import { useState, useEffect } from "react";
import { Home, Zap, X } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { fetchPlayerSeasonStats, findPlayer } from "../utils/nbaStats";
import { calcSeasonAverageFP } from "../utils/league";
import { callClaude } from "../utils/api";
import { buildFullContext } from "../utils/fullContext";
import { getRankings } from "../utils/rankings";
import { getNegotiationLog } from "../utils/negotiationLog";
import { getTeamContexts } from "../utils/teamContext";

const TEAM_ABB_MAP = {
  "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets",
  "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
  "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
  "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
  "LAC": "LA Clippers", "LAL": "LA Lakers", "MEM": "Memphis Grizzlies",
  "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
  "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
  "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
  "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
  "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
};

function getMatchupQuality(opp) {
  // Rough matchup quality based on known defensive teams — updates each season
  const tough = ["BOS","MEM","OKC","CLE","MIN","MIL","DEN","NYK"];
  const easy = ["WAS","CHA","ORL","UTA","SAS","POR","DET","HOU"];
  if (tough.includes(opp)) return { label: "Tough", color: "var(--red)", bg: "var(--red-bg)" };
  if (easy.includes(opp)) return { label: "Favorable", color: "var(--green)", bg: "var(--green-bg)" };
  return { label: "Neutral", color: "var(--accent-dim)", bg: "var(--accent-light)" };
}

