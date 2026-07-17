import { useState, useRef, useCallback } from "react";
import { Home } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Debrief from "./pages/Debrief";
import Rankings from "./pages/Rankings";
import BigBoard from "./pages/BigBoard";
import TradeFinder from "./pages/TradeFinder";
import LockInAdvisor from "./pages/LockInAdvisor";
import League from "./pages/League";
import DraftNight from "./pages/DraftNight";
import Waivers from "./pages/Waivers";
import RosterPanel from "./components/RosterPanel";

// Tabs grouped by use frequency — divider renders between groups
const TAB_GROUPS = [
  // Daily use
  [
    { id: "dashboard", label: null, icon: true },
    { id: "waivers", label: "Waivers" },
    { id: "lockin", label: "Lock-In" },
  ],
  // Research / strategy
  [
    { id: "trade", label: "Trade Evaluator" },
    { id: "rankings", label: "Rankings" },
    { id: "league", label: "League" },
  ],
  // Seasonal / rare
  [
    { id: "bigboard", label: "Big Board" },
    { id: "draft", label: "Draft Night" },
  ],
];
const TABS = TAB_GROUPS.flat();

const NOW = new Date().toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [homeTab, setHomeTab] = useState("dashboard");
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
          {TAB_GROUPS.map((group, gi) => (
            <span key={gi} style={{ display: "contents" }}>
              {gi > 0 && (
                <span style={{
                  display: "inline-block", width: 1,
                  height: 16, background: "var(--border)",
                  margin: "0 4px", verticalAlign: "middle", opacity: 0.7,
                }} />
              )}
              {group.map((t, ti) => (
                <button
                  key={t.id}
                  className={`nav-tab${tab === t.id ? " active" : ""}`}
                  onClick={() => setTab(t.id)}
                  style={gi === 2 ? { opacity: 0.55, fontSize: 11 } : {}}
                >
                  {t.icon ? <Home size={16} /> : t.label}
                </button>
              ))}
            </span>
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
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button className={`tab-btn${homeTab === "dashboard" ? " active" : ""}`} onClick={() => setHomeTab("dashboard")}>🏠 Today</button>
              <button className={`tab-btn${homeTab === "debrief" ? " active" : ""}`} onClick={() => setHomeTab("debrief")}>📋 Debrief</button>
            </div>
            {homeTab === "dashboard" && <Dashboard />}
            {homeTab === "debrief" && <Debrief />}
          </div>
        )}
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
        {tab === "waivers" && <Waivers />}
        {tab === "draft" && <DraftNight />}
      </main>
    </div>
  );
}
