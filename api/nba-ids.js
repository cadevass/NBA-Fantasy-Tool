export default async function handler(req, res) {
  try {
    const upstream = await fetch(
      "https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=2025-26&IsOnlyCurrentSeason=1",
      {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Host": "stats.nba.com",
          "Origin": "https://www.nba.com",
          "Referer": "https://www.nba.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "x-nba-stats-origin": "stats",
          "x-nba-stats-token": "true",
        }
      }
    );
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    const data = await upstream.json();
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    const idIdx = headers.indexOf("PERSON_ID");
    const nameIdx = headers.indexOf("DISPLAY_FIRST_LAST");
    const map = {};
    for (const row of rows) {
      if (row[idIdx] && row[nameIdx]) map[row[nameIdx]] = row[idIdx];
    }
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(map);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
