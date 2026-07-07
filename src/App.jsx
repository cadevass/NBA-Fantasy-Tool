import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import BigBoard from "./pages/BigBoard";
import TradeFinder from "./pages/TradeFinder";
import LockInAdvisor from "./pages/LockInAdvisor";
import League from "./pages/League";
import DraftNight from "./pages/DraftNight";
import RosterPanel from "./components/RosterPanel";

const TABS = [
  { id: "dashboard", label: "🏠" },
  { id: "bigboard", label: "Big Board" },
  { id: "trade", label: "Trade Evaluator" },
  { id: "lockin", label: "Lock-In Advisor" },
  { id: "league", label: "League" },
  { id: "draft", label: "🏀 Draft Night" },
];

const NOW = new Date().toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });

export default function App() {
  const [tab, setTab] = useState("dashboard");

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
              {t.label}
            </button>
          ))}
        </nav>

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
        {tab === "league" && <League />}
        {tab === "draft" && <DraftNight />}
      </main>
    </div>
  );
}
