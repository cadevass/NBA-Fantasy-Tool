import { useState, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSleeperContext } from "../context/SleeperContext";
import { Zap, Check, X, ChevronRight } from "lucide-react";

const LEAGUE_CONFIG = {
  teams: 10,
  rounds: 3,
  myPicks: { 1: 8, 2: 8, 3: 8 },
};

function getPickNumber(round, slot) {
  return (round - 1) * LEAGUE_CONFIG.teams + slot;
}

function getPick(pickNumber) {
  const round = Math.ceil(pickNumber / LEAGUE_CONFIG.teams);
  const slot = pickNumber - (round - 1) * LEAGUE_CONFIG.teams;
  return { round, slot };
}

export default function DraftNight() {
  const { teams } = useSleeperContext();
  const [prospects, setProspects] = useLocalStorage("bb_prospects", []);
  const [draftLog, setDraftLog] = useLocalStorage("draft_log", []);
  const [currentPick, setCurrentPick] = useLocalStorage("dn_currentPick", 1);
  const [activeTab, setActiveTab] = useState("board");

  const totalPicks = LEAGUE_CONFIG.teams * LEAGUE_CONFIG.rounds;
  const { round, slot } = getPick(currentPick);
  const isMyPick = LEAGUE_CONFIG.myPicks[round] === slot;
  const myNextPick = useMemo(() => {
    for (let p = currentPick; p <= totalPicks; p++) {
      const { round: r, slot: s } = getPick(p);
      if (LEAGUE_CONFIG.myPicks[r] === s) return p;
    }
    return null;
  }, [currentPick]);

  const picksUntilMine = myNextPick ? myNextPick - currentPick : null;

  const available = useMemo(() =>
    prospects.filter(p => !p.drafted).sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return (b._score || 0) - (a._score || 0);
    }),
  [prospects]);

  const taken = useMemo(() =>
    prospects.filter(p => p.drafted).sort((a, b) =>
      (a.draftOrder || 999) - (b.draftOrder || 999)
    ),
  [prospects]);

  function markDrafted(id, byMe) {
    const prospect = prospects.find(p => p.id === id);
    setProspects(prev => prev.map(p =>
      p.id === id ? { ...p, drafted: true, draftedBy: byMe ? "me" : "other", draftOrder: currentPick } : p
    ));
    setDraftLog(prev => [...prev, {
      pick: currentPick,
      round,
      slot,
      name: prospect.name,
      byMe,
      positions: prospect.positions,
      tier: prospect.tier,
    }]);
    setCurrentPick(n => n + 1);
  }

  function undoLastPick() {
    if (!draftLog.length) return;
    const last = draftLog[draftLog.length - 1];
    setProspects(prev => prev.map(p =>
      p.name === last.name ? { ...p, drafted: false, draftedBy: null, draftOrder: null } : p
    ));
    setDraftLog(prev => prev.slice(0, -1));
    setCurrentPick(n => n - 1);
  }

  const tierColors = { 1: "var(--tier-1)", 2: "var(--tier-2)", 3: "var(--tier-3)", 4: "var(--tier-4)", 5: "var(--tier-5)" };
  const tierBgs = { 1: "#FFF3DC", 2: "#E8F5EE", 3: "#E8F0F8", 4: "#F0EBF8", 5: "var(--surface-2)" };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Draft Night</div>
          <div className="text-sm text-muted mt-1">2026 Rookie Draft · Linear · 10 Teams</div>
        </div>
        <div className="flex gap-2">
          <button className={`tab-btn${activeTab === "board" ? " active" : ""}`} onClick={() => setActiveTab("board")}>Board</button>
          <button className={`tab-btn${activeTab === "log" ? " active" : ""}`} onClick={() => setActiveTab("log")}>Draft Log ({draftLog.length})</button>
        </div>
      </div>

      {/* On the clock banner */}
      <div style={{
        background: isMyPick ? "var(--accent)" : "var(--text-primary)",
        color: "white",
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
            {isMyPick ? "🏆 You're On The Clock" : "On The Clock"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-mono)" }}>
            Pick {currentPick} · Round {round}.{String(slot).padStart(2, "0")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {!isMyPick && picksUntilMine !== null && (
            <div>
              <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your next pick</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {picksUntilMine === 0 ? "NOW" : `In ${picksUntilMine} pick${picksUntilMine === 1 ? "" : "s"}`}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                R{getPick(myNextPick).round}.{String(getPick(myNextPick).slot).padStart(2, "0")}
              </div>
            </div>
          )}
          {currentPick > totalPicks && (
            <div style={{ fontSize: 16, fontWeight: 700 }}>Draft Complete 🎉</div>
          )}
        </div>
      </div>

      {/* Pick grid */}
      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Pick Tracker</span></div>
        <div className="card-body">
          {[1, 2, 3].map(r => (
            <div key={r} style={{ marginBottom: r < 3 ? 10 : 0 }}>
              <div className="text-xs text-muted mb-1" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Round {r}</div>
              <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                {Array.from({ length: LEAGUE_CONFIG.teams }).map((_, i) => {
                  const slot = i + 1;
                  const pickNum = getPickNumber(r, slot);
                  const isMe = LEAGUE_CONFIG.myPicks[r] === slot;
                  const isDone = pickNum < currentPick;
                  const isCurrent = pickNum === currentPick;
                  const logEntry = draftLog.find(d => d.pick === pickNum);

                  return (
                    <div key={slot} title={logEntry ? logEntry.name : `Pick ${pickNum}`} style={{
                      width: 52, height: 52,
                      border: `2px solid ${isMe ? "var(--accent)" : isCurrent ? "var(--text-primary)" : "var(--border)"}`,
                      borderRadius: "var(--radius)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: isDone ? (logEntry?.byMe ? "var(--accent)" : "var(--surface-2)") : isCurrent ? "var(--text-primary)" : isMe ? "var(--accent-light)" : "white",
                      color: isDone ? (logEntry?.byMe ? "white" : "var(--text-muted)") : isCurrent ? "white" : isMe ? "var(--accent-dim)" : "var(--text-muted)",
                      fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600,
                      position: "relative", cursor: isDone && logEntry ? "help" : "default",
                      flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 9, opacity: 0.7 }}>{r}.{String(slot).padStart(2, "0")}</div>
                      {logEntry ? (
                        <div style={{ fontSize: 9, textAlign: "center", padding: "0 2px", lineHeight: 1.2, marginTop: 2 }}>
                          {logEntry.name.split(" ").slice(-1)[0]}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, marginTop: 2 }}>{isMe ? "ME" : slot}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost btn-sm" onClick={undoLastPick} disabled={!draftLog.length}>
              ↩ Undo Last Pick
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm("Reset entire draft?")) { setCurrentPick(1); setDraftLog([]); setProspects(prev => prev.map(p => ({ ...p, drafted: false, draftedBy: null, draftOrder: null }))); } }}>
              Reset Draft
            </button>
          </div>
        </div>
      </div>

      {activeTab === "board" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
          {/* Available */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Available — {available.length}</span>
              {available[0] && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent-dim)", fontWeight: 600 }}>
                  Best: {available[0].name}
                </span>
              )}
            </div>
            <div>
              {available.map((p, i) => (
                <div key={p.id} style={{
                  display: "grid",
                  gridTemplateColumns: "24px 24px 1fr auto",
                  alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border)",
                  background: i === 0 ? "var(--accent-light)" : "white",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={e => { if (i !== 0) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={e => { if (i !== 0) e.currentTarget.style.background = "white"; }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{i + 1}</div>
                  <div style={{
                    width: 22, height: 22, borderRadius: 3,
                    background: tierBgs[p.tier], color: tierColors[p.tier],
                    border: `1px solid ${tierColors[p.tier]}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
                  }}>{p.tier}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {p.positions?.join("/")} · {p.nbaTeam || p.college}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isMyPick ? (
                      <button className="btn btn-accent btn-sm" onClick={() => markDrafted(p.id, true)}>
                        <Check size={12} /> Draft
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => markDrafted(p.id, false)}>
                        Gone
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {available.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  All prospects drafted
                </div>
              )}
            </div>
          </div>

          {/* Taken */}
          <div className="card">
            <div className="card-header"><span className="card-title">Drafted — {taken.length}</span></div>
            <div>
              {taken.map(p => (
                <div key={p.id} style={{
                  padding: "8px 12px", borderBottom: "1px solid var(--border)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  opacity: p.draftedBy === "me" ? 1 : 0.6,
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: p.draftedBy === "me" ? 700 : 500 }}>
                      {p.draftedBy === "me" && "✓ "}{p.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.positions?.join("/")}</div>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {p.draftOrder ? `Pick ${p.draftOrder}` : ""}
                  </div>
                </div>
              ))}
              {taken.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  No picks made yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "log" && (
        <div className="card">
          <div className="card-header"><span className="card-title">Draft Log</span></div>
          {draftLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No picks logged yet</div>
          ) : (
            <div>
              {draftLog.map((entry, i) => (
                <div key={i} style={{
                  padding: "10px 14px", borderBottom: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 12,
                  background: entry.byMe ? "var(--accent-light)" : "white",
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", minWidth: 48 }}>
                    {entry.round}.{String(entry.slot).padStart(2, "0")}
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: 3,
                    background: tierBgs[entry.tier], color: tierColors[entry.tier],
                    border: `1px solid ${tierColors[entry.tier]}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0,
                  }}>{entry.tier}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: entry.byMe ? 700 : 500, fontSize: 13 }}>
                      {entry.byMe && "✓ "}{entry.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.positions?.join("/")}</div>
                  </div>
                  {entry.byMe && (
                    <span style={{
                      background: "var(--accent)", color: "white",
                      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    }}>MY PICK</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
