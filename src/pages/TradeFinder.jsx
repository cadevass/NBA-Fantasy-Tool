import { useState, useEffect } from "react";
import { Plus, X, Zap, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSupabaseArray } from "../hooks/useSupabaseStorage";
import { callClaude } from "../utils/api";
import { DYNASTY_CONTEXT } from "../utils/league";
import { useSleeperContext } from "../context/SleeperContext";
import { MY_PICKS, getPickValue, getAgeCurveMultiplier, getWindowAlignment } from "../utils/pickValues";
import { getTeamContexts, setTeamContext, getTeamContext, TEAM_STATUSES } from "../utils/teamContext";
import { getNegotiationLog, saveNegotiationLog, INTERACTION_TYPES, getInteractionColor, getInteractionBg, getAiProfiles, saveAiProfiles } from "../utils/negotiationLog";
import { dbSet, dbGet } from "../utils/supabase";
import { fetchPlayerSeasonStats, findPlayer } from "../utils/nbaStats";
import MarketValueModal from "../components/MarketValueModal";
import { buildDraftContext } from "../utils/sleeperDraft";
import { buildFullContext } from "../utils/fullContext";
import { getRankings } from "../utils/rankings";

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
                <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}{s {p.name}</div>{p.name}</div> ` (Age ${s.age})`}</div>
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
  const { myTeam, teams, startupDraft } = useSleeperContext();
  const { value: history, addItem: addTradeHistory, updateItem: updateTradeHistory, setValueAndSync } = useSupabaseArray("trade_history_v2");
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
  const [targetPlayer, setTargetPlayer] = useState(null);
  const [suggestContext, setSuggestContext] = useState("");
  const [marketValues, setMarketValues] = useState([]);
  useEffect(() => { getRankings().then(setMarketValues); }, []);
  const [showMarketValues, setShowMarketValues] = useState(false);
  const [negLog, setNegLog] = useState([]);
  const [aiProfiles, setAiProfiles] = useState({});
  const [generatingProfile, setGeneratingProfile] = useState(null);
  const [selectedTeamProfile, setSelectedTeamProfile] = useState(null);
  useEffect(() => { getAiProfiles().then(setAiProfiles); }, []);
  const [newInteraction, setNewInteraction] = useState({ type: "offer_sent", iGive: "", iReceive: "", notes: "", date: new Date().toISOString().split("T")[0] });
  useEffect(() => { getNegotiationLog().then(setNegLog); }, []);
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

  async function generateProfile(rosterId) {
    const team = otherTeams.find(t => t.rosterId === rosterId);
    const ctx = getTeamContext(rosterId);
    const teamNeg = negLog.filter(n => n.rosterId === rosterId);
    if (!teamNeg.length) return;
    setGeneratingProfile(rosterId);
    try {
      const negLines = teamNeg.map(n => {
        const typeLabel = INTERACTION_TYPES.find(t => t.value === n.type)?.label || n.type;
        const parts = [`[${n.date}] ${typeLabel}`];
        if (n.iGive) parts.push(`I offered: ${n.iGive}`);
        if (n.iReceive) parts.push(`For: ${n.iReceive}`);
        if (n.notes) parts.push(n.notes);
        return parts.join(" | ");
      }).join("\n");

      const prompt = `Generate a concise dynasty fantasy basketball negotiation profile for this manager based on their interaction history.

MANAGER: ${team?.teamName || team?.username}
STATUS: ${ctx.status || "unknown"}
SCOUTING NOTES: ${ctx.notes || "none"}

INTERACTION HISTORY:
${negLines}

Write a 3-5 sentence behavioural profile covering:
1. How they negotiate (fast/slow, direct/coy, firm/flexible)
2. What they value (proven players vs picks vs youth)
3. How to approach them (lead with what, avoid what)
4. Overall assessment of how easy/hard they are to deal with

Be specific to the interactions above. No generic advice. Dynasty fantasy context only. Plain text only — no markdown, no asterisks, no headers, no bullet points.`;

      const profile = await callClaude([{ role: "user", content: prompt }]);
      const updated = { ...aiProfiles, [rosterId]: profile };
      setAiProfiles(updated);
      await saveAiProfiles(updated);
    } catch (e) {
      console.error("Profile generation failed:", e);
    } finally {
      setGeneratingProfile(null);
    }
  }

  async function addInteraction(rosterId) {
    if (!newInteraction.notes && !newInteraction.iGive && !newInteraction.iReceive) return;
    const entry = { ...newInteraction, id: Date.now(), rosterId };
    const updated = [entry, ...negLog];
    setNegLog(updated);
    await saveNegotiationLog(updated);
    setNewInteraction({ type: "offer_sent", iGive: "", iReceive: "", notes: "", date: new Date().toISOString().split("T")[0] });
  }

  async function deleteInteraction(id) {
    const updated = negLog.filter(x => x.id !== id);
    setNegLog(updated);
    await saveNegotiationLog(updated);
  }

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

      // Build market value context
      const fullCtx = buildFullContext({
        myTeam,
        nbaPlayers,
        marketValues,
        negLog,
        tradeBlock: JSON.parse(localStorage.getItem("trade_block") || "[]"),
        teamContexts: getTeamContexts(),
        startupDraft,
        teams,
        targetRosterId: selectedTeam?.rosterId || null,
        pageContext: { additionalContext: otherContext },
        aiProfiles,
        dynastyMode: localStorage.getItem('dynasty_mode') || 'contending',
      });

      const prompt = `Evaluate this dynasty fantasy basketball trade. Search the web for any current player news or injuries.

I GIVE:
${giveStr}

I RECEIVE:
${recStr}

OTHER TEAM: ${teamCtx}

${fullCtx}

CRITICAL INSTRUCTION: Start your response with DYNASTY_VALUE_DELTA on the very first line. No headers, no markdown, no preamble.
IMPORTANT: Fantasy dynasty only. Positional slots and scoring output only.
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
      await addTradeHistory(tradeResult);
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
    if (suggestTeamId === null || !targetPlayer) return;
    setSuggestLoading(true); setSuggestions(null);
    try {
      const targetTeam = suggestTeamId === -1 ? null : otherTeams.find(t => t.rosterId === suggestTeamId);
      const draftCtx = buildDraftContext(startupDraft, teams || []);

      // Build my roster with stats
      const myRosterStr = myRosterPlayers.map(p => {
        const s = getStats(p.name);
        return s ? `${p.name} (${p.pos?.join("/")}, Age ${s.age}, ${s.pts}pts/${s.reb}reb/${s.ast}ast/${s.stl}stl/${s.blk}blk)` : p.name;
      }).join("\n");

      const myPicks = Object.values(MY_PICKS).map(p => `${p.label} (dynasty value: ${p.givingValue})`).join(", ");

      // Build all team rosters with stats
      const allTeamRosters = (targetTeam ? [targetTeam] : otherTeams).map(t => {
        const ctx = getTeamContext(t.rosterId);
        const roster = [...t.starters, ...t.bench, ...(t.taxi||[])].map(p => {
          const s = getStats(p.name);
          return s ? `${p.name} (Age ${s.age}, ${s.pts}pts/${s.reb}reb/${s.ast}ast)` : p.name;
        }).join(", ");
        return `${t.teamName||t.username} | Status: ${ctx.status||"unknown"} | Notes: ${ctx.notes||"none"} | Roster: ${roster}`;
      }).join("\n\n");
      const targetTeamCtx = getTeamContext(targetTeam?.rosterId);
      const targetStats = getStats(targetPlayer.name);
      const targetPlayerStr = targetStats
        ? `${targetPlayer.name} (Age ${targetStats.age}, ${targetStats.pts}pts/${targetStats.reb}reb/${targetStats.ast}ast/${targetStats.stl}stl/${targetStats.blk}blk)`
        : targetPlayer.name;

      // Find target player's startup pick
      const targetStartupPick = startupDraft?.find(p => p.playerName === targetPlayer.name);
      const startupPickStr = targetStartupPick
        ? `Drafted at Pick ${targetStartupPick.pickNo} (Round ${targetStartupPick.round}) in the startup — this indicates their attachment level`
        : "Startup pick position unknown";
      const offerFullCtx = buildFullContext({
        myTeam,
        nbaPlayers,
        marketValues,
        negLog,
        tradeBlock: JSON.parse(localStorage.getItem("trade_block") || "[]"),
        teamContexts: getTeamContexts(),
        startupDraft,
        teams,
        targetRosterId: targetTeam?.rosterId || null,
        pageContext: { additionalContext: suggestContext },
        aiProfiles,
        dynastyMode: localStorage.getItem('dynasty_mode') || 'contending',
      });

      const prompt = `You are a dynasty fantasy basketball trade analyst for a Sleeper points league (Lock-In mode).

