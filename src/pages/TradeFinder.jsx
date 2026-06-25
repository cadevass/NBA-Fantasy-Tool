import { useState, useEffect, useCallback } from "react";
import { Plus, X, Zap, RefreshCw, ChevronDown, Search, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";
import { MY_PICKS, getPickValue, getAgeCurveMultiplier, getWindowAlignment } from "../utils/pickValues";
import { getTeamContexts, setTeamContext, getTeamContext, TEAM_STATUSES, contextValueAdjustment } from "../utils/teamContext";
import { fetchPlayerSeasonStats, findPlayer } from "../utils/nbaStats";

const PICK_YEARS = ["2026", "2027", "2028"];
const PICK_ROUNDS = ["1st", "2nd", "3rd"];

// Grade helpers
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

function GradeTag({ score }) {
  const { grade, color } = getGrade(score);
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15,
      color, minWidth: 28, display: "inline-block",
    }}>{grade}</span>
  );
}

function AssetTag({ asset, onRemove }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: asset.type === "pick" ? "var(--accent-light)" : "var(--surface-2)",
      border: `1px solid ${asset.type === "pick" ? "#F5D98A" : "var(--border)"}`,
      borderRadius: "var(--radius)", padding: "4px 8px", fontSize: 12, fontWeight: 500,
    }}>
      <span>{asset.label}</span>
      {asset.detail && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>· {asset.detail}</span>}
      {onRemove && (
        <button onClick={onRemove} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 0, marginLeft: 2 }}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function TeamTag({ status }) {
  const s = TEAM_STATUSES.find(t => t.value === status) || TEAM_STATUSES[3];
  return <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>;
}

