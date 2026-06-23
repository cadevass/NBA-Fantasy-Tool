import { useSleeperContext } from "../context/SleeperContext";
import { RefreshCw } from "lucide-react";

const SECTION_COLORS = {
  starters: "var(--green)",
  bench: "var(--blue)",
  taxi: "var(--text-muted)",
};

function PlayerChip({ player, section }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 12,
    }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{player.name}</div>
        {player.status && player.status !== "Active" && (
          <div style={{ fontSize: 10, color: "var(--red)", marginTop: 1 }}>{player.status}</div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: SECTION_COLORS[section] }}>
          {player.pos.join("/")}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{player.team}</div>
      </div>
    </div>
  );
}

export default function RosterPanel() {
  const { myTeam, loading, lastSynced, sync } = useSleeperContext();

  if (loading && !myTeam) {
    return (
      <div className="card" style={{ position: "sticky", top: 72 }}>
        <div className="card-body" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
          <span className="spinner" style={{ margin: "0 auto 8px", display: "block" }} />
          <div className="text-sm">Syncing from Sleeper...</div>
        </div>
      </div>
    );
  }

  if (!myTeam) return null;

  return (
    <div className="card" style={{ position: "sticky", top: 72 }}>
      <div className="card-header">
        <div>
          <span className="card-title">My Roster</span>
          {lastSynced && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Synced {lastSynced}</div>}
        </div>
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={sync} disabled={loading} title="Refresh">
          <RefreshCw size={11} />
        </button>
      </div>

      <div style={{ borderBottom: "1px solid var(--border)", padding: "6px 12px" }}>
        <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Starters</div>
        {myTeam.starters.map(p => <PlayerChip key={p.id} player={p} section="starters" />)}
      </div>

      {myTeam.bench.length > 0 && (
        <div style={{ borderBottom: "1px solid var(--border)", padding: "6px 12px" }}>
          <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Bench</div>
          {myTeam.bench.map(p => <PlayerChip key={p.id} player={p} section="bench" />)}
        </div>
      )}

      {myTeam.taxi.length > 0 && (
        <div style={{ padding: "6px 12px" }}>
          <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Taxi Squad</div>
          {myTeam.taxi.map(p => <PlayerChip key={p.id} player={p} section="taxi" />)}
        </div>
      )}
    </div>
  );
}
