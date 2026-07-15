import { calcSeasonAverageFP } from "./league";
import { buildDraftContext } from "./sleeperDraft";
import { INTERACTION_TYPES } from "./negotiationLog";

// Master context builder — feeds every AI prompt across every page
// Rankings now powers everything — marketValues param accepts consensus_rankings data
export function buildFullContext({
  myTeam,
  nbaPlayers,
  marketValues = [],
  negLog = [],
  tradeBlock = [],
  teamContexts = {},
  startupDraft = [],
  teams = [],
  targetRosterId = null,
  pageContext = {},
  aiProfiles = {},
  dynastyMode = "contending",
}) {
  const sections = [];

  // ── DYNASTY MODE ──
  sections.push(`DYNASTY MODE: ${dynastyMode.toUpperCase()}
${dynastyMode === "contending" ? "You are CONTENDING NOW. You are willing to trade picks and younger players to win immediately. Prioritise proven production, floor reliability, and immediate fantasy output. You can afford to give up future assets for proven contributors." : "You are REBUILDING. You are willing to trade proven veterans and win-now players to accumulate picks, youth, and long-term assets. Prioritise age curve, upside, and draft capital. Veterans are expendable — youth and picks are the currency."}`);

  // ── SCORING SYSTEM ──
  sections.push(`SCORING SYSTEM (Lock-In mode — think in fantasy points, not raw stats):
pts×0.5, reb×1, ast×1, stl×2, blk×2, TO×-1, 3PM×0.5
Bonuses: DD+1, TD+2, 40pts+2, 50pts+2, 15ast+1, 20reb+1
CRITICAL: Steals and blocks are worth 2x — defensive playmakers are premium assets in this league.`);

  // ── MY ROSTER ──
  if (myTeam) {
    const allPlayers = [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])];
    const rosterLines = allPlayers.map(p => {
      const stats = nbaPlayers?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase());
      const mv = marketValues.find(m => m.name.toLowerCase().replace(/[^a-z0-9 ]/g, '') === p.name.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
      const avgFP = stats ? calcSeasonAverageFP(stats) : null;
      const parts = [p.name];
      if (stats) parts.push(`${stats.pts}pts/${stats.reb}reb/${stats.ast}ast/${stats.stl}stl/${stats.blk}blk Age ${stats.age}`);
      if (avgFP) parts.push(`~${avgFP} FP/game avg`);
      if (mv) parts.push(`Market Value: ${mv.value}/100 (${mv.trend}) — ${mv.summary}`);
      return parts.join(' | ');
    });

    sections.push(`MY ROSTER — THE BACKSHOT DYNASTY:
${rosterLines.join("\n")}`);

    // Untouchables and sell candidates derived from market values
    const untouchables = marketValues.filter(m => m.category === "My Roster" && m.value >= 85).map(m => m.name);
    const sellCandidates = marketValues.filter(m => m.category === "My Roster" && (m.value < 70 || m.trend === "Falling")).map(m => `${m.name} (${m.value}/100, ${m.trend})`);
    const holds = marketValues.filter(m => m.category === "My Roster" && m.value >= 70 && m.value < 85 && m.trend !== "Falling").map(m => m.name);

    sections.push(`MARKET VALUE SCALE: Values are out of 100 representing current dynasty trade market value. 90+ = elite franchise asset (very high ask required but available for the right price). 75-89 = strong asset (meaningful return needed). 60-74 = solid tradeable piece. Below 60 = declining or limited value, more moveable. NO player is completely untouchable — the right offer changes everything. Use these values to calibrate realistic trade expectations, not as hard rules.`);
  }

  // ── MY TRADE BLOCK ──
  const myBlock = tradeBlock.filter(p => p.owner === "My Roster");
  if (myBlock.length > 0) {
    sections.push(`MY PLAYERS ON THE TRADE BLOCK (actively available):
${myBlock.map(p => `${p.name}${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
  }

  // ── STARTUP DRAFT CONTEXT ──
  if (startupDraft?.length > 0 && teams?.length > 0) {
    sections.push(`STARTUP DRAFT CONTEXT (use to gauge emotional attachment to players):
${buildDraftContext(startupDraft, teams)}`);
  }

  // ── TARGET TEAM CONTEXT ──
  if (targetRosterId) {
    const targetTeam = teams.find(t => t.rosterId === targetRosterId);
    const ctx = teamContexts[targetRosterId] || {};
    const teamNeg = negLog.filter(n => n.rosterId === targetRosterId).sort((a, b) => b.id - a.id);
    const theirBlock = tradeBlock.filter(p => p.owner === "League Player" && p.team === String(targetRosterId));

    if (targetTeam) {
      const rosterLines = [...targetTeam.starters, ...targetTeam.bench, ...(targetTeam.taxi || [])].map(p => {
        const stats = nbaPlayers?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase());
        const mv = marketValues.find(m => m.name.toLowerCase().replace(/[^a-z0-9 ]/g, '') === p.name.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
        const parts = [p.name];
        if (stats) parts.push(`${stats.pts}pts/${stats.reb}reb/${stats.ast}ast Age ${stats.age}`);
        if (mv) parts.push(`Value: ${mv.value}/100 (${mv.trend})`);
        return parts.join(' | ');
      });

      sections.push(`TARGET TEAM: ${targetTeam.teamName || targetTeam.username}
Status: ${ctx.status || "unknown"}
Scouting Notes: ${ctx.notes || "none"}
Their Roster:
${rosterLines.join("\n")}`);
    }

    if (teamNeg.length > 0) {
      const negLines = teamNeg.map(n => {
        const typeLabel = INTERACTION_TYPES.find(t => t.value === n.type)?.label || n.type;
        const parts = [`[${n.date}] ${typeLabel}`];
        if (n.iGive) parts.push(`I offered: ${n.iGive}`);
        if (n.iReceive) parts.push(`For: ${n.iReceive}`);
        if (n.notes) parts.push(`Notes: ${n.notes}`);
        return parts.join(" | ");
      });

      sections.push(`NEGOTIATION HISTORY WITH THIS MANAGER (critical — use to calibrate all offers):
${negLines.join("\n")}

PATTERN: ${teamNeg.filter(n => n.type === "declined").length} declined, ${teamNeg.filter(n => n.type === "accepted" || n.type === "completed").length} accepted, ${teamNeg.filter(n => n.type === "countered").length} countered${teamNeg.filter(n => n.type === "declined").length >= 2 ? " — this manager tends to decline, raise your offers" : ""}${teamNeg.filter(n => n.type === "accepted").length >= 2 ? " — this manager tends to accept, push harder" : ""}`);
    }

    if (theirBlock.length > 0) {
      sections.push(`THEIR PLAYERS ON THE TRADE BLOCK (confirmed available):
${theirBlock.map(p => `${p.name}${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
    }

    // League trade block (all managers)
    const leagueBlock = tradeBlock.filter(p => p.owner === "League Player");
    if (leagueBlock.length > 0) {
      sections.push(`LEAGUE TRADE BLOCK (players confirmed available across all teams):
${leagueBlock.map(p => `${p.name} (${p.team || "unknown owner"})${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
    }
  }

  // ── PAGE-SPECIFIC CONTEXT ──
  if (pageContext.additionalContext) {
    sections.push(`ADDITIONAL INTEL (treat as hard facts — highest priority):
${pageContext.additionalContext}`);
  }

  return sections.join("\n\n═══════════════════════════════\n\n");
}
