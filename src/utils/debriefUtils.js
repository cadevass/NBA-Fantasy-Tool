// src/utils/debriefUtils.js
// Debrief system utilities — fetches matchup data, weekly schedules,
// resolves player info for the lock-in debrief UI.
import { getWeekDateRange } from "./weekUtils";

const LEAGUE_ID = "1371805753509158912";
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const MY_ROSTER_ID = 1;

// Fetch both sides of a matchup for a given week
export async function fetchMatchupData(week, sleeperPlayers, teams) {
  const res = await fetch(
    `https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${week}`
  );
  if (!res.ok) throw new Error(`Matchup fetch failed: ${res.status}`);
  const matchups = await res.json();
  if (!matchups?.length) return null;

  // Find my matchup
  const mine = matchups.find(m => m.roster_id === MY_ROSTER_ID);
  if (!mine) return null;
  const opponent = matchups.find(
    m => m.matchup_id === mine.matchup_id && m.roster_id !== MY_ROSTER_ID
  );

  return {
    mine: resolveMatchup(mine, sleeperPlayers, teams),
    opponent: opponent ? resolveMatchup(opponent, sleeperPlayers, teams) : null,
    week,
  };
}

function resolveMatchup(matchup, sleeperPlayers, teams) {
  const team = teams?.find(t => t.rosterId === matchup.roster_id);
  const starterIds = matchup.starters || [];
  const allIds = matchup.players || [];
  const benchIds = allIds.filter(id => !starterIds.includes(id));
  const points = matchup.players_points || {};
  const starterPoints = matchup.starters_points || {};

  const STARTER_SLOTS = ["PG","SG","G","SF","PF","F","C","UTIL","UTIL"];

  function resolvePlayer(id, slotIndex = null) {
    const p = sleeperPlayers?.[String(id)];
    const name = p ? `${p.first_name} ${p.last_name}` : `Player ${id}`;
    const pos = p?.fantasy_positions || [];
    const nbaTeam = p?.team || "FA";
    return {
      id: String(id),
      name,
      pos,
      nbaTeam,
      slot: slotIndex !== null ? STARTER_SLOTS[slotIndex] : "BN",
      lockedFP: starterIds.includes(id) ? (starterPoints[id] ?? null) : null,
      totalFP: points[id] ?? null,
      isStarter: starterIds.includes(id),
    };
  }

  return {
    rosterId: matchup.roster_id,
    matchupId: matchup.matchup_id,
    username: team?.username || `Team ${matchup.roster_id}`,
    totalPoints: matchup.points || 0,
    starters: starterIds.map((id, i) => resolvePlayer(id, i)),
    bench: benchIds.map(id => resolvePlayer(id)),
    allPlayers: allIds.map((id, i) =>
      resolvePlayer(id, starterIds.includes(id) ? starterIds.indexOf(id) : null)
    ),
  };
}

// Fetch a team's games for a specific week
// Returns array of { date, opponent, opponentAbbr, opponentLogo, homeAway }
export async function fetchTeamWeekSchedule(nbaTeamAbbr, weekNumber) {
  const range = getWeekDateRange(weekNumber);
  if (!range) return [];

  try {
    const res = await fetch(
      `${ESPN_BASE}/teams/${nbaTeamAbbr}/schedule?season=2027`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data.events || [];

    // Filter to games within the week's date range (AWST = UTC+8)
    return events
      .filter(e => {
        const gameDate = new Date(e.date);
        const gameDateAWST = new Date(gameDate.getTime() + 8 * 60 * 60 * 1000);
        return gameDateAWST >= range.start && gameDateAWST <= range.end;
      })
      .map(e => {
        const comp = e.competitions?.[0];
        const isHome = comp?.competitors?.find(c => c.homeAway === "home")
          ?.team?.abbreviation === nbaTeamAbbr;
        const opp = comp?.competitors?.find(c =>
          c.team?.abbreviation !== nbaTeamAbbr
        );
        return {
          date: e.date,
          dateStr: new Date(e.date).toISOString().slice(0, 10),
          gameId: e.id,
          opponent: opp?.team?.displayName || "?",
          opponentAbbr: opp?.team?.abbreviation || "?",
          opponentLogo: opp?.team?.logo || null,
          homeAway: isHome ? "vs" : "@",
          label: `${isHome ? "vs" : "@"} ${opp?.team?.abbreviation || "?"}`,
        };
      });
  } catch {
    return [];
  }
}

// Query game_logs for a specific player + date to get their FP
export async function fetchPlayerGameFP(playerName, gameDate) {
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("game_logs")
      .select("fp, pts, reb, ast, stl, blk, min")
      .ilike("player_name", playerName)
      .eq("game_date", gameDate)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

// Debrief storage
const DEBRIEF_KEY = "debrief_history";

export function getDebriefHistory() {
  try { return JSON.parse(localStorage.getItem(DEBRIEF_KEY) || "[]"); } catch { return []; }
}

export async function saveDebrief(debrief) {
  const history = getDebriefHistory();
  const existing = history.findIndex(d => d.week === debrief.week);
  if (existing >= 0) history[existing] = debrief;
  else history.unshift(debrief);
  try { localStorage.setItem(DEBRIEF_KEY, JSON.stringify(history)); } catch {}
  try {
    const { dbSet } = await import("./supabase");
    await dbSet("app_settings", DEBRIEF_KEY, history);
  } catch {}
}
