// Team classification and context
// Stored in localStorage, manually set by user

const KEY = "trade_team_context";

export const TEAM_STATUSES = [
  { value: "contender", label: "🟢 Contender", description: "Top 3 projection, win-now mode" },
  { value: "fringe", label: "🟡 Playoff Fringe", description: "Competing but not quite there" },
  { value: "rebuilder", label: "🔴 Rebuilding", description: "Trading vets for picks/youth" },
  { value: "unknown", label: "⚪ Unknown", description: "Not yet classified" },
];

export function getTeamContexts() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch { return {}; }
}

export function setTeamContext(rosterId, context) {
  const all = getTeamContexts();
  all[rosterId] = context;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getTeamContext(rosterId) {
  return getTeamContexts()[rosterId] || { status: "unknown", notes: "" };
}

// Value adjustment based on team context and player type
export function contextValueAdjustment(playerAge, teamStatus) {
  const age = parseInt(playerAge) || 25;
  const isYoung = age <= 23;
  const isPrime = age >= 24 && age <= 28;
  const isVet = age >= 29;

  if (teamStatus === "contender") {
    if (isPrime) return 1.15;
    if (isVet) return 1.05;
    if (isYoung) return 0.90;
  }
  if (teamStatus === "rebuilder") {
    if (isYoung) return 1.20;
    if (isPrime) return 0.90;
    if (isVet) return 0.70;
  }
  return 1.0; // fringe or unknown
}
