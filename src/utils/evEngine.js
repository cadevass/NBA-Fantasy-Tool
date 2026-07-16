// src/utils/evEngine.js
// Lock-In EV Engine — Phase 3.
// Computes probability + expected value of waiting vs locking, from
// the player's empirical game log distribution in Supabase game_logs.
// supabase client loaded lazily to avoid circular init
let _supabase = null;
async function getClient() {
  if (!_supabase) _supabase = (await import("./supabase")).supabase;
  return _supabase;
}

const SAMPLE = 20; // games to build distribution from

export async function fetchPlayerLogs(playerName, limit = SAMPLE) {
  try {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("game_logs")
      .select("game_date, fp, min, pts, reb, ast, stl, blk")
      .ilike("player_name", playerName.trim())
      .order("game_date", { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) return null;
    return data.filter(r => r.min > 0); // exclude DNPs from distribution
  } catch {
    return null;
  }
}

// P(at least one of N games beats threshold)
export function probBeat(logs, threshold, n) {
  if (!logs || logs.length === 0) return null;
  const pBeatOne = logs.filter(r => r.fp > threshold).length / logs.length;
  return 1 - Math.pow(1 - pBeatOne, n);
}

// Expected value of the best of N games from the empirical distribution
// Uses bootstrap simulation over the actual logs for accuracy
export function evWait(logs, n, simRuns = 2000) {
  if (!logs || logs.length === 0) return null;
  const fps = logs.map(r => r.fp);
  let total = 0;
  for (let i = 0; i < simRuns; i++) {
    let best = 0;
    for (let j = 0; j < n; j++) {
      const sample = fps[Math.floor(Math.random() * fps.length)];
      if (sample > best) best = sample;
    }
    total += best;
  }
  return Math.round((total / simRuns) * 10) / 10;
}

// DNP rate — used to estimate auto-lock zero risk when N=1
// (if they sit their last game of the week you eat a zero)
export async function fetchDNPRate(playerName) {
  try {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("game_logs")
      .select("min")
      .ilike("player_name", playerName.trim())
      .order("game_date", { ascending: false })
      .limit(30);
    if (error || !data || data.length === 0) return 0;
    const dnps = data.filter(r => r.min === 0).length;
    return Math.round((dnps / data.length) * 100);
  } catch {
    return 0;
  }
}

// Full EV analysis for a player given their locked score + remaining games
export async function computeEV(playerName, lockedScore, remainingGames, matchupDelta = 0) {
  const logs = await fetchPlayerLogs(playerName);
  if (!logs || logs.length < 3) {
    return { available: false, reason: logs === null ? "No game log data yet — activates in October" : `Only ${logs?.length || 0} games logged` };
  }

  const n = Math.max(remainingGames, 1);
  const prob = probBeat(logs, lockedScore, n);
  const ev = evWait(logs, n);
  const dnpRate = n === 1 ? await fetchDNPRate(playerName) : 0;

  // Auto-lock zero risk: if N=1 and DNP rate > 0, expected value of waiting
  // is discounted by the chance of eating a zero
  const dnpPenalty = n === 1 ? (dnpRate / 100) * lockedScore : 0;
  const evAdjusted = ev !== null ? Math.round((ev - dnpPenalty) * 10) / 10 : null;

  // Math verdict (before AI)
  // Threshold: if trailing in matchup (matchupDelta < 0), lower bar for waiting
  const evGain = evAdjusted !== null ? evAdjusted - lockedScore : null;
  const THRESHOLD = matchupDelta < -20 ? -2 : matchupDelta > 20 ? 5 : 2;
  const mathVerdict = evGain !== null ? (evGain > THRESHOLD ? "HOLD" : "LOCK") : null;

  // Distribution stats
  const fps = logs.map(r => r.fp).sort((a, b) => a - b);
  const mean = Math.round(logs.reduce((s, r) => s + r.fp, 0) / logs.length * 10) / 10;
  const p75 = fps[Math.floor(fps.length * 0.75)];
  const p90 = fps[Math.floor(fps.length * 0.9)];
  const boomRate = Math.round(logs.filter(r => r.fp >= 35).length / logs.length * 100);

  return {
    available: true,
    games: logs.length,
    lockedScore,
    remainingGames: n,
    prob: prob !== null ? Math.round(prob * 100) : null,
    ev: evAdjusted,
    evRaw: ev,
    evGain,
    mathVerdict,
    dnpRate,
    mean,
    p75,
    p90,
    boomRate,
    matchupDelta,
    recentLogs: logs.slice(0, 5),
  };
}
