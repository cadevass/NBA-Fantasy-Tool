import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Lock, RefreshCw } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { getCurrentWeek, getWeekDateRange, isSeasonConfigured, SEASON_CONFIG } from "../utils/weekUtils";
import { fetchMatchupData, fetchTeamWeekSchedule, fetchPlayerGameFP, getDebriefHistory, saveDebrief } from "../utils/debriefUtils";
import { callClaude } from "../utils/api";
import { getRankings } from "../utils/rankings";


// MOCK MATCHUP — remove when season starts October
const MOCK_ENABLED = true;
const MOCK_MATCHUP = {
  mine: {
    rosterId: 1,
    username: "JelqEmDown31",
    totalPoints: 247.5,
    starters: [
      { id: "s1", name: "Cade Cunningham", pos: ["PG"], nbaTeam: "DET", slot: "PG", lockedFP: 38.0, isStarter: true },
      { id: "s2", name: "Dejounte Murray", pos: ["PG","SG"], nbaTeam: "NOP", slot: "SG", lockedFP: 25.5, isStarter: true },
      { id: "s3", name: "Jalen Johnson", pos: ["PF","SF"], nbaTeam: "ATL", slot: "SF", lockedFP: 32.0, isStarter: true },
      { id: "s4", name: "Franz Wagner", pos: ["SF","PF"], nbaTeam: "ORL", slot: "PF", lockedFP: 28.0, isStarter: true },
      { id: "s5", name: "Alex Sarr", pos: ["C"], nbaTeam: "WAS", slot: "C", lockedFP: 31.5, isStarter: true },
      { id: "s6", name: "Kel'el Ware", pos: ["C","PF"], nbaTeam: "MIL", slot: "UTIL", lockedFP: 29.0, isStarter: true },
      { id: "s7", name: "Peyton Watson", pos: ["SF"], nbaTeam: "DEN", slot: "UTIL", lockedFP: 22.5, isStarter: true },
      { id: "s8", name: "Payton Pritchard", pos: ["PG"], nbaTeam: "BOS", slot: "G", lockedFP: 21.5, isStarter: true },
      { id: "s9", name: "Donovan Clingan", pos: ["C"], nbaTeam: "POR", slot: "UTIL", lockedFP: 19.5, isStarter: true },
    ],
    bench: [
      { id: "b1", name: "Michael Porter", pos: ["SF"], nbaTeam: "BKN", slot: "BN", lockedFP: null, isStarter: false },
      { id: "b2", name: "Bennedict Mathurin", pos: ["SG"], nbaTeam: "LAC", slot: "BN", lockedFP: null, isStarter: false },
      { id: "b3", name: "Scoot Henderson", pos: ["PG"], nbaTeam: "POR", slot: "BN", lockedFP: null, isStarter: false },
    ],
    allPlayers: [],
  },
  opponent: {
    rosterId: 5,
    username: "BotswananButler",
    totalPoints: 231.0,
    starters: [
      { id: "o1", name: "Nikola Jokic", pos: ["C"], nbaTeam: "DEN", slot: "C", lockedFP: 44.0, isStarter: true },
      { id: "o2", name: "Dylan Harper", pos: ["SG"], nbaTeam: "SAS", slot: "SG", lockedFP: 28.5, isStarter: true },
      { id: "o3", name: "Jaylen Brown", pos: ["SF"], nbaTeam: "PHI", slot: "SF", lockedFP: 31.0, isStarter: true },
      { id: "o4", name: "Jalen Williams", pos: ["PF"], nbaTeam: "OKC", slot: "PF", lockedFP: 27.0, isStarter: true },
      { id: "o5", name: "Scottie Barnes", pos: ["PF"], nbaTeam: "TOR", slot: "PF", lockedFP: 25.5, isStarter: true },
      { id: "o6", name: "Tyler Herro", pos: ["SG"], nbaTeam: "MIL", slot: "G", lockedFP: 22.0, isStarter: true },
      { id: "o7", name: "Kyrie Irving", pos: ["PG"], nbaTeam: "DAL", slot: "PG", lockedFP: 19.5, isStarter: true },
      { id: "o8", name: "Stephon Castle", pos: ["SG"], nbaTeam: "SAS", slot: "UTIL", lockedFP: 18.0, isStarter: true },
      { id: "o9", name: "Immanuel Quickley", pos: ["PG"], nbaTeam: "TOR", slot: "UTIL", lockedFP: 15.5, isStarter: true },
    ],
    bench: [
      { id: "ob1", name: "Dylan Harper", pos: ["SG"], nbaTeam: "SAS", slot: "BN", lockedFP: null, isStarter: false },
      { id: "ob2", name: "Carter Bryant", pos: ["PF"], nbaTeam: "SAS", slot: "BN", lockedFP: null, isStarter: false },
    ],
    allPlayers: [],
  },
  week: 1,
};
// Populate allPlayers from starters + bench
MOCK_MATCHUP.mine.allPlayers = [...MOCK_MATCHUP.mine.starters, ...MOCK_MATCHUP.mine.bench];
MOCK_MATCHUP.opponent.allPlayers = [...MOCK_MATCHUP.opponent.starters, ...MOCK_MATCHUP.opponent.bench];

