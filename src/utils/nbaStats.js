const BASE_URL = "https://api.server.nbaapi.com/api";
const CACHE_KEY = "nba_stats_2026";
const CACHE_DATE_KEY = "nba_stats_2026_date";

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
    let allRows = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${BASE_URL}/playertotals?season=2026&pageSize=50&page=${page}`);
      const json = await res.json();
      const rows = json.data || [];
      allRows = [...allRows, ...rows];
      hasMore = rows.length === 50;
      page++;
      if (page > 20) break;
    }

    // Group by playerId — handle traded players (multiple rows)
    const grouped = {};
    allRows.forEach(p => {
      if (!grouped[p.playerId]) {
        grouped[p.playerId] = [];
      }
      grouped[p.playerId].push(p);
    });

    // For each player, use the row with most games (their primary team)
    // Skip "2TM" / "3TM" combined rows — use individual team rows instead
    const perGame = Object.values(grouped).map(rows => {
      // Filter out combined rows (2TM, 3TM)
      const teamRows = rows.filter(r => r.team !== "2TM" && r.team !== "3TM");
      // Pick the row with most games played
      const primary = teamRows.length > 0
        ? teamRows.sort((a, b) => b.games - a.games)[0]
        : rows.sort((a, b) => b.games - a.games)[0];

      const g = primary.games || 1;
      return {
        id: primary.playerId,
        name: primary.playerName,
        team: primary.team,
        age: primary.age,
        gp: primary.games,
        pts: Math.round(primary.points / g * 10) / 10,
        reb: Math.round(primary.totalRb / g * 10) / 10,
        ast: Math.round(primary.assists / g * 10) / 10,
        stl: Math.round(primary.steals / g * 10) / 10,
        blk: Math.round(primary.blocks / g * 10) / 10,
        to: Math.round(primary.turnovers / g * 10) / 10,
        threesMade: Math.round(primary.threeFg / g * 10) / 10,
      };
    });

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
  let match = players.find(p => p.name?.toLowerCase() === lower);
  if (match) return match;
  const parts = lower.split(" ");
  const lastName = parts.slice(-1)[0];
  const firstInitial = parts[0]?.[0];
  match = players.find(p => {
    const pLower = p.name?.toLowerCase() || "";
    return pLower.includes(lastName) && pLower.startsWith(firstInitial);
  });
  return match || null;
}