TARGET PLAYER: ${targetPlayerStr}
OWNER: ${targetTeam?.teamName || targetTeam?.username}
STARTUP DRAFT: ${startupPickStr}

${offerFullCtx}

CRITICAL CONTEXT — READ THIS FIRST:
${suggestContext || "none"}

If context mentions a previously declined offer — TRADE_1 must be ABOVE that offer. Never offer less than what was already rejected.

STEP 1 — Search the web for ${targetPlayer.name}'s current dynasty value and 2026-27 outlook.
STEP 2 — Determine their TRUE market value from research. Cross-reference with the market values in the context above.
STEP 3 — Build 3 escalating packages using the declined offer as your floor (if mentioned).

RULES:
1. ONLY use players from MY ROSTER or THEIR ROSTER. Never invent players.
2. FANTASY ONLY — value = pts/reb/ast/stl×2/blk×2/3PM×0.5/DD+1/TD+2.
3. Match cost to TRUE value — if elite, packages should include better players.
4. Use negotiation history above to calibrate — past declines tell you what isn't enough.

IMPORTANT: Start your response with TRADE_1: on the very first line. No preamble. No headers.

Generate exactly 3 packages in escalating order:
- TRADE_1: Opening Anchor — lowest realistic offer to start negotiations. Still meaningful but leaves room to negotiate up.
- TRADE_2: Fair Value — what the trade actually costs based on market values. Both sides should feel this is roughly fair.
- TRADE_3: Walk-Away Max — the most you would pay. Only go here if they're stubborn. If they reject this, walk away.

