import { useState, useEffect, useRef } from "react";
import { dbSet, dbGet, dbGetAll, dbDelete } from "../utils/supabase";

// Drop-in replacement for useLocalStorage that also syncs to Supabase
export function useSupabaseStorage(table, key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(`${table}_${key}`);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  const [synced, setSynced] = useState(false);
  const saveTimeout = useRef(null);

  // Load from Supabase on mount
  useEffect(() => {
  useEffect(() => {
    async function load() {
      try {
        const remote = await dbGet(table, key);
        if (remote !== null) {
          setValue(remote);
          localStorage.setItem(`${table}_${key}`, JSON.stringify(remote));
        }
      } catch (e) {
        console.warn("Supabase unavailable, using localStorage:", e.message);
      }
      setSynced(true);
    }
    load();
  }, [table, key]);
  }, [table, key]);

  // Save to both localStorage and Supabase (debounced)
  const setValueAndSync = (newValue) => {
    const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
    setValue(valueToStore);
    localStorage.setItem(`${table}_${key}`, JSON.stringify(valueToStore));

    // Debounce Supabase writes to avoid hammering on rapid updates
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      dbSet(table, key, valueToStore);
    }, 1000);
  };

  return [value, setValueAndSync, synced];
}

// For array-based tables (prospects, trade history) where each item is a row
export function useSupabaseArray(table, initialValue = []) {
  const [value, setValue] = useState(initialValue);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const rows = await dbGetAll(table);
        if (rows.length > 0) {
          const items = rows.map(r => r.data);
          setValue(items);
          localStorage.setItem(table, JSON.stringify(items));
        } else {
          const local = localStorage.getItem(table);
          if (local) {
            const items = JSON.parse(local);
            setValue(items);
            for (const item of items) {
              await dbSet(table, item.id?.toString() || Date.now().toString(), item);
            }
          }
        }
      } catch (e) {
        console.warn("Supabase unavailable, falling back to localStorage:", e.message);
        try {
          const local = localStorage.getItem(table);
          if (local) setValue(JSON.parse(local));
        } catch {}
      }
      setSynced(true);
    }
    load();
  }, [table]);
  const setValueAndSync = async (newValue) => {
    const items = newValue instanceof Function ? newValue(value) : newValue;
    setValue(items);
    localStorage.setItem(table, JSON.stringify(items));
  };

  const addItem = async (item) => {
    const newItems = [...value, item];
    setValue(newItems);
    localStorage.setItem(table, JSON.stringify(newItems));
    await dbSet(table, item.id?.toString(), item);
  };

  const updateItem = async (id, updatedItem) => {
    const newItems = value.map(i => i.id === id ? updatedItem : i);
    setValue(newItems);
    localStorage.setItem(table, JSON.stringify(newItems));
    await dbSet(table, id?.toString(), updatedItem);
  };

  const deleteItem = async (id) => {
    const newItems = value.filter(i => i.id !== id);
    setValue(newItems);
    localStorage.setItem(table, JSON.stringify(newItems));
    await dbDelete(table, id?.toString());
  };

  const replaceAll = async (items) => {
    setValue(items);
    localStorage.setItem(table, JSON.stringify(items));
    for (const item of items) {
      await dbSet(table, item.id?.toString(), item);
    }
  };

  return { value, synced, addItem, updateItem, deleteItem, replaceAll, setValueAndSync };
}
