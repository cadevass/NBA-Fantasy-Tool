const STARTUP_DRAFT_ID = "1228234415201583104";
const CACHE_KEY = "sleeper_startup_draft";

export async function fetchStartupDraft() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const res = await fetch(`https://api.sleeper.app/v1/draft/${STARTUP_DRAFT_ID}/picks`);
    const picks = await res.json();

    const data = picks.map(p => ({
      pickNo: p.pick_no,
      round: p.round,
      slot: p.draft_slot,
      playerName: `${p.metadata.first_name} ${p.metadata.last_name}`,
      playerId: p.player_id,
      pickedBy: p.picked_by,
      rosterId: p.roster_id,
    }));

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("Startup draft fetch error:", e);
    return [];
  }
}

// Get a summary of what each roster owns and at what pick
export function buildDraftContext(picks, teams) {
  if (!picks?.length || !teams?.length) return "";

  const lines = [];
  teams.forEach(team => {
    const teamPicks = picks
      .filter(p => p.rosterId === team.rosterId)
      .sort((a, b) => a.pickNo - b.pickNo);

    if (teamPicks.length > 0) {
      const topPicks = teamPicks.slice(0, 5).map(p => `${p.playerName} (Pick ${p.pickNo})`).join(", ");
      lines.push(`${team.teamName || team.username}: drafted ${topPicks}`);
    }
  });

  return lines.join("\n");
}
