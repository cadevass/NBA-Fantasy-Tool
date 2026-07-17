import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useSleeperContext } from "../context/SleeperContext";
import { runTransactionScan, getTransactionCache } from "../utils/transactions";
import { getRankings } from "../utils/rankings";

const TYPE_LABEL = {
  free_agent: "FA Move",
  waiver: "Waiver",
  trade: "Trade",
};

const TYPE_COLOR = {
  free_agent: "var(--text-muted)",
  waiver: "var(--accent-dim)",
  trade: "var(--green)",
};

function TransactionCard({ t }) {
  const time = new Date(t.created).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="card" style={{ marginBottom: 8, borderLeft: t.isNotable ? "3px solid var(--accent)" : "3px solid transparent" }}>
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "var(--surface-2)", color: TYPE_COLOR[t.type] || "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
            {TYPE_LABEL[t.type] || t.type}
          </span>
          {t.isNew && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--green)", border: "1px solid var(--green)", borderRadius: 3, padding: "0 4px" }}>NEW</span>}
          {t.notableDrops.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
              🚨 Notable Drop
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>Wk {t.week} · {time}</span>
        </div>

        {/* Free agent / waiver moves */}
        {t.type !== "trade" && (
          <div style={{ fontSize: 12 }}>
            {t.adds.map((a, i) => (
              <div key={i} style={{ color: "var(--green)", marginBottom: 2 }}>
                ＋ {a.player} → <span style={{ fontWeight: 600 }}>{a.team}</span>
              </div>
            ))}
            {t.drops.map((d, i) => (
              <div key={i} style={{ color: t.notableDrops.find(n => n.playerId === d.playerId) ? "var(--accent)" : "var(--red)", marginBottom: 2 }}>
                － {d.player} ← <span style={{ fontWeight: 600 }}>{d.team}</span>
                {t.notableDrops.find(n => n.playerId === d.playerId) && " ⚠️ has value"}
              </div>
            ))}
          </div>
        )}

        {/* Trades */}
        {t.type === "trade" && (
          <div style={{ fontSize: 12 }}>
            {/* Group by roster */}
            {Object.entries(
              [...t.adds, ...t.drops, ...t.picks].reduce((acc, item) => {
                const key = item.team;
                if (!acc[key]) acc[key] = { receives: [], sends: [] };
                if (t.adds.includes(item)) acc[key].receives.push(item.player);
                if (t.drops.includes(item)) acc[key].sends.push(item.player);
                return acc;
              }, {})
            ).map(([team, { receives, sends }]) => (
              <div key={team} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{team}</span>
                {receives.length > 0 && <span style={{ color: "var(--green)" }}> gets: {receives.join(", ")}</span>}
                {sends.length > 0 && <span style={{ color: "var(--red)" }}> sends: {sends.join(", ")}</span>}
              </div>
            ))}
            {t.picks.length > 0 && (
              <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                Picks: {t.picks.map(p => `${p.season} R${p.round} (${p.from}→${p.to})`).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Radar() {
  const { players: sleeperPlayers, teams } = useSleeperContext();
  const [data, setData] = useState(getTransactionCache());
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // all | notable | trades

  async function scan() {
    if (!sleeperPlayers || !teams) { setError("Sync league first"); return; }
    setScanning(true); setError(null);
    try {
      const rankings = await getRankings();
      const result = await runTransactionScan(sleeperPlayers, teams, rankings);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (!data && sleeperPlayers && teams) scan();
  }, [sleeperPlayers, teams]);

  const transactions = (data?.transactions || []).filter(t => {
    if (filter === "notable") return t.isNotable;
    if (filter === "trades") return t.type === "trade";
    return true;
  });

  const newCount = (data?.transactions || []).filter(t => t.isNew).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Transaction Radar</div>
          <div className="text-sm text-muted mt-1">
            {data ? <>Last scan {new Date(data.scannedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{newCount > 0 && ` · ${newCount} new`}</> : "No scan yet"}
          </div>
        </div>
        <button className="btn btn-accent btn-sm" onClick={scan} disabled={scanning}>
          {scanning ? <><span className="spinner" /> Scanning...</> : <><RefreshCw size={13} /> Scan</>}
        </button>
      </div>

      {error && (
        <div style={{ background: "var(--red-bg)", border: "1px solid #F5C6C3", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["all", "notable", "trades"].map(f => (
          <button key={f} className={`btn btn-sm${filter === f ? " btn-accent" : ""}`} onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
            {f === "notable" ? "🚨 Notable" : f === "trades" ? "🔄 Trades" : "All"}
          </button>
        ))}
      </div>

      {transactions.length === 0 && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: 13 }}>
            {filter !== "all" ? "Nothing matching this filter." : "No transactions found — hit Scan to fetch league activity."}
          </div>
        </div>
      )}

      {transactions.map(t => <TransactionCard key={t.id} t={t} />)}
    </div>
  );
}