TRADE_1:
I_GIVE: [opening anchor package]
I_RECEIVE: ${targetPlayer.name}
FROM_TEAM: ${targetTeam?.teamName || targetTeam?.username}
WHY_THEY_ACCEPT: [1-2 sentences — what genuine need does this fill for them]
WHY_I_WIN: [1-2 sentences — how does this improve your roster]
CONFIDENCE: [High/Medium/Low]

TRADE_2:
[same format — fair value]

TRADE_3:
[same format — walk-away max]`;

      const text = await callClaude([{ role: "user", content: prompt }]);
      setSuggestions(text);
    } catch (e) {
      setSuggestions(`Error: ${e.message}`);
    } finally {
      setSuggestLoading(false);
    }
  }

  function parseSuggestions(text) {
    if (!text) return [];
    const trades = [];
    const blocks = text.split(/TRADE_\d+:/i).filter(b => b.trim() && /I_GIVE:/i.test(b));
    blocks.forEach((block, i) => {
      const clean = s => s?.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      const give = clean(block.match(/I_GIVE:\s*([^\n]+)/i)?.[1]) || "";
      const receive = clean(block.match(/I_RECEIVE:\s*([^\n]+)/i)?.[1]) || "";
      const fromTeam = clean(block.match(/FROM_TEAM:\s*([^\n]+)/i)?.[1]) || "";
      const whyAccept = clean(block.match(/WHY_THEY_ACCEPT:\s*([\s\S]+?)(?=WHY_I_WIN:|CONFIDENCE:|TRADE_\d+:|$)/i)?.[1]) || "";
      const whyWin = clean(block.match(/WHY_I_WIN:\s*([\s\S]+?)(?=CONFIDENCE:|TRADE_\d+:|$)/i)?.[1]) || "";
      const confidence = block.match(/CONFIDENCE:\s*(High|Medium|Low)/i)?.[1] || "Medium";
      if (give || receive) trades.push({ id: i+1, give, receive, fromTeam, whyAccept, whyWin, confidence });
    });
    return trades;
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
        <div className="flex gap-2 items-center">
          <button className={`tab-btn${activeTab === "evaluate" ? " active" : ""}`} onClick={() => setActiveTab("evaluate")}>Evaluate</button>
          <button className={`tab-btn${activeTab === "suggest" ? " active" : ""}`} onClick={() => setActiveTab("suggest")}>Offer Builder</button>
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

      {/* OFFER BUILDER */}
      {activeTab === "suggest" && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
          {/* LEFT PANEL */}
          <div className="flex-col gap-4">
            {/* Step 1: Pick team */}
            <div className="card">
              <div className="card-header"><span className="card-title">1. Pick a Team</span></div>
              <div className="card-body">
                <select className="select" value={suggestTeamId ?? ""}
                  onChange={e => { setSuggestTeamId(e.target.value === "" ? null : parseInt(e.target.value)); setTargetPlayer(null); setSuggestions(null); }}
                  style={{ fontSize: 14, height: 44 }}>
                  <option value="">Select a team...</option>
                  {otherTeams.map(t => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName || t.username} — {getTeamContext(t.rosterId).status || "unclassified"}
                    </option>
                  ))}
                </select>
                {suggestTeamId && getTeamContext(otherTeams.find(t => t.rosterId === suggestTeamId)?.rosterId)?.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {getTeamContext(otherTeams.find(t => t.rosterId === suggestTeamId)?.rosterId)?.notes}
                  </div>
                )}
                {suggestTeamId && aiProfiles[suggestTeamId] && (
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                    color: "var(--green)", fontWeight: 600 }}>
                    <span>📋</span> AI profile active — negotiation intel loaded
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Pick target player */}
            {suggestTeamId && (() => {
              const team = otherTeams.find(t => t.rosterId === suggestTeamId);
              const roster = team ? [...team.starters, ...team.bench, ...(team.taxi||[])] : [];
              return (
                <div className="card">
                  <div className="card-header"><span className="card-title">2. Who Do You Want?</span></div>
                  <div className="card-body flex-col gap-2">
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Click a player to target them</div>
                    {roster.map(p => {
                      const s = getStats(p.name);
                      const mv = marketValues.find(m => m.name.toLowerCase() === p.name.toLowerCase());
                      const isSelected = targetPlayer?.name === p.name;
                      return (
                        <div key={p.name}
                          onClick={() => { setTargetPlayer(p); setSuggestions(null); }}
                          style={{
                            padding: "10px 12px", borderRadius: "var(--radius)",
                            border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                            background: isSelected ? "var(--accent-light)" : "var(--surface)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: 13 }}>{p.name}{s ? ` (Age ${s.age})` : ""}</div>
                            {mv ? (
                              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700,
                                color: mv.value >= 80 ? "var(--green)" : mv.value >= 60 ? "var(--accent-dim)" : "var(--text-muted)" }}>
                                {mv.value}/100
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>no value</span>
                            )}
                          </div>
                          {s && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                              {s.pts}pts · {s.reb}reb · {s.ast}ast · {s.stl}stl · {s.blk}blk · Age {s.age}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Step 3: Context + Build */}
            {targetPlayer && (() => {
              const mv = marketValues.find(m => m.name.toLowerCase() === targetPlayer.name.toLowerCase());
              const notInDB = !mv;
              return (
                <div className="flex-col gap-3">
                  {notInDB ? (
                    <div style={{ padding: 16, borderRadius: "var(--radius-lg)", background: "var(--red-bg)",
                      border: "1px solid var(--red)", fontSize: 13 }}>
                      <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>⚠ No Market Value Found</div>
                      <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {targetPlayer.name} is not in your Market Value Database. Add them first so the Offer Builder has grounded values to work with — otherwise it will hallucinate.
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, color: "var(--red)" }}
                        onClick={() => setShowMarketValues(true)}>
                        Open Market Values →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--surface-2)",
                        border: "1px solid var(--border)", fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{targetPlayer.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{mv.value}/100</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{mv.summary}</div>
                        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${mv.value}%`, height: "100%", borderRadius: 3,
                            background: mv.value >= 80 ? "var(--green)" : mv.value >= 60 ? "var(--accent)" : "var(--red)" }} />
                        </div>
                      </div>
                      <div className="input-group">
                        <label className="label">Additional Context</label>
                        <textarea className="textarea" rows={2}
                          placeholder="Your intel on this player and manager..."
                          value={suggestContext} onChange={e => setSuggestContext(e.target.value)} />
                      </div>
                      <button className="btn btn-accent w-full" style={{ height: 44, fontSize: 15 }}
                        onClick={getSuggestions} disabled={suggestLoading}>
                        {suggestLoading
                          ? <><span className="spinner" /> Building packages...</>
                          : <><Zap size={15} /> Build Offer Packages</>
                        }
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* RIGHT PANEL */}
          <div>
            {suggestLoading && (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                  <div className="spinner" style={{ margin: "0 auto 16px", width: 32, height: 32 }} />
                  <div className="font-semibold" style={{ fontSize: 14 }}>Building packages for {targetPlayer?.name}...</div>
                  <div className="text-sm mt-2">Matching values, checking trade block, analysing team needs</div>
                </div>
              </div>
            )}
            {!suggestLoading && suggestions ? (
              <div className="flex-col gap-3">
                {(() => {
                  const mv = marketValues.find(m => m.name.toLowerCase() === targetPlayer?.name?.toLowerCase());
                  const myValues = marketValues.filter(m => m.category === "My Roster");
                  return parseSuggestions(suggestions).map(trade => {
                    // Calculate value gap
                    const giveNames = trade.give.split(/[,+]/).map(s => s.trim());
                    const normalise = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
                    // Only use player values for gap % (picks shown separately)
                    const matchedPlayers = giveNames.reduce((acc, name) => {
                      const normName = normalise(name);
                      const m = myValues.find(v => {
                        const normV = normalise(v.name);
                        return normName.includes(normV) || normV.includes(normName);
                      });
                      if (m) acc.push(m.value);
                      return acc;
                    }, []);
                    const pickCount = giveNames.filter(n => /(\d{4})\s+(1st|2nd|3rd)/i.test(n)).length;
                    const giveTotal = matchedPlayers.reduce((s, v) => s + v, 0);
                    const targetVal = mv?.value || 0;

                    const isStarConsolidation = matchedPlayers.length >= 2 && giveTotal >= targetVal * 0.7;
                    return (
                      <div key={trade.id} className="card">
                        <div className="card-header">
                          <div>
                            <span className="card-title">
                              {trade.id === 1 ? "🔵 Opening Anchor" : trade.id === 2 ? "🟡 Fair Value" : "🔴 Walk-Away Max"}
                            </span>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              Targeting {targetPlayer?.name}
                            </div>
                          </div>
                          <span style={{
                            marginLeft: "auto", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: trade.confidence === "High" ? "var(--green-bg)" : trade.confidence === "Low" ? "var(--red-bg)" : "var(--accent-light)",
                            color: trade.confidence === "High" ? "var(--green)" : trade.confidence === "Low" ? "var(--red)" : "var(--accent-dim)",
                          }}>{trade.confidence} Confidence</span>
                        </div>

                        {/* Value Gap Meter */}
                        {targetVal > 0 && giveTotal > 0 && (
                          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Value comparison (players only)</span>
                              {pickCount > 0 && <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>+ {pickCount} pick{pickCount > 1 ? "s" : ""} not shown</span>}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                              <div style={{ textAlign: "center", padding: "8px", background: "var(--red-bg)", borderRadius: "var(--radius)" }}>
                                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: "var(--red)" }}>{giveTotal}</div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>YOU GIVE</div>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                {giveTotal > targetVal ? (
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)" }}>▲ {giveTotal - targetVal} over</div>
                                ) : giveTotal < targetVal ? (
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-dim)" }}>▼ {targetVal - giveTotal} under</div>
                                ) : (
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)" }}>= Even</div>
                                )}
                              </div>
                              <div style={{ textAlign: "center", padding: "8px", background: "var(--green-bg)", borderRadius: "var(--radius)" }}>
                                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: "var(--green)" }}>{targetVal}</div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>YOU GET</div>
                              </div>
                            </div>
                            {isStarConsolidation && (
                              <div style={{ marginTop: 8, fontSize: 11, color: "var(--green)", fontWeight: 600 }}>
                                ⭐ Star consolidation — trading quantity for quality, which typically favours you long-term
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderBottom: "1px solid var(--border)" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>I Give</div>
                            <div style={{ fontSize: 13 }}>{trade.give}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>I Receive</div>
                            <div style={{ fontSize: 13 }}>{trade.receive}</div>
                          </div>
                        </div>
                        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {trade.whyAccept && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Why They Accept</div>
                              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{trade.whyAccept}</div>
                            </div>
                          )}
                          {trade.whyWin && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Why I Win</div>
                              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{trade.whyWin}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : !suggestLoading && (
              <div className="card">
                <div className="card-body" style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
                  <Zap size={40} style={{ margin: "0 auto 16px", opacity: 0.15 }} />
                  <div className="font-semibold" style={{ fontSize: 15 }}>Offer Builder</div>
                  <div className="text-sm mt-2">Pick a team, select your target, get 3 grounded offer packages</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAMS */}
      {/* TEAMS */}
      {activeTab === "teams" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
          {/* Team List */}
          <div className="card">
            <div className="card-header"><span className="card-title">Leaguemates</span></div>
            <div>
              {otherTeams.map(team => {
                const ctx = getTeamContext(team.rosterId);
                const teamNeg = negLog.filter(n => n.rosterId === team.rosterId);
                const isSelected = selectedTeamProfile === team.rosterId;
                return (
                  <div key={team.rosterId}
                    onClick={() => setSelectedTeamProfile(isSelected ? null : team.rosterId)}
                    style={{
                      padding: "12px 16px", borderBottom: "1px solid var(--border)",
                      cursor: "pointer", background: isSelected ? "var(--accent-light)" : "",
                      borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{team.teamName || team.username}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>@{team.username}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {teamNeg.length > 0 && (
                          <span style={{ fontSize: 10, background: "var(--accent-light)", color: "var(--accent-dim)",
                            padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>{teamNeg.length}</span>
                        )}
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                          background: ctx.status === "contender" ? "var(--green-bg)" : ctx.status === "rebuilding" ? "var(--red-bg)" : "var(--surface-2)",
                          color: ctx.status === "contender" ? "var(--green)" : ctx.status === "rebuilding" ? "var(--red)" : "var(--text-muted)",
                        }}>{ctx.status || "?"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Profile */}
          {selectedTeamProfile ? (() => {
            const team = otherTeams.find(t => t.rosterId === selectedTeamProfile);
            const ctx = getTeamContext(selectedTeamProfile);
            const teamNeg = negLog.filter(n => n.rosterId === selectedTeamProfile).sort((a,b) => b.id - a.id);
            if (!team) return null;
            return (
              <div className="flex-col gap-4">
                {/* Profile Header */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <span className="card-title">{team.teamName || team.username}</span>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>@{team.username}</div>
                    </div>
                    <select className="select" style={{ width: 180, fontSize: 13, marginLeft: "auto" }}
                      value={ctx.status || "unknown"}
                      onChange={e => updateTeamCtx(selectedTeamProfile, "status", e.target.value)}>
                      {TEAM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="card-body">
                    <div className="input-group">
                      <label className="label">Scouting Notes</label>
                      <textarea className="textarea" rows={2}
                        placeholder="Tendencies, preferences, what they want, what they won't do..."
                        value={ctx.notes || ""}
                        onChange={e => updateTeamCtx(selectedTeamProfile, "notes", e.target.value)} />
                    </div>
                    {teamNeg.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>AI Behavioural Profile</span>
                          <button className="btn btn-ghost btn-xs" onClick={() => generateProfile(selectedTeamProfile)}
                            disabled={generatingProfile === selectedTeamProfile}>
                            {generatingProfile === selectedTeamProfile ? <><span className="spinner" /> Generating...</> : aiProfiles[selectedTeamProfile] ? "↻ Refresh" : "✦ Generate"}
                          </button>
                        </div>
                        {aiProfiles[selectedTeamProfile] ? (
                          <div style={{ padding: 10, background: "var(--surface-2)", borderRadius: "var(--radius)", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                            {aiProfiles[selectedTeamProfile].replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,3} /g, '').replace(/---/g, '').trim()}
                          </div>
                        ) : (
                          <div style={{ padding: 10, background: "var(--surface-2)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                            Click Generate to create an AI profile from your negotiation history
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Log Interaction */}
                <div className="card">
                  <div className="card-header"><span className="card-title">Log Interaction</span></div>
                  <div className="card-body flex-col gap-3">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div className="input-group">
                        <label className="label">Type</label>
                        <select className="select" value={newInteraction.type}
                          onChange={e => setNewInteraction(p => ({ ...p, type: e.target.value }))} style={{ fontSize: 13 }}>
                          {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="label">Date</label>
                        <input className="input" type="date" value={newInteraction.date}
                          onChange={e => setNewInteraction(p => ({ ...p, date: e.target.value }))} style={{ fontSize: 13 }} />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div className="input-group">
                        <label className="label">I Offered</label>
                        <input className="input" placeholder="e.g. Wagner + 1.08" value={newInteraction.iGive}
                          onChange={e => setNewInteraction(p => ({ ...p, iGive: e.target.value }))} style={{ fontSize: 13 }} />
                      </div>
                      <div className="input-group">
                        <label className="label">They Offered / I Asked For</label>
                        <input className="input" placeholder="e.g. Brandon Miller" value={newInteraction.iReceive}
                          onChange={e => setNewInteraction(p => ({ ...p, iReceive: e.target.value }))} style={{ fontSize: 13 }} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label className="label">Notes</label>
                      <textarea className="textarea" rows={2}
                        placeholder="What happened, their reaction, what they said..."
                        value={newInteraction.notes}
                        onChange={e => setNewInteraction(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <button className="btn btn-accent w-full" onClick={() => addInteraction(selectedTeamProfile)}>
                      + Log Interaction
                    </button>
                  </div>
                </div>

                {/* Interaction History */}
                {teamNeg.length > 0 && (
                  <div className="card">
                    <div className="card-header"><span className="card-title">Negotiation History</span></div>
                    <div>
                      {teamNeg.map(n => (
                        <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)",
                          borderLeft: `3px solid ${getInteractionColor(n.type)}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                              background: getInteractionBg(n.type), color: getInteractionColor(n.type),
                              textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {INTERACTION_TYPES.find(t => t.value === n.type)?.label || n.type}
                            </span>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{n.date}</span>
                              <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}
                                onClick={() => deleteInteraction(n.id)}>✕</button>
                            </div>
                          </div>
                          {(n.iGive || n.iReceive) && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "6px 0", fontSize: 12 }}>
                              {n.iGive && <div><span style={{ color: "var(--red)", fontWeight: 600 }}>I offered: </span>{n.iGive}</div>}
                              {n.iReceive && <div><span style={{ color: "var(--green)", fontWeight: 600 }}>For: </span>{n.iReceive}</div>}
                            </div>
                          )}
                          {n.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{n.notes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="card">
              <div className="card-body" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                <div className="font-semibold" style={{ fontSize: 14 }}>Select a leaguemate to view their profile</div>
                <div className="text-sm mt-2">Track negotiations, tendencies, and build intel over the season</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORY */}
      {activeTab === "history" && (
        <div className="flex-col gap-3">
          {history.length === 0 ? (
            <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No trades evaluated yet</div></div>
          ) : (
            <>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}
                  onClick={() => { if (confirm("Clear all trade history?")) setValueAndSync([]); }}>
                  Clear All
                </button>
              </div>
              {history.map(h => (
                <div key={h.id} className="card">
                  <div className="card-header">
                    <div style={{ cursor: "pointer" }} onClick={() => { setResult(h); setActiveTab("evaluate"); }}>
                      <div style={{ fontWeight: 600 }}>vs {h.teamName || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(h.date).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2 items-center" style={{ marginLeft: "auto" }}>
                      {h.parsed?.verdict && (
                        <div style={{
                          background: VERDICT_STYLES[h.parsed.verdict]?.bg,
                          color: VERDICT_STYLES[h.parsed.verdict]?.color,
                          padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        }}>{VERDICT_STYLES[h.parsed.verdict]?.label}</div>
                      )}
                      <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}
                        onClick={() => setValueAndSync(history.filter(x => x.id !== h.id))}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div className="text-sm"><span style={{ color: "var(--red)", fontWeight: 600 }}>Out: </span>{h.giving.map(a => a.label).join(", ") || "—"}</div>
                    <div className="text-sm mt-1"><span style={{ color: "var(--green)", fontWeight: 600 }}>In: </span>{h.receiving.map(a => a.label).join(", ") || "—"}</div>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <div className="flex gap-2 items-center mb-2">
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Outcome</span>
                      <div className="flex gap-1">
                        {["Sent", "Accepted", "Rejected", "Countered", "Not Sent"].map(outcome => (
                          <button key={outcome}
                            className="btn btn-xs"
                            style={{
                              background: h.outcome === outcome ? "var(--accent)" : "var(--surface-2)",
                              color: h.outcome === outcome ? "white" : "var(--text-muted)",
                              border: "1px solid var(--border)",
                              fontWeight: h.outcome === outcome ? 700 : 400,
                            }}
                            onClick={() => updateTradeHistory(h.id, { ...h, outcome })}>
                            {outcome}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input className="input" style={{ fontSize: 12 }}
                      placeholder="Notes — what happened, any context..."
                      value={h.notes || ""}
                      onChange={e => updateTradeHistory(h.id, { ...h, notes: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    {showMarketValues && <MarketValueModal onClose={() => setShowMarketValues(false)} />}
    </div>
  );
}
