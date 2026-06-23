import { useState, useMemo } from "react";
import { Plus, X, Newspaper, Zap, AlertTriangle, Check, Edit2 } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT, LOCK_IN_CONTEXT, LEAGUE_CONFIG } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const EMPTY_PROSPECT = {
  name: "", age: "", college: "", positions: [],
  height: "", pts: "", reb: "", ast: "", stl: "", blk: "",
  projRole: "", nbaTeam: "", ceilingRating: 3, dynastyRating: 3, notes: "",
};

function scoringAlgo(p) {
  const statsScore =
    (parseFloat(p.pts) || 0) * 0.5 +
    (parseFloat(p.reb) || 0) * 1.0 +
    (parseFloat(p.ast) || 0) * 1.0 +
    (parseFloat(p.stl) || 0) * 2.0 +
    (parseFloat(p.blk) || 0) * 2.0;
  const agePenalty = Math.max(0, (parseInt(p.age) || 20) - 18) * 0.5;
  return Math.round((statsScore * 2 + p.ceilingRating * 4 + p.dynastyRating * 3 - agePenalty) * 10) / 10;
}

function assignTier(score, allScores) {
  if (!allScores.length) return 3;
  const pct = score / Math.max(...allScores);
  if (pct >= 0.85) return 1;
  if (pct >= 0.68) return 2;
  if (pct >= 0.48) return 3;
  if (pct >= 0.30) return 4;
  return 5;
}

function CeilingDots({ value }) {
  return (
    <div className="ceiling-dots">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`ceiling-dot${i <= value ? " filled" : ""}`} />
      ))}
    </div>
  );
}

function PickCountdown({ currentPick, totalPicks, myPick }) {
  return (
    <div className="pick-tracker">
      {Array.from({ length: totalPicks }).map((_, i) => {
        const pick = i + 1;
        const isMe = pick === myPick;
        const done = pick < currentPick;
        return (
          <div key={i} className={`pick-slot${isMe ? " my-pick" : ""}${done ? " completed" : ""}`} title={isMe ? "Your pick" : `Pick ${pick}`}>
            {pick}
          </div>
        );
      })}
    </div>
  );
}

