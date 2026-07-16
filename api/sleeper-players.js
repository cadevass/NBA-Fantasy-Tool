// Vercel proxy for Sleeper NBA players — returns only name + sport_id
// Trims the 5MB blob to ~50KB, works on corporate networks
export default async function handler(req, res) {
  try {
    const upstream = await fetch("https://api.sleeper.app/v1/players/nba");
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Upstream failed" });
    const raw = await upstream.json();
    const trimmed = {};
    for (const [id, p] of Object.entries(raw)) {
      if (p.sport_id) trimmed[`${p.first_name} ${p.last_name}`] = p.sport_id;
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(trimmed);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
