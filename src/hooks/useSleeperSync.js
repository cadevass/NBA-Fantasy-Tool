import { useState } from "react";

const LEAGUE_ID = "1371805753509158912";
const SLEEPER_BASE = "https://api.sleeper.app/v1";

export function useSleeperSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leagueData, setLeagueData] = useState(null);

  async function sync() {
    setLoading(true);
    setError(null);
    try {
      // Fetch all in parallel
      const [rostersRes, usersRes, playersRes] = await Promise.all([
        fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`),
        fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`),
        fetch(`${SLEEPER_BASE}/players/nba`),
      ]);

      const [rosters, users, players] = await Promise.all([
        rostersRes.json(),
        usersRes.json(),
        playersRes.json(),
      ]);

      // Map user_id -> display name / team name
      const userMap = {};
      users.forEach(u => {
        userMap[u.user_id] = {
          username: u.display_name,
          teamName: u.metadata?.team_name || u.display_name,
        };
      });

      // Helper to resolve player ID to name + position
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

      // Build full team list
      const teams = rosters.map(roster => {
        const user = userMap[roster.owner_id] || { username: "Unknown", teamName: "Unknown Team" };
        return {
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          teamName: user.teamName,
          username: user.username,
          starters: (roster.starters || []).map(resolvePlayer),
          bench: (roster.players || [])
            .filter(id => !(roster.starters || []).includes(id) && !(roster.taxi || []).includes(id) && !(roster.reserve || []).includes(id))
            .map(resolvePlayer),
          taxi: (roster.taxi || []).map(resolvePlayer),
          reserve: (roster.reserve || []).map(resolvePlayer),
          isMe: user.teamName?.includes("Backshot") || user.username === "JelqEmDown31",
        };
      });

      // Sort so my team is first
      teams.sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));

      setLeagueData(teams);
      return teams;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { sync, loading, error, leagueData };
}
