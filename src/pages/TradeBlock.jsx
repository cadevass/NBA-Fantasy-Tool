import { useState } from "react";
import { X } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";

export default function TradeBlock() {
  const { myTeam, teams } = useSleeperContext();
  const myRosterPlayers = myTeam ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])] : [];
  const [tradeBlock, setTradeBlock] = useState(() => {
    try { return JSON.parse(localStorage.getItem("trade_block") || "[]"); } catch { return []; }
  });
  const [newBlockPlayer, setNewBlockPlayer] = useState({ name: "", team: "", isMyPlayer: true, notes: "" });

  function saveBlock(updated) {
    setTradeBlock(updated);
    try { localStorage.setItem("trade_block", JSON.stringify(updated)); } catch {}
  }

  function addPlayer() {
    if (!newBlockPlayer.name) return;
    saveBlock([...tradeBlock, {
      ...newBlockPlayer,
      id: Date.now(),
      owner: newBlockPlayer.isMyPlayer ? "My Roster" : "League Player",
    }]);
    setNewBlockPlayer({ name: "", team: "", isMyPlayer: true, notes: "" });
  }

  function removePlayer(id) {
    saveBlock(tradeBlock.filter(p => p.id !== id));
  }

  const ownerTeam = (teams || []).find(t => (t.teamName || t.username) === newBlockPlayer.team);
  const ownerRoster = ownerTeam ? [...ownerTeam.starters, ...ownerTeam.bench, ...(ownerTeam.taxi || [])] : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Trade Block</div>
          <div className="text-sm text-muted mt-1">Your available players + confirmed intel on leaguemate availability</div>
        </div>
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">Add Player</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className={`btn btn-sm${newBlockPlayer.isMyPlayer ? " btn-accent" : ""}`}
              onClick={() => setNewBlockPlayer(p => ({ ...p, isMyPlayer: true, name: "", team: "" }))}>
              My Roster
            </button>
            <button className={`btn btn-sm${!newBlockPlayer.isMyPlayer ? " btn-accent" : ""}`}
              onClick={() => setNewBlockPlayer(p => ({ ...p, isMyPlayer: false, name: "", team: "" }))}>
              League Player
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {newBlockPlayer.isMyPlayer ? (
              <select className="select" value={newBlockPlayer.name}
                onChange={e => setNewBlockPlayer(p => ({ ...p, name: e.target.value, team: "Me" }))}
                style={{ gridColumn: "1 / -1" }}>
                <option value="">Select from my roster...</option>
                {myRosterPlayers.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            ) : (
              <>
                <select className="select" value={newBlockPlayer.team}
                  onChange={e => setNewBlockPlayer(p => ({ ...p, team: e.target.value, name: "" }))}>
                  <option value="">Select owner...</option>
                  {(teams || []).filter(t => !t.isMe).map(t => (
                    <option key={t.rosterId} value={t.teamName || t.username}>{t.teamName || t.username}</option>
                  ))}
                </select>
                <select className="select" value={newBlockPlayer.name}
                  onChange={e => setNewBlockPlayer(p => ({ ...p, name: e.target.value }))}
                  disabled={!newBlockPlayer.team}>
                  <option value="">{newBlockPlayer.team ? "Select player..." : "Select owner first..."}</option>
                  {ownerRoster.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="Notes (e.g. wants picks, rebuilding...)"
              value={newBlockPlayer.notes}
              onChange={e => setNewBlockPlayer(p => ({ ...p, notes: e.target.value }))}
              style={{ flex: 1, fontSize: 13 }} />
            <button className="btn btn-accent btn-sm" onClick={addPlayer} disabled={!newBlockPlayer.name}>
              Add
            </button>
          </div>
        </div>
      </div>

      {/* My players on block */}
      {tradeBlock.filter(p => p.owner === "My Roster").length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            My Players Available
          </div>
          {tradeBlock.filter(p => p.owner === "My Roster").map(p => (
            <div key={p.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                {p.notes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.notes}</div>}
              </div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--green-bg)", color: "var(--green)", fontWeight: 700 }}>Available</span>
              <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => removePlayer(p.id)}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* League players on block */}
      {tradeBlock.filter(p => p.owner === "League Player").length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            League Trade Block
          </div>
          {tradeBlock.filter(p => p.owner === "League Player").map(p => (
            <div key={p.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.team}{p.notes && ` · ${p.notes}`}</div>
              </div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--accent-light)", color: "var(--accent-dim)", fontWeight: 700 }}>On Block</span>
              <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => removePlayer(p.id)}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {tradeBlock.length === 0 && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: 13 }}>
            No players on the block yet — add your available players above and log confirmed intel on leaguemates.
          </div>
        </div>
      )}
    </div>
  );
}
