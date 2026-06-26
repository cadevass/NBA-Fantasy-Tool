import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Generic upsert — stores any data blob by key
export async function dbSet(table, id, data) {
  const { error } = await supabase
    .from(table)
    .upsert({ id, data, updated_at: new Date().toISOString() });
  if (error) console.error(`dbSet error (${table}):`, error);
}

// Generic get by key
export async function dbGet(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select("data")
    .eq("id", id)
    .single();
  if (error) return null;
  return data?.data ?? null;
}

// Generic get all rows from a table
export async function dbGetAll(table) {
  const { data, error } = await supabase
    .from(table)
    .select("id, data")
    .order("updated_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

// Delete a row
export async function dbDelete(table, id) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id);
  if (error) console.error(`dbDelete error (${table}):`, error);
}
