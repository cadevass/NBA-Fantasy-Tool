// src/utils/objectiveRankings.js
// Phase 8 — Objective Rankings Engine (v2)
//
// v1 was broken: it double-counted stocks (calcSeasonAverageFP already applies
// stl x2 / blk x2, so a separate Stocks Rate trait dipped twice), used flat
// percentiles that compressed the elite tail, and applied an age curve so
// aggressive that 20-year-olds outranked top-10 NBA players.
//
// v2 is production-dominant. FP/game in OUR scoring is the headline — the
// stl/blk premium is already inside it. Remaining traits answer: is this
// sustainable, does it scale, and does it boom (which is what Lock-In pays for).
import { calcSeasonAverageFP } from "./league";

export const MIN_GAMES = 20;
export const MIN_MPG = 14;

export const TRAITS = {
  production:   { label: "Production",    weight: 0.45, needsLogs: false, desc: "FP/game in our scoring — stl/blk 2x already included" },
  ceiling:      { label: "Ceiling",       weight: 0.25, needsLogs: true,  desc: "90th percentile single game — Lock-In only needs one" },
  efficiency:   { label: "Efficiency",    weight: 0.18, needsLogs: false, desc: "FP per minute — predicts growth when minutes expand" },
  roleSecurity: { label: "Role Security", weight: 0.12, needsLogs: false, desc: "Start rate blended with minutes — is it sustainable" },
  volatility:   { label: "Boom Factor",   weight: 0.04, needsLogs: true,  desc: "Game-to-game variance — high is GOOD in Lock-In" },
};

// Softened curve — a nudge, not a coronation
export function ageMultiplier(age) {
  if (!age) return 1.0;
  if (age <= 21) return 1.06;
  if (age <= 24) return 1.04;
  if (age <= 27) return 1.00;
  if (age <= 30) return 0.94;
  if (age <= 33) return 0.86;
  return 0.76;
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

function rawTraits(p) {
  const fp = calcSeasonAverageFP(p) || 0;
  const min = p.minutes || 0;
  const startRate = p.gp > 0 ? (p.gamesStarted || 0) / p.gp : 0;
  return {
    production: fp,
    efficiency: min > 0 ? fp / min : 0,
    roleSecurity: startRate * 0.7 + Math.min(min / 36, 1) * 0.3,
  };
}

function percentileMap(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    if (!sorted.length) return 50;
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1; else hi = mid;
    }
    return Math.round((lo / sorted.length) * 100);
  };
}

// Elite tail needs to separate. Flat percentile puts 35 FP and 27 FP eight
// points apart; this stretches the top end so the gap reflects reality.
function scaledCurve(values) {
  const pct = percentileMap(values);
  const max = Math.max(...values, 1);
  return (v) => {
    const p = pct(v);
    const ratio = v / max;              // 0-1 vs best in pool
    return Math.round(p * 0.55 + ratio * 100 * 0.45);
  };
}

export function computeObjectiveRankings(nbaPlayers, gameLogSignals = null) {
  const pool = (nbaPlayers || []).filter(
    p => (p.gp || 0) >= MIN_GAMES && (p.minutes || 0) >= MIN_MPG
  );
  if (!pool.length) return { rankings: [], poolSize: 0, logsActive: false };

  const logsActive = !!gameLogSignals && Object.keys(gameLogSignals).length > 0;
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const raws = pool.map(p => ({ player: p, raw: rawTraits(p) }));

  if (logsActive) {
    for (const r of raws) {
      const gl = gameLogSignals[norm(r.player.name)];
      if (gl) {
        r.raw.ceiling = gl.p90 ?? null;
        r.raw.volatility = gl.cv ?? null;
      }
    }
  }

  const activeTraits = Object.keys(TRAITS).filter(k => !TRAITS[k].needsLogs || logsActive);

  const scoreFns = {};
  for (const key of activeTraits) {
    const vals = raws.map(r => r.raw[key]).filter(v => typeof v === "number" && !isNaN(v));
    // Production and Ceiling use the scaled curve; ratio traits use plain percentile
    scoreFns[key] = (key === "production" || key === "ceiling") ? scaledCurve(vals) : percentileMap(vals);
  }

  const totalWeight = activeTraits.reduce((s, k) => s + TRAITS[k].weight, 0);

  const rankings = raws.map(({ player, raw }) => {
    const traits = {};
    let composite = 0;
    for (const key of activeTraits) {
      const v = raw[key];
      if (typeof v !== "number" || isNaN(v)) continue;
      let s = scoreFns[key](v);
      if (key === "volatility") s = 100 - s; // inverted: boom-bust is good here
      const w = TRAITS[key].weight / totalWeight;
      traits[key] = { raw: Math.round(v * 100) / 100, percentile: s, weight: Math.round(w * 1000) / 10 };
      composite += s * w;
    }
    const mult = ageMultiplier(player.age);
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
      score: Math.min(99, Math.round(composite * mult)),
      traits,
    };
  });

  rankings.sort((a, b) => b.score - a.score);
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return { rankings, poolSize: pool.length, logsActive, activeTraits };
}

export async function fetchCeilingSignals() {
  try {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("game_logs")
      .select("player_name, fp, min")
      .gt("min", 0)
      .limit(20000);
    if (error || !data || !data.length) return null;

    const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const byPlayer = {};
    for (const row of data) {
      const k = norm(row.player_name);
      (byPlayer[k] = byPlayer[k] || []).push(row.fp);
    }

    const out = {};
    for (const [k, fps] of Object.entries(byPlayer)) {
      if (fps.length < 10) continue;
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
