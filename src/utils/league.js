export const LEAGUE_CONFIG = {
  name: "The Backshot Dynasty",
  platform: "Sleeper",
  mode: "Lock-In",
  teams: 10,
  myPick: 8,
  draftType: "Linear",
  draftRounds: 3,
  myPicks: ["1.08", "2.08", "3.08"],
};

export const SCORING = {
  pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1,
  threesMade: 0.5, doubleDouble: 1, tripleDouble: 2,
  technicalFoul: -2, flagrantFoul: -1,
  bonus40pts: 2, bonus50pts: 2, bonus15ast: 1, bonus20reb: 1,
};

export function calcFantasyScore(stats) {
  const { pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, to = 0, threesMade = 0 } = stats;
  let score = 0;
  score += pts * SCORING.pts;
  score += reb * SCORING.reb;
  score += ast * SCORING.ast;
  score += stl * SCORING.stl;
  score += blk * SCORING.blk;
  score += to * SCORING.to;
  score += threesMade * SCORING.threesMade;

  const categories = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
  if (categories >= 3) score += SCORING.tripleDouble + SCORING.doubleDouble;
  else if (categories >= 2) score += SCORING.doubleDouble;

  if (pts >= 50) score += SCORING.bonus50pts + SCORING.bonus40pts;
  else if (pts >= 40) score += SCORING.bonus40pts;
  if (ast >= 15) score += SCORING.bonus15ast;
  if (reb >= 20) score += SCORING.bonus20reb;

  return Math.round(score * 10) / 10;
}

export const MY_ROSTER = {
  starters: [
    { name: "Cade Cunningham", pos: ["PG"], team: "DET", note: "Franchise cornerstone" },
    { name: "Dejounte Murray", pos: ["SG"], team: "NOP" },
    { name: "De'Aaron Fox", pos: ["PG", "SG"], team: "SAS", note: "Pillar" },
    { name: "Jalen Johnson", pos: ["SF", "PF"], team: "ATL", note: "Untouchable" },
    { name: "Franz Wagner", pos: ["PF", "SF"], team: "ORL" },
    { name: "Kel'el Ware", pos: ["C", "PF"], team: "MIA" },
    { name: "Alex Sarr", pos: ["C"], team: "WAS", note: "Future anchor" },
    { name: "Scoot Henderson", pos: ["PG"], team: "POR" },
    { name: "Donovan Clingan", pos: ["C"], team: "POR", note: "Young big future" },
  ],
  bench: [
    { name: "Jaden Ivey", pos: ["SG", "PG"], team: "FA", note: "Drop candidate — waived by CHI March 30 2026, knee injury, no team" },
    { name: "GG Jackson", pos: ["SF", "PF"], team: "MEM" },
    { name: "Jonathan Kuminga", pos: ["PF"], team: "ATL" },
    { name: "Peyton Watson", pos: ["SF", "PF"], team: "DEN" },
  ],
  taxi: [
    { name: "Tre Johnson", pos: ["SG", "PG"], team: "WAS" },
    { name: "C. Murray-Boyles", pos: ["C", "PF"], team: "TOR" },
    { name: "Kasparas Jakučionis", pos: ["PG", "SG"], team: "MIA" },
  ],
  draftCapital: [
    "2026 1st (1.08)", "2026 2nd (2.08)", "2026 3rd (3.08)",
    "2027 1st", "2027 2nd", "2027 3rd",
    "2028 1st", "2028 2nd", "2028 3rd",
  ],
};

export const LOCK_IN_CONTEXT = `
LOCK-IN MODE STRATEGY CONTEXT:
- Only ONE game per week per player counts. You choose to lock it in after it completes, or let Sleeper default to their final game.
- High-variance stars are MORE valuable — you only need one monster game.
- Consistent-but-modest producers are LESS valuable — ceiling is capped.
- Steals (2pts) and blocks (2pts) are worth 2x vs assists/rebounds — defensive playmakers are premium.
- 40+ and 50+ point bonuses reward volume scorers heavily.
- Double-double and triple-double bonuses reward versatile high-usage players.
- Players must be in starting lineup BEFORE the game to be eligible.
`;

export const DYNASTY_CONTEXT = `
MY DYNASTY SITUATION:
- Young core with a 2-3 year dynasty window opening.
- Pillars: Cade Cunningham (PG, DET), De'Aaron Fox (PG/SG, SAS), Jalen Johnson (SF/PF, ATL — untouchable).
- Future bigs: Alex Sarr (C, WAS), Donovan Clingan (C, POR), Kel'el Ware (C/PF, MIA).
- Drop candidate: Jaden Ivey — free agent, knee injury, no team, dynasty value in freefall.
- Rich in draft capital: 1st/2nd/3rd in 2026, 2027, 2028.
- 2026 rookie draft picks: 1.08, 2.03, 3.08 (linear draft, pick 8th every round).
- Need SG depth and high-ceiling SF/PF to complement the core.
`;

export const AI_SYSTEM_PROMPT = `You are an expert NBA fantasy basketball analyst for a dynasty league called "The Backshot Dynasty" on Sleeper.

SCORING SYSTEM:
- Points: 0.5 | Rebounds: 1 | Assists: 1 | Steals: 2 | Blocks: 2 | Turnovers: -1
- 3PM bonus: 0.5 | Double-Double: +1 | Triple-Double: +2
- Technical Foul: -2 | Flagrant Foul: -1
- 40+ points: +2 | 50+ points: +2 | 15+ assists: +1 | 20+ rebounds: +1

${LOCK_IN_CONTEXT}
${DYNASTY_CONTEXT}

IMPORTANT: This is a FANTASY BASKETBALL dynasty league, not real NBA roster construction. Players do not play alongside each other — roster fit means filling open positional slots (PG, SG, G, SF, PF, F, C, UTIL) and maximising fantasy scoring output. Never analyse real-world on-court chemistry, ball-handler competition, or playing time sharing between my players. Analyse fantasy value only: scoring ceiling, stat production, positional eligibility, and dynasty window alignment.

Be direct, data-driven, and opinionated. Give clear verdicts. No hedging. Format your response concisely.`;
