import { MY_ROSTER } from "../utils/league";

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
        {player.note && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{player.note}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: SECTION_COLORS[section] }}>{player.pos.join("/")}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{player.team}</div>
      </div>
    </div>
  );
}

export default function RosterPanel() {
  return (
    <div className="card" style={{ position: "sticky", top: 72 }}>
      <div className="card-header">
        <span className="card-title">My Roster</span>
        <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>The Backshot Dynasty</span>
      </div>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "6px 12px" }}>
        <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Starters</div>
        {MY_ROSTER.starters.map(p => <PlayerChip key={p.name} player={p} section="starters" />)}
      </div>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "6px 12px" }}>
        <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Bench</div>
        {MY_ROSTER.bench.map(p => <PlayerChip key={p.name} player={p} section="bench" />)}
      </div>
      <div style={{ padding: "6px 12px" }}>
        <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Taxi Squad</div>
        {MY_ROSTER.taxi.map(p => <PlayerChip key={p.name} player={p} section="taxi" />)}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>Draft Capital</div>
        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
          {MY_ROSTER.draftCapital.map(d => (
            <span key={d} style={{
              display: "inline-block", background: "var(--accent-light)", border: "1px solid #F5D98A",
              borderRadius: 3, padding: "2px 6px", fontSize: 10, fontFamily: "var(--font-mono)",
              color: "var(--accent-dim)", fontWeight: 600,
            }}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
