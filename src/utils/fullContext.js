import { calcSeasonAverageFP } from "./league";
import { buildDraftContext } from "./sleeperDraft";
import { INTERACTION_TYPES } from "./negotiationLog";

// Available slices — each page declares only what it needs
// ALL_SLICES is the default (backward-compatible for any call that omits slices)
export const ALL_SLICES = [
  "dynasty_mode",
  "scoring",
  "roster",
  "market_values",
  "trade_block",
  "draft_context",
  "target_team",
  "additional_context",
];

// Per-page recommended slice sets
export const PAGE_SLICES = {
  dashboard:    ["dynasty_mode", "scoring", "roster"],
  lockin:       ["dynasty_mode", "scoring", "roster"],
  waivers:      ["dynasty_mode", "scoring", "roster", "market_values"],
  bigboard:     ["dynasty_mode", "scoring", "roster", "market_values"],
  trade:        ALL_SLICES,
  rankings:     ["dynasty_mode", "scoring", "roster", "market_values"],
};

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
  slices = ALL_SLICES, // declare what this call needs
}) {
  const has = s => slices.includes(s);
  const sections = [];

  // ── DYNASTY MODE ──
  if (has("dynasty_mode")) {
    sections.push(`DYNASTY MODE: ${dynastyMode.toUpperCase()}
${dynastyMode === "contending"
  ? "You are CONTENDING NOW. Trade picks and younger players to win immediately. Prioritise proven production, floor reliability, and immediate fantasy output."
  : "You are REBUILDING. Trade proven veterans to accumulate picks, youth, and long-term assets. Veterans are expendable — youth and picks are the currency."}`);
  }

  // ── SCORING SYSTEM ──
  if (has("scoring")) {
    sections.push(`SCORING SYSTEM (Lock-In mode):
pts×0.5, reb×1, ast×1, stl×2, blk×2, TO×-1, 3PM×0.5
Bonuses: DD+1, TD+2, 40pts+2, 50pts+2, 15ast+1, 20reb+1
CRITICAL: Steals and blocks are worth 2x — defensive playmakers are premium assets.`);
  }

  // ── MY ROSTER ──
  if (has("roster") && myTeam) {
    const allPlayers = [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])];
    const rosterLines = allPlayers.map(p => {
      const stats = nbaPlayers?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase());
      const avgFP = stats ? calcSeasonAverageFP(stats) : null;
      const parts = [p.name];
      if (stats) parts.push(`${stats.pts}pts/${stats.reb}reb/${stats.ast}ast/${stats.stl}stl/${stats.blk}blk Age ${stats.age}`);
      if (avgFP) parts.push(`~${avgFP} FP/game avg`);
      if (has("market_values")) {
        const mv = marketValues.find(m => m.name.toLowerCase().replace(/[^a-z0-9 ]/g, '') === p.name.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
        if (mv) parts.push(`Value: ${mv.value}/100 (${mv.trend}) — ${mv.summary}`);
      }
      return parts.join(' | ');
    });
    sections.push(`MY ROSTER — THE BACKSHOT DYNASTY:\n${rosterLines.join("\n")}`);
  }

  // ── MARKET VALUE SCALE ──
  if (has("market_values") && myTeam) {
    const sellCandidates = marketValues
      .filter(m => m.category === "My Roster" && (m.value < 70 || m.trend === "Falling"))
      .map(m => `${m.name} (${m.value}/100, ${m.trend})`);
    sections.push(`MARKET VALUE SCALE: Values out of 100. 90+ = elite franchise asset. 75-89 = strong asset. 60-74 = solid piece. Below 60 = moveable. NO player is untouchable — the right price changes everything.${sellCandidates.length ? `\nSell candidates: ${sellCandidates.join(", ")}` : ""}`);
  }

  // ── MY TRADE BLOCK ──
  if (has("trade_block")) {
    const myBlock = tradeBlock.filter(p => p.owner === "My Roster");
    if (myBlock.length > 0) {
      sections.push(`MY PLAYERS ON THE TRADE BLOCK:\n${myBlock.map(p => `${p.name}${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
    }
  }

  // ── STARTUP DRAFT CONTEXT ──
  if (has("draft_context") && startupDraft?.length > 0 && teams?.length > 0) {
    sections.push(`STARTUP DRAFT CONTEXT (emotional attachment gauge):\n${buildDraftContext(startupDraft, teams)}`);
  }

  // ── TARGET TEAM CONTEXT ──
  if (has("target_team") && targetRosterId) {
    const targetTeam = teams.find(t => t.rosterId === targetRosterId);
    const ctx = teamContexts[targetRosterId] || {};
    const teamNeg = negLog.filter(n => n.rosterId === targetRosterId).sort((a, b) => b.id - a.id);
    const theirBlock = tradeBlock.filter(p => p.owner === "League Player" && p.team === String(targetRosterId));
    const leagueBlock = tradeBlock.filter(p => p.owner === "League Player");

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
Their Roster:\n${rosterLines.join("\n")}`);
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
      const declined = teamNeg.filter(n => n.type === "declined").length;
      const accepted = teamNeg.filter(n => n.type === "accepted" || n.type === "completed").length;
      const countered = teamNeg.filter(n => n.type === "countered").length;
      sections.push(`NEGOTIATION HISTORY (calibrate all offers):
${negLines.join("\n")}
PATTERN: ${declined} declined, ${accepted} accepted, ${countered} countered${declined >= 2 ? " — tends to decline, raise your offers" : ""}${accepted >= 2 ? " — tends to accept, push harder" : ""}`);
    }

    if (theirBlock.length > 0) {
      sections.push(`THEIR TRADE BLOCK:\n${theirBlock.map(p => `${p.name}${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
    }

    if (leagueBlock.length > 0) {
      sections.push(`LEAGUE TRADE BLOCK:\n${leagueBlock.map(p => `${p.name} (${p.team || "unknown"})${p.notes ? ` — ${p.notes}` : ""}`).join("\n")}`);
    }

    // AI behavioural profile
    if (aiProfiles[targetRosterId]) {
      sections.push(`AI BEHAVIOURAL PROFILE FOR THIS MANAGER:\n${aiProfiles[targetRosterId]}`);
    }
  }

  // ── PAGE-SPECIFIC CONTEXT ──
  if (has("additional_context") && pageContext.additionalContext) {
    sections.push(`ADDITIONAL INTEL (treat as hard facts — highest priority):\n${pageContext.additionalContext}`);
  }

  return sections.join("\n\n═══════════════════════════════\n\n");
}
