import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, X, Edit2, Save, Trash2, ChevronDown, ChevronUp, Newspaper } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { fetchPlayerSeasonStats, findPlayer } from "../utils/nbaStats";
import { computeObjectiveRankings, fetchCeilingSignals, TRAITS } from "../utils/objectiveRankings";
import { callClaude } from "../utils/api";
import {
  getRankings, saveRankings, sortRankings,
  fuzzyMatch, findPlayerInRankings,
  applyNewsUpdate, revertNewsEntry,
  getTierFromValue,
  POSITIONS, CATEGORIES, TIERS
} from "../utils/rankings";

const TREND_COLORS = {
  Rising: { color: "var(--green)", bg: "var(--green-bg)", icon: "↑" },
  Stable: { color: "var(--accent-dim)", bg: "var(--accent-light)", icon: "→" },
  Falling: { color: "var(--red)", bg: "var(--red-bg)", icon: "↓" },
};

function Sparkline({ player }) {
  // Build value history from newsLog + current value
  const history = [];
  if (player.newsLog?.length > 0) {
    // newsLog entries have previousValue — reconstruct timeline
    const entries = [...player.newsLog].reverse();
    entries.forEach(e => { if (e.previousValue !== undefined) history.push(e.previousValue); });
  }
  history.push(player.value);
  if (history.length < 2) return null;

  const min = Math.min(...history) - 5;
  const max = Math.max(...history) + 5;
  const range = max - min || 1;
  const w = 48, h = 20;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const last = history[history.length - 1];
  const first = history[0];
  const color = last > first ? "var(--green)" : last < first ? "var(--red)" : "var(--text-muted)";
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={points.split(" ").pop().split(",")[0]} cy={points.split(" ").pop().split(",")[1]} r="2" fill={color} />
    </svg>
  );
}

function OwnershipIcon({ category, style }) {
  if (category === "My Roster") return <span title="My Roster" style={{ fontSize: 14, ...style }}>🟢</span>;
  if (category === "League Player") return <span title="League Rostered" style={{ fontSize: 14, ...style }}>🔵</span>;
  return <span title="Free Agent" style={{ fontSize: 14, ...style }}>⚪</span>;
}

