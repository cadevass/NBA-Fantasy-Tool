// src/utils/objectiveRankings.js
// Phase 8 — Objective Rankings Engine (v3)
//
// v1: double-counted stocks (calcSeasonAverageFP already applies stl/blk x2),
//     flat percentiles crushed the elite tail, age curve was a coronation.
// v2: fixed the double-count but Role Security (16%) acted as noise — it
//     penalised Wemby for 29 mpg and let Jalen Johnson outrank Jokic despite
//     a 9.6 FP/g gap. Percentile blending still compressed the top.
// v3: production is nearly everything, scored as ratio-to-best on a gentle
//     curve so elite separation survives. Role security is a PENALTY only —
//     it can punish a bench role but never differentiates two starters.
import { calcSeasonAverageFP } from "./league";

export const MIN_GAMES = 20;
export const MIN_MPG = 14;

export const TRAITS = {
  production: { label: "Production", weight: 0.85, needsLogs: false, desc: "FP/game in our scoring vs league best — stl/blk 2x already inside" },
  ceiling:    { label: "Ceiling",    weight: 0.25, needsLogs: true,  desc: "90th percentile single game — Lock-In only needs one" },
  efficiency: { label: "Efficiency", weight: 0.15, needsLogs: false, desc: "FP per minute — upside signal if minutes expand" },
};

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

// Role penalty: only ever punishes. Two full starters both get 1.0 — the
// engine should never split hairs between 34.8 and 35.2 mpg.
export function rolePenalty(p) {
  const startRate = p.gp > 0 ? (p.gamesStarted || 0) / p.gp : 0;
  const min = p.minutes || 0;
  if (startRate >= 0.7 && min >= 26) return 1.0;   // locked-in starter
  if (startRate >= 0.4 || min >= 24) return 0.97;  // rotation regular
  if (min >= 18) return 0.93;                       // bench role
  return 0.88;                                      // limited
}

// Ratio to league best on a gentle curve. sqrt lifts the mid-pack a little
// without flattening the gap between 42.3 FP and 32.7 FP.
function ratioCurve(values) {
  const max = Math.max(...values, 1);
  return (v) => Math.round(Math.pow(Math.max(v, 0) / max, 0.7) * 100);
}

function rawTraits(p) {
  const fp = calcSeasonAverageFP(p) || 0;
  const min = p.minutes || 0;
  return {
    production: fp,
    efficiency: min > 0 ? fp / min : 0,
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
      if (gl) r.raw.ceiling = gl.p90 ?? null;
    }
  }

  const activeTraits = Object.keys(TRAITS).filter(k => !TRAITS[k].needsLogs || logsActive);

  const scoreFns = {};
  for (const key of activeTraits) {
    const vals = raws.map(r => r.raw[key]).filter(v => typeof v === "number" && !isNaN(v));
    scoreFns[key] = ratioCurve(vals);
  }

  const totalWeight = activeTraits.reduce((s, k) => s + TRAITS[k].weight, 0);

  const rankings = raws.map(({ player, raw }) => {
    const traits = {};
    let composite = 0;
    for (const key of activeTraits) {
      const v = raw[key];
      if (typeof v !== "number" || isNaN(v)) continue;
      const s = scoreFns[key](v);
      const w = TRAITS[key].weight / totalWeight;
      traits[key] = { raw: Math.round(v * 100) / 100, percentile: s, weight: Math.round(w * 1000) / 10 };
      composite += s * w;
    }

    const ageMult = ageMultiplier(player.age);
    const roleMult = rolePenalty(player);

    return {
      name: player.name,
      position: player.position,
      team: player.team,
      age: player.age,
      gp: player.gp,
      minutes: player.minutes,
      fp: calcSeasonAverageFP(player),
      baseScore: Math.round(composite),
      ageMultiplier: ageMult,
      roleMultiplier: roleMult,
      ageBand: ageBand(player.age),
      score: Math.min(99, Math.round(composite * ageMult * roleMult)),
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
      out[k] = {
        p90: Math.round(sorted[Math.floor(sorted.length * 0.9)] * 10) / 10,
        games: fps.length,
      };
    }
    return out;
  } catch {
    return null;
  }
}
