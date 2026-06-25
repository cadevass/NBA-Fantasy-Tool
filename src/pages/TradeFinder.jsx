import { useState, useEffect } from "react";
import { Plus, X, Zap, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";
import { MY_PICKS, getPickValue, getAgeCurveMultiplier, getWindowAlignment } from "../utils/pickValues";
import { getTeamContexts, setTeamContext, getTeamContext, TEAM_STATUSES } from "../utils/teamContext";
import { fetchPlayerSeasonStats, findPlayer } from "../utils/nbaStats";

const PICK_YEARS = ["2026", "2027", "2028"];
const PICK_ROUNDS = ["1st", "2nd", "3rd"];

function getGrade(score) {
  if (score >= 90) return { grade: "A+", color: "var(--green)" };
  if (score >= 80) return { grade: "A", color: "var(--green)" };
  if (score >= 70) return { grade: "A-", color: "var(--green)" };
  if (score >= 60) return { grade: "B+", color: "#2B7A3B" };
  if (score >= 50) return { grade: "B", color: "#2B7A3B" };
  if (score >= 40) return { grade: "B-", color: "var(--accent-dim)" };
  if (score >= 30) return { grade: "C+", color: "var(--accent)" };
  if (score >= 20) return { grade: "C", color: "var(--accent)" };
  if (score >= 10) return { grade: "D", color: "var(--red)" };
  return { grade: "F", color: "var(--red)" };
}

function PlayerCard({ player, stats, onRemove, side }) {
  return (
    <div style={{
      background: side === "give" ? "#FFF5F5" : "#F0FFF4",
      border: `1px solid ${side === "give" ? "#FEB2B2" : "#9AE6B4"}`,
      borderRadius: "var(--radius-lg)",
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{player.label}</div>
        {stats ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
            {stats.pts}pts · {stats.reb}reb · {stats.ast}ast · {stats.stl}stl · {stats.blk}blk
            <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>Age {stats.age} · {stats.team}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{player.detail || "Player"}</div>
        )}
      </div>
      <button onClick={onRemove} style={{
        border: "none", background: "rgba(0,0,0,0.06)", cursor: "pointer",
        borderRadius: "50%", width: 24, height: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <X size={12} />
      </button>
    </div>
  );
}

function PickCard({ pick, onRemove, side }) {
  return (
    <div style={{
      background: "var(--accent-light)",
      border: "1px solid #F5D98A",
      borderRadius: "var(--radius-lg)",
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{pick.label}</div>
        <div style={{ fontSize: 11, color: "var(--accent-dim)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
          Value: {side === "give" ? (pick.givingValue || getPickValue(pick.label, "giving")) : (pick.receivingValue || getPickValue(pick.label, "receiving"))}
        </div>
      </div>
      <button onClick={onRemove} style={{
        border: "none", background: "rgba(0,0,0,0.06)", cursor: "pointer",
        borderRadius: "50%", width: 24, height: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <X size={12} />
      </button>
    </div>
  );
}

function PlayerSearchList({ players, onAdd, placeholder, side }) {
  const [search, setSearch] = useState("");
  const [showPicks, setShowPicks] = useState(false);
  const [pickYear, setPickYear] = useState("2027");
  const [pickRound, setPickRound] = useState("1st");

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  return (
    <div>
      <input
        className="input"
        placeholder={placeholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      {search && (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          overflow: "hidden", marginBottom: 8, boxShadow: "var(--shadow-md)",
          background: "var(--surface)",
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 13 }}>No players found</div>
          )}
          {filtered.map(p => (
            <div key={p.id} style={{
              padding: "10px 14px", borderBottom: "1px solid var(--border)",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
              onClick={() => { onAdd({ type: "player", label: p.name, detail: `${p.pos?.join("/") || ""} · ${p.team}`, _nbaId: p.name }); setSearch(""); }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {p.pos?.join("/") || ""} · {p.team}
                </div>
              </div>
              <Plus size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {/* Picks section */}
      <button
        className="btn btn-ghost btn-sm w-full"
        style={{ justifyContent: "space-between", marginTop: 4 }}
        onClick={() => setShowPicks(!showPicks)}
      >
        <span>+ Add Pick</span>
        {showPicks ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {showPicks && (
        <div style={{
          marginTop: 8, padding: "12px",
          background: "var(--surface-2)", borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}>
          {side === "give" ? (
            // My picks
            <div className="flex-col gap-2">
              <div className="label mb-1">My Draft Capital</div>
              {Object.entries(MY_PICKS).map(([key, pick]) => (
                <button key={key} className="btn btn-ghost btn-xs w-full"
                  style={{ justifyContent: "space-between" }}
                  onClick={() => onAdd({ type: "pick", label: pick.label, givingValue: pick.givingValue })}>
                  <span>{pick.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{pick.givingValue}</span>
                </button>
              ))}
            </div>
          ) : (
            // Their picks
            <div>
              <div className="label mb-2">Their Pick</div>
              <div className="flex gap-2 items-center">
                <select className="select" value={pickYear} onChange={e => setPickYear(e.target.value)} style={{ fontSize: 12 }}>
                  {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
                </select>
                <select className="select" value={pickRound} onChange={e => setPickRound(e.target.value)} style={{ fontSize: 12 }}>
                  {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
                </select>
                <button className="btn btn-accent btn-xs" onClick={() => onAdd({
                  type: "pick",
                  label: `${pickYear} ${pickRound}`,
                  receivingValue: getPickValue(`${pickYear} ${pickRound}`, "receiving"),
                })}>
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DimensionRow({ label, score, reasoning }) {
  const { grade, color } = getGrade(score);
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: reasoning ? "pointer" : "default" }}
        onClick={() => reasoning && setExpanded(!expanded)}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{label}</div>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color, minWidth: 28 }}>{grade}</span>
        <div style={{ width: 80, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(score, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        {reasoning && <ChevronDown size={12} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "0.2s" }} />}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, paddingLeft: 4 }}>
          {reasoning || "See overall summary for context."}
        </div>
      )}
    </div>
  );
}

const VERDICT_STYLES = {
  "ACCEPT": { bg: "var(--green-bg)", color: "var(--green)", label: "✓ Accept" },
  "DECLINE": { bg: "var(--red-bg)", color: "var(--red)", label: "✗ Decline" },
  "COUNTER": { bg: "var(--accent-light)", color: "var(--accent-dim)", label: "↔ Counter" },
};

export default function TradeFinder() {
  const { myTeam, teams } = useSleeperContext();
  const [history, setHistory] = useLocalStorage("trade_history_v2", []);
  const [nbaPlayers, setNbaPlayers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [teamContexts, setTeamContextsState] = useState(getTeamContexts());

  const [giving, setGiving] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [otherContext, setOtherContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("evaluate");

  const [suggestTeamId, setSuggestTeamId] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const otherTeams = (teams || []).filter(t => !t.isMe && t.ownerId);
  const selectedTeam = otherTeams.find(t => t.rosterId === selectedTeamId);
  const selectedTeamPlayers = selectedTeam
    ? [...selectedTeam.starters, ...selectedTeam.bench, ...(selectedTeam.taxi || [])]
    : [];

  const myRosterPlayers = myTeam
    ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])]
    : [];

  useEffect(() => {
    async function load() {
      setStatsLoading(true);
      const players = await fetchPlayerSeasonStats();
      setNbaPlayers(players);
      setStatsLoading(false);
    }
    load();
  }, []);

  function getStats(name) { return findPlayer(nbaPlayers, name); }

  function updateTeamCtx(rosterId, field, value) {
    const current = getTeamContext(rosterId);
    setTeamContext(rosterId, { ...current, [field]: value });
    setTeamContextsState(getTeamContexts());
  }

  function buildAssetSummary(assets, side) {
    return assets.map(a => {
      if (a.type === "pick") {
        const val = side === "giving" ? (a.givingValue || getPickValue(a.label, "giving")) : (a.receivingValue || getPickValue(a.label, "receiving"));
        return `${a.label} (dynasty pick value: ${val})`;
      }
      const stats = getStats(a.label);
      if (stats) {
        return `${a.label} — Age ${stats.age}, ${stats.pts}pts/${stats.reb}reb/${stats.ast}ast/${stats.stl}stl/${stats.blk}blk per game (2025-26). Window: ${getWindowAlignment(stats.age)}`;
      }
      return `${a.label}`;
    }).join("\n");
  }

  async function evaluate() {
    if (!giving.length && !receiving.length) return;
    setLoading(true); setResult(null);
    try {
      const giveStr = buildAssetSummary(giving, "giving");
      const recStr = buildAssetSummary(receiving, "receiving");
      const teamCtx = selectedTeam
        ? `${selectedTeam.teamName || selectedTeam.username} — Status: ${getTeamContext(selectedTeam.rosterId).status || "unknown"}`
        : "Unknown";

      const prompt = `Evaluate this dynasty fantasy basketball trade. Search the web for any current player news or injuries.

I GIVE:
${giveStr}

I RECEIVE:
${recStr}

OTHER TEAM: ${teamCtx}
CONTEXT: ${otherContext || "None"}

${DYNASTY_CONTEXT}

CRITICAL INSTRUCTION: Your response must start with the structured scoring block below. No headers, no markdown, no preamble. Start your response with DYNASTY_VALUE_DELTA on the very first line.

IMPORTANT: Fantasy dynasty only. Positional slots and scoring output — not real NBA roster construction.

Score each 0-100 with 1-2 sentences reasoning:

DYNASTY_VALUE_DELTA: [score] | [reasoning]
IMMEDIATE_IMPACT: [score] | [reasoning]
AGE_CURVE_FIT: [score] | [reasoning]
LOCK_IN_CEILING: [score] | [reasoning]
ROSTER_CONSTRUCTION: [score] | [reasoning]

OVERALL_SCORE: [score]
VERDICT: [ACCEPT / DECLINE / COUNTER]
SUMMARY: [2-3 sentence plain English verdict]
COUNTER_SUGGESTION: [if declining, what would make it work]`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const parsed = parseEval(text);
      const tradeResult = {
        id: Date.now(),
        giving: [...giving],
        receiving: [...receiving],
        teamName: selectedTeam?.teamName || selectedTeam?.username || "Unknown",
        analysis: text, parsed,
        date: new Date().toISOString(),
      };
      setResult(tradeResult);
      setHistory(prev => [tradeResult, ...prev.slice(0, 9)]);
    } catch (e) {
      setResult({ analysis: `Error: ${e.message}`, parsed: null });
    } finally {
      setLoading(false);
    }
  }

  function parseEval(text) {
    try {
      const clean = s => s?.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#+/g, "").trim();
      const extractScore = (key) => {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.toUpperCase().includes(key.toUpperCase())) {
            const numMatch = line.match(/(\d+)/);
            const pipeIdx = line.indexOf("|");
            const reasoning = pipeIdx !== -1 ? clean(line.slice(pipeIdx + 1)) : "";
            if (numMatch) return { score: parseInt(numMatch[1]), reasoning };
          }
        }
        return { score: 50, reasoning: "" };
      };
      const verdictM = text.match(/VERDICT:\s*(ACCEPT|DECLINE|COUNTER)/i);
      const summaryM = text.match(/SUMMARY:\s*(.+?)(?=COUNTER_SUGGESTION:|$)/is);
      const counterM = text.match(/COUNTER_SUGGESTION:\s*(.+?)$/is);
      const overallM = text.match(/OVERALL_SCORE:\s*(\d+)/i);
      return {
        dynastyValue: extractScore("DYNASTY_VALUE_DELTA"),
        immediateImpact: extractScore("IMMEDIATE_IMPACT"),
        ageCurve: extractScore("AGE_CURVE_FIT"),
        lockInCeiling: extractScore("LOCK_IN_CEILING"),
        rosterConstruction: extractScore("ROSTER_CONSTRUCTION"),
        overall: overallM ? parseInt(overallM[1]) : 50,
        verdict: verdictM ? verdictM[1].toUpperCase() : null,
        summary: clean(summaryM?.[1]) || clean(text.slice(0, 400)),
        counter: clean(counterM?.[1]) || null,
      };
    } catch { return null; }
  }
  async function getSuggestions() {
    if (suggestTeamId === null) return;
    setSuggestLoading(true); setSuggestions(null);
    try {
      const targetTeam = suggestTeamId === -1 ? null : otherTeams.find(t => t.rosterId === suggestTeamId);
      const myRoster = myRosterPlayers.map(p => {
        const s = getStats(p.name);
        return s ? `${p.name} (Age ${s.age}, ${s.pts}pts/${s.reb}reb/${s.ast}ast)` : p.name;
      }).join(", ");

      const theirRoster = targetTeam
        ? [...targetTeam.starters, ...targetTeam.bench, ...(targetTeam.taxi || [])].map(p => {
            const s = getStats(p.name);
            return s ? `${p.name} (Age ${s.age}, ${s.pts}pts/${s.reb}reb/${s.ast}ast)` : p.name;
          }).join(", ")
        : "All league teams";

      const myPicks = Object.values(MY_PICKS).map(p => `${p.label} (value: ${p.givingValue})`).join(", ");
      const teamStatus = targetTeam ? getTeamContext(targetTeam.rosterId).status : "various";

      const prompt = `You are a dynasty fantasy basketball trade analyst. Search the web for current player values and news, then suggest 3 realistic trade proposals.

MY ROSTER: ${myRoster}
MY DRAFT CAPITAL: ${myPicks}

${targetTeam
  ? `TARGET TEAM: ${targetTeam.teamName || targetTeam.username} (Status: ${teamStatus})\nTHEIR ROSTER: ${theirRoster}`
  : `FIND BEST TRADES ACROSS ALL TEAMS:
${otherTeams.map(t => {
            const roster = [...t.starters, ...t.bench, ...(t.taxi||[])].map(p => p.name).join(", ");
            return `${t.teamName||t.username} (${getTeamContext(t.rosterId).status||"unknown"}): ${roster}`;
          }).join("\n")}`
}

${DYNASTY_CONTEXT}

CRITICAL RULES:
1. You may ONLY suggest players that appear in MY ROSTER or THEIR ROSTER lists above. Never invent or suggest players not listed.
2. This is FANTASY basketball only — player value = fantasy scoring output and dynasty window. Never mention real basketball fit, team chemistry, or on-court roles.
3. Only suggest trades the other team would realistically accept based on their status and needs.

Generate 3 realistic trade proposals using ONLY the players listed above. Format each as:

TRADE_1:
I_GIVE: [assets]
I_RECEIVE: [assets]
FROM_TEAM: [team name]
RATIONALE: [2-3 sentences why both sides benefit]
FAIRNESS: [Favors me / Fair / Favors them]

TRADE_2:
[same]

TRADE_3:
[same]`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      setSuggestions(text);
    } catch (e) {
      setSuggestions(`Error: ${e.message}`);
    } finally {
      setSuggestLoading(false);
    }
  }

  function reset() {
    setGiving([]); setReceiving([]); setOtherContext("");
    setResult(null); setSelectedTeamId(null);
  }

  const teamCtx = selectedTeam ? getTeamContext(selectedTeam.rosterId) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Trade Finder</div>
          <div className="text-sm text-muted mt-1">
            {statsLoading ? "Loading 2025-26 NBA stats..." : `${nbaPlayers.length} players loaded · 2025-26 season`}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={`tab-btn${activeTab === "evaluate" ? " active" : ""}`} onClick={() => setActiveTab("evaluate")}>Evaluate</button>
          <button className={`tab-btn${activeTab === "suggest" ? " active" : ""}`} onClick={() => setActiveTab("suggest")}>Suggest</button>
          <button className={`tab-btn${activeTab === "teams" ? " active" : ""}`} onClick={() => setActiveTab("teams")}>Teams</button>
          <button className={`tab-btn${activeTab === "history" ? " active" : ""}`} onClick={() => setActiveTab("history")}>History</button>
        </div>
      </div>

      {/* EVALUATE */}
      {activeTab === "evaluate" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>

          {/* LEFT — Trade Builder */}
          <div className="flex-col gap-4">

            {/* Team Selector */}
            <div className="card">
              <div className="card-body">
                <div className="label mb-2">Trading With</div>
                <select className="select" value={selectedTeamId || ""}
                  onChange={e => { setSelectedTeamId(parseInt(e.target.value) || null); setReceiving([]); }}
                  style={{ fontSize: 14, fontWeight: 500, height: 44 }}>
                  <option value="">Select a team...</option>
                  {otherTeams.map(t => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName || t.username} — {getTeamContext(t.rosterId).status || "unclassified"}
                    </option>
                  ))}
                </select>
                {selectedTeam && teamCtx?.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {teamCtx.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Trade Columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* I GIVE */}
              <div className="card">
                <div className="card-header" style={{ background: "#FFF5F5", borderBottom: "1px solid #FEB2B2" }}>
                  <span className="card-title" style={{ color: "var(--red)" }}>I Give</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{giving.length} asset{giving.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="card-body flex-col gap-3">
                  <PlayerSearchList
                    players={myRosterPlayers.map(p => ({ ...p, id: p.name, pos: p.pos, team: p.team }))}
                    onAdd={a => setGiving(prev => [...prev, a])}
                    placeholder="Search my roster..."
                    side="give"
                  />
                  {giving.length > 0 && (
                    <div className="flex-col gap-2 mt-2">
                      {giving.map((a, i) => a.type === "pick"
                        ? <PickCard key={i} pick={a} onRemove={() => setGiving(prev => prev.filter((_, idx) => idx !== i))} side="give" />
                        : <PlayerCard key={i} player={a} stats={getStats(a.label)} onRemove={() => setGiving(prev => prev.filter((_, idx) => idx !== i))} side="give" />
                      )}
                    </div>
                  )}
                  {giving.length === 0 && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12 }}>
                      Search above to add players or picks
                    </div>
                  )}
                </div>
              </div>

              {/* I RECEIVE */}
              <div className="card">
                <div className="card-header" style={{ background: "#F0FFF4", borderBottom: "1px solid #9AE6B4" }}>
                  <span className="card-title" style={{ color: "var(--green)" }}>I Receive</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{receiving.length} asset{receiving.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="card-body flex-col gap-3">
                  {selectedTeam ? (
                    <PlayerSearchList
                      players={selectedTeamPlayers.map(p => ({ ...p, id: p.name, pos: p.pos, team: p.team }))}
                      onAdd={a => setReceiving(prev => [...prev, a])}
                      placeholder={`Search ${selectedTeam.teamName || selectedTeam.username}...`}
                      side="receive"
                    />
                  ) : (
                    <div style={{
                      textAlign: "center", padding: "24px 12px",
                      color: "var(--text-muted)", fontSize: 13,
                      border: "2px dashed var(--border)", borderRadius: "var(--radius)",
                    }}>
                      Select a team above first
                    </div>
                  )}
                  {receiving.length > 0 && (
                    <div className="flex-col gap-2 mt-2">
                      {receiving.map((a, i) => a.type === "pick"
                        ? <PickCard key={i} pick={a} onRemove={() => setReceiving(prev => prev.filter((_, idx) => idx !== i))} side="receive" />
                        : <PlayerCard key={i} player={a} stats={getStats(a.label)} onRemove={() => setReceiving(prev => prev.filter((_, idx) => idx !== i))} side="receive" />
                      )}
                    </div>
                  )}
                  {receiving.length === 0 && selectedTeam && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12 }}>
                      Search above to add players or picks
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Context + CTA */}
            <div className="card">
              <div className="card-body flex-col gap-3">
                <div className="input-group">
                  <label className="label">Additional Context (optional)</label>
                  <textarea className="textarea" rows={2} value={otherContext}
                    onChange={e => setOtherContext(e.target.value)}
                    placeholder="e.g. They're desperate for a PG, rebuilding mode, championship window closing..." />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={reset}><RefreshCw size={13} /> Reset</button>
                  <button className="btn btn-accent w-full" style={{ fontSize: 15, height: 44 }}
                    onClick={evaluate} disabled={loading || (!giving.length && !receiving.length)}>
                    {loading ? <><span className="spinner" /> Evaluating...</> : <><Zap size={15} /> Evaluate Trade</>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Result */}
          <div>
            {result?.parsed ? (
              <div className="card">
                <div className="card-header">
                  <div>
                    <span className="card-title">Trade Analysis</span>
                    {result.teamName && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>vs {result.teamName}</div>}
                  </div>
                  {result.parsed.verdict && (
                    <div style={{
                      marginLeft: "auto",
                      background: VERDICT_STYLES[result.parsed.verdict]?.bg,
                      color: VERDICT_STYLES[result.parsed.verdict]?.color,
                      padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                    }}>
                      {VERDICT_STYLES[result.parsed.verdict]?.label}
                    </div>
                  )}
                </div>

                {/* Overall */}
                <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 40, fontWeight: 700, fontFamily: "var(--font-mono)", color: getGrade(result.parsed.overall).color, lineHeight: 1 }}>
                      {getGrade(result.parsed.overall).grade}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>Overall</div>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", flex: 1 }}>
                    {result.parsed.summary}
                  </div>
                </div>

                <DimensionRow label="Dynasty Value Delta" score={result.parsed.dynastyValue.score} reasoning={result.parsed.dynastyValue.reasoning} />
                <DimensionRow label="Immediate Impact" score={result.parsed.immediateImpact.score} reasoning={result.parsed.immediateImpact.reasoning} />
                <DimensionRow label="Age Curve Fit" score={result.parsed.ageCurve.score} reasoning={result.parsed.ageCurve.reasoning} />
                <DimensionRow label="Lock-In Ceiling Impact" score={result.parsed.lockInCeiling.score} reasoning={result.parsed.lockInCeiling.reasoning} />
                <DimensionRow label="Roster Construction" score={result.parsed.rosterConstruction.score} reasoning={result.parsed.rosterConstruction.reasoning} />

                {result.parsed.counter && result.parsed.verdict !== "ACCEPT" && (
                  <div style={{ padding: "14px 16px", background: "var(--accent-light)", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Counter Suggestion</div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{result.parsed.counter}</div>
                  </div>
                )}
              </div>
            ) : result ? (
              <div className="card"><div className="card-body"><div className="ai-box">{result.analysis}</div></div></div>
            ) : (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
                  <Zap size={40} style={{ margin: "0 auto 16px", opacity: 0.15 }} />
                  <div className="font-semibold" style={{ fontSize: 15 }}>No analysis yet</div>
                  <div className="text-sm mt-2">Build a trade on the left and hit Evaluate</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUGGEST */}
      {activeTab === "suggest" && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Suggestion Engine</span></div>
            <div className="card-body flex-col gap-3">
              <div className="input-group">
                <label className="label">Target</label>
                <select className="select" value={suggestTeamId ?? ""}
                  onChange={e => setSuggestTeamId(e.target.value === "" ? null : parseInt(e.target.value))}>
                  <option value="">Select...</option>
                  <option value={-1}>🌐 Best trade across all teams</option>
                  {otherTeams.map(t => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName || t.username}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-accent w-full" onClick={getSuggestions}
                disabled={suggestLoading || suggestTeamId === null}>
                {suggestLoading ? <><span className="spinner" /> Finding trades...</> : <><Zap size={14} /> Suggest Trades</>}
              </button>
            </div>
          </div>
          <div>
            {suggestions ? (
              <div className="card">
                <div className="card-header"><span className="card-title">Suggested Trades</span></div>
                <div className="card-body"><div className="ai-box">{suggestions}</div></div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                  <div className="font-semibold" style={{ fontSize: 14 }}>Select a target and hit Suggest Trades</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAMS */}
      {activeTab === "teams" && (
        <div className="card">
          <div className="card-header"><span className="card-title">Team Classification</span></div>
          <div>
            {otherTeams.map(team => {
              const ctx = getTeamContext(team.rosterId);
              return (
                <div key={team.rosterId} style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{team.teamName || team.username}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>@{team.username}</div>
                    </div>
                    <select className="select" style={{ width: 200, fontSize: 13 }}
                      value={ctx.status || "unknown"}
                      onChange={e => updateTeamCtx(team.rosterId, "status", e.target.value)}>
                      {TEAM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <input className="input" placeholder="Notes (e.g. 'selling vets, wants picks and youth')"
                    value={ctx.notes || ""} style={{ fontSize: 12 }}
                    onChange={e => updateTeamCtx(team.rosterId, "notes", e.target.value)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {activeTab === "history" && (
        <div>
          {history.length === 0 ? (
            <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No trades evaluated yet</div></div>
          ) : (
            <div className="flex-col gap-3">
              {history.map(h => (
                <div key={h.id} className="card" style={{ cursor: "pointer" }}
                  onClick={() => { setResult(h); setActiveTab("evaluate"); }}>
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 600 }}>vs {h.teamName || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(h.date).toLocaleDateString()}</div>
                    </div>
                    {h.parsed?.verdict && (
                      <div style={{
                        marginLeft: "auto",
                        background: VERDICT_STYLES[h.parsed.verdict]?.bg,
                        color: VERDICT_STYLES[h.parsed.verdict]?.color,
                        padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      }}>{VERDICT_STYLES[h.parsed.verdict]?.label}</div>
                    )}
                  </div>
                  <div style={{ padding: "10px 16px" }}>
                    <div className="text-sm"><span style={{ color: "var(--red)", fontWeight: 600 }}>Out: </span>{h.giving.map(a => a.label).join(", ") || "—"}</div>
                    <div className="text-sm mt-1"><span style={{ color: "var(--green)", fontWeight: 600 }}>In: </span>{h.receiving.map(a => a.label).join(", ") || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
