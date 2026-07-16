import { useState, useEffect } from "react";
import { RefreshCw, Eye, EyeOff, X } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { fetchPlayerSeasonStats } from "../utils/nbaStats";
import {
  runScan, getLastScan, getDismissed, dismissPlayer, undismissPlayer,
  isVisible, getWatchlist, toggleWatch, normName, buildVerdictPrompt,
} from "../utils/waiverScanner";
import { callClaude } from "../utils/api";
import { getRankings } from "../utils/rankings";
import { weakestRosterPlayers } from "../utils/waiverScanner";

function Badge({ children }) {
  return <span style={{ marginRight: 3 }}>{children}</span>;
}

function ScoreBar({ score }) {
  const pct = Math.min(score, 100);
  const color = score >= 50 ? "var(--green)" : score >= 30 ? "var(--accent)" : "var(--text-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 90 }}>
      <div style={{ flex: 1, height: 4, background: "var(--surface-2)", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: 4, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color, minWidth: 34, textAlign: "right" }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function FACard({ r, watched, onDismiss, onWatch, expanded, onToggle, onVerdict, verdict, verdictLoading }) {
  return (
    <div className="card" style={{ marginBottom: 8, opacity: 1 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", cursor: "pointer", gap: 12 }} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
            {r.isNew && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--green)", border: "1px solid var(--green)", borderRadius: 3, padding: "0 4px", letterSpacing: "0.05em" }}>NEW</span>}
            {r.movement > 2 && <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700 }}>▲{r.movement}</span>}
            {r.movement < -2 && <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>▼{Math.abs(r.movement)}</span>}
            {watched && <Eye size={12} style={{ color: "var(--accent)" }} />}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {r.position} · {r.team} · Age {r.age} · {r.pts}p/{r.reb}r/{r.ast}a/{r.stl}s/{r.blk}b · {r.minutes} mpg
          </div>
        </div>
        <div style={{ fontSize: 14 }}>{r.badges.map((b, i) => <Badge key={i}>{b}</Badge>)}</div>
        <ScoreBar score={r.score} />
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px" }}>
          <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
            Score components
          </div>
          {r.components.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span><b>{c.label}</b> — {c.detail}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>+{c.pts}</span>
            </div>
          ))}
          {verdict && (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {verdict}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm btn-accent" disabled={verdictLoading} onClick={(e) => { e.stopPropagation(); onVerdict(r); }}>
              {verdictLoading ? <><span className="spinner" /> Analysing...</> : "✦ Verdict"}
            </button>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onWatch(r.name); }}>
              {watched ? <><EyeOff size={12} /> Unwatch</> : <><Eye size={12} /> Watchlist</>}
            </button>
            <button className="btn btn-sm" style={{ color: "var(--red)" }} onClick={(e) => { e.stopPropagation(); onDismiss(r.name, r.score); }}>
              <X size={12} /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Waivers() {
  const { teams, players } = useSleeperContext();
  const [scan, setScan] = useState(getLastScan());
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(getDismissed());
  const [watchlist, setWatchlist] = useState(getWatchlist());
  const [expandedName, setExpandedName] = useState(null);
  const [filter, setFilter] = useState("all"); // all | watchlist | dismissed
  const [posFilter, setPosFilter] = useState("ALL");
  const [verdicts, setVerdicts] = useState({});
  const [verdictLoading, setVerdictLoading] = useState(null);

  async function getVerdict(r) {
    setVerdictLoading(r.name);
    try {
      const rankings = await getRankings();
      const weakest = weakestRosterPlayers(rankings, 3);
      const prompt = buildVerdictPrompt(r, weakest);
      const text = await callClaude([{ role: "user", content: prompt }]);
      const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,3} /g, "").trim();
      setVerdicts(v => ({ ...v, [r.name]: clean }));
    } catch (e) {
      setVerdicts(v => ({ ...v, [r.name]: `Error: ${e.message}` }));
    } finally {
      setVerdictLoading(null);
    }
  }

  async function doScan() {
    if (!teams) { setError("Sync league rosters first (League tab)"); return; }
    setScanning(true);
    setError(null);
    try {
      const nbaPlayers = await fetchPlayerSeasonStats();
      const result = await runScan({ nbaPlayers, teams, sleeperPlayers: players });
      setScan(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  // Auto-scan on first open if stale (>12h) or missing
  useEffect(() => {
    const last = getLastScan();
    const stale = !last || (Date.now() - new Date(last.ranAt).getTime()) > 12 * 60 * 60 * 1000;
    if (stale && teams) doScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const results = (scan?.results || []).filter(r => {
    if (posFilter !== "ALL" && !String(r.position || "").includes(posFilter)) return false;
    const key = normName(r.name);
    if (filter === "watchlist") return !!watchlist[key];
    if (filter === "dismissed") return !!dismissed[key];
    return isVisible(r, dismissed);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Waiver Wire Scanner</div>
          <div className="text-sm text-muted mt-1">
            {scan ? <>Last scan {new Date(scan.ranAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {!scan.gameLogsActive && " · 📈🔥⚡ signals activate when the season starts"}
              {scan.debug && ` · API:${scan.debug.statsApiPlayers} FA:${scan.debug.freeAgents} Feed:${scan.debug.aboveFloor}`}</> : "No scan yet"}
          </div>
        </div>
        <button className="btn btn-accent btn-sm" onClick={doScan} disabled={scanning}>
          {scanning ? <><span className="spinner" /> Scanning...</> : <><RefreshCw size={13} /> Scan</>}
        </button>
      </div>

      {error && (
        <div style={{ background: "var(--red-bg)", border: "1px solid #F5C6C3", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {["all", "watchlist", "dismissed"].map(f => (
          <button key={f} className={`btn btn-sm${filter === f ? " btn-accent" : ""}`} onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
            {f === "watchlist" ? `👀 Watchlist (${Object.keys(watchlist).length})` : f}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />
        {["ALL", "PG", "SG", "SF", "PF", "C"].map(p => (
          <button key={p} className={`btn btn-sm${posFilter === p ? " btn-accent" : ""}`} onClick={() => setPosFilter(p)}>{p}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        📈 Minutes spike · 🔥 FP rising · ⚡ Per-min monster · 🛡️ Stocks · 🌊 Trending
      </div>

      {results.map(r => (
        <FACard
          key={r.name}
          r={r}
          watched={!!watchlist[normName(r.name)]}
          expanded={expandedName === r.name}
          onToggle={() => setExpandedName(expandedName === r.name ? null : r.name)}
          onDismiss={(name, score) => {
            if (dismissed[normName(name)]) undismissPlayer(name);
            else dismissPlayer(name, score);
            setDismissed(getDismissed());
          }}
          onWatch={(name) => setWatchlist({ ...toggleWatch(name) })}
          onVerdict={getVerdict}
          verdict={verdicts[r.name]}
          verdictLoading={verdictLoading === r.name}
        />
      ))}

      {scan && results.length === 0 && (
        <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: 13 }}>
          Nothing matching this filter.
        </div></div>
      )}
    </div>
  );
}
