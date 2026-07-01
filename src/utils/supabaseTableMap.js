// Maps localStorage keys to actual Supabase table names
export const TABLE_MAP = {
  'bb_prospects': 'prospects',
  'trade_history_v2': 'trade_history',
  'team_context': 'team_context',
  'app_settings': 'app_settings',
};

export function getSupabaseTable(localKey) {
  return TABLE_MAP[localKey] || localKey;
}
