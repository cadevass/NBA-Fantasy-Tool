// src/utils/waiverScanner.js
// Waiver Wire Scanner engine — Phase 1.
// Identifies free agents, computes signal components + composite Scanner
// Score, diffs vs previous scan, manages dismissals + watchlist.
// Game-log signals (minutes trend, FP divergence, per-minute) activate
// automatically once game_logs has data (October onward).
import { dbGet, dbSet } from "./supabase";
import { calcSeasonAverageFP } from "./league";
import { supabase } from "./supabase";

const SCAN_KEY = "waiver_last_scan";
const DISMISS_KEY = "waiver_dismissed";
const WATCH_KEY = "waiver_watchlist";
const TRENDING_URL =
  "https://api.sleeper.app/v1/players/nba/trending/add?lookback_hours=24&limit=50";

// ── Name normalisation (same approach as nbaStats findPlayer) ──
export function normName(n) {
  return String(n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fallback identity: first initial + last name + NBA team
function looseKey(name, team) {
  const parts = normName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0][0]}.${parts[parts.length - 1]}.${String(team || "").toUpperCase()}`;
}

// ── Free agent identification ──
// nbaPlayers: array from NBA stats API. teams: SleeperContext teams array.
export function identifyFreeAgents(nbaPlayers, teams) {
  const rostered = new Set();
  const rosteredLoose = new Set();
  for (const t of teams || []) {
    for (const p of [...t.starters, ...t.bench, ...(t.taxi || []), ...(t.reserve || [])]) {
      rostered.add(normName(p.name));
      const lk = looseKey(p.name, p.team);
      if (lk) rosteredLoose.add(lk);
    }
  }
  return (nbaPlayers || []).filter(p => {
    if (rostered.has(normName(p.name))) return false;
    const lk = looseKey(p.name, p.team);
    if (lk && rosteredLoose.has(lk)) return false;
    return true;
  });
}

// ── Game log signals (null until game_logs has data) ──
// Returns map: normName -> { recentFP, recentMin, seasonMinGL, fpPerMin, games }
export async function fetchGameLogSignals() {
  try {
    // last 10 games per player is approximated by pulling recent weeks;
    // offseason: table is empty -> return null
    const { data, error } = await supabase
      .from("game_logs")
      .select("player_name, game_date, min, fp")
      .order("game_date", { ascending: false })
      .limit(8000); // ~3 weeks of league-wide logs
    if (error || !data || data.length === 0) return null;

    const byPlayer = {};
    for (const row of data) {
      const key = normName(row.player_name);
      (byPlayer[key] = byPlayer[key] || []).push(row);
    }

    const signals = {};
    for (const [key, rows] of Object.entries(byPlayer)) {
      rows.sort((a, b) => (a.game_date < b.game_date ? 1 : -1));
      const recent = rows.slice(0, 10);
      const played = recent.filter(r => r.min > 0);
      if (played.length === 0) continue;
      const avg = (arr, f) => arr.reduce((s, r) => s + f(r), 0) / arr.length;
      signals[key] = {
        games: played.length,
        recentFP: +avg(played, r => r.fp).toFixed(1),
        recentMin: +avg(played, r => r.min).toFixed(1),
        fpPerMin: +(avg(played, r => r.fp) / Math.max(avg(played, r => r.min), 1)).toFixed(2),
      };
    }
    return signals;
  } catch {
    return null;
  }
}

// ── Sleeper trending (platform-wide adds, last 24h) ──
// Returns map: sleeper player_id -> add count. Caller matches via players map.
export async function fetchTrending(sleeperPlayers) {
  try {
    const res = await fetch(TRENDING_URL);
    if (!res.ok) return {};
    const list = await res.json(); // [{player_id, count}]
    const byName = {};
    for (const { player_id, count } of list) {
      const p = sleeperPlayers?.[player_id];
      if (p) byName[normName(`${p.first_name} ${p.last_name}`)] = count;
    }
    return byName;
  } catch {
    return {};
  }
}

// ── Composite score ──
// Transparent components; each contributes 0-25ish, total ~0-100.
export function scoreFA(fa, ctx) {
  const { glSignals, trending } = ctx;
  const key = normName(fa.name);
  const seasonFP = calcSeasonAverageFP(fa) || 0;
  const gl = glSignals?.[key];
  const trendCount = trending?.[key] || 0;

  const components = [];

  // Base production (season FP, capped contribution)
  const base = Math.min(seasonFP, 30) * 0.8; // up to 24
  components.push({ label: "Season FP", detail: `${seasonFP} FP/g`, pts: +base.toFixed(1) });

  // Stocks premium (season stl+blk per game x2 = FP from stocks)
  const stocksFP = ((fa.stl || 0) + (fa.blk || 0)) * 2;
  const stocks = Math.min(stocksFP, 8) * 2; // up to 16
  if (stocksFP >= 2) components.push({ label: "Stocks", detail: `${(fa.stl || 0).toFixed(1)} stl + ${(fa.blk || 0).toFixed(1)} blk = ${stocksFP.toFixed(1)} FP`, pts: +stocks.toFixed(1) });

  // Minutes trend — leading indicator (game logs)
  let minutesPts = 0;
  if (gl && fa.minutes) {
    const delta = gl.recentMin - fa.minutes;
    if (delta >= 4) {
      minutesPts = Math.min(delta, 12) * 2; // up to 24
      components.push({ label: "Minutes spike", detail: `${gl.recentMin} recent vs ${fa.minutes} season (+${delta.toFixed(1)})`, pts: +minutesPts.toFixed(1) });
    }
  }

  // FP divergence (game logs)
  let fpDivPts = 0;
  if (gl && seasonFP > 0) {
    const delta = gl.recentFP - seasonFP;
    if (delta >= 3 && gl.recentFP / seasonFP >= 1.2) {
      fpDivPts = Math.min(delta, 10) * 1.5; // up to 15
      components.push({ label: "FP rising", detail: `${gl.recentFP} recent vs ${seasonFP} season`, pts: +fpDivPts.toFixed(1) });
    }
  }

  // Per-minute monster (game logs): high FP/min on low minutes
  let permPts = 0;
  if (gl && gl.fpPerMin >= 1.0 && gl.recentMin <= 24) {
    permPts = 10;
    components.push({ label: "Per-min monster", detail: `${gl.fpPerMin} FP/min in ${gl.recentMin} mpg`, pts: permPts });
  }

  // Trending across Sleeper
  let trendPts = 0;
  if (trendCount > 0) {
    trendPts = Math.min(Math.log10(trendCount + 1) * 5, 12); // up to ~12
    components.push({ label: "Trending", detail: `${trendCount.toLocaleString()} adds/24h platform-wide`, pts: +trendPts.toFixed(1) });
  }

  const score = +(base + stocks + minutesPts + fpDivPts + permPts + trendPts).toFixed(1);

  const badges = [];
  if (minutesPts > 0) badges.push({ kind: "emoji", label: "📈" });
  if (fpDivPts > 0) badges.push({ kind: "emoji", label: "🔥" });

  return { score, components, badges, seasonFP, gl: gl || null, trendCount };
}

// ── Scan orchestration ──
export async function runScan({ nbaPlayers, teams, sleeperPlayers }) {
  const fas = identifyFreeAgents(nbaPlayers, teams);
  const [glSignals, trending] = await Promise.all([
    fetchGameLogSignals(),
    fetchTrending(sleeperPlayers),
  ]);

  const prevRaw = getLastScan();
  const prev = prevRaw?.results?.length > 0 ? prevRaw : null; // never baseline against a failed/empty scan
  const prevRanks = {};
  (prev?.results || []).forEach((r, i) => { prevRanks[normName(r.name)] = i; });

  let results = fas
    .map(fa => {
      const s = scoreFA(fa, { glSignals, trending });
      return {
        name: fa.name, team: fa.team, position: fa.position, age: fa.age,
        pts: fa.pts, reb: fa.reb, ast: fa.ast, stl: fa.stl, blk: fa.blk,
        minutes: fa.minutes, ...s,
      };
    })
    .filter(r => r.score >= 8) // noise floor
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);

  results = results.map((r, i) => {
    const key = normName(r.name);
    const prevRank = prevRanks[key];
    return {
      ...r,
      isNew: prev ? prevRank === undefined : false,
      movement: prevRank === undefined ? 0 : prevRank - i, // + = rose
    };
  });

  const scan = { ranAt: new Date().toISOString(), gameLogsActive: !!glSignals, results,
    debug: { statsApiPlayers: (nbaPlayers || []).length, freeAgents: fas.length, aboveFloor: results.length } };
  try { localStorage.setItem(SCAN_KEY, JSON.stringify(scan)); } catch (e) { console.warn("scan cache write failed", e); }
  dbSet("app_settings", SCAN_KEY, scan);
  return scan;
}

export function getLastScan() {
  try { return JSON.parse(localStorage.getItem(SCAN_KEY)); } catch { return null; }
}

// ── Dismissals (with auto-resurface on score jump) ──
export function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || {}; } catch { return {}; }
}
export function dismissPlayer(name, score) {
  const d = getDismissed();
  d[normName(name)] = { name, scoreAtDismissal: score, at: new Date().toISOString() };
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(d)); } catch {}
  dbSet("app_settings", DISMISS_KEY, d);
}
export function undismissPlayer(name) {
  const d = getDismissed();
  delete d[normName(name)];
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(d)); } catch {}
  dbSet("app_settings", DISMISS_KEY, d);
}
// visible if never dismissed, or score jumped 10+ since dismissal (resurface)
export function isVisible(result, dismissed) {
  const d = dismissed[normName(result.name)];
  if (!d) return true;
  return result.score - d.scoreAtDismissal >= 10;
}

// ── Watchlist ──
export function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || {}; } catch { return {}; }
}
export function toggleWatch(name, note = "") {
  const w = getWatchlist();
  const key = normName(name);
  if (w[key]) delete w[key];
  else w[key] = { name, note, at: new Date().toISOString() };
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(w)); } catch {}
  dbSet("app_settings", WATCH_KEY, w);
  return w;
}

// ── Weakest droppable roster player (for add/drop framing) ──
export function weakestRosterPlayers(rankings, count = 3) {
  return (rankings || [])
    .filter(r => r.category === "My Roster")
    .sort((a, b) => a.value - b.value)
    .slice(0, count);
}

// ── AI Verdict ──
// The verdict answers three things: (1) is the production real or an
// injury-vacuum mirage, (2) who on MY roster is the drop, (3) is this
// worth burning rolling waiver priority or safe to wait for FA.
export function buildVerdictPrompt(result, weakest, waiverContext = "") {
  const compLines = result.components.map(c => `- ${c.label}: ${c.detail} (+${c.pts})`).join("\n");
  const weakLines = (weakest || [])
    .map(w => `- ${w.name}: ${w.value}/100 (${w.trend})${w.summary ? ` — ${w.summary}` : ""}`)
    .join("\n") || "- (no consensus values available for roster)";
  const gl = result.gl
    ? `Recent form (last ${result.gl.games} games): ${result.gl.recentFP} FP in ${result.gl.recentMin} mpg (${result.gl.fpPerMin} FP/min)`
    : "No recent game log data (offseason or early season).";

  return `WAIVER WIRE VERDICT REQUEST

CANDIDATE: ${result.name} (${result.position}, ${result.team}, age ${result.age})
Season: ${result.pts}pts/${result.reb}reb/${result.ast}ast/${result.stl}stl/${result.blk}blk in ${result.minutes} mpg — ~${result.seasonFP} FP/game
${gl}
Scanner Score: ${result.score}
Score components:
${compLines}
${result.trendCount > 0 ? `Platform-wide Sleeper adds (24h): ${result.trendCount.toLocaleString()}` : ""}

MY WEAKEST ROSTER HOLDINGS (drop candidates, by consensus value):
${weakLines}

WAIVER SYSTEM: Rolling priority (using a claim sends me to the back of the queue — a real cost).
${waiverContext ? `ADDITIONAL CONTEXT (treat as hard facts): ${waiverContext}` : ""}

OUTPUT RULES: Start IMMEDIATELY with "VERDICT:" — no preamble, no acknowledgement, no dividers, no markdown, no line breaks inside a field. One line per field except SUSTAINABILITY and REASONING which are single flowing paragraphs.
ANSWER EXACTLY THIS STRUCTURE:
VERDICT: [ADD NOW / WATCHLIST / PASS]
DROP: [which of my players to drop, or "none worth dropping"]
PRIORITY: [BURN PRIORITY / WAIT FOR FA — will he clear waivers in a sleepy 10-team league?]
SUSTAINABILITY: [Is this production role-driven or an injury-vacuum mirage? What happens when the roster normalises?]
REASONING: [2-3 sentences max. Direct and opinionated, no hedging.]`;
}
