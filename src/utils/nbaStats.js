const BASE_URL = "https://api.server.nbaapi.com/api";
const CACHE_KEY = "nba_stats_2024";
const CACHE_DATE_KEY = "nba_stats_2024_date";

function getCached() {
  try {
    const date = localStorage.getItem(CACHE_DATE_KEY);
    const data = localStorage.getItem(CACHE_KEY);
    if (date === new Date().toDateString() && data) return JSON.parse(data);
    return null;
  } catch { return null; }
}

function setCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_DATE_KEY, new Date().toDateString());
  } catch {}
}

export async function fetchPlayerSeasonStats() {
  const cached = getCached();
  if (cached) return cached;

  try {
    // Fetch all pages
    let allPlayers = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${BASE_URL}/playertotals?season=2024&pageSize=100&page=${page}`);
      const json = await res.json();
      const players = json.data || [];
      allPlayers = [...allPlayers, ...players];
      hasMore = players.length === 100;
      page++;
      if (page > 10) break; // safety cap
    }

    // Convert totals to per-game
    const perGame = allPlayers.map(p => ({
      id: p.playerId,
      name: p.playerName,
      team: p.team,
      age: p.age,
      gp: p.games,
      pts: p.games > 0 ? Math.round(p.points / p.games * 10) / 10 : 0,
      reb: p.games > 0 ? Math.round(p.totalRb / p.games * 10) / 10 : 0,
      ast: p.games > 0 ? Math.round(p.assists / p.games * 10) / 10 : 0,
      stl: p.games > 0 ? Math.round(p.steals / p.games * 10) / 10 : 0,
      blk: p.games > 0 ? Math.round(p.blocks / p.games * 10) / 10 : 0,
      to: p.games > 0 ? Math.round(p.turnovers / p.games * 10) / 10 : 0,
      threesMade: p.games > 0 ? Math.round(p.threeFg / p.games * 10) / 10 : 0,
    }));

    setCache(perGame);
    return perGame;
  } catch (e) {
    console.error("NBA stats fetch error:", e);
    return [];
  }
}

export function findPlayer(players, name) {
  if (!players?.length || !name) return null;
  const lower = name.toLowerCase().trim();
  // Exact match first
  let match = players.find(p => p.name?.toLowerCase() === lower);
  if (match) return match;
  // Last name match
  const lastName = lower.split(" ").slice(-1)[0];
  const firstLetter = lower[0];
  match = players.find(p => {
    const pLower = p.name?.toLowerCase() || "";
    return pLower.includes(lastName) && pLower.startsWith(firstLetter);
  });
  return match || null;
}
