// src/utils/sleeperStats.js
// Exact season FP from Sleeper's own stat totals — no bonus estimation.
// Sleeper labels seasons by start year (2025 = 2025-26 season).
import { SCORING } from "./league";

const CACHE_KEY = "sleeper_season_stats_2025";
const CACHE_DATE_KEY = "sleeper_season_stats_2025_date";

// s.sp is seconds played
export function exactSeasonFP(s) {
  if (!s || !s.gp) return null;
  const base =
    (s.pts || 0) * SCORING.pts +
    (s.reb || 0) * SCORING.reb +
    (s.ast || 0) * SCORING.ast +
    (s.stl || 0) * SCORING.stl +
    (s.blk || 0) * SCORING.blk +
    (s.to || 0) * SCORING.to +
    (s.tpm || 0) * SCORING.threesMade;

  // Sleeper counts every TD inside dd, so DD-only = dd - td
  const ddOnly = Math.max((s.dd || 0) - (s.td || 0), 0);
  const bonuses =
    ddOnly * SCORING.doubleDouble +
    (s.td || 0) * (SCORING.tripleDouble + SCORING.doubleDouble) +
    (s.b40 || 0) * SCORING.bonus40pts +
    (s.b50 || 0) * SCORING.bonus50pts +
    (s.b15a || 0) * SCORING.bonus15ast +
    (s.b20r || 0) * SCORING.bonus20reb;

  const penalties =
    (s.tf || 0) * SCORING.technicalFoul +
    (s.ff || 0) * SCORING.flagrantFoul;

  const total = base + bonuses + penalties;
  return {
    totalFP: Math.round(total * 10) / 10,
    fpPerGame: Math.round((total / s.gp) * 10) / 10,
    gp: s.gp,
    mpg: s.sp ? Math.round((s.sp / 60 / s.gp) * 10) / 10 : 0,
    startRate: s.gp ? (s.gs || 0) / s.gp : 0,
    ppg: Math.round(((s.pts || 0) / s.gp) * 10) / 10,
    rpg: Math.round(((s.reb || 0) / s.gp) * 10) / 10,
    apg: Math.round(((s.ast || 0) / s.gp) * 10) / 10,
    spg: Math.round(((s.stl || 0) / s.gp) * 10) / 10,
    bpg: Math.round(((s.blk || 0) / s.gp) * 10) / 10,
    ddRate: s.gp ? Math.round(((s.dd || 0) / s.gp) * 100) : 0,
    tdRate: s.gp ? Math.round(((s.td || 0) / s.gp) * 100) : 0,
  };
}

export async function fetchSleeperSeasonStats(season = "2025") {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const date = localStorage.getItem(CACHE_DATE_KEY);
    if (cached && date === new Date().toDateString()) return JSON.parse(cached);
  } catch {}

  try {
    const res = await fetch(`/api/sleeper-stats?season=${season}`);
    if (!res.ok) throw new Error(`Stats proxy ${res.status}`);
    const data = await res.json();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_DATE_KEY, new Date().toDateString());
    } catch {}
    return data;
  } catch (e) {
    try {
      const stale = localStorage.getItem(CACHE_KEY);
      if (stale) return JSON.parse(stale);
    } catch {}
    return null;
  }
}

// Build name -> exact FP map using the Sleeper players blob for ID resolution
export function buildExactFPMap(statsById, sleeperPlayers) {
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
  const out = {};
  for (const [id, s] of Object.entries(statsById || {})) {
    const p = sleeperPlayers?.[id];
    if (!p) continue;
    const calc = exactSeasonFP(s);
    if (!calc) continue;
    out[norm(`${p.first_name} ${p.last_name}`)] = {
      ...calc,
      name: `${p.first_name} ${p.last_name}`,
      position: (p.fantasy_positions || [])[0] || "?",
      team: p.team || "FA",
    };
  }
  return out;
}

// ── Global exact-FP singleton ──
// Loaded once, then read synchronously anywhere. Falls back to null until
// ready, so callers keep the estimator as a backstop.
let _exactMap = null;
let _loading = null;

export function getExactFP(name) {
  if (!_exactMap) return null;
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
  return _exactMap[norm(name)] || null;
}

export function isExactFPReady() {
  return !!_exactMap;
}

export async function loadExactFPMap() {
  if (_exactMap) return _exactMap;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const [stats, players] = await Promise.all([
        fetchSleeperSeasonStats("2025"),
        fetch("https://api.sleeper.app/v1/players/nba").then(r => r.json()).catch(() => null),
      ]);
      if (!stats || !players) return null;
      _exactMap = buildExactFPMap(stats, players);
      return _exactMap;
    } catch {
      return null;
    } finally {
      _loading = null;
    }
  })();
  return _loading;
}
