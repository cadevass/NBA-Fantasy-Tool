// src/utils/transactions.js
// Phase 4 — Transaction Radar
// Fetches all league transactions, resolves player/team names,
// flags notable drops, diffs vs last fetch for NEW tags.
import { dbGet, dbSet } from "./supabase";

const LEAGUE_ID = "1371805753509158912";
const CACHE_KEY = "transaction_radar";
const MY_ROSTER_ID = 1; // JelqEmDown31

export async function fetchAllTransactions(sleeperPlayers, teams) {
  // Poll weeks 1-20 — stop when two consecutive empty weeks found
  const all = [];
  let emptyStreak = 0;
  for (let week = 1; week <= 20; week++) {
    try {
      const res = await fetch(
        `https://api.sleeper.app/v1/league/${LEAGUE_ID}/transactions/${week}`
      );
      if (!res.ok) break;
      const txns = await res.json();
      if (!txns?.length) {
        emptyStreak++;
        if (emptyStreak >= 2) break;
        continue;
      }
      emptyStreak = 0;
      all.push(...txns.map(t => ({ ...t, week })));
    } catch { break; }
  }
  return all;
}

function resolveName(playerId, sleeperPlayers) {
  const p = sleeperPlayers?.[String(playerId)];
  if (!p) return `Player ${playerId}`;
  return `${p.first_name} ${p.last_name}`;
}

function resolveTeam(rosterId, teams) {
  const t = teams?.find(t => t.rosterId === rosterId);
  return t?.username || `Team ${rosterId}`;
}

export function parseTransactions(raw, sleeperPlayers, teams, rankings = []) {
  return raw
    .filter(t => t.status === "complete")
    .filter(t => {
      // Exclude MY transactions from the feed — this is intel on others
      const rosterIds = t.roster_ids || [];
      return !rosterIds.includes(MY_ROSTER_ID);
    })
    .map(t => {
      const adds = Object.entries(t.adds || {}).map(([pid, rid]) => ({
        player: resolveName(pid, sleeperPlayers),
        playerId: pid,
        rosterId: rid,
        team: resolveTeam(rid, teams),
      }));
      const drops = Object.entries(t.drops || {}).map(([pid, rid]) => ({
        player: resolveName(pid, sleeperPlayers),
        playerId: pid,
        rosterId: rid,
        team: resolveTeam(rid, teams),
      }));
      const picks = (t.draft_picks || []).map(p => ({
        season: p.season,
        round: p.round,
        from: resolveTeam(p.previous_owner_id, teams),
        to: resolveTeam(p.owner_id, teams),
      }));

      // Flag notable drops — player with consensus value >= 50 dropped
      const notableDrops = drops.filter(d => {
        const rv = rankings.find(r =>
          r.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          d.player.toLowerCase().replace(/[^a-z0-9]/g, "")
        );
        return rv && rv.value >= 50;
      });

      return {
        id: t.transaction_id,
        type: t.type, // free_agent | waiver | trade
        week: t.week,
        created: t.created,
        adds,
        drops,
        picks,
        notableDrops,
        isNotable: notableDrops.length > 0 || t.type === "trade",
      };
    })
    .sort((a, b) => b.created - a.created);
}

export function getTransactionCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

export async function runTransactionScan(sleeperPlayers, teams, rankings) {
  const raw = await fetchAllTransactions(sleeperPlayers, teams);
  const parsed = parseTransactions(raw, sleeperPlayers, teams, rankings);

  // Diff vs previous — flag new transactions
  const prev = getTransactionCache();
  const prevIds = new Set((prev?.transactions || []).map(t => t.id));
  const transactions = parsed.map(t => ({ ...t, isNew: !prevIds.has(t.id) }));

  const payload = { scannedAt: new Date().toISOString(), transactions };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
  try { await dbSet("app_settings", CACHE_KEY, payload); } catch {}
  return payload;
}
