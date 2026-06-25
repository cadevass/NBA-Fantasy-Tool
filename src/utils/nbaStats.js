// NBA Stats API utility
// Uses a CORS proxy to access stats.nba.com

const CORS_PROXY = "https://corsproxy.io/?";
const NBA_STATS_BASE = "https://stats.nba.com/stats";

const NBA_HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nba.com",
  "Referer": "https://www.nba.com/",
};

// Cache in localStorage for 24 hours
function getCached(key) {
  try {
    const item = localStorage.getItem(`nba_stats_${key}`);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem(`nba_stats_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

export async function fetchPlayerSeasonStats(season = "2024-25") {
  const cacheKey = `player_stats_${season}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${CORS_PROXY}${encodeURIComponent(
      `${NBA_STATS_BASE}/leaguedashplayerstats?Season=${season}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&LastNGames=0&Month=0&OpponentTeamID=0&PaceAdjust=N&PlusMinus=N&Rank=N&LeagueID=00`
    )}`;

    const res = await fetch(url, { headers: NBA_HEADERS });
    const json = await res.json();

    const headers = json.resultSets[0].headers;
    const rows = json.resultSets[0].rowSet;

    const players = rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return {
        id: obj.PLAYER_ID,
        name: obj.PLAYER_NAME,
        team: obj.TEAM_ABBREVIATION,
        age: obj.AGE,
        gp: obj.GP,
        pts: parseFloat(obj.PTS?.toFixed(1)),
        reb: parseFloat(obj.REB?.toFixed(1)),
        ast: parseFloat(obj.AST?.toFixed(1)),
        stl: parseFloat(obj.STL?.toFixed(1)),
        blk: parseFloat(obj.BLK?.toFixed(1)),
        to: parseFloat(obj.TOV?.toFixed(1)),
        threesMade: parseFloat(obj.FG3M?.toFixed(1)),
        min: parseFloat(obj.MIN?.toFixed(1)),
        fgPct: parseFloat((obj.FG_PCT * 100)?.toFixed(1)),
      };
    });

    setCache(cacheKey, players);
    return players;
  } catch (e) {
    console.error("NBA Stats API error:", e);
    return [];
  }
}

export function findPlayer(players, name) {
  if (!players?.length || !name) return null;
  const lower = name.toLowerCase();
  return players.find(p => p.name?.toLowerCase() === lower) ||
    players.find(p => p.name?.toLowerCase().includes(lower.split(" ").slice(-1)[0].toLowerCase()));
}

export async function getPlayerStats(name, season = "2024-25") {
  const all = await fetchPlayerSeasonStats(season);
  return findPlayer(all, name);
}