export default function BigBoard() {
  const [prospects, setProspects] = useLocalStorage("bb_prospects", []);
  const [news, setNews] = useLocalStorage("bb_news", []);
  const [currentPick, setCurrentPick] = useLocalStorage("bb_currentPick", 1);
  const [currentRound, setCurrentRound] = useLocalStorage("bb_currentRound", 1);
  const [showModal, setShowModal] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_PROSPECT });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [newsText, setNewsText] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const { myTeam } = useSleeperContext();
  const [editingId, setEditingId] = useState(null);

  const rankedProspects = useMemo(() => {
    const scored = prospects.map(p => ({ ...p, _score: p.manualScore ?? scoringAlgo(p) }));
    const allScores = scored.map(p => p._score);
    return scored
      .map(p => ({ ...p, tier: p.manualTier ?? assignTier(p._score, allScores) }))
      .sort((a, b) => b._score - a._score);
  }, [prospects]);

  const scarcityAlerts = useMemo(() => {
    const remaining = rankedProspects.filter(p => !p.drafted);
    const alerts = [];
    POSITIONS.forEach(pos => {
      const topTier = remaining.filter(p => p.positions?.includes(pos) && p.tier <= 2);
      if (topTier.length > 0 && topTier.length <= 2) alerts.push(`Only ${topTier.length} Tier 1-2 ${pos} remaining`);
    });
    return alerts;
  }, [rankedProspects]);

  function togglePos(pos) {
    setForm(f => ({
      ...f,
      positions: f.positions.includes(pos) ? f.positions.filter(p => p !== pos) : [...f.positions, pos],
    }));
  }

  async function handleAddProspect() {
    setAiLoading(true);
    setAiResult("");
    try {
      const rosterSummary = myTeam ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])].map(p => `${p.name} (${p.pos.join("/")}, ${p.team})`).join(", ") : "Roster not loaded yet";

      const prompt = `Analyse this 2026 NBA Draft prospect for my dynasty team:

NAME: ${form.name}
AGE: ${form.age} | POSITION(S): ${form.positions.join("/")} | HEIGHT: ${form.height}
COLLEGE/COUNTRY: ${form.college}
STATS: ${form.pts}pts / ${form.reb}reb / ${form.ast}ast / ${form.stl}stl / ${form.blk}blk / ${form.threesMade || 0} 3PM / ${form.to || 0} TO
PROJECTED NBA ROLE: ${form.projRole}
LOCK-IN CEILING: ${form.ceilingRating}/5 | DYNASTY VALUE: ${form.dynastyRating}/5
MY NOTES: ${form.notes}

MY CURRENT ROSTER: ${rosterSummary}
${DYNASTY_CONTEXT}
${LOCK_IN_CONTEXT}

Give me:
1. FIT SUMMARY (2-3 sentences)
2. LOCK-IN CEILING ASSESSMENT
3. SUGGESTED TIER (1-5 with brief reason)
4. ONE KEY RISK for my team specifically

Be direct. No fluff.`;

      const result = await callClaude([{ role: "user", content: prompt }]);
      setAiResult(result);
      const newProspect = { ...form, id: editingId || Date.now(), addedAt: new Date().toISOString(), aiAnalysis: result, drafted: false, draftedBy: null };
      setProspects(prev => editingId ? prev.map(p => p.id === editingId ? newProspect : p) : [...prev, newProspect]);
      setEditingId(null);
    } catch (e) {
      setAiResult(`Error: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  function handleSaveWithoutAI() {
    const newProspect = { ...form, id: editingId || Date.now(), addedAt: new Date().toISOString(), aiAnalysis: "", drafted: false, draftedBy: null };
    setProspects(prev => editingId ? prev.map(p => p.id === editingId ? newProspect : p) : [...prev, newProspect]);
    setShowModal(false); setEditingId(null); setForm({ ...EMPTY_PROSPECT });
  }

  function openEdit(p) { setForm({ ...p }); setEditingId(p.id); setAiResult(p.aiAnalysis || ""); setShowModal(true); }
  function markDrafted(id, byMe) { setProspects(prev => prev.map(p => p.id === id ? { ...p, drafted: true, draftedBy: byMe ? "me" : "other" } : p)); setCurrentPick(n => n + 1); }
  function deleteProspect(id) { setProspects(prev => prev.filter(p => p.id !== id)); }
  function overrideTier(id, tier) { setProspects(prev => prev.map(p => p.id === id ? { ...p, manualTier: parseInt(tier) } : p)); }

  async function processNews() {
    if (!newsText.trim()) return;
    setNewsLoading(true);
    try {
      const prompt = `News report submitted. Analyse its impact on my dynasty big board.

NEWS: ${newsText}
MY PROSPECTS: ${prospects.map(p => p.name).join(", ") || "None yet"}
${DYNASTY_CONTEXT}
${LOCK_IN_CONTEXT}

Give me:
1. WHICH PLAYERS ARE AFFECTED
2. RANKING IMPACT for each (move up/down/no change, why)
3. ANY IMMEDIATE ACTION RECOMMENDED

Be direct and specific.`;

      const result = await callClaude([{ role: "user", content: prompt }]);
      setNews(prev => [{ id: Date.now(), text: newsText, analysis: result, addedAt: new Date().toISOString() }, ...prev]);
      setNewsText("");
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setNewsLoading(false); }
  }

  const bestAvailable = useMemo(() => {
    const available = rankedProspects.filter(p => !p.drafted);
    if (!available.length) return null;
    const myPositions = myTeam ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])].flatMap(p => p.pos) : [];
    const posCount = {};
    POSITIONS.forEach(pos => { posCount[pos] = myPositions.filter(p => p === pos).length; });
    return available.map(p => ({
      ...p,
      bpaScore: p._score + (p.positions || []).reduce((acc, pos) => acc + Math.max(0, 3 - (posCount[pos] || 0)) * 2, 0),
    })).sort((a, b) => b.bpaScore - a.bpaScore)[0];
  }, [rankedProspects]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Draft Big Board</div>
          <div className="text-sm text-muted mt-1">2026 NBA Rookie Draft — Linear, Pick 8 · Round {currentRound} · Pick {currentPick}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNews(!showNews)}><Newspaper size={13} /> News Feed</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ...EMPTY_PROSPECT }); setAiResult(""); setEditingId(null); setShowModal(true); }}><Plus size={13} /> Add Prospect</button>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">Round {currentRound} Pick Tracker</span>
          <div className="flex gap-2" style={{ marginLeft: "auto" }}>
            {[1, 2, 3].map(r => <button key={r} className={`btn btn-xs ${currentRound === r ? "btn-accent" : "btn-ghost"}`} onClick={() => setCurrentRound(r)}>R{r}</button>)}
          </div>
        </div>
        <div className="card-body">
          <PickCountdown currentPick={currentPick} totalPicks={10} myPick={currentRound === 1 ? 8 : currentRound === 2 ? 3 : 8} />
          <div className="text-xs text-muted mt-2">
            My picks: <strong>1.08</strong> · <strong>2.03</strong> · <strong>3.08</strong>
            &nbsp;·&nbsp;
            <button className="btn btn-xs btn-ghost" onClick={() => setCurrentPick(1)}>Reset</button>
            <button className="btn btn-xs btn-ghost" style={{ marginLeft: 4 }} onClick={() => setCurrentPick(p => p + 1)}>Advance Pick</button>
          </div>
        </div>
      </div>

      {scarcityAlerts.map((alert, i) => <div key={i} className="scarcity-alert mb-2"><AlertTriangle size={13} /> {alert}</div>)}
      {bestAvailable && <div className="info-alert mb-3"><Zap size={13} /><span>Best Available: <strong>{bestAvailable.name}</strong> ({bestAvailable.positions?.join("/")} · Tier {bestAvailable.tier})</span></div>}

      {showNews && (
        <div className="card mb-3">
          <div className="card-header">
            <span className="card-title">News / Intel Feed</span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setShowNews(false)}><X size={12} /></button>
          </div>
          <div className="card-body">
            <div className="input-group mb-2">
              <label className="label">Paste tweet, report, or insider intel</label>
              <textarea className="textarea" rows={3} value={newsText} onChange={e => setNewsText(e.target.value)} placeholder="e.g. 'Per Woj: [Prospect] has serious interest from OKC at 3...'" />
            </div>
            <button className="btn btn-accent btn-sm" onClick={processNews} disabled={newsLoading || !newsText.trim()}>
              {newsLoading ? <><span className="spinner" /> Analysing...</> : <><Zap size={12} /> Analyse Impact</>}
            </button>
            {news.map(item => (
              <div key={item.id} className="news-item mt-3">
                <div className="news-text">"{item.text}"</div>
                <div className="news-meta">{new Date(item.addedAt).toLocaleString()}</div>
                <div className="ai-box mt-1">{item.analysis}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Rankings — {rankedProspects.length} Prospects</span>
          <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>Auto-ranked by projected fantasy fit</span>
        </div>
        {rankedProspects.length === 0 ? (
          <div className="card-body" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)" }}>
            <Plus size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
            <div className="font-semibold" style={{ fontSize: 14 }}>No prospects added yet</div>
            <div className="text-sm mt-1">Click "Add Prospect" to start building your big board</div>
          </div>
        ) : (
          <div>
            {rankedProspects.map((p, i) => (
              <div key={p.id} className={`player-row${p.drafted ? " drafted" : ""}`}>
                <div className="rank-num">{i + 1}</div>
                <div className={`tier-badge tier-${p.tier}`}>{p.tier}</div>
                <div>
                  <div className="player-name">{p.name}</div>
                  <div className="player-meta">
                    {p.positions?.map(pos => <span key={pos} className="pos-badge">{pos}</span>)}
                    {p.nbaTeam && <span style={{ color: "var(--accent-dim)", fontWeight: 600 }}>{p.nbaTeam}</span>}{p.college && <span>{p.college}</span>}
                    {p.age && <span> · Age {p.age}</span>}
                  </div>
                </div>
                <div className="stat-val text-muted" style={{ fontSize: 11 }}>{p.pts && `${p.pts}/${p.reb}/${p.ast}`}</div>
                <div className="stat-val"><CeilingDots value={p.ceilingRating} /><div className="text-xs text-muted mt-1">Ceiling</div></div>
                <div className="stat-val"><span className="font-mono text-sm">{p._score}</span><div className="text-xs text-muted mt-1">Score</div></div>
                <div>
                  <select className="select" style={{ fontSize: 11, padding: "3px 4px", width: 44 }} value={p.tier} onChange={e => overrideTier(p.id, e.target.value)}>
                    {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>T{t}</option>)}
                  </select>
                </div>
                <div>
                  {!p.drafted ? (
                    <div className="flex gap-2" style={{ marginRight: 8 }}>
                      <button className="btn btn-xs btn-accent" onClick={() => markDrafted(p.id, true)} title="I drafted this player">
                        <Check size={10} /> Mine
                      </button>
                      <button className="btn btn-xs btn-ghost" onClick={() => { if (window.confirm(`Mark ${p.name} as taken by another team?`)) markDrafted(p.id, false); }} title="Drafted by another team">
                        Gone
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">{p.draftedBy === "me" ? "✓ Drafted" : "Taken"}</span>
                  )}
                </div>
                <div className="flex gap-2" style={{ marginLeft: 8 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)} title="Edit">
                    <Edit2 size={10} />
                  </button>
                  <button className="btn btn-danger btn-xs" title="Delete"
                    onClick={() => { if (window.confirm(`Delete ${p.name}?`)) deleteProspect(p.id); }}>
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editingId ? "Edit Prospect" : "Add Prospect"}</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="input-group col-span-2">
                  <label className="label">Player Name</label>
                  <input className="input" placeholder="e.g. Cooper Flagg" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="label">Age</label>
                  <input className="input" type="number" placeholder="19" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="label">Height</label>
                  <input className="input" placeholder='6&apos;9"' value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
                </div>
                <div className="input-group col-span-2">
                  <label className="label">College / Country</label>
                  <input className="input" placeholder="Duke / Australia" value={form.college} onChange={e => setForm(f => ({ ...f, college: e.target.value }))} />
                </div>
              </div>
              <div className="input-group">
                <label className="label">Position(s)</label>
                <div className="flex gap-2 mt-1">
                  {POSITIONS.map(pos => <button key={pos} className={`btn btn-xs ${form.positions.includes(pos) ? "btn-primary" : "btn-ghost"}`} onClick={() => togglePos(pos)}>{pos}</button>)}
                </div>
              </div>
              <div>
                <label className="label mb-1">Season Stats (per game)</label>
                <div className="form-grid-3">
                  {["pts", "reb", "ast", "stl", "blk"].map(stat => (
                    <div key={stat} className="input-group">
                      <label className="label">{stat === "threesMade" ? "3PM" : stat === "to" ? "TO" : stat.toUpperCase()}</label>
                      <input className="input" type="number" step="0.1" placeholder="0.0" value={form[stat]} onChange={e => setForm(f => ({ ...f, [stat]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="input-group">
                <label className="label">Projected NBA Role</label>
                <input className="input" placeholder="e.g. Starting SF, two-way wing" value={form.projRole} onChange={e => setForm(f => ({ ...f, projRole: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="label">NBA Draft Destination (team selected by)</label>
                <input className="input" placeholder="e.g. WAS Wizards (Pick 1) — TBD" value={form.nbaTeam} onChange={e => setForm(f => ({ ...f, nbaTeam: e.target.value }))} />
              </div>
              <div className="form-grid">
                <div className="input-group">
                  <label className="label">Lock-In Ceiling (1-5)</label>
                  <div className="flex gap-2 items-center">
                    <input className="input" type="range" min={1} max={5} value={form.ceilingRating} onChange={e => setForm(f => ({ ...f, ceilingRating: parseInt(e.target.value) }))} />
                    <span className="font-mono font-semibold" style={{ fontSize: 16, minWidth: 18 }}>{form.ceilingRating}</span>
                  </div>
                </div>
                <div className="input-group">
                  <label className="label">Dynasty Value (1-5)</label>
                  <div className="flex gap-2 items-center">
                    <input className="input" type="range" min={1} max={5} value={form.dynastyRating} onChange={e => setForm(f => ({ ...f, dynastyRating: parseInt(e.target.value) }))} />
                    <span className="font-mono font-semibold" style={{ fontSize: 16, minWidth: 18 }}>{form.dynastyRating}</span>
                  </div>
                </div>
              </div>
              <div className="input-group">
                <label className="label">Notes</label>
                <textarea className="textarea" rows={2} placeholder="Key observations, concerns, comp players..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {aiResult && <div><label className="label mb-1">AI Analysis</label><div className="ai-box">{aiResult}</div></div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-ghost" onClick={handleSaveWithoutAI} disabled={!form.name}>Save (No AI)</button>
              <button className="btn btn-accent" onClick={handleAddProspect} disabled={aiLoading || !form.name || !form.positions.length}>
                {aiLoading ? <><span className="spinner" /> Analysing...</> : <><Zap size={13} /> Analyse & Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
