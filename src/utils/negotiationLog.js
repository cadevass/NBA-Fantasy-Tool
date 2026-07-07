import { dbGet, dbSet } from "./supabase";

const KEY = "negotiation_log";

export async function getNegotiationLog() {
  try {
    const local = localStorage.getItem(KEY);
    const localData = local ? JSON.parse(local) : [];
    const data = await dbGet("app_settings", KEY);
    if (data && data.length > 0) {
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    }
    if (localData.length > 0) {
      await dbSet("app_settings", KEY, localData);
    }
    return localData;
  } catch {
    const local = localStorage.getItem(KEY);
    return local ? JSON.parse(local) : [];
  }
}

export async function saveNegotiationLog(log) {
  localStorage.setItem(KEY, JSON.stringify(log));
  try {
    await dbSet("app_settings", KEY, log);
  } catch {}
}

export const INTERACTION_TYPES = [
  { value: "offer_sent", label: "Offer Sent" },
  { value: "offer_received", label: "Offer Received" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "countered", label: "Countered" },
  { value: "inquiry", label: "Inquiry" },
  { value: "completed", label: "Trade Completed" },
];

export function getInteractionColor(type) {
  if (type === "accepted" || type === "completed") return "var(--green)";
  if (type === "declined") return "var(--red)";
  if (type === "countered") return "var(--accent-dim)";
  return "var(--text-muted)";
}

export function getInteractionBg(type) {
  if (type === "accepted" || type === "completed") return "var(--green-bg)";
  if (type === "declined") return "var(--red-bg)";
  if (type === "countered") return "var(--accent-light)";
  return "var(--surface-2)";
}