export default function Dashboard() {
  const { myTeam, players: sleeperPlayers } = useSleeperContext();
  const [todaysGames, setTodaysGames] = useState([]);
  const [activePlayers, setActivePlayers] = useState([]);
  const [nbaPlayers, setNbaPlayers] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [showStartSit, setShowStartSit] = useState(false);
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [startSitLoading, setStartSitLoading] = useState(false);
  const [startSitResult, setStartSitResult] = useState(null);
  const [lockStates, setLockStates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dashboard_lock_states") || "{}"); } catch { return {}; }
  });
  const [marketValues, setMarketValues] = useState([]);
  const [negLog, setNegLog] = useState([]);
  useEffect(() => { getRankings().then(setMarketValues); }, []);
  useEffect(() => { getNegotiationLog().then(setNegLog); }, []);

  const today = new Date().toLocaleDateString("en-AU", { 
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Australia/Perth"
  });

  useEffect(() => {
    fetchPlayerSeasonStats().then(setNbaPlayers);
  }, []);

  useEffect(() => {
    async function fetchSchedule() {
      setLoadingSchedule(true);
      try {
        const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
        const data = await res.json();
        const games = data.events || [];
        setTodaysGames(games);

        if (!myTeam) return;
        const allPlayers = [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])];
        
        // Build set of teams playing today
        const teamsPlaying = new Set();
        const gamesByTeam = {};
        games.forEach(e => {
          const comp = e.competitions[0];
          comp.competitors.forEach(c => {
            const abb = c.team.abbreviation;
            teamsPlaying.add(abb);
            // Find opponent
            const opp = comp.competitors.find(x => x.team.abbreviation !== abb);
            gamesByTeam[abb] = {
              opponent: opp?.team?.abbreviation || "?",
              time: new Date(e.date).toLocaleTimeString("en-AU", { 
                hour: "2-digit", minute: "2-digit", timeZone: "Australia/Perth" 
              }),
              status: comp.status?.type?.description || "",
            };
          });
        });

        // Filter roster to players with games today
        let active = allPlayers
          .filter(p => p.team && teamsPlaying.has(p.team))
          .map(p => ({
            ...p,
            game: gamesByTeam[p.team],
            seasonAvgFP: nbaPlayers.length ? (() => {
              const s = findPlayer(nbaPlayers, p.name);
              return s ? calcSeasonAverageFP(s) : null;
            })() : null,
          }));

        // MOCK DATA for offseason testing — remove when season starts
        if (active.length === 0 && allPlayers.length > 0) {
          const mockOpponents = ["BOS","WAS","LAL","DEN","MIA"];
          active = allPlayers.slice(0, 5).map((p, i) => ({
            ...p,
            game: { opponent: mockOpponents[i % mockOpponents.length], time: "7:30 PM", status: "MOCK" },
            seasonAvgFP: nbaPlayers.length ? (() => {
              const s = findPlayer(nbaPlayers, p.name);
              return s ? calcSeasonAverageFP(s) : null;
            })() : null,
          }));
        }
        setActivePlayers(active);
      } catch (e) {
        console.error("Schedule fetch error:", e);
      } finally {
        setLoadingSchedule(false);
      }
    }
    fetchSchedule();
  }, [myTeam]);

  // Recalculate seasonAvgFP when nbaPlayers loads
  useEffect(() => {
    if (!nbaPlayers.length || !activePlayers.length) return;
    setActivePlayers(prev => prev.map(p => ({
      ...p,
      seasonAvgFP: (() => {
        const s = findPlayer(nbaPlayers, p.name);
        return s ? calcSeasonAverageFP(s) : null;
      })(),
    })));
  }, [nbaPlayers]);

  async function runStartSit() {
    if (!playerA || !playerB || playerA === playerB) return;
    setStartSitLoading(true); setStartSitResult(null);
    try {
      const pA = activePlayers.find(p => p.name === playerA);
      const pB = activePlayers.find(p => p.name === playerB);
      const sA = findPlayer(nbaPlayers, playerA);
      const sB = findPlayer(nbaPlayers, playerB);
      const avgA = sA ? calcSeasonAverageFP(sA) : null;
      const avgB = sB ? calcSeasonAverageFP(sB) : null;
      const mqA = pA?.game ? getMatchupQuality(pA.game.opponent) : null;
      const mqB = pB?.game ? getMatchupQuality(pB.game.opponent) : null;

      const dashCtx = buildFullContext({
        myTeam,
        nbaPlayers,
        marketValues,
        negLog,
        tradeBlock: JSON.parse(localStorage.getItem("trade_block") || "[]"),
        teamContexts: getTeamContexts(),
        startupDraft: [],
        teams: [],
        targetRosterId: null,
        pageContext: {},
        dynastyMode: localStorage.getItem('dynasty_mode') || 'contending',
      });

      const prompt = `Start/Sit decision for The Backshot Dynasty (Sleeper Lock-In mode, AWST timezone).

PLAYER A: ${playerA}
Season Avg FP: ${avgA || "unknown"} | Today vs: ${pA?.game?.opponent || "?"} (${mqA?.label || "?"} matchup)
2025-26 Stats: ${sA ? `${sA.pts}pts/${sA.reb}reb/${sA.ast}ast/${sA.stl}stl/${sA.blk}blk` : "unknown"}

PLAYER B: ${playerB}
Season Avg FP: ${avgB || "unknown"} | Today vs: ${pB?.game?.opponent || "?"} (${mqB?.label || "?"} matchup)
2025-26 Stats: ${sB ? `${sB.pts}pts/${sB.reb}reb/${sB.ast}ast/${sB.stl}stl/${sB.blk}blk` : "unknown"}

${dashCtx}

Search for their projected roles and outlooks for next season.
Lock-In mode — ceiling matters more than floor. High-variance players are premium.

Respond in this exact format:
START: [Player A or Player B]
CONFIDENCE: [High or Medium or Low]
REASONING: [2-3 sentences in fantasy point terms — direct and opinionated]`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const cleanStr = s => s?.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      const startM = text.match(/START:\s*(.+)/i);
      const confM = text.match(/CONFIDENCE:\s*(High|Medium|Low)/i);
      const reasonM = text.match(/REASONING:\s*([\s\S]+?)$/i);
      setStartSitResult({
        start: cleanStr(startM?.[1]),
        confidence: confM?.[1],
        reasoning: cleanStr(reasonM?.[1]),
        raw: text,
      });
    } catch (e) {
      setStartSitResult({ raw: `Error: ${e.message}` });
    } finally {
      setStartSitLoading(false);
    }
  }

  function getNbaId(playerName) {
    if (!sleeperPlayers) return null;
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const entry = Object.values(sleeperPlayers).find(p =>
      norm(`${p.first_name} ${p.last_name}`) === norm(playerName)
    );
    return entry?.sport_id || null;
  }

  function cycleLock(name, gamesLeft) {
    setLockStates(prev => {
      const cur = prev[name];
      let next;
      if (!cur || cur.state === "unlocked") next = { state: "locked", fp: null };
      else if (cur.state === "locked" && cur.fp === null) next = { state: "locked", fp: 0 };
      else next = { state: "unlocked" };
      const updated = { ...prev, [name]: next };
      try { localStorage.setItem("dashboard_lock_states", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function setLockedFP(name, fp) {
    setLockStates(prev => {
      const updated = { ...prev, [name]: { state: "locked", fp: parseFloat(fp) || 0 } };
      try { localStorage.setItem("dashboard_lock_states", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  const SLOT_ORDER = ["PG","SG","G","SF","PF","F","C","UTIL"];
  const sortedActive = [...activePlayers].sort((a, b) => {
    const ai = SLOT_ORDER.findIndex(s => a.pos?.includes(s));
    const bi = SLOT_ORDER.findIndex(s => b.pos?.includes(s));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Today's Dashboard</div>
          <div className="text-sm text-muted mt-1">{today}</div>
        </div>
        <button className="btn btn-accent" onClick={() => { setShowStartSit(true); setStartSitResult(null); }}
          disabled={activePlayers.length < 2}>
          <Zap size={14} /> Start / Sit
        </button>
      </div>

      {/* Active Players Grid */}
      {loadingSchedule ? (
        <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
          <span className="spinner" style={{ margin: "0 auto 12px" }} />
          <div>Loading today's schedule...</div>
        </div></div>
      ) : sortedActive.length === 0 ? (
        <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
          <Home size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
          <div className="font-semibold" style={{ fontSize: 15 }}>No players active today</div>
          <div className="text-sm mt-2">Rest day or offseason — check back when the season starts</div>
        </div></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {sortedActive.map(p => {
            const mq = p.game ? getMatchupQuality(p.game.opponent) : null;
            const nbaId = getNbaId(p.name);
            const lock = lockStates[p.name] || { state: "unlocked" };
            const gamesLeft = 1;
            const isLocked = lock.state === "locked";
            const isWarning = !isLocked && gamesLeft === 1;
            return (
              <div key={p.name} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 10px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2)", border: "1px solid var(--border)", flexShrink: 0, marginRight: 10 }}>
                    {nbaId ? (
                      <img
                        src={`https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`}
                        alt={p.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                        onError={e => {
                          e.target.style.display = "none";
                          e.target.parentNode.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--text-muted)">${p.name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>`;
                        }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "var(--text-muted)" }}>
                        {p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{p.name}</div>
                      {mq && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: mq.bg, color: mq.color, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginLeft: 4 }}>{mq.label}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {p.pos?.join("/")} · {p.team}
                      {p.game && <span> · vs {p.game.opponent} · {p.game.time}</span>}
                    </div>
                  </div>
                </div>
                {p.seasonAvgFP && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 14px 10px", background: "var(--surface-2)", borderRadius: "var(--radius)", padding: "5px 10px" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Season Avg</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, marginLeft: "auto" }}>{p.seasonAvgFP} FP</span>
                  </div>
                )}
                <div
                  onClick={() => cycleLock(p.name, gamesLeft)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 14px", cursor: "pointer",
                    background: isLocked ? "var(--green-bg)" : isWarning ? "var(--red-bg)" : "var(--surface-2)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: isLocked ? "var(--green)" : isWarning ? "var(--red)" : "var(--text-muted)", letterSpacing: "0.03em" }}>
                    {isLocked ? "🔒 LOCKED" : isWarning ? "⚠️ LAST GAME" : "⏳ UNLOCKED"}
                  </span>
                  {isLocked ? (
                    <input
                      type="number"
                      placeholder="FP"
                      value={lock.fp || ""}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setLockedFP(p.name, e.target.value)}
                      style={{ width: 52, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, border: "none", background: "transparent", color: "var(--green)", textAlign: "right", outline: "none" }}
                    />
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{gamesLeft}g left · tap to lock</span>
                  )}
                </div>
              </div>
            );
          })}      )}

      {/* Start/Sit Modal */}
      {showStartSit && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => e.target === e.currentTarget && setShowStartSit(false)}>
          <div className="card" style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}>
            <div className="card-header">
              <span className="card-title">Start / Sit</span>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setShowStartSit(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="card-body flex-col gap-4">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="input-group">
                  <label className="label">Player A</label>
                  <select className="select" value={playerA} onChange={e => setPlayerA(e.target.value)}>
                    <option value="">Select...</option>
                    {sortedActive.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="label">Player B</label>
                  <select className="select" value={playerB} onChange={e => setPlayerB(e.target.value)}>
                    <option value="">Select...</option>
                    {sortedActive.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {playerA && playerB && playerA !== playerB && (() => {
                const pA = activePlayers.find(p => p.name === playerA);
                const pB = activePlayers.find(p => p.name === playerB);
                const sA = findPlayer(nbaPlayers, playerA);
                const sB = findPlayer(nbaPlayers, playerB);
                const mqA = pA?.game ? getMatchupQuality(pA.game.opponent) : null;
                const mqB = pB?.game ? getMatchupQuality(pB.game.opponent) : null;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[{name: playerA, p: pA, s: sA, mq: mqA}, {name: playerB, p: pB, s: sB, mq: mqB}].map(({name, p, s, mq}) => (
                      <div key={name} style={{ background: "var(--surface-2)", borderRadius: "var(--radius-lg)", padding: 14 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{name}</div>
                        {s && <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                          {s.pts}pts · {s.reb}reb · {s.ast}ast · {s.stl}stl · {s.blk}blk
                        </div>}
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          vs {p?.game?.opponent || "?"} · {p?.game?.time} AWST
                        </div>
                        {mq && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: mq.bg, color: mq.color, textTransform: "uppercase" }}>{mq.label}</span>}
                        {s && <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18 }}>
                          {calcSeasonAverageFP(s)} FP avg
                        </div>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <button className="btn btn-accent w-full" onClick={runStartSit}
                disabled={startSitLoading || !playerA || !playerB || playerA === playerB}>
                {startSitLoading ? <><span className="spinner" /> Analysing...</> : <><Zap size={14} /> Get Recommendation</>}
              </button>

              {startSitResult && (
                <div style={{ 
                  padding: 16, borderRadius: "var(--radius-lg)",
                  background: "var(--surface-2)", border: "1px solid var(--border)"
                }}>
                  {startSitResult.start && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {startSitResult.confidence} Confidence · Start
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 20, color: "var(--green)", marginTop: 2 }}>
                        {startSitResult.start?.replace(/\*\*/g, "").replace(/\*/g, "").trim()}
                      </div>
                    </div>
                  )}
                  {startSitResult.reasoning && (
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                      {startSitResult.reasoning}
                    </div>
                  )}
                  {!startSitResult.start && <div className="ai-box">{startSitResult.raw}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