export default function Rankings() {
  const { myTeam, teams } = useSleeperContext();
  const [rankings, setRankings] = useState([]);
  const [nbaPlayers, setNbaPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [catFilter, setCatFilter] = useState("All");
  const [trendFilter, setTrendFilter] = useState("All");
  const [viewMode, setViewMode] = useState("manual"); // manual | engine
  const [engineData, setEngineData] = useState(null);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineExpanded, setEngineExpanded] = useState(null);
  const [engineScope, setEngineScope] = useState("tracked");
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", value: 70, trend: "Stable", category: "League Player", position: "PG", nbaTeam: "", summary: "" });
  const [showNewsFeed, setShowNewsFeed] = useState(false);
  const [newsInput, setNewsInput] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsResult, setNewsResult] = useState(null);
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [missingPlayers, setMissingPlayers] = useState([]);

  // Build ownership map from Sleeper
  const ownershipMap = {};
  if (myTeam) {
    [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])].forEach(p => {
      ownershipMap[p.name] = "My Roster";
    });
  }
  (teams || []).filter(t => !t.isMe).forEach(team => {
    [...team.starters, ...team.bench, ...(team.taxi || [])].forEach(p => {
      if (!ownershipMap[p.name]) ownershipMap[p.name] = "League Player";
    });
  });

  useEffect(() => {
    getRankings().then(data => {
      setRankings(data);
      setLoading(false);
    });
    fetchPlayerSeasonStats().then(setNbaPlayers);
  }, []);

  // Objective engine — computes on first switch to engine view
  useEffect(() => {
    if (viewMode !== "engine" || engineData || !nbaPlayers.length) return;
    setEngineLoading(true);
    (async () => {
      try {
        const signals = await fetchCeilingSignals();
        setEngineData(computeObjectiveRankings(nbaPlayers, signals));
      } catch (e) {
        setEngineData({ rankings: [], poolSize: 0, error: e.message });
      } finally {
        setEngineLoading(false);
      }
    })();
  }, [viewMode, nbaPlayers, engineData]);


  const sorted = sortRankings(rankings.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (posFilter !== "All" && p.position !== posFilter) return false;
    if (catFilter !== "All" && p.category !== catFilter) return false;
    if (trendFilter !== "All" && p.trend !== trendFilter) return false;
    return true;
  }));

  async function save(updated) {
    setRankings(updated);
    await saveRankings(updated);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({ ...p });
    setExpandedId(p.id);
  }

  async function saveEdit() {
    const updated = rankings.map(p => p.id === editingId ? { ...editForm, updatedAt: new Date().toISOString().split("T")[0] } : p);
    await save(updated);
    setEditingId(null);
  }

  async function deletePlayer(id) {
    if (!confirm("Remove this player from rankings?")) return;
    await save(rankings.filter(p => p.id !== id));
  }

  async function addPlayer() {
    if (!addForm.name) return;
    const newPlayer = {
      ...addForm,
      id: crypto.randomUUID(),
      newsLog: [],
      updatedAt: new Date().toISOString().split("T")[0],
    };
    await save([...rankings, newPlayer]);
    setShowAddForm(false);
    setAddForm({ name: "", value: 70, trend: "Stable", category: "League Player", position: "PG", nbaTeam: "", summary: "" });
  }

  async function revertNews(playerId, newsId) {
    const updated = revertNewsEntry(rankings, playerId, newsId);
    await save(updated);
  }

  async function analyseNews() {
    if (!newsInput.trim()) return;
    setNewsLoading(true);
    setNewsResult(null);
    setPendingUpdates([]);
    setMissingPlayers([]);

    try {
      const allPlayers = sortRankings(rankings).map((p, i) => `${i+1}. ${p.name} (${p.position}, ${p.nbaTeam}, Value: ${p.value}/100, ${p.trend})`).join("\n");
      const leagueRosters = (teams || []).map(t => `${t.teamName || t.username}: ${[...t.starters, ...t.bench].map(p => p.name).join(", ")}`).join("\n");

      const prompt = `You are a dynasty fantasy basketball analyst. A manager has submitted news for analysis.

CRITICAL: Search the web FIRST to verify all current NBA roster information, trades, and team situations. Do NOT rely on training data for current player locations or roles — search everything.

NEWS SUBMITTED:
${newsInput}

MY CURRENT RANKINGS (all players I track):
${allPlayers}

LEAGUE ROSTERS (who owns who):
${leagueRosters}

SCORING SYSTEM: pts×0.5, reb×1, ast×1, stl×2, blk×2, TO×-1, 3PM×0.5, DD+1, TD+2. Steals and blocks are worth 2x — defensive players are premium.

INSTRUCTIONS:
1. Search the web to verify the news and understand its full impact
2. Identify ALL players affected (primary player + anyone whose role/usage/value changes as a result)
3. For each affected player, determine if they are in MY RANKINGS list above
4. For players IN my rankings: suggest a value adjustment (positive or negative integer, e.g. +8 or -5) with reasoning
5. For players NOT in my rankings but significantly affected: flag them so I can add them

Respond in this EXACT format — no other text:

HEADLINE: [one sentence summary of the news]

AFFECTED:
PLAYER: [exact name from rankings if found, otherwise their full name]
IN_RANKINGS: [YES or NO]
CURRENT_VALUE: [their current value if in rankings, or N/A]
SUGGESTED_DELTA: [integer like +8 or -5, or N/A if not in rankings]
IMPACT: [one sentence — what changed and why it affects their fantasy value in this scoring system]
---
[repeat for each affected player]

END`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      setNewsResult(text);

      // Parse the response
      const headlineM = text.match(/HEADLINE:\s*(.+)/);
      const headline = headlineM?.[1]?.trim() || newsInput.slice(0, 100);

      const blocks = text.split("---").filter(b => b.includes("PLAYER:"));
      const updates = [];
      const missing = [];

      blocks.forEach(block => {
        const nameM = block.match(/PLAYER:\s*(.+)/);
        const inRankM = block.match(/IN_RANKINGS:\s*(YES|NO)/i);
        const deltaM = block.match(/SUGGESTED_DELTA:\s*([+-]?\d+)/);
        const impactM = block.match(/IMPACT:\s*(.+)/);
        const currentM = block.match(/CURRENT_VALUE:\s*(\d+|N\/A)/);

        if (!nameM) return;
        const name = nameM[1].trim();
        const inRankings = inRankM?.[1]?.toUpperCase() === "YES";
        const delta = deltaM ? parseInt(deltaM[1]) : 0;
        const impact = impactM?.[1]?.trim() || "";
        const currentValue = currentM?.[1] || "N/A";

        if (inRankings) {
          const player = findPlayerInRankings(rankings, name);
          if (player) {
            updates.push({ id: player.id, name: player.name, delta, impact, headline, currentValue: player.value });
          }
        } else {
          missing.push({ name, impact });
        }
      });

      setPendingUpdates(updates);
      setMissingPlayers(missing);
    } catch (e) {
      setNewsResult(`Error: ${e.message}`);
    } finally {
      setNewsLoading(false);
    }
  }

  async function applyUpdates() {
    const approved = pendingUpdates.filter(u => u.approved !== false);
    if (!approved.length) return;
    const { updated } = applyNewsUpdate(rankings, approved);
    await save(updated);
    setShowNewsFeed(false);
    setNewsInput("");
    setNewsResult(null);
    setPendingUpdates([]);
    setMissingPlayers([]);
  }

  const tradeBlock = JSON.parse(localStorage.getItem("trade_block") || "[]");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Consensus Rankings</div>
          <div className="text-sm text-muted mt-1">{rankings.length} players tracked · sorted by dynasty value</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNewsFeed(true)}>
            <Newspaper size={14} /> News Feed
          </button>
          <button className="btn btn-accent btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={14} /> Add Player
          </button>
        </div>
      </div>

      {/* Add Player Form */}
      {showAddForm && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">Add Player</span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setShowAddForm(false)}><X size={12} /></button>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 120px 120px 100px", gap: 8, marginBottom: 8 }}>
              <input className="input" placeholder="Player name" value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 13 }} />
              <input className="input" placeholder="NBA Team (e.g. BOS)" value={addForm.nbaTeam}
                onChange={e => setAddForm(f => ({ ...f, nbaTeam: e.target.value }))} style={{ fontSize: 13 }} />
              <input className="input" type="number" min={0} max={100} value={addForm.value}
                onChange={e => setAddForm(f => ({ ...f, value: parseInt(e.target.value) || 0 }))} style={{ fontSize: 13 }} />
              <select className="select" value={addForm.position}
                onChange={e => setAddForm(f => ({ ...f, position: e.target.value }))} style={{ fontSize: 13 }}>
                {POSITIONS.map(p => <option key={p}>{p}</option>)}
              </select>
              <select className="select" value={addForm.trend}
                onChange={e => setAddForm(f => ({ ...f, trend: e.target.value }))} style={{ fontSize: 13 }}>
                {["Rising","Stable","Falling"].map(t => <option key={t}>{t}</option>)}
              </select>
              <select className="select" value={addForm.category}
                onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ fontSize: 13 }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input className="input" placeholder="One-line summary..." value={addForm.summary}
                onChange={e => setAddForm(f => ({ ...f, summary: e.target.value }))} style={{ fontSize: 13, flex: 1 }} />
              <button className="btn btn-accent btn-sm" onClick={addPlayer} disabled={!addForm.name}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
        <input className="input" placeholder="Search..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: 200, fontSize: 13 }} />
        <div className="flex gap-1">
          {["All", ...POSITIONS].map(p => (
            <button key={p} className={`btn btn-xs ${posFilter === p ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setPosFilter(p)}>{p}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {["All", "My Roster", "League Player", "Free Agent"].map(c => (
            <button key={c} className={`btn btn-xs ${catFilter === c ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setCatFilter(c)}>{c}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {[["All","All"],["Rising","↑ Rising"],["Stable","→ Stable"],["Falling","↓ Falling"]].map(([val, label]) => (
            <button key={val} className={`btn btn-xs ${trendFilter === val ? "btn-accent" : "btn-ghost"}`}
              onClick={() => setTrendFilter(val)}
              style={{ color: trendFilter !== val ? (val === "Rising" ? "var(--green)" : val === "Falling" ? "var(--red)" : undefined) : undefined }}>
              {label}
            </button>
          ))}
        </div>

      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={`tab-btn${viewMode === "manual" ? " active" : ""}`} onClick={() => setViewMode("manual")}>
          My Rankings ({rankings.length})
        </button>
        <button className={`tab-btn${viewMode === "engine" ? " active" : ""}`} onClick={() => setViewMode("engine")}>
          ⚙️ Engine
        </button>
      </div>

      {/* Rankings Table */}
      {viewMode === "manual" && (
      <div className="card">
        {loading ? (
          <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading rankings...</div>
        ) : sorted.length === 0 ? (
          <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No players found</div>
        ) : sorted.map((player, idx) => {
          const rank = idx + 1;
          const tier = getTierFromValue(player.value);
          const trend = TREND_COLORS[player.value > 0 ? player.trend : "Stable"];
          const isExpanded = expandedId === player.id;
          const isEditing = editingId === player.id;
          const onTradeBlock = tradeBlock.some(t => t.name?.toLowerCase() === player.name?.toLowerCase());
          const stats = findPlayer(nbaPlayers, player.name);
          const ownership = ownershipMap[player.name] || player.category;

          return (
            <div key={player.id} style={{ borderBottom: "1px solid var(--border)" }}>
              {/* Main Row */}
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : player.id)}>
                {/* Rank */}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>
                  {rank}
                </div>
                {/* Ownership */}
                <OwnershipIcon category={ownership} />
                {/* Name + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{player.name}</span>
                    {onTradeBlock && <span title="On trade block" style={{ fontSize: 11 }}>🏷️</span>}
                    {(() => {
                      if (!player.updatedAt) return null;
                      const daysSince = Math.floor((Date.now() - new Date(player.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
                      const threshold = player.trend === "Falling" ? 7 : player.trend === "Rising" ? 14 : 30;
                      return daysSince >= threshold ? (
                        <span title={`Last updated ${daysSince} days ago — ${player.trend} players should be reviewed every ${threshold} days`} style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.7 }}>⏳</span>
                      ) : null;
                    })()}
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{player.position} · {player.nbaTeam}</span>
                  </div>
                  {stats && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      {stats.pts}pts · {stats.reb}reb · {stats.ast}ast · {stats.stl}stl · {stats.blk}blk
                    </div>
                  )}
                </div>
                {/* Tier */}
                <span style={{ fontSize: 10, color: TIERS[tier]?.color, fontWeight: 700, minWidth: 20 }}>T{tier}</span>
                {/* Value bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                  <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${player.value}%`, height: "100%", borderRadius: 3,
                      background: player.value >= 85 ? "var(--green)" : player.value >= 70 ? "#2B7A3B" : player.value >= 55 ? "var(--accent)" : "var(--red)" }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, minWidth: 24 }}>{player.value}</span>
                </div>
                {/* Sparkline */}
                <Sparkline player={player} />
                {/* Trend */}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: TREND_COLORS[player.trend]?.bg, color: TREND_COLORS[player.trend]?.color, minWidth: 70, textAlign: "center" }}>
                  {TREND_COLORS[player.trend]?.icon} {player.trend}
                </span>

                {/* Actions */}
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-xs" onClick={() => startEdit(player)}><Edit2 size={11} /></button>
                  <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => deletePlayer(player.id)}><Trash2 size={11} /></button>
                </div>
                {isExpanded ? <ChevronUp size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div style={{ padding: "0 16px 16px", background: "var(--surface-2)" }}>
                  {isEditing ? (
                    <div className="flex-col gap-3 pt-3">
                      <div style={{ display: "grid", gridTemplateColumns: "80px 120px 120px 100px", gap: 8 }}>
                        <input className="input" type="number" min={0} max={100} value={editForm.value}
                          onChange={e => setEditForm(f => ({ ...f, value: parseInt(e.target.value) || 0 }))} style={{ fontSize: 13 }} />
                        <select className="select" value={editForm.trend}
                          onChange={e => setEditForm(f => ({ ...f, trend: e.target.value }))} style={{ fontSize: 13 }}>
                          {["Rising","Stable","Falling"].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <select className="select" value={editForm.category}
                          onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ fontSize: 13 }}>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <input className="input" placeholder="Position" value={editForm.position}
                          onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} style={{ fontSize: 13 }} />
                      </div>
                      <input className="input" value={editForm.nbaTeam}
                        onChange={e => setEditForm(f => ({ ...f, nbaTeam: e.target.value }))}
                        placeholder="NBA Team" style={{ fontSize: 13 }} />
                      <textarea className="textarea" rows={2} value={editForm.summary}
                        onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))} style={{ fontSize: 13 }} />
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        <button className="btn btn-accent btn-sm" onClick={saveEdit}><Save size={12} /> Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 flex-col gap-3">
                      {player.summary && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{player.summary}</div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Last updated: {player.updatedAt}</div>

                      {/* News Log */}
                      {player.newsLog?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>News Log</div>
                          {player.newsLog.map(n => (
                            <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{n.headline}</div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{n.impact}</div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                                  {n.date} · {n.valueBefore} → {n.valueAfter} ({n.delta > 0 ? "+" : ""}{n.delta})
                                </div>
                              </div>
                              <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)", flexShrink: 0 }}
                                onClick={() => revertNews(player.id, n.id)}
                                title="Delete and revert value change">
                                ↩ Revert
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* ENGINE VIEW */}
      {viewMode === "engine" && (
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Objective Rankings Engine</div>
              Computed from season stats, calibrated to our Lock-In scoring. FP/game is adjusted for age, role security and efficiency, which sets the ordering. Rank then maps to a dynasty value curve (compressed at the top, like KTC/Dynatyze).
              {engineData && !engineData.logsActive && (
                <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
                  Ceiling + Volatility activate in October once game logs accumulate — weights currently redistributed across the six computable traits.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <button className={`btn btn-xs ${engineScope === "tracked" ? "btn-accent" : "btn-ghost"}`} onClick={() => setEngineScope("tracked")}>In my database</button>
            <button className={`btn btn-xs ${engineScope === "all" ? "btn-accent" : "btn-ghost"}`} onClick={() => setEngineScope("all")}>Whole league</button>
            {engineData && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>pool: {engineData.poolSize} qualifying</span>}
          </div>

          <div className="card">
            {engineLoading ? (
              <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                <span className="spinner" style={{ display: "block", margin: "0 auto 12px" }} />
                Computing percentiles...
              </div>
            ) : !engineData ? (
              <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading stats...</div>
            ) : engineData.error ? (
              <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--red)" }}>{engineData.error}</div>
            ) : (() => {
              const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const manualMap = {};
              rankings.forEach(r => { manualMap[norm(r.name)] = r; });
              const rows = engineData.rankings.filter(r => engineScope === "all" ? true : manualMap[norm(r.name)]);
              if (rows.length === 0) return (
                <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No qualifying players in this view.</div>
              );
              return rows.map((r, i) => {
                const manual = manualMap[norm(r.name)];
                const delta = manual ? r.score - manual.value : null;
                const isOpen = engineExpanded === r.name;
                return (
                  <div key={r.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                      onClick={() => setEngineExpanded(isOpen ? null : r.name)}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.name}
                          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>{r.position} · {r.team} · {r.age}yo</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                          {r.fp} FP/g · {r.minutes} mpg · {r.gp} games
                        </div>
                      </div>
                      {manual && (
                        <div style={{ textAlign: "right", minWidth: 54 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--text-muted)" }}>{manual.value}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>mine</div>
                        </div>
                      )}
                      {delta !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", minWidth: 44, textAlign: "center",
                          color: Math.abs(delta) < 5 ? "var(--text-muted)" : delta > 0 ? "var(--green)" : "var(--red)" }}>
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${r.score}%`, height: "100%", borderRadius: 3,
                            background: r.score >= 85 ? "var(--green)" : r.score >= 70 ? "#2B7A3B" : r.score >= 55 ? "var(--accent)" : "var(--red)" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, minWidth: 24 }}>{r.score}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Trait breakdown</div>
                        {Object.entries(r.traits).map(([key, t]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12 }}>
                            <span style={{ minWidth: 108, fontWeight: 600 }}>{TRAITS[key] ? TRAITS[key].label : key}</span>
                            <div style={{ flex: 1, height: 4, background: "var(--surface)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ width: `${t.percentile}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", minWidth: 34, textAlign: "right", color: "var(--text-muted)" }}>{t.percentile}%</span>
                            <span style={{ fontFamily: "var(--font-mono)", minWidth: 46, textAlign: "right", fontSize: 11 }}>{t.raw}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 34, textAlign: "right" }}>w{t.weight}%</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {r.fp} FP/g x age {r.ageMultiplier} ({r.ageBand}) x role {r.roleMultiplier} x eff {r.effBonus} = {r.adjusted} adj → rank #{r.rank} → {r.score}
                        </div>
                        {delta !== null && Math.abs(delta) >= 10 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: delta > 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                            {delta > 0
                              ? `Engine rates him ${delta} higher than you — possible buy target you are undervaluing`
                              : `You rate him ${Math.abs(delta)} higher than the engine — make sure you can justify the premium`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}


      {/* News Feed Modal */}
      {showNewsFeed && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowNewsFeed(false)}>
          <div className="card" style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto" }}>
            <div className="card-header">
              <span className="card-title">News Feed</span>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setShowNewsFeed(false)}><X size={14} /></button>
            </div>
            <div className="card-body flex-col gap-4">
              <div className="input-group">
                <label className="label">Paste news, tweet, or report</label>
                <textarea className="textarea" rows={4} value={newsInput}
                  onChange={e => setNewsInput(e.target.value)}
                  placeholder="e.g. LaMelo Ball traded to Minnesota Timberwolves for Naz Reid and draft picks..." />
              </div>
              <button className="btn btn-accent w-full" onClick={analyseNews} disabled={newsLoading || !newsInput.trim()}>
                {newsLoading ? <><span className="spinner" /> Analysing impact...</> : <><Zap size={14} /> Analyse Impact</>}
              </button>

              {/* Pending Updates */}
              {pendingUpdates.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Proposed Value Changes</div>
                  {pendingUpdates.map((u, i) => (
                    <div key={u.id} style={{ padding: "12px", borderRadius: "var(--radius)", background: "var(--surface-2)",
                      border: `1px solid ${u.approved === false ? "var(--red)" : "var(--border)"}`, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                          <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 13 }}>
                            {u.currentValue} → <strong style={{ color: u.delta > 0 ? "var(--green)" : "var(--red)" }}>
                              {Math.max(0, Math.min(100, u.currentValue + u.delta))}
                            </strong>
                            <span style={{ color: u.delta > 0 ? "var(--green)" : "var(--red)", marginLeft: 4 }}>
                              ({u.delta > 0 ? "+" : ""}{u.delta})
                            </span>
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <input type="number" value={u.delta}
                            onChange={e => setPendingUpdates(prev => prev.map((x, j) => j === i ? { ...x, delta: parseInt(e.target.value) || 0 } : x))}
                            style={{ width: 60, fontFamily: "var(--font-mono)", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "2px 6px", background: "var(--surface)" }} />
                          <button className="btn btn-xs" style={{ background: u.approved === false ? "var(--surface-2)" : "var(--green-bg)", color: u.approved === false ? "var(--text-muted)" : "var(--green)" }}
                            onClick={() => setPendingUpdates(prev => prev.map((x, j) => j === i ? { ...x, approved: true } : x))}>✓</button>
                          <button className="btn btn-xs" style={{ background: u.approved === false ? "var(--red-bg)" : "var(--surface-2)", color: u.approved === false ? "var(--red)" : "var(--text-muted)" }}
                            onClick={() => setPendingUpdates(prev => prev.map((x, j) => j === i ? { ...x, approved: false } : x))}>✕</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{u.impact}</div>
                    </div>
                  ))}
                  <button className="btn btn-accent w-full" onClick={applyUpdates}>
                    Apply Approved Changes
                  </button>
                </div>
              )}

              {/* Missing Players */}
              {missingPlayers.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Players Not In Rankings</div>
                  {missingPlayers.map((p, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--accent-light)",
                      border: "1px solid var(--border)", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{p.impact}</div>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => {
                        setAddForm(f => ({ ...f, name: p.name }));
                        setShowNewsFeed(false);
                        setShowAddForm(true);
                      }}>+ Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
