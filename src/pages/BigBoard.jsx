import { useState, useMemo } from "react";
import { Plus, X, Newspaper, Zap, Edit2 } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT, LOCK_IN_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const EMPTY_PROSPECT = {
  name: "", age: "", college: "", positions: [],
  height: "", pts: "", reb: "", ast: "", stl: "", blk: "", threesMade: "", to: "",
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
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`ceiling-dot${i <= value ? " filled" : ""}`} />
      ))}
    </div>
  );
}

export default function BigBoard() {
  const { myTeam } = useSleeperContext();
  const [prospects, setProspects] = useLocalStorage("bb_prospects", []);
  const [news, setNews] = useLocalStorage("bb_news", []);
  const [showModal, setShowModal] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_PROSPECT });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [newsText, setNewsText] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const rankedProspects = useMemo(() => {
    const scored = prospects.map(p => ({ ...p, _score: p.manualScore ?? scoringAlgo(p) }));
    const allScores = scored.map(p => p._score);
    return scored
      .map(p => ({ ...p, tier: p.manualTier ?? assignTier(p._score, allScores) }))
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return b._score - a._score;
      });
  }, [prospects]);

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
      const rosterSummary = myTeam
        ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])].map(p => `${p.name} (${p.pos.join("/")}, ${p.team})`).join(", ")
        : "Roster not loaded yet";

      const prompt = `Analyse this 2026 NBA Draft prospect for my dynasty team. Search the web for their current NBA landing spot, team fit, and any recent news.

NAME: ${form.name}
AGE: ${form.age} | POSITION(S): ${form.positions.join("/")} | HEIGHT: ${form.height}
COLLEGE/COUNTRY: ${form.college}
NBA DRAFT DESTINATION: ${form.nbaTeam || "Search for this"}
STATS: ${form.pts}pts / ${form.reb}reb / ${form.ast}ast / ${form.stl}stl / ${form.blk}blk / ${form.threesMade || 0} 3PM / ${form.to || 0} TO
PROJECTED NBA ROLE: ${form.projRole}
LOCK-IN CEILING: ${form.ceilingRating}/5 | DYNASTY VALUE: ${form.dynastyRating}/5
MY NOTES: ${form.notes}

MY CURRENT ROSTER: ${rosterSummary}
${DYNASTY_CONTEXT}
${LOCK_IN_CONTEXT}

Give me:
1. FIT SUMMARY (2-3 sentences — fantasy roster fit, positional slot, dynasty window alignment)
2. NBA LANDING SPOT ANALYSIS (search for where they were drafted and what that means for their fantasy timeline — usage, role, team pace)
3. LOCK-IN CEILING ASSESSMENT (is the rating accurate for this scoring system?)
4. SUGGESTED TIER (1-5 with brief reason)
5. ONE KEY RISK for my team specifically

Be direct. No fluff. Fantasy dynasty context only — not real NBA roster construction.`;

      const result = await callClaude([{ role: "user", content: prompt }]);
      setAiResult(result);
      const newProspect = {
        ...form,
        id: editingId || Date.now(),
        addedAt: new Date().toISOString(),
        aiAnalysis: result,
      };
      setProspects(prev => editingId ? prev.map(p => p.id === editingId ? newProspect : p) : [...prev, newProspect]);
      setEditingId(null);
    } catch (e) {
      setAiResult(`Error: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  function handleSaveWithoutAI() {
    const newProspect = {
      ...form,
      id: editingId || Date.now(),
      addedAt: new Date().toISOString(),
      aiAnalysis: "",
    };
    setProspects(prev => editingId ? prev.map(p => p.id === editingId ? newProspect : p) : [...prev, newProspect]);
    setShowModal(false); setEditingId(null); setForm({ ...EMPTY_PROSPECT });
  }

  function openEdit(p) { setForm({ ...p }); setEditingId(p.id); setAiResult(p.aiAnalysis || ""); setShowModal(true); }
  function deleteProspect(id) { setProspects(prev => prev.filter(p => p.id !== id)); }
  function overrideTier(id, tier) { setProspects(prev => prev.map(p => p.id === id ? { ...p, manualTier: parseInt(tier) } : p)); }

  async function processNews() {
    if (!newsText.trim()) return;
    setNewsLoading(true);
    try {
      const prompt = `News report submitted about 2026 NBA Draft prospects. Search the web for any related current information, then analyse the impact on my dynasty big board.

NEWS: ${newsText}
MY PROSPECTS: ${prospects.map(p => p.name).join(", ") || "None yet"}
${DYNASTY_CONTEXT}
${LOCK_IN_CONTEXT}

Give me:
1. WHICH PLAYERS ARE AFFECTED
2. RANKING IMPACT for each (move up/down/no change, why)
3. ANY IMMEDIATE ACTION RECOMMENDED

Be direct and specific. Fantasy dynasty context only.`;

      const result = await callClaude([{ role: "user", content: prompt }]);
      setNews(prev => [{ id: Date.now(), text: newsText, analysis: result, addedAt: new Date().toISOString() }, ...prev]);
      setNewsText("");
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setNewsLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Draft Big Board</div>
          <div className="text-sm text-muted mt-1">2026 NBA Rookie Draft — {rankedProspects.length} prospects ranked</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNews(!showNews)}><Newspaper size={13} /> News Feed</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ...EMPTY_PROSPECT }); setAiResult(""); setEditingId(null); setShowModal(true); }}>
            <Plus size={13} /> Add Prospect
          </button>
        </div>
      </div>

      {showNews && (
        <div className="card mb-3">
          <div className="card-header">
            <span className="card-title">News / Intel Feed</span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setShowNews(false)}><X size={12} /></button>
          </div>
          <div className="card-body">
            <div className="input-group mb-2">
              <label className="label">Paste tweet, report, or insider intel</label>
              <textarea className="textarea" rows={3} value={newsText} onChange={e => setNewsText(e.target.value)}
                placeholder="e.g. 'Per Woj: [Prospect] has serious interest from OKC at 3...'" />
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
          <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>Tier → Fantasy Score</span>
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
              <div key={p.id} className="player-row">
                <div className="rank-num">{i + 1}</div>
                <div className={`tier-badge tier-${p.tier}`}>{p.tier}</div>
                <div>
                  <div className="player-name">{p.name}</div>
                  <div className="player-meta">
                    {p.positions?.map(pos => <span key={pos} className="pos-badge">{pos}</span>)}
                    {p.nbaTeam && <span style={{ color: "var(--accent-dim)", fontWeight: 600, marginRight: 4 }}>{p.nbaTeam}</span>}
                    {p.college && <span>{p.college}</span>}
                    {p.age && <span> · Age {p.age}</span>}
                  </div>
                </div>
                <div className="stat-val text-muted" style={{ fontSize: 11 }}>{p.pts && `${p.pts}/${p.reb}/${p.ast}`}</div>
                <div className="stat-val"><CeilingDots value={p.ceilingRating} /><div className="text-xs text-muted mt-1">Ceiling</div></div>
                <div className="stat-val"><span className="font-mono text-sm">{p._score}</span><div className="text-xs text-muted mt-1">Score</div></div>
                <div>
                  <select className="select" style={{ fontSize: 11, padding: "3px 4px", width: 44 }}
                    value={p.tier} onChange={e => overrideTier(p.id, e.target.value)}>
                    {[1,2,3,4,5].map(t => <option key={t} value={t}>T{t}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "span 1" }} />
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)}><Edit2 size={10} /></button>
                  <button className="btn btn-danger btn-xs"
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
                  <input className="input" placeholder="e.g. AJ Dybantsa" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="label">Age</label>
                  <input className="input" type="number" placeholder="19" value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="label">Height</label>
                  <input className="input" placeholder='6&apos;9"' value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
                </div>
                <div className="input-group col-span-2">
                  <label className="label">College / Country</label>
                  <input className="input" placeholder="Duke / Australia" value={form.college}
                    onChange={e => setForm(f => ({ ...f, college: e.target.value }))} />
                </div>
              </div>

              <div className="input-group">
                <label className="label">Position(s)</label>
                <div className="flex gap-2 mt-1">
                  {POSITIONS.map(pos => (
                    <button key={pos} className={`btn btn-xs ${form.positions.includes(pos) ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => togglePos(pos)}>{pos}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label mb-1">Season Stats (per game)</label>
                <div className="form-grid-3">
                  {["pts","reb","ast","stl","blk","threesMade","to"].map(stat => (
                    <div key={stat} className="input-group">
                      <label className="label">{stat === "threesMade" ? "3PM" : stat === "to" ? "TO" : stat.toUpperCase()}</label>
                      <input className="input" type="number" step="0.1" placeholder="0.0" value={form[stat]}
                        onChange={e => setForm(f => ({ ...f, [stat]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="label">Projected NBA Role</label>
                <input className="input" placeholder="e.g. Starting SF, two-way wing" value={form.projRole}
                  onChange={e => setForm(f => ({ ...f, projRole: e.target.value }))} />
              </div>

              <div className="input-group">
                <label className="label">NBA Draft Destination</label>
                <input className="input" placeholder="e.g. WAS Wizards (Pick 1)" value={form.nbaTeam}
                  onChange={e => setForm(f => ({ ...f, nbaTeam: e.target.value }))} />
              </div>

              <div className="form-grid">
                <div className="input-group">
                  <label className="label">Lock-In Ceiling (1-5)</label>
                  <div className="flex gap-2 items-center">
                    <input className="input" type="range" min={1} max={5} value={form.ceilingRating}
                      onChange={e => setForm(f => ({ ...f, ceilingRating: parseInt(e.target.value) }))} />
                    <span className="font-mono font-semibold" style={{ fontSize: 16, minWidth: 18 }}>{form.ceilingRating}</span>
                  </div>
                </div>
                <div className="input-group">
                  <label className="label">Dynasty Value (1-5)</label>
                  <div className="flex gap-2 items-center">
                    <input className="input" type="range" min={1} max={5} value={form.dynastyRating}
                      onChange={e => setForm(f => ({ ...f, dynastyRating: parseInt(e.target.value) }))} />
                    <span className="font-mono font-semibold" style={{ fontSize: 16, minWidth: 18 }}>{form.dynastyRating}</span>
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label className="label">Notes</label>
                <textarea className="textarea" rows={2} placeholder="Key observations, concerns, comp players..."
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {aiResult && <div><label className="label mb-1">AI Analysis</label><div className="ai-box">{aiResult}</div></div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-ghost" onClick={handleSaveWithoutAI} disabled={!form.name}>Save (No AI)</button>
              <button className="btn btn-accent" onClick={handleAddProspect}
                disabled={aiLoading || !form.name || !form.positions.length}>
                {aiLoading ? <><span className="spinner" /> Analysing...</> : <><Zap size={13} /> Analyse & Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
