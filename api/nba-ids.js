// Returns player name → ESPN/NBA CDN numeric ID from game_logs
// Empty offseason (no games), populates automatically from October onward
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from("game_logs")
      .select("player_name, player_id")
      .order("game_date", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const map = {};
    for (const row of data || []) {
      if (!map[row.player_name]) map[row.player_name] = row.player_id;
    }
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(map);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
