import { dbGet, dbSet } from "./supabase";

const KEY = "consensus_rankings";

export async function getRankings() {
  try {
    const local = localStorage.getItem(KEY);
    const localData = local ? JSON.parse(local) : null;
    const remote = await dbGet("app_settings", KEY);
    if (remote && remote.length > 0) {
      localStorage.setItem(KEY, JSON.stringify(remote));
      return remote;
    }
    if (localData && localData.length > 0) {
      await dbSet("app_settings", KEY, localData);
      return localData;
    }
    return [];
  } catch {
    const local = localStorage.getItem(KEY);
    return local ? JSON.parse(local) : [];
  }
}

export async function saveRankings(players) {
  localStorage.setItem(KEY, JSON.stringify(players));
  try {
    await dbSet("app_settings", KEY, players);
  } catch {
    console.warn("Supabase unavailable — saved to localStorage, will sync when online");
  }
}

// Auto-sync when network comes back
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const local = localStorage.getItem(KEY);
    if (local) {
      try {
        const data = JSON.parse(local);
        await dbSet("app_settings", KEY, data);
        console.log("Rankings synced to Supabase");
      } catch {}
    }
  });
}

// Fuzzy name match — normalise and compare
export function fuzzyMatch(playerName, searchName) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pn = norm(playerName);
  const sn = norm(searchName);
  if (pn === sn) return 1.0;
  if (pn.includes(sn) || sn.includes(pn)) return 0.9;
  // Last name match
  const lastName = s => norm(s.split(" ").slice(-1)[0]);
  if (lastName(playerName) === lastName(searchName)) return 0.7;
  return 0;
}

export function findPlayerInRankings(rankings, name) {
  if (!name || !rankings?.length) return null;
  let best = null;
  let bestScore = 0;
  for (const p of rankings) {
    const score = fuzzyMatch(p.name, name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0.7 ? best : null;
}

// Sort rankings by value desc, tiebreak by id
export function sortRankings(players) {
  return [...players].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

// Apply batch news updates with snapshot for revert
export function applyNewsUpdate(players, adjustments) {
  // Snapshot before update
  const snapshot = JSON.parse(JSON.stringify(players));
  
  const updated = players.map(p => {
    const adj = adjustments.find(a => a.id === p.id);
    if (!adj) return p;
    const valueBefore = p.value;
    const valueAfter = Math.max(0, Math.min(100, p.value + adj.delta));
    const newsEntry = {
      id: Date.now() + Math.random(),
      date: new Date().toISOString().split("T")[0],
      headline: adj.headline,
      impact: adj.impact,
      valueBefore,
      valueAfter,
      delta: adj.delta,
      snapshot: valueBefore, // store pre-update value for revert
    };
    return {
      ...p,
      value: valueAfter,
      trend: adj.delta > 3 ? "Rising" : adj.delta < -3 ? "Falling" : p.trend,
      updatedAt: new Date().toISOString().split("T")[0],
      newsLog: [newsEntry, ...(p.newsLog || []).slice(0, 9)], // cap at 10
    };
  });

  return { updated, snapshot };
}

// Revert a single news entry
export function revertNewsEntry(players, playerId, newsEntryId) {
  return players.map(p => {
    if (p.id !== playerId) return p;
    const entry = p.newsLog?.find(n => n.id === newsEntryId);
    if (!entry) return p;
    return {
      ...p,
      value: entry.valueBefore,
      trend: entry.valueBefore > p.value ? "Rising" : entry.valueBefore < p.value ? "Falling" : p.trend,
      newsLog: (p.newsLog || []).filter(n => n.id !== newsEntryId),
      updatedAt: new Date().toISOString().split("T")[0],
    };
  });
}

export const TIERS = {
  1: { label: "T1 — Elite", color: "var(--green)" },
  2: { label: "T2 — Star", color: "#2B7A3B" },
  3: { label: "T3 — Solid", color: "var(--accent-dim)" },
  4: { label: "T4 — Depth", color: "var(--text-muted)" },
  5: { label: "T5 — Stash", color: "var(--text-muted)" },
};

export function getTierFromValue(value) {
  if (value >= 85) return 1;
  if (value >= 72) return 2;
  if (value >= 58) return 3;
  if (value >= 42) return 4;
  return 5;
}

export function getBuySell(player) {
  if (player.trend === "Rising") return { label: "BUY", color: "var(--green)", bg: "var(--green-bg)" };
  if (player.trend === "Falling") return { label: "SELL", color: "var(--red)", bg: "var(--red-bg)" };
  return { label: "HOLD", color: "var(--accent-dim)", bg: "var(--accent-light)" };
}

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const CATEGORIES = ["My Roster", "League Player", "Free Agent"];
