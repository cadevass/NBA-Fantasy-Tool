import { useState, useMemo } from "react";
import { Lock, TrendingUp, Zap, Plus, X, RefreshCw } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { calcFantasyScore, LOCK_IN_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EMPTY_GAME = { pts: "", reb: "", ast: "", stl: "", blk: "", to: "", threesMade: "" };

// ALL_ROSTER now comes from Sleeper context

function StatInput({ label, field, value, onChange }) {
  return (
    <div className="stat-cell">
      <input type="number" min={0} step={1} value={value} onChange={e => onChange(field, e.target.value)}
        style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, outline: "none", padding: 0 }}
        placeholder="0" />
      <div className="stat-cell-lbl">{label}</div>
    </div>
  );
}

export default function LockInAdvisor() {
  const { myTeam } = useSleeperContext();
  const ALL_ROSTER = myTeam ? [...myTeam.starters, ...myTeam.bench].map(p => p.name) : [];
  const [sessions, setSessions] = useLocalStorage("lockin_sessions", []);
  const [playerName, setPlayerName] = useState(ALL_ROSTER[0] || "");
  const [customPlayer, setCustomPlayer] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [game, setGame] = useState({ ...EMPTY_GAME });
  const [recentGames, setRecentGames] = useLocalStorage("lockin_recent", {});
  const [remainingGames, setRemainingGames] = useState([{ day: "Thu", opponent: "vs BOS", enabled: true }]);
  const [injuryStatus, setInjuryStatus] = useState("Healthy");
  const [extraContext, setExtraContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("advisor");

  const activeName = useCustom ? customPlayer : playerName;

  const fantasyScore = useMemo(() => {
    const parsed = {};
    for (const [k, v] of Object.entries(game)) parsed[k] = parseFloat(v) || 0;
    return calcFantasyScore(parsed);
  }, [game]);

  function updateStat(field, val) { setGame(g => ({ ...g, [field]: val })); }
  function addRemainingGame() { setRemainingGames(prev => [...prev, { day: "Sun", opponent: "vs GSW", enabled: true }]); }
  function removeRemainingGame(i) { setRemainingGames(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRemaining(i, field, val) { setRemainingGames(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: val } : g)); }

  function saveAsRecentGame() {
    const entry = { ...game, score: fantasyScore, date: new Date().toISOString() };
    setRecentGames(prev => ({ ...prev, [activeName]: [entry, ...(prev[activeName] || []).slice(0, 4)] }));
  }

  const playerRecent = recentGames[activeName] || [];
  const avgRecentScore = useMemo(() => {
    if (!playerRecent.length) return null;
    return Math.round(playerRecent.reduce((s, g) => s + (g.score || 0), 0) / playerRecent.length * 10) / 10;
  }, [playerRecent]);

  async function analyse() {
    setLoading(true); setResult(null);
    try {
      const remainingStr = remainingGames.filter(g => g.enabled).map(g => `${g.day}: ${g.opponent}`).join(", ") || "No games remaining";
      const recentStr = playerRecent.length
        ? playerRecent.map((g, i) => `Game ${i+1}: ${g.score}pts fantasy (${g.pts}pts/${g.reb}reb/${g.ast}ast)`).join(" | ")
        : "No recent game history stored";

      const prompt = `Lock-In Decision for ${activeName}:

COMPLETED GAME: ${game.pts}pts / ${game.reb}reb / ${game.ast}ast / ${game.stl}stl / ${game.blk}blk / ${game.to}TO / ${game.threesMade} 3PM
FANTASY SCORE: ${fantasyScore} points
RECENT FORM: ${recentStr}
SEASON AVG: ${avgRecentScore ? `${avgRecentScore} pts` : "Unknown"}
REMAINING GAMES: ${remainingStr}
INJURY STATUS: ${injuryStatus}
CONTEXT: ${extraContext || "None"}

${LOCK_IN_CONTEXT}

Give me:
1. SCORE ASSESSMENT — above or below average?
2. REMAINING SCHEDULE — realistic chance of a better game?
3. RISK FACTORS — injury, load management, B2B
4. LOCK-IN CEILING CHECK — is this near their ceiling?
5. VERDICT: LOCK IT IN or LET IT RIDE — with confidence (High/Medium/Low)
6. REASONING — 2-3 sentences max

Be direct.`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const upper = text.toUpperCase();
      const verdict = upper.includes("LOCK IT IN") || upper.includes("LOCK IN") ? "lock" : upper.includes("LET IT RIDE") ? "ride" : null;

      const session = { id: Date.now(), player: activeName, game: { ...game }, score: fantasyScore, analysis: text, verdict, date: new Date().toISOString(), remainingGames: remainingGames.filter(g => g.enabled) };
      setResult(session);
      setSessions(prev => [session, ...prev.slice(0, 19)]);
      saveAsRecentGame();
    } catch (e) { setResult({ analysis: `Error: ${e.message}`, verdict: null }); }
    finally { setLoading(false); }
  }

  function reset() { setGame({ ...EMPTY_GAME }); setResult(null); setExtraContext(""); setInjuryStatus("Healthy"); }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Lock-In Advisor</div>
          <div className="text-sm text-muted mt-1">Input a completed game — get a Lock In / Let It Ride verdict</div>
        </div>
        <div className="flex gap-2">
          <button className={`tab-btn${activeTab === "advisor" ? " active" : ""}`} onClick={() => setActiveTab("advisor")}>Advisor</button>
          <button className={`tab-btn${activeTab === "history" ? " active" : ""}`} onClick={() => setActiveTab("history")}>History ({sessions.length})</button>
        </div>
      </div>

      {activeTab === "advisor" && (
        <div className="page-grid-2">
          <div className="flex-col gap-3">
            <div className="card">
              <div className="card-header"><span className="card-title">Player</span></div>
              <div className="card-body">
                <div className="flex gap-2 mb-3">
                  <button className={`btn btn-xs ${!useCustom ? "btn-primary" : "btn-ghost"}`} onClick={() => setUseCustom(false)}>My Roster</button>
                  <button className={`btn btn-xs ${useCustom ? "btn-primary" : "btn-ghost"}`} onClick={() => setUseCustom(true)}>Other Player</button>
                </div>
                {!useCustom
                  ? <select className="select" value={playerName} onChange={e => setPlayerName(e.target.value)}>{ALL_ROSTER.map(n => <option key={n}>{n}</option>)}</select>
                  : <input className="input" placeholder="Player name..." value={customPlayer} onChange={e => setCustomPlayer(e.target.value)} />
                }
                {playerRecent.length > 0 && (
                  <div className="mt-3">
                    <div className="label mb-1">Recent Form — {activeName}</div>
                    <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                      {playerRecent.map((g, i) => (
                        <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 10px", textAlign: "center", minWidth: 60 }}>
                          <div className="font-mono font-semibold" style={{ fontSize: 15 }}>{g.score}</div>
                          <div className="text-xs text-muted">G{i + 1}</div>
                        </div>
                      ))}
                      {avgRecentScore && (
                        <div style={{ background: "var(--accent-light)", border: "1px solid #F5D98A", borderRadius: "var(--radius)", padding: "6px 10px", textAlign: "center", minWidth: 60 }}>
                          <div className="font-mono font-semibold" style={{ fontSize: 15, color: "var(--accent-dim)" }}>{avgRecentScore}</div>
                          <div className="text-xs" style={{ color: "var(--accent-dim)" }}>Avg</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Completed Game Stats</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-xs text-muted">Fantasy Score:</span>
                  <span className="font-mono font-semibold" style={{ fontSize: 20 }}>{fantasyScore}</span>
                </div>
              </div>
              <div className="card-body">
                <div className="stat-breakdown">
                  <StatInput label="PTS" field="pts" value={game.pts} onChange={updateStat} />
                  <StatInput label="REB" field="reb" value={game.reb} onChange={updateStat} />
                  <StatInput label="AST" field="ast" value={game.ast} onChange={updateStat} />
                  <StatInput label="STL" field="stl" value={game.stl} onChange={updateStat} />
                  <StatInput label="BLK" field="blk" value={game.blk} onChange={updateStat} />
                  <StatInput label="TO" field="to" value={game.to} onChange={updateStat} />
                  <StatInput label="3PM" field="threesMade" value={game.threesMade} onChange={updateStat} />
                </div>
                {fantasyScore > 0 && (
                  <div className="mt-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 10 }}>
                    <div className="text-xs text-muted mb-1 font-semibold" style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>Score Breakdown</div>
                    <div className="flex gap-3" style={{ flexWrap: "wrap", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                      {parseFloat(game.pts) > 0 && <span>{(parseFloat(game.pts)*0.5).toFixed(1)} pts</span>}
                      {parseFloat(game.reb) > 0 && <span>{(parseFloat(game.reb)*1).toFixed(1)} reb</span>}
                      {parseFloat(game.ast) > 0 && <span>{(parseFloat(game.ast)*1).toFixed(1)} ast</span>}
                      {parseFloat(game.stl) > 0 && <span style={{ color: "var(--green)" }}>{(parseFloat(game.stl)*2).toFixed(1)} stl</span>}
                      {parseFloat(game.blk) > 0 && <span style={{ color: "var(--green)" }}>{(parseFloat(game.blk)*2).toFixed(1)} blk</span>}
                      {parseFloat(game.to) > 0 && <span style={{ color: "var(--red)" }}>-{(parseFloat(game.to)*1).toFixed(1)} TO</span>}
                      {parseFloat(game.pts) >= 40 && <span style={{ color: "var(--accent)" }}>+{parseFloat(game.pts) >= 50 ? 4 : 2} bonus</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Remaining Schedule This Week</span>
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={addRemainingGame}><Plus size={11} /> Add Game</button>
              </div>
              <div className="card-body flex-col gap-2">
                {remainingGames.length === 0 && <div className="text-sm text-muted">No games remaining.</div>}
                {remainingGames.map((g, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="checkbox" checked={g.enabled} onChange={e => updateRemaining(i, "enabled", e.target.checked)} />
                    <select className="select" value={g.day} onChange={e => updateRemaining(i, "day", e.target.value)} style={{ flex: "0 0 70px", fontSize: 12 }}>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <input className="input" value={g.opponent} onChange={e => updateRemaining(i, "opponent", e.target.value)} placeholder="vs OPP" style={{ flex: 1, fontSize: 12 }} />
                    <button className="btn btn-ghost btn-xs" onClick={() => removeRemainingGame(i)}><X size={11} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Additional Context</span></div>
              <div className="card-body flex-col gap-3">
                <div className="input-group">
                  <label className="label">Injury / Load Status</label>
                  <select className="select" value={injuryStatus} onChange={e => setInjuryStatus(e.target.value)}>
                    {["Healthy","Questionable (minor)","Dealing with injury","Load management risk","Just returned from injury","Back-to-back (fatigued)"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="label">Notes</label>
                  <textarea className="textarea" rows={2} value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="e.g. B2B tomorrow, rivalry game coming up..." />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={reset}><RefreshCw size={13} /> Reset</button>
              <button className="btn btn-accent w-full" onClick={analyse} disabled={loading || fantasyScore === 0 || !activeName}>
                {loading ? <><span className="spinner" /> Analysing...</> : <><Lock size={14} /> Get Verdict</>}
              </button>
            </div>
          </div>

          <div>
            {result ? (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">{result.player}</span>
                  {result.verdict && (
                    <div className={`verdict ${result.verdict === "lock" ? "verdict-lock" : "verdict-ride"}`} style={{ marginLeft: "auto" }}>
                      {result.verdict === "lock" ? <><Lock size={13} /> Lock It In</> : <><TrendingUp size={13} /> Let It Ride</>}
                    </div>
                  )}
                </div>
                <div className="card-body">
                  <div className="flex gap-3 mb-3">
                    <div className="stat-cell" style={{ flex: 1, padding: "12px", textAlign: "center" }}>
                      <div className="font-mono font-semibold" style={{ fontSize: 28 }}>{result.score}</div>
                      <div className="stat-cell-lbl">This Game</div>
                    </div>
                    {avgRecentScore && (
                      <div className="stat-cell" style={{ flex: 1, padding: "12px", textAlign: "center" }}>
                        <div className="font-mono font-semibold" style={{ fontSize: 28 }}>{avgRecentScore}</div>
                        <div className="stat-cell-lbl">Recent Avg</div>
                      </div>
                    )}
                    <div className="stat-cell" style={{ flex: 1, padding: "12px", textAlign: "center" }}>
                      <div className="font-mono font-semibold" style={{ fontSize: 18 }}>{result.remainingGames?.length || 0}</div>
                      <div className="stat-cell-lbl">Games Left</div>
                    </div>
                  </div>
                  <div className="ai-box">{result.analysis}</div>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                  <Lock size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                  <div className="font-semibold" style={{ fontSize: 14 }}>No analysis yet</div>
                  <div className="text-sm mt-1">Input a player's completed game stats and hit Get Verdict</div>
                </div>
              </div>
            )}

            <div className="card mt-3">
              <div className="card-header"><span className="card-title">My Starters</span></div>
              {MY_ROSTER.starters.map(p => (
                <div key={p.name} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => { setPlayerName(p.name); setUseCustom(false); }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.pos.join("/")} · {p.team}</div>
                  </div>
                  {recentGames[p.name]?.[0] && <div className="font-mono text-sm">{recentGames[p.name][0].score}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div>
          {sessions.length === 0 ? (
            <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No lock-in decisions recorded yet</div></div>
          ) : (
            <div className="flex-col gap-3">
              {sessions.map(s => (
                <div key={s.id} className="card">
                  <div className="card-header">
                    <div><span className="font-semibold">{s.player}</span><span className="text-muted text-xs font-mono" style={{ marginLeft: 8 }}>{new Date(s.date).toLocaleDateString()}</span></div>
                    <div className="flex gap-3 items-center" style={{ marginLeft: "auto" }}>
                      <span className="font-mono font-semibold" style={{ fontSize: 18 }}>{s.score} pts</span>
                      {s.verdict && <div className={`verdict ${s.verdict === "lock" ? "verdict-lock" : "verdict-ride"}`}>{s.verdict === "lock" ? "Locked" : "Let Ride"}</div>}
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="flex gap-2 mb-2" style={{ flexWrap: "wrap", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      <span>{s.game.pts}pts</span><span>{s.game.reb}reb</span><span>{s.game.ast}ast</span><span>{s.game.stl}stl</span><span>{s.game.blk}blk</span><span>{s.game.to}TO</span><span>{s.game.threesMade} 3PM</span>
                    </div>
                    <div className="ai-box" style={{ fontSize: 12 }}>{s.analysis}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
