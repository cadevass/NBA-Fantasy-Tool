export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await request.json();

      // NBA Stats proxy request
      if (body.type === "nba_stats") {
        const nbaUrl = `https://stats.nba.com/stats/leaguedashplayerstats?Season=${body.season || "2024-25"}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&LastNGames=0&Month=0&OpponentTeamID=0&PaceAdjust=N&PlusMinus=N&Rank=N&LeagueID=00`;
        
        const nbaRes = await fetch(nbaUrl, {
          headers: {
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://www.nba.com",
            "Referer": "https://www.nba.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "x-nba-stats-origin": "stats",
            "x-nba-stats-token": "true",
          },
        });

        const data = await nbaRes.json();
        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Claude API request
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
        },
        body: JSON.stringify({
          model: body.model || "claude-sonnet-4-6",
          max_tokens: body.max_tokens || 2048,
          system: body.system,
          messages: body.messages,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
            }
          ],
        }),
      });

      const data = await response.json();
      const textContent = data.content
        ?.filter(block => block.type === "text")
        ?.map(block => block.text)
        ?.join("\n") || "";

      return new Response(JSON.stringify({ ...data, _extractedText: textContent }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        status: response.status,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