function DimensionRow({ label, score, reasoning }) {
  const { grade, color } = getGrade(score);
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: reasoning ? "pointer" : "default" }}
        onClick={() => reasoning && setExpanded(!expanded)}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{label}</div>
        <GradeTag score={score} />
        <div style={{
          width: 80, height: 6, background: "var(--surface-2)",
          borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{ width: `${Math.min(score, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        {reasoning && <ChevronDown size={12} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
      </div>
      {expanded && reasoning && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, paddingLeft: 4 }}>
          {reasoning}
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
  const [teamContexts, setTeamContexts] = useState(getTeamContexts());

  // Trade builder state
  const [giving, setGiving] = useState([]);
  const [receiving, setReceiving] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [extraTeamIds, setExtraTeamIds] = useState([]);
  const [giveMode, setGiveMode] = useState("player");
  const [receiveMode, setReceiveMode] = useState("player");
  const [giveSearch, setGiveSearch] = useState("");
  const [receiveSearch, setReceiveSearch] = useState("");
  const [givePickYear, setGivePickYear] = useState("2027");
  const [givePickRound, setGivePickRound] = useState("1st");
  const [receivePickYear, setReceivePickYear] = useState("2027");
  const [receivePickRound, setReceivePickRound] = useState("1st");
  const [otherContext, setOtherContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("evaluate");

  // Suggestion state
  const [suggestTeamId, setSuggestTeamId] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const otherTeams = (teams || []).filter(t => !t.isMe && t.ownerId);
  const selectedTeam = otherTeams.find(t => t.rosterId === selectedTeamId);
  const selectedTeamPlayers = selectedTeam
    ? [...selectedTeam.starters, ...selectedTeam.bench, ...(selectedTeam.taxi || [])]
    : [];

  const myAssets = myTeam
    ? [...myTeam.starters, ...myTeam.bench, ...(myTeam.taxi || [])]
    : [];

  // Load NBA stats on mount
  useEffect(() => {
    async function load() {
      setStatsLoading(true);
      const players = await fetchPlayerSeasonStats("2024-25");
      setNbaPlayers(players);
      setStatsLoading(false);
    }
    load();
  }, []);

  function getPlayerStats(name) {
    return findPlayer(nbaPlayers, name);
  }

  function updateTeamContext(rosterId, field, value) {
    const current = getTeamContext(rosterId);
    const updated = { ...current, [field]: value };
    setTeamContext(rosterId, updated);
    setTeamContexts(getTeamContexts());
  }

  // Build asset summary for AI with stats
  function buildAssetSummary(assets, side) {
    return assets.map(a => {
      if (a.type === "pick") {
        const val = getPickValue(a.label, side);
        return `${a.label} (dynasty value: ${val})`;
      }
      const stats = getPlayerStats(a.label);
      const age = stats?.age || "?";
      const window = stats ? getWindowAlignment(age) : "";
      const curve = stats ? getAgeCurveMultiplier(age) : 1;
      if (stats) {
        return `${a.label} — Age ${age}, ${stats.pts}pts/${stats.reb}reb/${stats.ast}ast/${stats.stl}stl/${stats.blk}blk, ${stats.threesMade} 3PM, ${stats.to} TO (2024-25 per game). Window alignment: ${window}. Age curve multiplier: ${curve}x`;
      }
      return `${a.label} — stats not found in 2024-25 NBA data`;
    }).join("\n");
  }

  async function evaluate() {
    if (!giving.length && !receiving.length) return;
    setLoading(true); setResult(null);
    try {
      const giveStr = buildAssetSummary(giving, "giving");
      const recStr = buildAssetSummary(receiving, "receiving");
      const teamCtx = selectedTeam
        ? `${selectedTeam.teamName || selectedTeam.username} — Status: ${getTeamContext(selectedTeam.rosterId).status}`
        : "Unknown";

      const prompt = `Evaluate this dynasty fantasy basketball trade. Use web search for any current player news, injuries, or role changes.

I GIVE:
${giveStr}

I RECEIVE:
${recStr}

OTHER TEAM: ${teamCtx}
EXTRA CONTEXT: ${otherContext || "None"}

${DYNASTY_CONTEXT}

IMPORTANT: This is a FANTASY dynasty league. Analyse fantasy value only — scoring output, positional slots, dynasty window. Not real NBA roster construction.

Score each dimension from 0-100 and give 1-2 sentences of reasoning for each:

DYNASTY_VALUE_DELTA: [0-100] | [reasoning]
IMMEDIATE_IMPACT: [0-100] | [reasoning]  
AGE_CURVE_FIT: [0-100] | [reasoning]
LOCK_IN_CEILING: [0-100] | [reasoning]
ROSTER_CONSTRUCTION: [0-100] | [reasoning]

Then give:
OVERALL_SCORE: [0-100]
VERDICT: [ACCEPT / DECLINE / COUNTER]
SUMMARY: [2-3 sentences — plain English verdict]
COUNTER_SUGGESTION: [If declining, what would make this work?]

Format your response EXACTLY as shown above with the pipe separators so it can be parsed.`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      const parsed = parseEvaluation(text);
      const tradeResult = {
        id: Date.now(),
        giving: [...giving],
        receiving: [...receiving],
        teamName: selectedTeam?.teamName || selectedTeam?.username || "Unknown",
        analysis: text,
        parsed,
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

  function parseEvaluation(text) {
    try {
      const extract = (key) => {
        const regex = new RegExp(`${key}:\\s*\\[?(\\d+)\\]?\\s*\\|?\\s*(.*)`, 'i');
        const match = text.match(regex);
        return match ? { score: parseInt(match[1]), reasoning: match[2]?.trim() } : { score: 50, reasoning: "" };
      };
      const verdictMatch = text.match(/VERDICT:\s*\[?(ACCEPT|DECLINE|COUNTER)\]?/i);
      const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?=COUNTER_SUGGESTION:|$)/is);
      const counterMatch = text.match(/COUNTER_SUGGESTION:\s*(.+?)$/is);
      const overallMatch = text.match(/OVERALL_SCORE:\s*\[?(\d+)\]?/i);

      return {
        dynastyValue: extract("DYNASTY_VALUE_DELTA"),
        immediateImpact: extract("IMMEDIATE_IMPACT"),
        ageCurve: extract("AGE_CURVE_FIT"),
        lockInCeiling: extract("LOCK_IN_CEILING"),
        rosterConstruction: extract("ROSTER_CONSTRUCTION"),
        overall: overallMatch ? parseInt(overallMatch[1]) : 50,
        verdict: verdictMatch ? verdictMatch[1].toUpperCase() : null,
        summary: summaryMatch ? summaryMatch[1].trim() : text.slice(0, 300),
        counter: counterMatch ? counterMatch[1].trim() : null,
      };
    } catch {
      return null;
    }
  }

  async function getSuggestions() {
    if (!suggestTeamId && suggestTeamId !== 0) return;
    setSuggestLoading(true); setSuggestions(null);
    try {
      const targetTeam = suggestTeamId === -1 ? null : otherTeams.find(t => t.rosterId === suggestTeamId);
      const myRoster = myAssets.map(p => {
        const stats = getPlayerStats(p.name);
        if (stats) return `${p.name} (Age ${stats.age}, ${stats.pts}pts/${stats.reb}reb/${stats.ast}ast, window: ${getWindowAlignment(stats.age)})`;
        return p.name;
      }).join(", ");

      const theirRoster = targetTeam
        ? [...targetTeam.starters, ...targetTeam.bench, ...(targetTeam.taxi || [])].map(p => {
            const stats = getPlayerStats(p.name);
            if (stats) return `${p.name} (Age ${stats.age}, ${stats.pts}pts/${stats.reb}reb/${stats.ast}ast)`;
            return p.name;
          }).join(", ")
        : "All league teams";

      const teamStatus = targetTeam ? getTeamContext(targetTeam.rosterId).status : "various";
      const myPicks = Object.values(MY_PICKS).map(p => `${p.label} (give value: ${p.givingValue})`).join(", ");

      const prompt = `You are a dynasty fantasy basketball trade analyst. Search the web for current player news and values, then suggest 3 realistic trade proposals.

MY ROSTER: ${myRoster}
MY DRAFT CAPITAL: ${myPicks}

${targetTeam ? `TARGET TEAM: ${targetTeam.teamName || targetTeam.username}
THEIR ROSTER: ${theirRoster}
THEIR STATUS: ${teamStatus}` : `TARGET: Best available trades across all league teams
ALL OTHER TEAMS: ${otherTeams.map(t => `${t.teamName || t.username} (${getTeamContext(t.rosterId).status})`).join(", ")}`}

${DYNASTY_CONTEXT}

Generate exactly 3 trade proposals. For each:
- Be realistic — suggest trades the other team would actually consider
- Factor in team direction (contenders want production, rebuilders want youth/picks)
- Consider my 2-3 year dynasty window

Format each proposal as:
TRADE_1:
I_GIVE: [assets]
I_RECEIVE: [assets]  
FROM_TEAM: [team name]
RATIONALE: [2-3 sentences why both sides benefit]
ESTIMATED_FAIRNESS: [Slightly favors me / Fair / Slightly favors them]

TRADE_2:
[same format]

TRADE_3:
[same format]`;

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
    setResult(null); setSelectedTeamId(null); setExtraTeamIds([]);
    setGiveSearch(""); setReceiveSearch("");
  }

  const filteredMyAssets = myAssets.filter(p => p.name.toLowerCase().includes(giveSearch.toLowerCase()));
  const filteredTheirAssets = selectedTeamPlayers.filter(p => p.name.toLowerCase().includes(receiveSearch.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ fontSize: 16 }}>Trade Finder</div>
          <div className="text-sm text-muted mt-1">
            Evaluate trades · Get suggestions · {statsLoading ? "Loading NBA stats..." : `${nbaPlayers.length} players loaded`}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={`tab-btn${activeTab === "evaluate" ? " active" : ""}`} onClick={() => setActiveTab("evaluate")}>Evaluate</button>
          <button className={`tab-btn${activeTab === "suggest" ? " active" : ""}`} onClick={() => setActiveTab("suggest")}>Suggest</button>
          <button className={`tab-btn${activeTab === "teams" ? " active" : ""}`} onClick={() => setActiveTab("teams")}>Teams</button>
          <button className={`tab-btn${activeTab === "history" ? " active" : ""}`} onClick={() => setActiveTab("history")}>History</button>
        </div>
      </div>

      {/* EVALUATE TAB */}
      {activeTab === "evaluate" && (
        <div className="page-grid-2">
          <div className="flex-col gap-3">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Trade Builder</span>
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={reset}><RefreshCw size={11} /> Reset</button>
              </div>
              <div className="card-body flex-col gap-4">

                {/* Team selector */}
                <div className="input-group">
                  <label className="label">Trading With</label>
                  <select className="select" value={selectedTeamId || ""} onChange={e => setSelectedTeamId(parseInt(e.target.value) || null)}>
                    <option value="">Select team...</option>
                    {otherTeams.map(t => (
                      <option key={t.rosterId} value={t.rosterId}>
                        {t.teamName || t.username} — {getTeamContext(t.rosterId).status}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3-way */}
                {selectedTeamId && otherTeams.length > 1 && (
                  <div>
                    <div className="label mb-1">Add 3rd Team</div>
                    <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                      {otherTeams.filter(t => t.rosterId !== selectedTeamId).map(t => (
                        <button key={t.rosterId}
                          className={`btn btn-xs ${extraTeamIds.includes(t.rosterId) ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => setExtraTeamIds(prev =>
                            prev.includes(t.rosterId) ? prev.filter(id => id !== t.rosterId) : [...prev, t.rosterId]
                          )}>
                          {t.teamName || t.username}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* I GIVE */}
                  <div>
                    <div className="label mb-2">I Give</div>
                    <div className="flex gap-1 mb-2">
                      <button className={`btn btn-xs ${giveMode === "player" ? "btn-primary" : "btn-ghost"}`} onClick={() => setGiveMode("player")}>Player</button>
                      <button className={`btn btn-xs ${giveMode === "pick" ? "btn-primary" : "btn-ghost"}`} onClick={() => setGiveMode("pick")}>Pick</button>
                    </div>

                    {giveMode === "player" && (
                      <div>
                        <input className="input mb-2" placeholder="Search my roster..." value={giveSearch}
                          onChange={e => setGiveSearch(e.target.value)} style={{ fontSize: 12 }} />
                        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                          {filteredMyAssets.map(p => {
                            const stats = getPlayerStats(p.name);
                            return (
                              <div key={p.id} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}
                                onClick={() => setGiving(prev => [...prev, { type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team}`, age: stats?.age }])}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                                onMouseLeave={e => e.currentTarget.style.background = ""}>
                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                {stats && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{stats.pts}pts/{stats.reb}reb/{stats.ast}ast · Age {stats.age}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {giveMode === "pick" && (
                      <div className="flex-col gap-2">
                        <div className="label" style={{ fontSize: 10 }}>My Picks</div>
                        {Object.entries(MY_PICKS).map(([key, pick]) => (
                          <button key={key} className="btn btn-ghost btn-xs" style={{ justifyContent: "space-between", width: "100%" }}
                            onClick={() => setGiving(prev => [...prev, { type: "pick", label: pick.label, givingValue: pick.givingValue }])}>
                            <span>{pick.label}</span>
                            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{pick.givingValue}</span>
                          </button>
                        ))}
                        <div className="label mt-2" style={{ fontSize: 10 }}>Custom Pick</div>
                        <div className="flex gap-1">
                          <select className="select" value={givePickYear} onChange={e => setGivePickYear(e.target.value)} style={{ fontSize: 11 }}>
                            {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
                          </select>
                          <select className="select" value={givePickRound} onChange={e => setGivePickRound(e.target.value)} style={{ fontSize: 11 }}>
                            {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
                          </select>
                          <button className="btn btn-ghost btn-xs" onClick={() => setGiving(prev => [...prev, { type: "pick", label: `${givePickYear} ${givePickRound}`, givingValue: getPickValue(`${givePickYear} ${givePickRound}`, "giving") }])}>
                            <Plus size={10} />
                          </button>
                        </div>
                      </div>
                    )}

                    {giving.length > 0 && (
                      <div className="flex gap-1 mt-2" style={{ flexWrap: "wrap" }}>
                        {giving.map((a, i) => <AssetTag key={i} asset={a} onRemove={() => setGiving(prev => prev.filter((_, idx) => idx !== i))} />)}
                      </div>
                    )}
                  </div>

                  {/* I RECEIVE */}
                  <div>
                    <div className="label mb-2">I Receive</div>
                    <div className="flex gap-1 mb-2">
                      <button className={`btn btn-xs ${receiveMode === "player" ? "btn-primary" : "btn-ghost"}`} onClick={() => setReceiveMode("player")}>Player</button>
                      <button className={`btn btn-xs ${receiveMode === "pick" ? "btn-primary" : "btn-ghost"}`} onClick={() => setReceiveMode("pick")}>Pick</button>
                    </div>

                    {receiveMode === "player" && selectedTeam && (
                      <div>
                        <input className="input mb-2" placeholder={`Search ${selectedTeam.teamName || selectedTeam.username}...`}
                          value={receiveSearch} onChange={e => setReceiveSearch(e.target.value)} style={{ fontSize: 12 }} />
                        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                          {filteredTheirAssets.map(p => {
                            const stats = getPlayerStats(p.name);
                            return (
                              <div key={p.id} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}
                                onClick={() => setReceiving(prev => [...prev, { type: "player", label: p.name, detail: `${p.pos.join("/")} · ${p.team}`, age: stats?.age }])}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                                onMouseLeave={e => e.currentTarget.style.background = ""}>
                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                {stats && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{stats.pts}pts/{stats.reb}reb/{stats.ast}ast · Age {stats.age}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {receiveMode === "player" && !selectedTeam && (
                      <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: 12, border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                        Select a team above first
                      </div>
                    )}

                    {receiveMode === "pick" && (
                      <div className="flex-col gap-2">
                        <div className="flex gap-1">
                          <select className="select" value={receivePickYear} onChange={e => setReceivePickYear(e.target.value)} style={{ fontSize: 11 }}>
                            {PICK_YEARS.map(y => <option key={y}>{y}</option>)}
                          </select>
                          <select className="select" value={receivePickRound} onChange={e => setReceivePickRound(e.target.value)} style={{ fontSize: 11 }}>
                            {PICK_ROUNDS.map(r => <option key={r}>{r}</option>)}
                          </select>
                          <button className="btn btn-ghost btn-xs" onClick={() => setReceiving(prev => [...prev, { type: "pick", label: `${receivePickYear} ${receivePickRound}`, receivingValue: getPickValue(`${receivePickYear} ${receivePickRound}`, "receiving") }])}>
                            <Plus size={10} />
                          </button>
                        </div>
                      </div>
                    )}

                    {receiving.length > 0 && (
                      <div className="flex gap-1 mt-2" style={{ flexWrap: "wrap" }}>
                        {receiving.map((a, i) => <AssetTag key={i} asset={a} onRemove={() => setReceiving(prev => prev.filter((_, idx) => idx !== i))} />)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="input-group">
                  <label className="label">Additional Context</label>
                  <textarea className="textarea" rows={2} value={otherContext}
                    onChange={e => setOtherContext(e.target.value)}
                    placeholder="e.g. They need a PG badly, championship window closing..." />
                </div>

                <button className="btn btn-accent w-full" onClick={evaluate}
                  disabled={loading || (!giving.length && !receiving.length)}>
                  {loading ? <><span className="spinner" /> Evaluating...</> : <><Zap size={14} /> Evaluate Trade</>}
                </button>
              </div>
            </div>
          </div>

          {/* RESULT */}
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
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                    }}>
                      {VERDICT_STYLES[result.parsed.verdict]?.label}
                    </div>
                  )}
                </div>

                {/* Overall score */}
                <div style={{ padding: "16px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "var(--font-mono)", color: getGrade(result.parsed.overall).color }}>
                      {getGrade(result.parsed.overall).grade}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Overall</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                    {result.parsed.summary}
                  </div>
                </div>

                {/* Dimensions */}
                <DimensionRow label="Dynasty Value Delta" score={result.parsed.dynastyValue.score} reasoning={result.parsed.dynastyValue.reasoning} />
                <DimensionRow label="Immediate Impact" score={result.parsed.immediateImpact.score} reasoning={result.parsed.immediateImpact.reasoning} />
                <DimensionRow label="Age Curve Fit" score={result.parsed.ageCurve.score} reasoning={result.parsed.ageCurve.reasoning} />
                <DimensionRow label="Lock-In Ceiling Impact" score={result.parsed.lockInCeiling.score} reasoning={result.parsed.lockInCeiling.reasoning} />
                <DimensionRow label="Roster Construction" score={result.parsed.rosterConstruction.score} reasoning={result.parsed.rosterConstruction.reasoning} />

                {/* Counter suggestion */}
                {result.parsed.counter && result.parsed.verdict !== "ACCEPT" && (
                  <div style={{ padding: "12px 14px", background: "var(--accent-light)", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Counter Suggestion</div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{result.parsed.counter}</div>
                  </div>
                )}
              </div>
            ) : result ? (
              <div className="card">
                <div className="card-body">
                  <div className="ai-box">{result.analysis}</div>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                  <Zap size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                  <div className="font-semibold" style={{ fontSize: 14 }}>No analysis yet</div>
                  <div className="text-sm mt-1">Build a trade and hit Evaluate</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUGGEST TAB */}
      {activeTab === "suggest" && (
        <div className="page-grid-2">
          <div className="card">
            <div className="card-header"><span className="card-title">Trade Suggestion Engine</span></div>
            <div className="card-body flex-col gap-3">
              <div className="input-group">
                <label className="label">Target</label>
                <select className="select" value={suggestTeamId ?? ""} onChange={e => setSuggestTeamId(e.target.value === "" ? null : parseInt(e.target.value))}>
                  <option value="">Select...</option>
                  <option value={-1}>🌐 Best Trade Across All Teams</option>
                  {otherTeams.map(t => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName || t.username} — {getTeamContext(t.rosterId).status}
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
                <div className="card-body">
                  <div className="ai-box">{suggestions}</div>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                  <TrendingUp size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                  <div className="font-semibold" style={{ fontSize: 14 }}>No suggestions yet</div>
                  <div className="text-sm mt-1">Select a target and hit Suggest Trades</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAMS TAB */}
      {activeTab === "teams" && (
        <div className="card">
          <div className="card-header"><span className="card-title">Team Classification</span></div>
          <div>
            {otherTeams.map(team => {
              const ctx = getTeamContext(team.rosterId);
              return (
                <div key={team.rosterId} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{team.teamName || team.username}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>@{team.username}</div>
                    </div>
                    <select className="select" style={{ width: 180, fontSize: 12 }}
                      value={ctx.status || "unknown"}
                      onChange={e => updateTeamContext(team.rosterId, "status", e.target.value)}>
                      {TEAM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <input className="input" placeholder="Notes (e.g. 'selling off vets, wants picks')"
                    value={ctx.notes || ""} style={{ fontSize: 12 }}
                    onChange={e => updateTeamContext(team.rosterId, "notes", e.target.value)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div>
          {history.length === 0 ? (
            <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No trades evaluated yet</div></div>
          ) : (
            <div className="flex-col gap-3">
              {history.map(h => (
                <div key={h.id} className="card" style={{ cursor: "pointer" }} onClick={() => { setResult(h); setActiveTab("evaluate"); }}>
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>vs {h.teamName || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(h.date).toLocaleDateString()}</div>
                    </div>
                    {h.parsed?.verdict && (
                      <div style={{
                        marginLeft: "auto",
                        background: VERDICT_STYLES[h.parsed.verdict]?.bg,
                        color: VERDICT_STYLES[h.parsed.verdict]?.color,
                        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      }}>
                        {VERDICT_STYLES[h.parsed.verdict]?.label}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "10px 14px" }}>
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
