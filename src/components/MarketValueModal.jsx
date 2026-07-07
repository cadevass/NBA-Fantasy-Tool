import { useState, useEffect } from "react";
import { X, Plus, Edit2, Save, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getMarketValues, saveMarketValues, TRENDS, CATEGORIES, getTrendColor, getTrendBg, getTrendIcon, getValueColor } from "../utils/marketValues";

const EMPTY = { name: "", value: 70, trend: "Stable", category: "My Roster", summary: "", updatedAt: "" };

function ValueBar({ value }) {
  const color = getValueColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color, minWidth: 28 }}>{value}</span>
    </div>
  );
}

export default function MarketValueModal({ onClose }) {
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY });
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getMarketValues().then(data => {
      setValues(data);
      setLoading(false);
    });
  }, []);

  async function save(updated) {
    setValues(updated);
    await saveMarketValues(updated);
  }

  function startEdit(player) {
    setEditing(player.id);
    setEditForm({ ...player });
  }

  async function saveEdit() {
    const updated = values.map(v => v.id === editing ? { ...editForm, updatedAt: new Date().toISOString().split("T")[0] } : v);
    await save(updated);
    setEditing(null);
  }

  async function deletePlayer(id) {
    if (!confirm("Remove this player?")) return;
    await save(values.filter(v => v.id !== id));
  }

  async function addPlayer() {
    const newPlayer = { ...addForm, id: Date.now(), updatedAt: new Date().toISOString().split("T")[0] };
    await save([...values, newPlayer]);
    setAdding(false);
    setAddForm({ ...EMPTY });
  }

  const filtered = values
    .filter(v => filter === "All" || v.category === filter)
    .filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        
        {/* Header */}
        <div className="card-header" style={{ flexShrink: 0 }}>
          <span className="card-title">Market Value Database</span>
          <div className="flex gap-2 items-center" style={{ marginLeft: "auto" }}>
            <button className="btn btn-accent btn-sm" onClick={() => { setAdding(true); setEditForm({ ...EMPTY }); }}>
              <Plus size={13} /> Add Player
            </button>
            <button className="btn btn-ghost btn-xs" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, flexShrink: 0 }}>
          <input className="input" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
          {["All", "My Roster", "League Player"].map(f => (
            <button key={f} className={`btn btn-xs ${filter === f ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {/* Add Form */}
        {adding && (
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", flexShrink: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Add New Player</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 120px", gap: 8, marginBottom: 8 }}>
              <input className="input" placeholder="Player name" value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 13 }} />
              <input className="input" type="number" min={0} max={100} value={addForm.value}
                onChange={e => setAddForm(f => ({ ...f, value: parseInt(e.target.value) || 0 }))} style={{ fontSize: 13 }} />
              <select className="select" value={addForm.trend}
                onChange={e => setAddForm(f => ({ ...f, trend: e.target.value }))} style={{ fontSize: 13 }}>
                {TRENDS.map(t => <option key={t}>{t}</option>)}
              </select>
              <select className="select" value={addForm.category}
                onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ fontSize: 13 }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <textarea className="textarea" placeholder="One-line summary..." rows={2} value={addForm.summary}
              onChange={e => setAddForm(f => ({ ...f, summary: e.target.value }))} style={{ fontSize: 13, marginBottom: 8 }} />
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-accent btn-sm" onClick={addPlayer} disabled={!addForm.name}>Save</button>
            </div>
          </div>
        )}

        {/* Player List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No players found</div>
          ) : filtered.map(p => (
            <div key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
              {editing === p.id ? (
                <div style={{ padding: 16, background: "var(--surface-2)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 120px", gap: 8, marginBottom: 8 }}>
                    <input className="input" value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 13 }} />
                    <input className="input" type="number" min={0} max={100} value={editForm.value}
                      onChange={e => setEditForm(f => ({ ...f, value: parseInt(e.target.value) || 0 }))} style={{ fontSize: 13 }} />
                    <select className="select" value={editForm.trend}
                      onChange={e => setEditForm(f => ({ ...f, trend: e.target.value }))} style={{ fontSize: 13 }}>
                      {TRENDS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <select className="select" value={editForm.category}
                      onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ fontSize: 13 }}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <textarea className="textarea" rows={2} value={editForm.summary}
                    onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))} style={{ fontSize: 13, marginBottom: 8 }} />
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn btn-accent btn-sm" onClick={saveEdit}><Save size={12} /> Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        background: getTrendBg(p.trend), color: getTrendColor(p.trend),
                        textTransform: "uppercase", letterSpacing: "0.05em"
                      }}>{getTrendIcon(p.trend)} {p.trend}</span>
                      {p.category === "My Roster" && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px",
                          border: "1px solid var(--border)", borderRadius: 10 }}>My Roster</span>
                      )}
                    </div>
                    <ValueBar value={p.value} />
                    {p.summary && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{p.summary}</div>}
                    {p.updatedAt && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Updated {p.updatedAt}</div>}
                  </div>
                  <div className="flex gap-1" style={{ flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => startEdit(p)}><Edit2 size={11} /></button>
                    <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => deletePlayer(p.id)}><Trash2 size={11} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
