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

// Dynasty value curve. Real ranking scales (KTC, Dynatyze) are compressed at
// the top and decay slowly — the 10th best asset is ~90, not ~77. Anchors are
// explicit and tunable rather than a formula that happens to look linear.
const VALUE_ANCHORS = [
  [1, 99], [2, 97], [3, 96], [5, 94], [8, 92], [12, 90],
  [20, 86], [30, 82], [45, 77], [60, 72], [80, 67], [100, 62],
  [130, 55], [160, 49], [200, 42], [250, 34], [300, 27], [400, 20],
];

function rankToValue(rank) {
  const a = VALUE_ANCHORS;
  if (rank <= a[0][0]) return a[0][1];
  for (let i = 0; i < a.length - 1; i++) {
    const [r1, v1] = a[i], [r2, v2] = a[i + 1];
    if (rank <= r2) {
      const t = (rank - r1) / (r2 - r1);
      return Math.round(v1 + (v2 - v1) * t);
    }
  }
  return a[a.length - 1][1];
}

function rawTraits(p) {
  const fp = calcSeasonAverageFP(p) || 0;
  const min = p.minutes || 0;
  return { production: fp, efficiency: min > 0 ? fp / min : 0 };
}

export function computeObjectiveRankings(nbaPlayers, gameLogSignals = null, exactFPMap = null) {
  const pool = (nbaPlayers || []).filter(
    p => (p.gp || 0) >= MIN_GAMES && (p.minutes || 0) >= MIN_MPG
  );
  if (!pool.length) return { rankings: [], poolSize: 0, logsActive: false };

  const logsActive = !!gameLogSignals && Object.keys(gameLogSignals).length > 0;
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const rows = pool.map(p => {
    const raw = rawTraits(p);
    // Exact FP from Sleeper season stats beats our estimator — use it when present
    const exact = exactFPMap ? exactFPMap[norm(p.name)] : null;
    if (exact) {
      raw.production = exact.fpPerGame;
      raw.efficiency = exact.mpg > 0 ? exact.fpPerGame / exact.mpg : raw.efficiency;
    }
    const gl = logsActive ? gameLogSignals[norm(p.name)] : null;
    const ceiling = gl?.p90 ?? null;

    // Blend production with ceiling (Lock-In) — ceiling only when logs exist
    let core = raw.production;
    if (ceiling !== null) core = raw.production * 0.75 + ceiling * 0.25;

    // Efficiency as a small upside nudge, not a separate axis
    const effBonus = 1 + Math.min(Math.max(raw.efficiency - 0.85, 0), 0.35) * 0.12;

    const ageMult = ageMultiplier(p.age);
    const roleMult = rolePenalty(p);
    const adjusted = core * ageMult * roleMult * effBonus;

    return { player: p, raw, ceiling, core, effBonus, ageMult, roleMult, adjusted, exact };
  });

  rows.sort((a, b) => b.adjusted - a.adjusted);

  const rankings = rows.map((r, i) => {
    const rank = i + 1;
    const traits = {
      production: { raw: Math.round(r.raw.production * 10) / 10, percentile: null, weight: 85 },
      efficiency: { raw: Math.round(r.raw.efficiency * 100) / 100, percentile: null, weight: 15 },
    };
    if (r.ceiling !== null) {
      traits.ceiling = { raw: r.ceiling, percentile: null, weight: 25 };
    }
    return {
      name: r.player.name,
      position: r.player.position,
      team: r.player.team,
      age: r.player.age,
      gp: r.player.gp,
      minutes: r.player.minutes,
      fp: r.raw.production,
      fpSource: r.exact ? "sleeper" : "estimated",
      adjusted: Math.round(r.adjusted * 10) / 10,
      ageMultiplier: r.ageMult,
      roleMultiplier: r.roleMult,
      effBonus: Math.round(r.effBonus * 1000) / 1000,
      ageBand: ageBand(r.player.age),
      rank,
      score: rankToValue(rank),
      traits,
    };
  });

  return { rankings, poolSize: pool.length, logsActive };
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
