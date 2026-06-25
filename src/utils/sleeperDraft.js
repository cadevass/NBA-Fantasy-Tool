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

export function buildDraftContext(picks, teams) {
  if (!picks?.length || !teams?.length) return "";

  const lines = ["STARTUP DRAFT RESULTS (fantasy dynasty draft — not NBA draft):"];
  lines.push("Players drafted in rounds 1-2 of this startup are considered core assets by their owners.");
  lines.push("A player drafted in round 1-2 who is currently performing well (15+ ppg) is almost certainly UNTOUCHABLE.");
  lines.push("Only suggest trading a round 1-2 pick if: (a) they are injured long-term, (b) they have severely underperformed, or (c) the owner has explicitly signalled they are open to trading them.");
  lines.push("");

  teams.forEach(team => {
    const teamPicks = picks
      .filter(p => p.rosterId === team.rosterId)
      .sort((a, b) => a.pickNo - b.pickNo);

    if (teamPicks.length > 0) {
      const r1 = teamPicks.filter(p => p.round === 1).map(p => `${p.playerName} (Pick ${p.pickNo})`).join(", ");
      const r2 = teamPicks.filter(p => p.round === 2).map(p => `${p.playerName} (Pick ${p.pickNo})`).join(", ");
      const r3plus = teamPicks.filter(p => p.round >= 3).map(p => `${p.playerName} (Rd${p.round} Pick ${p.pickNo})`).join(", ");

      lines.push(`${team.teamName || team.username}:`);
      if (r1) lines.push(`  Round 1 (UNTOUCHABLE if performing): ${r1}`);
      if (r2) lines.push(`  Round 2 (likely untouchable if performing): ${r2}`);
      if (r3plus) lines.push(`  Round 3+ (potentially available): ${r3plus}`);
    }
  });

  return lines.join("\n");
}
