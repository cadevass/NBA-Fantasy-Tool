// Vercel serverless proxy for the NBA stats API.
// Work network blocks api.server.nbaapi.com directly; this serves it
// from the app's own domain. Usage: /api/stats?page=1&pageSize=50&season=2026
export default async function handler(req, res) {
  const { season = "2026", page = "1", pageSize = "50" } = req.query;
  try {
    const upstream = await fetch(
      `https://api.server.nbaapi.com/api/playertotals?season=${encodeURIComponent(season)}&pageSize=${encodeURIComponent(pageSize)}&page=${encodeURIComponent(page)}`
    );
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    }
    const data = await upstream.json();
    // Cache at Vercel's edge for 6h — season totals barely move intraday
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
