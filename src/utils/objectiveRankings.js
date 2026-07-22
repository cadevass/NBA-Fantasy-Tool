// src/utils/objectiveRankings.js
// Phase 8 — Objective Rankings Engine
// Computes dynasty value from public stats, calibrated to Backshot Dynasty
// Lock-In scoring (stl/blk 2x, one game per week = ceiling premium).
// Every trait is a percentile within the qualifying pool. No black box.
import { calcSeasonAverageFP } from "./league";

// Qualifying thresholds — below these we report "insufficient sample"
export const MIN_GAMES = 20;
export const MIN_MPG = 14;

// Trait weights. Ceiling + Volatility need game_logs (October).
// Until then their weight redistributes proportionally.
export const TRAITS = {
  production:   { label: "Production",    weight: 0.18, needsLogs: false, desc: "FP per game in our scoring" },
  stocksRate:   { label: "Stocks Rate",   weight: 0.18, needsLogs: false, desc: "(stl+blk)x2 as share of total FP — our market edge" },
  ceiling:      { label: "Ceiling",       weight: 0.20, needsLogs: true,  desc: "90th percentile single-game FP — Lock-In only needs one" },
  efficiency:   { label: "Efficiency",    weight: 0.14, needsLogs: false, desc: "FP per minute — predicts breakouts when minutes expand" },
  usage:        { label: "Usage",         weight: 0.12, needsLogs: false, desc: "(FGA + 0.44xFTA + TOV) per minute — top breakout signal" },
  roleSecurity: { label: "Role Security", weight: 0.08, needsLogs: false, desc: "Start rate blended with minutes — is production sustainable" },
  volatility:   { label: "Volatility",    weight: 0.06, needsLogs: true,  desc: "Game-to-game variance — INVERTED, boom-bust is good here" },
  availability: { label: "Availability",  weight: 0.04, needsLogs: false, desc: "Games played rate — can't boom if you don't play" },
};

// Age multiplier converts production score into dynasty value
export function ageMultiplier(age) {
  if (!age) return 1.0;
  if (age <= 21) return 1.15;
  if (age <= 24) return 1.10;
  if (age <= 27) return 1.00;
  if (age <= 30) return 0.92;
  if (age <= 33) return 0.82;
  return 0.70;
}

export function ageBand(age) {
  if (!age) return "unknown";
  if (age <= 21) return "21 and under";
  if (age <= 24) return "22-24";
  if (age <= 27) return "25-27";
  if (age <= 30) return "28-30";
  if (age <= 33) return "31-33";
  return "34+";
}

// ── Raw trait values from season stats ──
function rawTraits(p) {
  const fp = calcSeasonAverageFP(p) || 0;
  const min = p.minutes || 0;
  const stocksFP = ((p.stl || 0) + (p.blk || 0)) * 2;
  const startRate = p.gp > 0 ? (p.gamesStarted || 0) / p.gp : 0;

  return {
    production: fp,
    stocksRate: fp > 0 ? (stocksFP / fp) * 100 : 0,
    efficiency: min > 0 ? fp / min : 0,
    usage: min > 0 ? ((p.fga || 0) + 0.44 * (p.fta || 0) + (p.to || 0)) / min : 0,
    // start rate carries most weight but minutes confirm it
    roleSecurity: startRate * 0.7 + Math.min(min / 36, 1) * 0.3,
    availability: Math.min((p.gp || 0) / 82, 1),
  };
}

// ── Percentile within pool ──
function percentileMap(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    if (sorted.length === 0) return 50;
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1; else hi = mid;
    }
    return Math.round((lo / sorted.length) * 100);
  };
}

// ── Main engine ──
// nbaPlayers: array from fetchPlayerSeasonStats
// gameLogSignals: optional map from game_logs (October+) for ceiling/volatility
export function computeObjectiveRankings(nbaPlayers, gameLogSignals = null) {
  const pool = (nbaPlayers || []).filter(
    p => (p.gp || 0) >= MIN_GAMES && (p.minutes || 0) >= MIN_MPG
  );
  if (pool.length === 0) return { rankings: [], poolSize: 0, logsActive: false };

  const logsActive = !!gameLogSignals && Object.keys(gameLogSignals).length > 0;

  // Compute raw traits for whole pool
  const raws = pool.map(p => ({ player: p, raw: rawTraits(p) }));

  // Attach log-derived traits when available
  if (logsActive) {
    const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const r of raws) {
      const gl = gameLogSignals[norm(r.player.name)];
      if (gl) {
        r.raw.ceiling = gl.p90 ?? null;
        // Volatility INVERTED — higher variance scores better in Lock-In
        r.raw.volatility = gl.cv ?? null;
      }
    }
  }

  // Build percentile functions per trait
  const activeTraits = Object.keys(TRAITS).filter(
    k => !TRAITS[k].needsLogs || logsActive
  );
  const pctFns = {};
  for (const key of activeTraits) {
    const vals = raws.map(r => r.raw[key]).filter(v => typeof v === "number" && !isNaN(v));
    pctFns[key] = percentileMap(vals);
  }

  // Renormalise weights across active traits
  const totalWeight = activeTraits.reduce((s, k) => s + TRAITS[k].weight, 0);

  const rankings = raws.map(({ player, raw }) => {
    const traits = {};
    let composite = 0;
    for (const key of activeTraits) {
      const v = raw[key];
      if (typeof v !== "number" || isNaN(v)) continue;
      let pct = pctFns[key](v);
      if (key === "volatility") pct = 100 - pct; // inverted: high CV is good
      const w = TRAITS[key].weight / totalWeight;
      traits[key] = { raw: Math.round(v * 100) / 100, percentile: pct, weight: Math.round(w * 1000) / 10 };
      composite += pct * w;
    }

    const mult = ageMultiplier(player.age);
    const score = Math.min(99, Math.round(composite * mult));

    return {
      name: player.name,
      position: player.position,
      team: player.team,
      age: player.age,
      gp: player.gp,
      minutes: player.minutes,
      fp: calcSeasonAverageFP(player),
      baseScore: Math.round(composite),
      ageMultiplier: mult,
      ageBand: ageBand(player.age),
      score,
      traits,
    };
  });

  rankings.sort((a, b) => b.score - a.score);
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return { rankings, poolSize: pool.length, logsActive, activeTraits };
}

// ── Game log signals for ceiling + volatility (October onward) ──
export async function fetchCeilingSignals() {
  try {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("game_logs")
      .select("player_name, fp, min")
      .gt("min", 0)
      .limit(20000);
    if (error || !data || data.length === 0) return null;

    const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const byPlayer = {};
    for (const row of data) {
      const k = norm(row.player_name);
      (byPlayer[k] = byPlayer[k] || []).push(row.fp);
    }

    const out = {};
    for (const [k, fps] of Object.entries(byPlayer)) {
      if (fps.length < 10) continue; // insufficient sample
      const sorted = [...fps].sort((a, b) => a - b);
      const mean = fps.reduce((s, v) => s + v, 0) / fps.length;
      const sd = Math.sqrt(fps.reduce((s, v) => s + (v - mean) ** 2, 0) / fps.length);
      out[k] = {
        p90: Math.round(sorted[Math.floor(sorted.length * 0.9)] * 10) / 10,
        cv: mean > 0 ? Math.round((sd / mean) * 1000) / 1000 : 0,
        games: fps.length,
      };
    }
    return out;
  } catch {
    return null;
  }
}
