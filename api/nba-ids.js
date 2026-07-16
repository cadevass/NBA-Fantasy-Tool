// Vercel proxy for NBA player ID lookup
// Returns name → numeric ID map for headshot CDN
// data.nba.net is public, no auth required
export default async function handler(req, res) {
  try {
    const upstream = await fetch(
      "https://data.nba.net/data/10s/prod/v1/2025/players.json"
    );
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Upstream failed" });
    const data = await upstream.json();
    const map = {};
    for (const p of data.league?.standard || []) {
      if (p.personId && p.firstName && p.lastName) {
        map[`${p.firstName} ${p.lastName}`] = p.personId;
      }
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(map);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
