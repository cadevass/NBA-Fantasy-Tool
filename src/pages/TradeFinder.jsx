import { useState } from "react";
import { Plus, X, Zap, RefreshCw } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT, LOCK_IN_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";

const PICK_YEARS = ["2026", "2027", "2028"];
const PICK_ROUNDS = ["1st", "2nd", "3rd"];

const ALL_MY_ASSETS = [
  ...MY_ROSTER.starters.map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team}` })),
  ...MY_ROSTER.bench.map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team} (Bench)` })),
  ...MY_ROSTER.taxi.map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team} (Taxi)` })),
  ...MY_ROSTER.draftCapital.map(d => ({ type: "pick", label: d, detail: "Draft capital" })),
];

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
      {onRemove && <button onClick={onRemove} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 0, marginLeft: 2 }}><X size={11} /></button>}
    </div>
  );
}

function AssetPicker({ side, selected, onAdd, onRemove, label, myAssets }) {
  const [mode, setMode] = useState("player");
  const [customName, setCustomName] = useState("");
  const [customDetail, setCustomDetail] = useState("");
  const [pickYear, setPickYear] = useState("2027");
  const [pickRound, setPickRound] = useState("1st");
  const [search, setSearch] = useState("");

  function addMyAsset(asset) { onAdd({ ...asset, side }); setSearch(""); }
  function addPick() { onAdd({ type: "pick", label: `${pickYear} ${pickRound}`, detail: `${side === "give" ? "My pick" : "Their pick"}`, side }); }
  function addCustom() {
    if (!customName.trim()) return;
    onAdd({ type: "player", label: customName.trim(), detail: customDetail.trim(), side });
    setCustomName(""); setCustomDetail("");
  }

  const filteredAssets = (myAssets || ALL_MY_ASSETS).filter(a => a.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="label mb-2">{label}</div>
      <div className="flex gap-1 mb-2">
        <button className={`btn btn-xs ${mode === "player" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("player")}>My Players</button>
        <button className={`btn btn-xs ${mode === "pick" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("pick")}>Pick</button>
        <button className={`btn btn-xs ${mode === "custom" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("custom")}>Other Player</button>
      </div>

      {mode === "player" && side === "give" && (
        <div>
          <input className="input mb-2" placeholder="Search my assets..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 12 }} />
          <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            {filteredAssets.map((a, i) => (
              <div key={i} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between" }}
                onClick={() => addMyAsset(a)}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <span>{a.label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{a.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(mode === "player" && side === "receive" || mode === "custom") && (
        <div>
          <input className="input mb-2" placeholder="Player name..." value={customName} onChange={e => setCustomName(e.target.value)} style={{ fontSize: 12 }} />
          <input className="input mb-2" placeholder="POS · Team (optional)" value={customDetail} onChange={e => setCustomDetail(e.target.value)} style={{ fontSize: 12 }} />
          <button className="btn btn-ghost btn-xs" onClick={addCustom} disabled={!customName.trim()}><Plus size={11} /> Add Player</button>
        </div>
      )}

      {mode === "pick" && (
        <div className="flex gap-2 items-center">
          <select className="select" value={pickYear} onChange={e => setPickYear(e.target.value)} style={{ fontSize: 12 }}>
            {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="select" value={pickRound} onChange={e => setPickRound(e.target.value)} style={{ fontSize: 12 }}>
            {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="btn btn-ghost btn-xs" onClick={addPick}><Plus size={11} /> Add</button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex gap-1 mt-2" style={{ flexWrap: "wrap" }}>
          {selected.map((a, i) => <AssetTag key={i} asset={a} onRemove={() => onRemove(i)} />)}
        </div>
      )}
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
  const { myTeam, tradedPicks } = useSleeperContext();
  const myAssets = myTeam
    ? [
        ...myTeam.starters.map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team}` })),
        ...myTeam.bench.map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team} (Bench)` })),
        ...(myTeam.taxi || []).map(p => ({ type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team} (Taxi)` })),
      ]
    : ALL_MY_ASSETS;
  const [history, setHistory] = useLocalStorage("trade_history", []);
  const [giving, setGiving] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [otherTeamContext, setOtherTeamContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function addAsset(asset) { if (asset.side === "give") setGiving(prev => [...prev, asset]); else setReceiving(prev => [...prev, asset]); }
  function removeGiving(i) { setGiving(prev => prev.filter((_, idx) => idx !== i)); }
  function removeReceiving(i) { setReceiving(prev => prev.filter((_, idx) => idx !== i)); }

  async function evaluate() {
    if (!giving.length && !receiving.length) return;
    setLoading(true); setResult(null);
    try {
      const giveStr = giving.map(a => `${a.label} (${a.detail || a.type})`).join(", ") || "nothing";
      const recStr = receiving.map(a => `${a.label} (${a.detail || a.type})`).join(", ") || "nothing";

      const prompt = `Evaluate this dynasty trade for my team (The Backshot Dynasty):

I GIVE: ${giveStr}
I RECEIVE: ${recStr}
OTHER TEAM CONTEXT: ${otherTeamContext || "Unknown"}

${DYNASTY_CONTEXT}

Analyse across ALL dimensions:
1. DYNASTY VALUE DELTA
2. IMMEDIATE IMPACT
3. AGE CURVE FIT
4. POSITIONAL FIT
5. LOCK-IN CEILING IMPACT
6. OTHER TEAM MOTIVATION
7. REAL-WORLD CONTEXT
8. DRAFT CAPITAL VALUE

End with:
VERDICT: [ACCEPT / DECLINE / COUNTER]
CONFIDENCE: [High / Medium / Low]
COUNTER SUGGESTION (if declining): [brief suggestion]

Be direct and opinionated.`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const verdict = extractVerdict(text);
      const tradeResult = { id: Date.now(), giving: [...giving], receiving: [...receiving], otherContext: otherTeamContext, analysis: text, verdict, date: new Date().toISOString() };
      setResult(tradeResult);
      setHistory(prev => [tradeResult, ...prev.slice(0, 9)]);
    } catch (e) { setResult({ analysis: `Error: ${e.message}`, verdict: null }); }
    finally { setLoading(false); }
  }

  function reset() { setGiving([]); setReceiving([]); setOtherTeamContext(""); setResult(null); }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Trade Evaluator</div>
          <div className="text-sm text-muted mt-1">Full dynasty trade analysis across 8 dimensions</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reset}><RefreshCw size={13} /> Reset</button>
      </div>

      <div className="page-grid-2">
        <div className="flex-col gap-3">
          <div className="card">
            <div className="card-header"><span className="card-title">Trade Builder</span></div>
            <div className="card-body flex-col gap-4">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div style={{ borderRight: "1px solid var(--border)", paddingRight: 20 }}>
                  <AssetPicker side="give" selected={giving} onAdd={addAsset} onRemove={removeGiving} label="I Give" myAssets={myAssets} />
                </div>
                <div>
                  <AssetPicker side="receive" selected={receiving} onAdd={addAsset} onRemove={removeReceiving} label="I Receive" myAssets={myAssets} />
                </div>
              </div>
              <div className="input-group">
                <label className="label">Other Team Context (optional)</label>
                <textarea className="textarea" rows={2} placeholder="e.g. 'They're rebuilding, need picks.'" value={otherTeamContext} onChange={e => setOtherTeamContext(e.target.value)} />
              </div>
              <button className="btn btn-accent w-full" onClick={evaluate} disabled={loading || (!giving.length && !receiving.length)}>
                {loading ? <><span className="spinner" /> Evaluating...</> : <><Zap size={14} /> Evaluate Trade</>}
              </button>
            </div>
          </div>

          {result && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Analysis</span>
                {result.verdict && <div className={`verdict ${VERDICT_STYLES[result.verdict]}`} style={{ marginLeft: "auto" }}>{result.verdict}</div>}
              </div>
              <div className="card-body"><div className="ai-box">{result.analysis}</div></div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Recent Evaluations</span></div>
          {history.length === 0 ? (
            <div className="card-body text-muted text-sm" style={{ textAlign: "center", padding: "32px 16px" }}>No trades evaluated yet</div>
          ) : (
            <div>
              {history.map(h => (
                <div key={h.id} style={{ padding: "12px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => setResult(h)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted font-mono">{new Date(h.date).toLocaleDateString()}</span>
                    {h.verdict && <span className={`verdict ${VERDICT_STYLES[h.verdict]}`} style={{ padding: "2px 8px", fontSize: 11 }}>{h.verdict}</span>}
                  </div>
                  <div className="text-sm"><span style={{ color: "var(--red)" }}>Out: </span>{h.giving.map(a => a.label).join(", ") || "—"}</div>
                  <div className="text-sm"><span style={{ color: "var(--green)" }}>In: </span>{h.receiving.map(a => a.label).join(", ") || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
