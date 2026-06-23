import { useState } from "react";
import { Plus, X, Zap, RefreshCw, ChevronDown } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";

const PICK_YEARS = ["2026", "2027", "2028"];
const PICK_ROUNDS = ["1st", "2nd", "3rd"];

function AssetTag({ asset, onRemove }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: asset.type === "pick" ? "var(--accent-light)" : "var(--surface-2)",
      border: `1px solid ${asset.type === "pick" ? "#F5D98A" : "var(--border)"}`,
      borderRadius: "var(--radius)", padding: "4px 8px", fontSize: 12, fontWeight: 500,
    }}>
      <span>{asset.label}</span>
      {asset.detail && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>· {asset.detail}</span>}
      {onRemove && (
        <button onClick={onRemove} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 0, marginLeft: 2 }}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function PlayerList({ players, onAdd, side, teamName }) {
  const [search, setSearch] = useState("");
  const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <input className="input mb-2" placeholder={`Search ${teamName} players...`} value={search}
        onChange={e => setSearch(e.target.value)} style={{ fontSize: 12 }} />
      <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
        {filtered.map(p => (
          <div key={p.id} style={{
            padding: "7px 10px", borderBottom: "1px solid var(--border)",
            cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between",
          }}
            onClick={() => onAdd({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team} (${teamName})`, side })}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
            onMouseLeave={e => e.currentTarget.style.background = ""}>
            <span>{p.name}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{p.pos.join("/")} · {p.team}</span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: "10px", color: "var(--text-muted)", fontSize: 12 }}>No players found</div>}
      </div>
    </div>
  );
}

const VERDICT_STYLES = { "ACCEPT": "verdict-accept", "DECLINE": "verdict-decline", "COUNTER": "verdict-counter" };

function extractVerdict(text) {
  const upper = text.toUpperCase();
  if (upper.includes("VERDICT: ACCEPT")) return "ACCEPT";
  if (upper.includes("VERDICT: DECLINE")) return "DECLINE";
  if (upper.includes("VERDICT: COUNTER")) return "COUNTER";
  if (upper.includes("ACCEPT")) return "ACCEPT";
  if (upper.includes("DECLINE")) return "DECLINE";
  if (upper.includes("COUNTER")) return "COUNTER";
  return null;
}

export default function TradeFinder() {
  const { myTeam, teams } = useSleeperContext();
  const [history, setHistory] = useLocalStorage("trade_history", []);
  const [giving, setGiving] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [giveMode, setGiveMode] = useState("player");
  const [receiveMode, setReceiveMode] = useState("team");
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [extraTeamIds, setExtraTeamIds] = useState([]); // for 3-way deals
  const [pickYear, setPickYear] = useState("2027");
  const [pickRound, setPickRound] = useState("1st");
  const [givePickYear, setGivePickYear] = useState("2027");
  const [givePickRound, setGivePickRound] = useState("1st");
  const [otherTeamContext, setOtherTeamContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [giveSearch, setGiveSearch] = useState("");

  const otherTeams = (teams || []).filter(t => !t.isMe);
  const selectedTeam = otherTeams.find(t => t.rosterId === selectedTeamId);
  const selectedTeamPlayers = selectedTeam
    ? [...selectedTeam.starters, ...selectedTeam.bench, ...(selectedTeam.taxi || [])]
    : [];

  const myAssets = myTeam
    ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])]
    : [];

  const filteredMyAssets = myAssets.filter(p =>
    p.name.toLowerCase().includes(giveSearch.toLowerCase())
  );

  function addGiving(asset) { setGiving(prev => [...prev, asset]); }
  function addReceiving(asset) { setReceiving(prev => [...prev, asset]); }
  function removeGiving(i) { setGiving(prev => prev.filter((_, idx) => idx !== i)); }
  function removeReceiving(i) { setReceiving(prev => prev.filter((_, idx) => idx !== i)); }

  function addExtraTeam(rosterId) {
    if (!extraTeamIds.includes(rosterId)) setExtraTeamIds(prev => [...prev, rosterId]);
  }
  function removeExtraTeam(rosterId) {
    setExtraTeamIds(prev => prev.filter(id => id !== rosterId));
  }

  async function evaluate() {
    if (!giving.length && !receiving.length) return;
    setLoading(true); setResult(null);
    try {
      const giveStr = giving.map(a => `${a.label} (${a.detail || a.type})`).join(", ") || "nothing";
      const recStr = receiving.map(a => `${a.label} (${a.detail || a.type})`).join(", ") || "nothing";
      const involvedTeams = [
        selectedTeam?.teamName,
        ...extraTeamIds.map(id => otherTeams.find(t => t.rosterId === id)?.teamName),
      ].filter(Boolean).join(", ");

      const prompt = `Evaluate this dynasty trade for my team (The Backshot Dynasty):

I GIVE: ${giveStr}
I RECEIVE: ${recStr}
OTHER TEAM(S) INVOLVED: ${involvedTeams || "Unknown"}
CONTEXT: ${otherTeamContext || "None provided"}

${DYNASTY_CONTEXT}

Analyse across ALL dimensions:
1. DYNASTY VALUE DELTA
2. IMMEDIATE IMPACT
3. AGE CURVE FIT
4. POSITIONAL FIT
5. LOCK-IN CEILING IMPACT
6. OTHER TEAM MOTIVATION — why would they do this?
7. REAL-WORLD CONTEXT — form, injuries, situations
8. DRAFT CAPITAL VALUE — assess any picks

End with:
VERDICT: [ACCEPT / DECLINE / COUNTER]
CONFIDENCE: [High / Medium / Low]
COUNTER SUGGESTION (if declining): [brief suggestion]

Be direct and opinionated.`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const verdict = extractVerdict(text);
      const tradeResult = {
        id: Date.now(),
        giving: [...giving],
        receiving: [...receiving],
        involvedTeams,
        otherContext: otherTeamContext,
        analysis: text,
        verdict,
        date: new Date().toISOString(),
      };
      setResult(tradeResult);
      setHistory(prev => [tradeResult, ...prev.slice(0, 9)]);
    } catch (e) {
      setResult({ analysis: `Error: ${e.message}`, verdict: null });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setGiving([]); setReceiving([]); setOtherTeamContext("");
    setResult(null); setSelectedTeamId(null); setExtraTeamIds([]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Trade Evaluator</div>
          <div className="text-sm text-muted mt-1">Full dynasty trade analysis · supports 3-way deals</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reset}><RefreshCw size={13} /> Reset</button>
      </div>

      <div className="page-grid-2">
        <div className="flex-col gap-3">
          <div className="card">
            <div className="card-header"><span className="card-title">Trade Builder</span></div>
            <div className="card-body flex-col gap-4">

              {/* I GIVE */}
              <div>
                <div className="label mb-2">I Give</div>
                <div className="flex gap-1 mb-2">
                  <button className={`btn btn-xs ${giveMode === "player" ? "btn-primary" : "btn-ghost"}`} onClick={() => setGiveMode("player")}>My Players</button>
                  <button className={`btn btn-xs ${giveMode === "pick" ? "btn-primary" : "btn-ghost"}`} onClick={() => setGiveMode("pick")}>My Pick</button>
                </div>

                {giveMode === "player" && (
                  <div>
                    <input className="input mb-2" placeholder="Search my roster..." value={giveSearch}
                      onChange={e => setGiveSearch(e.target.value)} style={{ fontSize: 12 }} />
                    <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                      {filteredMyAssets.map(p => (
                        <div key={p.id} style={{
                          padding: "7px 10px", borderBottom: "1px solid var(--border)",
                          cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between",
                        }}
                          onClick={() => addGiving({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team}`, side: "give" })}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <span>{p.name}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{p.pos.join("/")} · {p.team}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {giveMode === "pick" && (
                  <div className="flex gap-2 items-center">
                    <select className="select" value={givePickYear} onChange={e => setGivePickYear(e.target.value)} style={{ fontSize: 12 }}>
                      {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
                    </select>
                    <select className="select" value={givePickRound} onChange={e => setGivePickRound(e.target.value)} style={{ fontSize: 12 }}>
                      {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-xs" onClick={() => addGiving({ type: "pick", label: `${givePickYear} ${givePickRound}`, detail: "My pick", side: "give" })}>
                      <Plus size={11} /> Add
                    </button>
                  </div>
                )}

                {giving.length > 0 && (
                  <div className="flex gap-1 mt-2" style={{ flexWrap: "wrap" }}>
                    {giving.map((a, i) => <AssetTag key={i} asset={a} onRemove={() => removeGiving(i)} />)}
                  </div>
                )}
              </div>

              <div className="divider" />

              {/* I RECEIVE */}
              <div>
                <div className="label mb-2">I Receive</div>

                {/* Team selector */}
                <div className="input-group mb-2">
                  <label className="label">From Team</label>
                  <select className="select" value={selectedTeamId || ""} onChange={e => setSelectedTeamId(parseInt(e.target.value) || null)} style={{ fontSize: 12 }}>
                    <option value="">Select a team...</option>
                    {otherTeams.map(t => (
                      <option key={t.rosterId} value={t.rosterId}>{t.teamName || t.username}</option>
                    ))}
                  </select>
                </div>

                {/* 3-way: add extra teams */}
                <div className="mb-2">
                  <div className="text-xs text-muted mb-1">3-way deal? Add another team:</div>
                  <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                    {otherTeams
                      .filter(t => t.rosterId !== selectedTeamId)
                      .map(t => (
                        <button key={t.rosterId}
                          className={`btn btn-xs ${extraTeamIds.includes(t.rosterId) ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => extraTeamIds.includes(t.rosterId) ? removeExtraTeam(t.rosterId) : addExtraTeam(t.rosterId)}>
                          {t.teamName || t.username}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Selected team's players */}
                {selectedTeam && (
                  <PlayerList
                    players={selectedTeamPlayers}
                    onAdd={addReceiving}
                    side="receive"
                    teamName={selectedTeam.teamName || selectedTeam.username}
                  />
                )}

                {/* Extra teams for 3-way */}
                {extraTeamIds.map(id => {
                  const team = otherTeams.find(t => t.rosterId === id);
                  if (!team) return null;
                  const teamPlayers = [...team.starters, ...team.bench, ...(team.taxi || [])];
                  return (
                    <div key={id} className="mt-2">
                      <div className="text-xs text-muted mb-1">From {team.teamName || team.username}:</div>
                      <PlayerList players={teamPlayers} onAdd={addReceiving} side="receive" teamName={team.teamName || team.username} />
                    </div>
                  );
                })}

                {/* Pick from other team */}
                <div className="mt-2">
                  <div className="text-xs text-muted mb-1">Or add their pick:</div>
                  <div className="flex gap-2 items-center">
                    <select className="select" value={pickYear} onChange={e => setPickYear(e.target.value)} style={{ fontSize: 12 }}>
                      {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
                    </select>
                    <select className="select" value={pickRound} onChange={e => setPickRound(e.target.value)} style={{ fontSize: 12 }}>
                      {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-xs" onClick={() => addReceiving({
                      type: "pick",
                      label: `${pickYear} ${pickRound}`,
                      detail: `${selectedTeam?.teamName || "Their"} pick`,
                      side: "receive",
                    })}>
                      <Plus size={11} /> Add
                    </button>
                  </div>
                </div>

                {receiving.length > 0 && (
                  <div className="flex gap-1 mt-2" style={{ flexWrap: "wrap" }}>
                    {receiving.map((a, i) => <AssetTag key={i} asset={a} onRemove={() => removeReceiving(i)} />)}
                  </div>
                )}
              </div>

              <div className="input-group">
                <label className="label">Additional Context (optional)</label>
                <textarea className="textarea" rows={2}
                  placeholder="e.g. They're rebuilding, need picks. Championship window closing."
                  value={otherTeamContext} onChange={e => setOtherTeamContext(e.target.value)} />
              </div>

              <button className="btn btn-accent w-full" onClick={evaluate}
                disabled={loading || (!giving.length && !receiving.length)}>
                {loading ? <><span className="spinner" /> Evaluating...</> : <><Zap size={14} /> Evaluate Trade</>}
              </button>
            </div>
          </div>

          {result && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Analysis</span>
                {result.verdict && (
                  <div className={`verdict ${VERDICT_STYLES[result.verdict]}`} style={{ marginLeft: "auto" }}>
                    {result.verdict}
                  </div>
                )}
              </div>
              <div className="card-body"><div className="ai-box">{result.analysis}</div></div>
            </div>
          )}
        </div>

        {/* History sidebar */}
        <div className="card">
          <div className="card-header"><span className="card-title">Recent Evaluations</span></div>
          {history.length === 0 ? (
            <div className="card-body text-muted text-sm" style={{ textAlign: "center", padding: "32px 16px" }}>
              No trades evaluated yet
            </div>
          ) : (
            <div>
              {history.map(h => (
                <div key={h.id} style={{ padding: "12px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => setResult(h)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted font-mono">{new Date(h.date).toLocaleDateString()}</span>
                    {h.verdict && (
                      <span className={`verdict ${VERDICT_STYLES[h.verdict]}`} style={{ padding: "2px 8px", fontSize: 11 }}>
                        {h.verdict}
                      </span>
                    )}
                  </div>
                  <div className="text-sm"><span style={{ color: "var(--red)" }}>Out: </span>{h.giving.map(a => a.label).join(", ") || "—"}</div>
                  <div className="text-sm"><span style={{ color: "var(--green)" }}>In: </span>{h.receiving.map(a => a.label).join(", ") || "—"}</div>
                  {h.involvedTeams && <div className="text-xs text-muted mt-1">vs {h.involvedTeams}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
