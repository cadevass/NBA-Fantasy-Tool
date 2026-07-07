import { dbGet, dbSet } from "./supabase";

const KEY = "market_values";

export async function getMarketValues() {
  // Check localStorage first (works on corporate network)
  const local = localStorage.getItem(KEY);
  const localData = local ? JSON.parse(local) : null;
  
  try {
    const data = await dbGet("app_settings", KEY);
    if (data && data.length > 0) {
      // Supabase has data — cache to localStorage and return
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    }
    // Supabase empty but we have local data — push it up
    if (localData && localData.length > 0) {
      await dbSet("app_settings", KEY, localData);
      return localData;
    }
    return [];
  } catch {
    // Supabase unavailable — use localStorage
    return localData || [];
  }
}

export async function saveMarketValues(values) {
  localStorage.setItem(KEY, JSON.stringify(values));
  try {
    await dbSet("app_settings", KEY, values);
  } catch (e) {
    console.warn("Supabase unavailable — saved to localStorage, will sync when online");
  }
}

// Auto-sync localStorage to Supabase when network comes back online
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const local = localStorage.getItem(KEY);
    if (local) {
      try {
        const data = JSON.parse(local);
        await dbSet("app_settings", KEY, data);
        console.log("Market values synced to Supabase");
      } catch (e) {
        console.warn("Auto-sync failed:", e);
      }
    }
  });
}

export const TRENDS = ["Rising", "Stable", "Falling"];
export const CATEGORIES = ["My Roster", "League Player"];

export function getTrendColor(trend) {
  if (trend === "Rising") return "var(--green)";
  if (trend === "Falling") return "var(--red)";
  return "var(--accent-dim)";
}

export function getTrendBg(trend) {
  if (trend === "Rising") return "var(--green-bg)";
  if (trend === "Falling") return "var(--red-bg)";
  return "var(--accent-light)";
}

export function getTrendIcon(trend) {
  if (trend === "Rising") return "↑";
  if (trend === "Falling") return "↓";
  return "→";
}

export function getValueColor(value) {
  if (value >= 85) return "var(--green)";
  if (value >= 70) return "#2B7A3B";
  if (value >= 55) return "var(--accent-dim)";
  return "var(--red)";
}
