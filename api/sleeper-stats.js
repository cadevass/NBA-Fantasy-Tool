// Vercel proxy for Sleeper NBA season stats.
// Sleeper labels seasons by start year: 2025 = the 2025-26 season.
// Returns exact counting stats AND real bonus counts (dd, td, 40p, 15ast, 20reb)
// so we never estimate bonus frequency again.
export default async function handler(req, res) {
  const season = req.query.season || "2025";
  try {
    const upstream = await fetch(
      `https://api.sleeper.app/v1/stats/nba/regular/${encodeURIComponent(season)}`
    );
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    const raw = await upstream.json();
    const out = {};
    for (const [id, s] of Object.entries(raw)) {
      if (!s || typeof s !== "object" || !s.gp) continue;
      out[id] = {
        gp: s.gp, gs: s.gs || 0, sp: s.sp || 0,
        pts: s.pts || 0, reb: s.reb || 0, ast: s.ast || 0,
        stl: s.stl || 0, blk: s.blk || 0, to: s.to || 0,
        tpm: s.tpm || 0, fga: s.fga || 0, fta: s.fta || 0,
        dd: s.dd || 0, td: s.td || 0, tf: s.tf || 0, ff: s.ff || 0,
        b40: s.bonus_pt_40p || 0, b50: s.bonus_pt_50p || 0,
        b15a: s.bonus_ast_15p || 0, b20r: s.bonus_reb_20p || 0,
      };
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
