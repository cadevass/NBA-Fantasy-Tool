import { useState, useRef, useCallback } from "react";
import { Home } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Rankings from "./pages/Rankings";
import BigBoard from "./pages/BigBoard";
import TradeFinder from "./pages/TradeFinder";
import LockInAdvisor from "./pages/LockInAdvisor";
import League from "./pages/League";
import DraftNight from "./pages/DraftNight";
import RosterPanel from "./components/RosterPanel";

const TABS = [
  { id: "dashboard", label: null, icon: true },
  { id: "bigboard", label: "Big Board" },
  { id: "trade", label: "Trade Evaluator" },
  { id: "lockin", label: "Lock-In Advisor" },
  { id: "rankings", label: "Rankings" },
  { id: "league", label: "League" },
  { id: "draft", label: "🏀 Draft Night" },
];

const NOW = new Date().toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [dynastyMode, setDynastyMode] = useState(() => localStorage.getItem("dynasty_mode") || "contending");
  const toggleMode = useCallback(() => {
    setDynastyMode(prev => {
      const next = prev === "contending" ? "rebuilding" : "contending";
      localStorage.setItem("dynasty_mode", next);
      return next;
    });
  }, []);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="brand-mark">BD</div>
          <div>
            <div className="brand-name">NBA Fantasy Tool</div>
            <div className="brand-sub">The Backshot Dynasty · Sleeper Lock-In</div>
          </div>
        </div>

        <nav className="top-bar-nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}>
              {t.icon ? <Home size={16} /> : t.label}
            </button>
          ))}
        </nav>

        <button id="dynasty-toggle" onClick={toggleMode} style={{
          marginRight: 12, padding: "4px 12px", borderRadius: 20, border: "1px solid var(--border)",
          background: (localStorage.getItem("dynasty_mode") || "contending") === "contending" ? "var(--green-bg)" : "var(--accent-light)",
          color: (localStorage.getItem("dynasty_mode") || "contending") === "contending" ? "var(--green)" : "var(--accent-dim)",
          fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em"
        }}>
          {(localStorage.getItem("dynasty_mode") || "contending") === "contending" ? "🏆 Contending" : "🔄 Rebuilding"}
        </button>
        <div className="top-bar-meta">{NOW}</div>
      </header>

      <main className="main-content">
        {tab === "dashboard" && <Dashboard />}
        {tab === "bigboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20, alignItems: "start" }}>
            <BigBoard />
            <RosterPanel />
          </div>
        )}
        {tab === "trade" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20, alignItems: "start" }}>
            <TradeFinder />
            <RosterPanel />
          </div>
        )}
        {tab === "lockin" && <LockInAdvisor />}
        {tab === "rankings" && <Rankings />}
        {tab === "league" && <League />}
        {tab === "draft" && <DraftNight />}
      </main>
    </div>
  );
}
