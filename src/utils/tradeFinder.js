// src/utils/tradeFinder.js
// Phase 5 — Proactive Trade Finder
// Scans all 9 opponent rosters vs consensus rankings + manager profiles
// to surface asymmetric trade opportunities.

const CACHE_KEY = "trade_finder_cache";

export function getFinderCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

export function saveFinderCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: new Date().toISOString() })); } catch {}
}

export function isCacheStale(cache) {
  if (!cache?.cachedAt) return true;
  return Date.now() - new Date(cache.cachedAt).getTime() > 24 * 60 * 60 * 1000;
}

// Score each opponent player as a trade target
// Returns sorted list of opportunities
export function findOpportunities({ teams, rankings, myTeam, aiProfiles, teamContexts, dynastyMode }) {
  const opportunities = [];
  const myRosterNames = new Set(
    [...(myTeam?.starters || []), ...(myTeam?.bench || []), ...(myTeam?.taxi || [])]
      .map(p => p.name.toLowerCase())
  );

  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // My sell candidates — players I want to move
  const mySellCandidates = rankings.filter(r =>
    r.category === "My Roster" && (r.value < 70 || r.trend === "Falling")
  );

  for (const team of (teams || [])) {
    if (team.isMe) continue;
    const profile = aiProfiles?.[String(team.rosterId)];
    const ctx = teamContexts?.[team.rosterId] || {};
    const status = ctx.status || "unknown";

    const allPlayers = [...team.starters, ...team.bench, ...(team.taxi || [])];

    for (const player of allPlayers) {
      const rv = rankings.find(r =>
        norm(r.name) === norm(player.name) && r.category === "League Player"
      );
      if (!rv) continue;

      const opportunities_for_player = [];

      // Angle 1: Value asymmetry — you value them higher than market implies
      // (community value would be needed for precise gap, estimate from trend)
      if (rv.value >= 70 && rv.trend === "Rising") {
        opportunities_for_player.push({
          angle: "rising",
          label: "Rising asset",
          detail: `${rv.value}/100 Rising — market may not have priced in trajectory yet`,
          urgency: rv.value >= 80 ? "high" : "medium",
        });
      }

      // Angle 2: Timeline mismatch — contender holding future assets or rebuilder holding vets
      if (status === "Rebuilding" && rv.value >= 75 && (player.pos || []).includes("PG")) {
        opportunities_for_player.push({
          angle: "timeline",
          label: "Timeline mismatch",
          detail: `${team.username} is rebuilding but holds a high-value ${rv.value}/100 player`,
          urgency: "medium",
        });
      }

      // Angle 3: Inactive/disengaged manager
      if (profile?.includes("CHRONIC INACTIVITY") || profile?.includes("auto-lock signals: 6")) {
        opportunities_for_player.push({
          angle: "inactive",
          label: "Inactive manager",
          detail: "Manager shows chronic inactivity — may accept below-market offers",
          urgency: "high",
        });
      }

      // Angle 4: Sell-high opportunity — one of my candidates fits their need
      const theirNeed = status === "Contending" ? mySellCandidates.filter(s => s.trend !== "Falling") : [];
      if (theirNeed.length > 0 && rv.value >= 72) {
        opportunities_for_player.push({
          angle: "sell_high",
          label: "Sell-high match",
          detail: `Can package ${theirNeed[0]?.name} (sell candidate) for ${player.name}`,
          urgency: "medium",
        });
      }

      if (opportunities_for_player.length > 0) {
        const urgencyScore = opportunities_for_player.filter(o => o.urgency === "high").length * 2
          + opportunities_for_player.filter(o => o.urgency === "medium").length;

        opportunities.push({
          player: player.name,
          playerValue: rv.value,
          playerTrend: rv.trend,
          team: team.username,
          rosterId: team.rosterId,
          pos: player.pos || [],
          angles: opportunities_for_player,
          urgencyScore,
          status,
        });
      }
    }
  }

  // Sort by urgency then value
  return opportunities
    .sort((a, b) => b.urgencyScore - a.urgencyScore || b.playerValue - a.playerValue)
    .slice(0, 8);
}
