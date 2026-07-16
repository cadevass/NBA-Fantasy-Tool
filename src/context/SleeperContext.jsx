import { createContext, useContext, useEffect, useState } from "react";
import { fetchStartupDraft } from "../utils/sleeperDraft";

const LEAGUE_ID = "1371805753509158912";
const SLEEPER_BASE = "https://api.sleeper.app/v1";
const PLAYERS_CACHE_KEY = "sleeper_players_cache_v2";
const PLAYERS_CACHE_DATE_KEY = "sleeper_players_cache_v2_date";
const LEAGUE_CACHE_KEY = "sleeper_league_cache";

const SleeperContext = createContext(null);

export function useSleeperContext() {
  return useContext(SleeperContext);
}

async function fetchPlayers() {
  const today = new Date().toDateString();
  const cachedDate = localStorage.getItem(PLAYERS_CACHE_DATE_KEY);
  const cachedPlayers = localStorage.getItem(PLAYERS_CACHE_KEY);

  if (cachedDate === today && cachedPlayers) {
    return JSON.parse(cachedPlayers);
  }

  const res = await fetch(`${SLEEPER_BASE}/players/nba`);
  const raw = await res.json();
  // Trim to only the fields the app uses — full blob (~5MB) blows mobile localStorage quota
  const players = {};
  for (const [id, p] of Object.entries(raw)) {
    players[id] = {
      first_name: p.first_name,
      last_name: p.last_name,
      fantasy_positions: p.fantasy_positions,
      team: p.team,
      status: p.status,
      sport_id: p.sport_id || null,
    };
  }
  try {
    localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(players));
    localStorage.setItem(PLAYERS_CACHE_DATE_KEY, today);
  } catch (e) {
    console.warn("players cache write failed", e);
  }
  return players;
}

async function fetchLeagueData(players) {
  const [rostersRes, usersRes, picksRes] = await Promise.all([
    fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`),
    fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`),
    fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`),
  ]);

  const [rosters, users, tradedPicks] = await Promise.all([
    rostersRes.json(),
    usersRes.json(),
    picksRes.json(),
  ]);

  const userMap = {};
  users.forEach(u => {
    userMap[u.user_id] = {
      username: u.display_name,
      teamName: u.metadata?.team_name || u.display_name,
      userId: u.user_id,
    };
  });

  function resolvePlayer(id) {
    const p = players[id];
    if (!p) return { id, name: `Unknown (${id})`, pos: [], team: "" };
    return {
      id,
      name: `${p.first_name} ${p.last_name}`,
      pos: p.fantasy_positions || [],
      team: p.team || "FA",
      status: p.status || "Active",
    };
  }

  const teams = rosters.map(roster => {
    const user = userMap[roster.owner_id] || { username: "Unknown", teamName: "Unknown Team", userId: null };
    const starterIds = roster.starters || [];
    const taxiIds = roster.taxi || [];
    const reserveIds = roster.reserve || [];
    const benchIds = (roster.players || []).filter(id =>
      !starterIds.includes(id) && !taxiIds.includes(id) && !reserveIds.includes(id)
    );

    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      teamName: user.teamName,
      username: user.username,
      starters: starterIds.map(resolvePlayer),
      bench: benchIds.map(resolvePlayer),
      taxi: taxiIds.map(resolvePlayer),
      reserve: reserveIds.map(resolvePlayer),
      isMe: user.username === "JelqEmDown31",
    };
  });

  teams.sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));

  return { teams, tradedPicks };
}

export function SleeperProvider({ children }) {
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState(() => {
    try {
      const cached = localStorage.getItem(LEAGUE_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [tradedPicks, setTradedPicks] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [startupDraft, setStartupDraft] = useState([]);

  async function sync() {
    setLoading(true);
    setError(null);
    try {
      const playerData = await fetchPlayers();
      setPlayers(playerData);
      const { teams: teamData, tradedPicks: picks } = await fetchLeagueData(playerData);
      setTeams(teamData);
      setTradedPicks(picks);
      setMyTeam(teamData.find(t => t.isMe) || null);
      setLastSynced(new Date().toLocaleTimeString());
      const draft = await fetchStartupDraft();
      setStartupDraft(draft);
      localStorage.setItem(LEAGUE_CACHE_KEY, JSON.stringify(teamData));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    sync();
  }, []);

  useEffect(() => {
    if (teams && !myTeam) {
      setMyTeam(teams.find(t => t.isMe) || null);
    }
  }, [teams]);

  return (
    <SleeperContext.Provider value={{ players, teams, myTeam, tradedPicks, startupDraft, loading, error, lastSynced, sync }}>
      {children}
    </SleeperContext.Provider>
  );
}
