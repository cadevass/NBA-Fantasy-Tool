import json, uuid

existing = [
    {"name": "Payton Pritchard", "value": 77, "trend": "Rising", "category": "My Roster", "position": "PG", "nbaTeam": "BOS", "summary": "Averaged 17pts/4.8ast/3.1 3PM, now central to Celtics offense with Brown gone"},
    {"name": "Dejounte Murray", "value": 59, "trend": "Falling", "category": "My Roster", "position": "SG", "nbaTeam": "NOP", "summary": "Post-Achilles 21 fantasy pts in 14 games, age 29, sell at reasonable value now"},
    {"name": "De Aaron Fox", "value": 50, "trend": "Falling", "category": "My Roster", "position": "PG", "nbaTeam": "SAS", "summary": "Finals collapse public, Harper outplayed him, ankle injury never healed"},
    {"name": "Michael Porter Jr.", "value": 77, "trend": "Stable", "category": "My Roster", "position": "SF", "nbaTeam": "BKN", "summary": "Career highs 24.2pts/7.1reb/3.4 3PM in 52 games, peak value window"},
    {"name": "Jalen Johnson", "value": 95, "trend": "Rising", "category": "My Roster", "position": "PF", "nbaTeam": "ATL", "summary": "22.5pts/10.3reb/7.9ast, All-NBA Third Team, franchise cornerstone"},
    {"name": "Peyton Watson", "value": 77, "trend": "Rising", "category": "My Roster", "position": "SF", "nbaTeam": "DEN", "summary": "Breakout season 14.6pts/2.1stl+blk, 23yo, defensive stocks worth 4 FP at 2x"},
    {"name": "Kel el Ware", "value": 85, "trend": "Rising", "category": "My Roster", "position": "C", "nbaTeam": "MIL", "summary": "Traded to Milwaukee in Giannis deal, now likely MIL starter, 22yo"},
    {"name": "Cade Cunningham", "value": 92, "trend": "Stable", "category": "My Roster", "position": "PG", "nbaTeam": "DET", "summary": "23.9pts/9.9ast/5.5reb, led Detroit to 60 wins, franchise cornerstone at 24"},
    {"name": "Donovan Clingan", "value": 78, "trend": "Rising", "category": "My Roster", "position": "C", "nbaTeam": "POR", "summary": "Elite rim protector at 22, only move for top-3 startup pick equivalent"},
    {"name": "Franz Wagner", "value": 78, "trend": "Stable", "category": "My Roster", "position": "SF", "nbaTeam": "ORL", "summary": "20.6pts/5.2reb when healthy but only 34 games, secure Orlando co-star role"},
    {"name": "Bennedict Mathurin", "value": 65, "trend": "Rising", "category": "My Roster", "position": "SG", "nbaTeam": "LAC", "summary": "Kawhi traded to Toronto, now featured scorer on rebuilding Clippers"},
    {"name": "Scoot Henderson", "value": 48, "trend": "Falling", "category": "My Roster", "position": "PG", "nbaTeam": "POR", "summary": "Portland backcourt is Morant/Lillard/Holiday, role essentially dead"},
    {"name": "Alex Sarr", "value": 88, "trend": "Rising", "category": "My Roster", "position": "C", "nbaTeam": "WAS", "summary": "16.3pts/7.4reb/2.0blk in 48 games, 21yo, elite shot-blocker"},
    {"name": "Collin Murray-Boyles", "value": 61, "trend": "Rising", "category": "My Roster", "position": "PF", "nbaTeam": "TOR", "summary": "21yo dynasty project, playoff standout 22pts/8reb Game 3"},
    {"name": "Kasparas Jakucionis", "value": 50, "trend": "Stable", "category": "My Roster", "position": "PG", "nbaTeam": "MIL", "summary": "20yo long-term stash on rebuilding Bucks"},
    {"name": "Brandon Miller", "value": 82, "trend": "Rising", "category": "League Player", "position": "SF", "nbaTeam": "CHA", "summary": "LaMelo traded making Miller Charlotte unquestioned #1, elite Lock-In ceiling"},
]

migrated = [{"id": str(uuid.uuid4()), "name": p["name"], "value": p["value"], "trend": p["trend"], "category": p["category"], "position": p["position"], "nbaTeam": p["nbaTeam"], "summary": p["summary"], "newsLog": [], "updatedAt": "2026-07-07"} for p in existing]

j = json.dumps(migrated).replace("'", "''")
sql = f"INSERT INTO app_settings (key, value, updated_at) VALUES ('consensus_rankings', '{j}'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();"

with open('/workspaces/NBA-Fantasy-Tool/rankings_insert.sql', 'w') as f:
    f.write(sql)

print("Done! Copy rankings_insert.sql content into Supabase")
