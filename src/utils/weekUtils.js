// src/utils/weekUtils.js
// Week date calculator for Backshot Dynasty debrief system
// OPENING_NIGHT must be updated once the 2026-27 NBA schedule is released (~August 2026)

export const SEASON_CONFIG = {
  openingNight: null, // SET THIS when confirmed: "2026-10-28" format
  totalWeeks: 21,
  playoffStartWeek: 19,
  timezone: "Australia/Perth",
};

export function isSeasonConfigured() {
  return !!SEASON_CONFIG.openingNight;
}

// Week 1 starts on the Monday before or on opening night (AWST)
export function getWeekDateRange(weekNumber) {
  if (!SEASON_CONFIG.openingNight) return null;
  const opening = new Date(SEASON_CONFIG.openingNight + "T00:00:00+08:00");
  // Find the Monday on or before opening night
  const day = opening.getDay(); // 0=Sun, 1=Mon...
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const week1Start = new Date(opening);
  week1Start.setDate(opening.getDate() + daysToMonday);
  // Add (weekNumber - 1) * 7 days
  const weekStart = new Date(week1Start);
  weekStart.setDate(week1Start.getDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    start: weekStart,
    end: weekEnd,
    label: `${weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
    startStr: weekStart.toISOString().slice(0, 10).replace(/-/g, ""),
    endStr: weekEnd.toISOString().slice(0, 10).replace(/-/g, ""),
  };
}

export function getCurrentWeek() {
  if (!SEASON_CONFIG.openingNight) return 1;
  const range1 = getWeekDateRange(1);
  if (!range1) return 1;
  const now = new Date();
  const diffMs = now - range1.start;
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(week, SEASON_CONFIG.totalWeeks));
}

export function isPlayoffWeek(weekNumber) {
  return weekNumber >= SEASON_CONFIG.playoffStartWeek;
}
