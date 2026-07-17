import { useState } from "react";
import Radar from "./Radar";
import { RefreshCw, User, Star } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";

const POS_COLORS = {
  PG: "#1D5C8A", SG: "#2B7A3B", SF: "#D4850A",
  PF: "#6B4FA0", C: "#C0392B", G: "#1D5C8A", F: "#D4850A",
};

function PosTag({ pos }) {
  return (
    <span style={{
      display: "inline-block", background: "var(--surface-2)",
      border: "1px solid var(--border)", borderRadius: 3,
      padding: "1px 5px", fontSize: 10, fontWeight: 600,
      color: POS_COLORS[pos] || "var(--text-secondary)",
      fontFamily: "var(--font-mono)", marginRight: 2,
    }}>{pos}</span>
  );
}

function PlayerRow({ player, slot }) {
  const isFA = player.team === "FA" || !player.team;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {slot && <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 28 }}>{slot}</span>}
        <div>
          <span style={{ fontWeight: 500 }}>{player.name}</span>
          {isFA && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--red)", fontWeight: 600 }}>FA</span>}
          {player.status && player.status !== "Active" && player.status !== "ACT" && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "var(--red)" }}>{player.status}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {player.pos.map(p => <PosTag key={p} pos={p} />)}
        <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>{player.team}</span>
      </div>
    </div>
  );
}

function TeamCard({ team, expanded, onToggle }) {
  const STARTER_SLOTS = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "UTIL"];
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {team.isMe && <Star size={13} style={{ color: "var(--accent)" }} fill="var(--accent)" />}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {team.teamName || team.username}
              {team.isMe && <span style={{ marginLeft: 8, fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>YOU</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>@{team.username}</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          {team.starters.length + team.bench.length + team.taxi.length} players · {expanded ? "▲" : "▼"}
        </div>
      </div>
      {expanded && (
        <div>
          <div style={{ padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Starters</span>
          </div>
          {team.starters.map((p, i) => <PlayerRow key={p.id} player={p} slot={STARTER_SLOTS[i]} />)}
          {team.bench.length > 0 && <>
            <div style={{ padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Bench</span>
            </div>
            {team.bench.map(p => <PlayerRow key={p.id} player={p} />)}
          </>}
          {team.taxi.length > 0 && <>
            <div style={{ padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Taxi Squad</span>
            </div>
            {team.taxi.map(p => <PlayerRow key={p.id} player={p} />)}
          </>}
          {team.reserve.length > 0 && <>
            <div style={{ padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>IR / Reserve</span>
            </div>
            {team.reserve.map(p => <PlayerRow key={p.id} player={p} />)}
          </>}
        </div>
      )}
    </div>
  );
}

export default function League() {
  const { teams, loading, error, lastSynced, sync } = useSleeperContext();
  const [expandedId, setExpandedId] = useState(null);
  const [leagueTab, setLeagueTab] = useState("rosters");

  return (
    <div>
      {/* Sub-tab nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button className={`tab-btn${leagueTab === "rosters" ? " active" : ""}`} onClick={() => setLeagueTab("rosters")}>Rosters</button>
        <button className={`tab-btn${leagueTab === "radar" ? " active" : ""}`} onClick={() => setLeagueTab("radar")}>📡 Radar</button>
      </div>

      {/* Radar tab */}
      {leagueTab === "radar" && <Radar />}

      {/* Rosters tab */}
      {leagueTab === "rosters" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold" style={{ fontSize: 16 }}>League Rosters</div>
              <div className="text-sm text-muted mt-1">
                Live sync from Sleeper · The Backshot Dynasty
                {lastSynced && <span> · Last synced {lastSynced}</span>}
              </div>
            </div>
            <button className="btn btn-accent btn-sm" onClick={sync} disabled={loading}>
              {loading ? <><span className="spinner" /> Syncing...</> : <><RefreshCw size={13} /> Sync</>}
            </button>
          </div>

          {error && (
            <div style={{ background: "var(--red-bg)", border: "1px solid #F5C6C3", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
              Error: {error}
            </div>
          )}

          {loading && !teams && (
            <div className="card">
              <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                <span className="spinner" style={{ margin: "0 auto 12px", display: "block", width: 24, height: 24 }} />
                <div className="text-sm">Fetching rosters from Sleeper...</div>
              </div>
            </div>
          )}

          {!loading && !teams && (
            <div className="card">
              <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                <User size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                <div className="font-semibold" style={{ fontSize: 14 }}>No data loaded</div>
                <div className="text-sm mt-1">Hit Sync to pull live rosters</div>
              </div>
            </div>
          )}

          {teams && teams.map(team => (
            <TeamCard
              key={team.rosterId}
              team={team}
              expanded={expandedId === team.rosterId}
              onToggle={() => setExpandedId(expandedId === team.rosterId ? null : team.rosterId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
