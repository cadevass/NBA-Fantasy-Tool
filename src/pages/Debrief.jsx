import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Lock, RefreshCw } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { getCurrentWeek, getWeekDateRange, isSeasonConfigured, SEASON_CONFIG } from "../utils/weekUtils";
import { fetchMatchupData, fetchTeamWeekSchedule, fetchPlayerGameFP, getDebriefHistory, saveDebrief } from "../utils/debriefUtils";
import { callClaude } from "../utils/api";
import { getRankings } from "../utils/rankings";


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
  const lockedFP = isLocked ? (decision.fp ?? player.lockedFP) : isAuto ? player.lockedFP : null;
  // Auto-select mock-0 when player has lockedFP but no gameDate selected yet
  const effectiveGameDate = decision?.gameDate ?? (player.lockedFP !== null && !isSeasonConfigured() ? "mock-0" : null);

  // NBA CDN headshot — uses same ID logic as Dashboard
  const NBA_IDS = {
    "Cade Cunningham": 1630595, "Jalen Johnson": 1630552,
    "Dejounte Murray": 1627749, "De'Aaron Fox": 1628368,
    "Alex Sarr": 1642259, "Kel'el Ware": 1642276,
    "Franz Wagner": 1630532, "Payton Pritchard": 1630202,
    "Michael Porter": 1629008, "Peyton Watson": 1631212,
    "Bennedict Mathurin": 1631097, "Scoot Henderson": 1630703,
    "Donovan Clingan": 1642270, "Dylan Harper": 1642844, "Carter Bryant": 1642363, "Nikola Jokic": 203999,
    "Jaylen Brown": 1627759,
    "Jalen Williams": 1630591, "Scottie Barnes": 1630567,
    "Tyler Herro": 1629029, "Kyrie Irving": 202681,
    "Stephon Castle": 1642248, "Immanuel Quickley": 1630193,
  };
  const nbaId = NBA_IDS[player.name] || null;

  const POS_COLORS = { PG: "#1D5C8A", SG: "#2B7A3B", SF: "#D4850A", PF: "#6B4FA0", C: "#C0392B", G: "#1D5C8A", F: "#D4850A", UTIL: "#555", BN: "#888" };
  const slotColor = POS_COLORS[player.slot] || "var(--text-muted)";

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", marginBottom: 10, overflow: "hidden",
    }}>
      {/* Main card — Sleeper layout */}
      <div style={{ display: "flex", gap: 0 }}>
        {/* Left: headshot */}
        <div style={{ position: "relative", width: 64, flexShrink: 0 }}>
          <div style={{ width: 64, height: 72, background: "var(--surface-2)", overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {nbaId ? (
              <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`} alt={player.name}
                style={{ width: 64, objectFit: "cover", objectPosition: "top" }}
                onError={e => { e.target.style.display = "none"; }} />
            ) : (
              <div style={{ width: 64, height: 72, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>
                {player.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
            )}
          </div>
          {/* Slot badge */}
          <div style={{ position: "absolute", top: 4, left: 4, background: slotColor, color: "#fff", fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, letterSpacing: "0.05em" }}>
            {player.slot}
          </div>
        </div>

        {/* Right: info + FP */}
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                {player.pos?.join(" · ")} · {player.nbaTeam}
                {isAuto && <span style={{ marginLeft: 6, color: "var(--red)", fontWeight: 700 }}>AUTO-LOCKED</span>}
                {isBenched && <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 700 }}>BENCHED</span>}
              </div>
            </div>
            {lockedFP !== null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 22, color: isAuto ? "var(--red)" : "var(--green)", lineHeight: 1 }}>
                  {lockedFP}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {isAuto ? "auto" : "locked"}
                </div>
              </div>
            )}
          </div>

          {/* Games row */}
          <div style={{ marginTop: 8 }}>
            {!isSeasonConfigured() ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {/* Mock game logos for offseason preview */}
                {["DET","ATL","MIA","BOS"].map((opp, i) => (
                  <div key={i} onClick={() => onDecision({ type: "locked", gameDate: `mock-${i}`, gameLabel: `vs ${opp}`, fp: player.lockedFP })}
                    style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: effectiveGameDate === `mock-${i}` ? "var(--accent)" : "var(--surface-2)",
                      border: `2px solid ${effectiveGameDate === `mock-${i}` ? "var(--accent)" : "var(--border)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 7, fontWeight: 700, color: effectiveGameDate === `mock-${i}` ? "#fff" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      position: "relative",
                    }}>
                      {opp}
                      {effectiveGameDate === `mock-${i}` && (
                        <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", width: "80%", height: 2, background: "var(--accent)", borderRadius: 1 }} />
                      )}
                    </div>
                    <span style={{ fontSize: 8, color: "var(--text-muted)" }}>{["Mon","Wed","Fri","Sun"][i]}</span>
                  </div>
                ))}
                <button onClick={() => onDecision({ type: "auto", fp: player.lockedFP })}
                  style={{ marginLeft: 4, fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isAuto ? "var(--red)" : "var(--border)"}`, background: isAuto ? "var(--red-bg)" : "transparent", color: isAuto ? "var(--red)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}>
                  AUTO
                </button>
                <button onClick={() => onDecision({ type: "benched" })}
                  style={{ fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isBenched ? "var(--accent)" : "var(--border)"}`, background: isBenched ? "var(--accent-light)" : "transparent", color: isBenched ? "var(--accent-dim)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}>
                  BN
                </button>
              </div>
            ) : loadingGames ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Loading...</div>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {games.map((g, i) => {
                  const isSelected = decision?.type === "locked" && decision?.gameDate === g.dateStr;
                  return (
                    <div key={i} onClick={() => onDecision({ type: "locked", gameDate: g.dateStr, gameLabel: g.label, fp: null })}
                      style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                        border: `2px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                        background: "var(--surface-2)",
                      }}>
                        <TeamLogo abbr={g.opponentAbbr} logo={g.opponentLogo} size={32} />
                      </div>
                      {isSelected && (
                        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", width: "90%", height: 2, background: "var(--accent)", borderRadius: 1 }} />
                      )}
                      <span style={{ fontSize: 8, color: isSelected ? "var(--accent)" : "var(--text-muted)", fontWeight: isSelected ? 700 : 400 }}>
                        {new Date(g.date).toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Perth" })}
                      </span>
                    </div>
                  );
                })}
                <button onClick={() => onDecision({ type: "auto", fp: player.lockedFP })}
                  style={{ marginLeft: 4, fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isAuto ? "var(--red)" : "var(--border)"}`, background: isAuto ? "var(--red-bg)" : "transparent", color: isAuto ? "var(--red)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}>
                  AUTO
                </button>
                <button onClick={() => onDecision({ type: "benched" })}
                  style={{ fontSize: 9, padding: "3px 6px", borderRadius: 3, border: `1px solid ${isBenched ? "var(--accent)" : "var(--border)"}`, background: isBenched ? "var(--accent-light)" : "transparent", color: isBenched ? "var(--accent-dim)" : "var(--text-muted)", cursor: "pointer", fontWeight: 700 }}>
                  BN
                </button>
              </div>
            )}
          </div>
        </div>
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