const SLOT_ORDER = ["PG","SG","G","SF","PF","F","C","UTIL","UTIL","BN","BN","BN","BN","BN","BN","IR","IR","IR","IR","TAXI","TAXI","TAXI"];

function TeamLogo({ abbr, logo, size = 28 }) {
  if (logo) return <img src={logo} alt={abbr} style={{ width: size, height: size, objectFit: "contain" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
      {abbr}
    </div>
  );
}

function PlayerDebriefCard({ player, side, weekGames, onDecision, decision }) {
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);

  useEffect(() => {
    if (!player.nbaTeam || player.nbaTeam === "FA" || !isSeasonConfigured()) return;
    setLoadingGames(true);
    weekGames(player.nbaTeam).then(g => {
      setGames(g);
      setLoadingGames(false);
    });
  }, [player.nbaTeam]);

  const isLocked = decision?.type === "locked";
  const isAuto = decision?.type === "auto";
  const isBenched = decision?.type === "benched";

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      marginBottom: 8, overflow: "hidden",
      borderLeft: isLocked ? "3px solid var(--green)" : isAuto ? "3px solid var(--red)" : "3px solid transparent",
    }}>
      {/* Player header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface-2)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>
          {player.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{player.slot} · {player.nbaTeam}</div>
        </div>
        {isLocked && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--green)" }}>{decision.fp ?? "?"}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>locked</div>
          </div>
        )}
        {isAuto && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)", padding: "2px 6px", borderRadius: 3 }}>AUTO</span>}
        {isBenched && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", background: "var(--surface)", padding: "2px 6px", borderRadius: 3, border: "1px solid var(--border)" }}>BENCHED</span>}
      </div>

      {/* Game selection row */}
      <div style={{ padding: "8px 12px" }}>
        {!isSeasonConfigured() ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Season not yet configured — set opening night in weekUtils.js</div>
        ) : loadingGames ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading schedule...</div>
        ) : games.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No games this week</div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {games.map((g, i) => {
              const isSelected = decision?.type === "locked" && decision?.gameDate === g.dateStr;
              return (
                <button
                  key={i}
                  onClick={() => onDecision({ type: "locked", gameDate: g.dateStr, gameLabel: g.label, fp: null })}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "4px 6px", borderRadius: "var(--radius)", cursor: "pointer",
                    border: isSelected ? "2px solid var(--green)" : "1px solid var(--border)",
                    background: isSelected ? "var(--green-bg)" : "var(--surface-2)",
                    position: "relative",
                  }}
                >
                  {isSelected && (
                    <Lock size={8} style={{ position: "absolute", top: 2, right: 2, color: "var(--green)" }} />
                  )}
                  <TeamLogo abbr={g.opponentAbbr} logo={g.opponentLogo} size={24} />
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {g.homeAway} {g.opponentAbbr}
                  </span>
                  <span style={{ fontSize: 8, color: "var(--text-muted)" }}>
                    {new Date(g.date).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Perth" })}
                  </span>
                </button>
              );
            })}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 4 }}>
              <button
                onClick={() => onDecision({ type: "auto", fp: player.lockedFP })}
                style={{ fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isAuto ? "var(--red)" : "var(--border)"}`, background: isAuto ? "var(--red-bg)" : "var(--surface-2)", color: isAuto ? "var(--red)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}
              >
                AUTO
              </button>
              <button
                onClick={() => onDecision({ type: "benched" })}
                style={{ fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isBenched ? "var(--accent)" : "var(--border)"}`, background: isBenched ? "var(--accent-light)" : "var(--surface-2)", color: isBenched ? "var(--accent-dim)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}
              >
                BENCH
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Debrief() {
  const { myTeam, players: sleeperPlayers, teams } = useSleeperContext();
  const [week, setWeek] = useState(getCurrentWeek());
  const [matchupData, setMatchupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [opponentRosterId, setOpponentRosterId] = useState(null);
  const [decisions, setDecisions] = useState({ mine: {}, opponent: {} });
  const [submitting, setSubmitting] = useState(false);
  const [coaching, setCoaching] = useState(null);
  const [history, setHistory] = useState(getDebriefHistory());

  // Cache weekly game schedules
  const scheduleCache = {};
  const getWeekGames = useCallback(async (nbaTeam) => {
    const key = `${nbaTeam}-${week}`;
    if (scheduleCache[key]) return scheduleCache[key];
    const games = await fetchTeamWeekSchedule(nbaTeam, week);
    scheduleCache[key] = games;
    return games;
  }, [week]);

  async function loadMatchup() {
    if (MOCK_ENABLED) {
      setMatchupData(MOCK_MATCHUP);
      setOpponentRosterId(MOCK_MATCHUP.opponent.rosterId);
      const preDecisions = { mine: {}, opponent: {} };
      MOCK_MATCHUP.mine.starters.forEach(p => {
        if (p.lockedFP !== null) preDecisions.mine[p.id] = { type: "locked", fp: p.lockedFP };
      });
      setDecisions(preDecisions);
      return;
    }
    if (!sleeperPlayers || !teams) return;
    setLoading(true); setError(null); setMatchupData(null); setCoaching(null);
    try {
      const data = await fetchMatchupData(week, sleeperPlayers, teams);
      if (!data) {
        setError("No matchup data for this week yet — available once the season starts.");
        return;
      }
      setMatchupData(data);
      if (data.opponent) setOpponentRosterId(data.opponent.rosterId);
      const preDecisions = { mine: {}, opponent: {} };
      data.mine.starters.forEach(p => {
        if (p.lockedFP !== null) preDecisions.mine[p.id] = { type: "locked", fp: p.lockedFP };
      });
      setDecisions(preDecisions);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMatchup(); }, [week, sleeperPlayers, teams]);

  function setDecision(side, playerId, decision) {
    setDecisions(prev => ({
      ...prev,
      [side]: { ...prev[side], [playerId]: decision },
    }));
  }

  async function submitDebrief() {
    setSubmitting(true);
    try {
      const rankings = await getRankings();
      const weekRange = getWeekDateRange(week);

      // Build summary for AI
      const myDecisionLines = (matchupData?.mine?.allPlayers || []).map(p => {
        const d = decisions.mine[p.id];
        if (!d) return `${p.name}: no decision recorded`;
        if (d.type === "locked") return `${p.name}: locked ${d.gameLabel || "unknown game"} for ${d.fp ?? matchupData?.mine?.starters?.find(s => s.id === p.id)?.lockedFP ?? "?"} FP`;
        if (d.type === "auto") return `${p.name}: AUTO-LOCKED (inactive signal)`;
        return `${p.name}: benched`;
      }).join("\n");

      const oppDecisionLines = (matchupData?.opponent?.allPlayers || []).map(p => {
        const d = decisions.opponent[p.id];
        if (!d) return `${p.name}: not recorded`;
        if (d.type === "locked") return `${p.name}: locked ${d.gameLabel || "unknown game"} for ${d.fp ?? "?"} FP`;
        if (d.type === "auto") return `${p.name}: AUTO-LOCKED`;
        return `${p.name}: benched`;
      }).join("\n");

      const prompt = `WEEKLY DEBRIEF — Week ${week}${weekRange ? ` (${weekRange.label})` : ""}

MY RESULT: ${matchupData?.mine?.totalPoints ?? "?"} FP vs ${matchupData?.opponent?.totalPoints ?? "?"} FP — ${(matchupData?.mine?.totalPoints ?? 0) > (matchupData?.opponent?.totalPoints ?? 0) ? "WIN" : "LOSS"}
OPPONENT: ${matchupData?.opponent?.username ?? "unknown"}

MY LOCK-IN DECISIONS:
${myDecisionLines}

OPPONENT DECISIONS (${matchupData?.opponent?.username ?? "opponent"}):
${oppDecisionLines}

SCORING SYSTEM: pts×0.5, reb×1, ast×1, stl×2, blk×2, TO×-1, 3PM×0.5, DD+1, TD+2, 40pts+2, 50pts+2
LOCK-IN RULE: Only one game per week per player counts. Auto-lock = Sleeper took their final game (activity flag). Early locks = conservative, late locks = aggressive ceiling-chasing.
LEAGUE RULE: If a manager appears inactive or tanking any given week, they drop a spot in the draft order.

Write a direct, opinionated coaching paragraph (4-6 sentences) covering:
1. My best and worst lock-in decisions this week with specific FP impact
2. What my decisions reveal about my tendencies (locking too early/late, risk appetite)
3. Key intel on my opponent — activity level, discipline patterns, anything exploitable
4. One actionable adjustment for next week

No markdown. No hedging. Direct coach voice.`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      setCoaching(text);

      // Save debrief
      const debrief = {
        week,
        weekLabel: weekRange?.label,
        submittedAt: new Date().toISOString(),
        myScore: matchupData?.mine?.totalPoints,
        opponentScore: matchupData?.opponent?.totalPoints,
        opponentName: matchupData?.opponent?.username,
        result: (matchupData?.mine?.totalPoints ?? 0) > (matchupData?.opponent?.totalPoints ?? 0) ? "W" : "L",
        decisions,
        coaching: text,
      };
      await saveDebrief(debrief);
      setHistory(getDebriefHistory());
    } catch (e) {
      setCoaching(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const weekRange = getWeekDateRange(week);
  const otherTeams = teams?.filter(t => !t.isMe) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Weekly Debrief</div>
          <div className="text-sm text-muted mt-1">
            {weekRange ? weekRange.label : "Season not yet configured"}
            {matchupData && ` · vs ${matchupData.opponent?.username ?? "?"}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="select" value={week} onChange={e => setWeek(Number(e.target.value))} style={{ fontSize: 12, width: 110 }}>
            {Array.from({ length: 21 }, (_, i) => i + 1).map(w => {
              const r = getWeekDateRange(w);
              const label = r ? `Wk ${w} · ${r.label}` : `Week ${w}`;
              return <option key={w} value={w}>{label}</option>;
            })}
          </select>
          <button className="btn btn-sm" onClick={loadMatchup} disabled={loading}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", color: "var(--text-muted)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 12px" }} />
          Loading matchup...
        </div>
      )}

      {matchupData && (
        <>
          {/* Score header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <div style={{ textAlign: "center", padding: "12px", background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>YOU</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 28, color: matchupData.mine.totalPoints > matchupData.opponent?.totalPoints ? "var(--green)" : "var(--text-primary)" }}>
                {matchupData.mine.totalPoints}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 14 }}>VS</div>
            <div style={{ textAlign: "center", padding: "12px", background: "var(--surface-2)", borderRadius: "var(--radius)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{matchupData.opponent?.username?.toUpperCase() ?? "OPPONENT"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 28, color: matchupData.opponent?.totalPoints > matchupData.mine.totalPoints ? "var(--red)" : "var(--text-primary)" }}>
                {matchupData.opponent?.totalPoints ?? "?"}
              </div>
            </div>
          </div>

          {/* Two column player grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* My side */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Your Decisions</div>
              {matchupData.mine.allPlayers.map(p => (
                <PlayerDebriefCard
                  key={p.id}
                  player={p}
                  side="mine"
                  weekGames={getWeekGames}
                  decision={decisions.mine[p.id]}
                  onDecision={d => setDecision("mine", p.id, d)}
                />
              ))}
            </div>

            {/* Opponent side */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                {matchupData.opponent?.username ?? "Opponent"} Decisions
              </div>
              {matchupData.opponent?.allPlayers.map(p => (
                <PlayerDebriefCard
                  key={p.id}
                  player={p}
                  side="opponent"
                  weekGames={getWeekGames}
                  decision={decisions.opponent[p.id]}
                  onDecision={d => setDecision("opponent", p.id, d)}
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-accent w-full" onClick={submitDebrief} disabled={submitting}>
              {submitting ? <><span className="spinner" /> Generating coaching report...</> : "✦ Submit Week Debrief"}
            </button>
          </div>

          {/* Coaching output */}
          {coaching && (
            <div style={{ marginTop: 16, padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Week {week} Coaching Report</div>
              {coaching}
            </div>
          )}
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Debrief History</div>
          {history.map((d, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13 }}>Wk {d.week}</span>
                {d.weekLabel && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.weekLabel}</span>}
                <span style={{ fontSize: 12 }}>vs {d.opponentName}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12,
                  color: d.result === "W" ? "var(--green)" : "var(--red)" }}>
                  {d.result} {d.myScore}–{d.opponentScore}
                </span>
              </div>
              {d.coaching && (
                <div style={{ padding: "0 14px 12px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {d.coaching}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
