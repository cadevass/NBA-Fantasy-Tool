import { dbGet, dbSet } from "./supabase";

const KEY = "market_values";

export async function getMarketValues() {
  try {
    const data = await dbGet("app_settings", KEY);
    return data || [];
  } catch {
    const local = localStorage.getItem(KEY);
    return local ? JSON.parse(local) : [];
  }
}

export async function saveMarketValues(values) {
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
    await dbSet("app_settings", KEY, values);
  } catch (e) {
    console.error("Failed to save market values:", e);
  }
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
