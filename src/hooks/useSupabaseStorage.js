import { useState, useEffect, useRef } from "react";
import { dbSet, dbGet, dbGetAll, dbDelete } from "../utils/supabase";

export function useSupabaseStorage(table, key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(`${table}_${key}`);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  const [synced, setSynced] = useState(false);
  const saveTimeout = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const remote = await dbGet(table, key);
        if (remote !== null) {
          setValue(remote);
          localStorage.setItem(`${table}_${key}`, JSON.stringify(remote));
        }
      } catch (e) {
        console.warn("Supabase unavailable:", e.message);
      }
      setSynced(true);
    }
    load();
  }, [table, key]);

  const setValueAndSync = (newValue) => {
    const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
    setValue(valueToStore);
    localStorage.setItem(`${table}_${key}`, JSON.stringify(valueToStore));
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      dbSet(table, key, valueToStore).catch(() => {});
    }, 1000);
  };

  return [value, setValueAndSync, synced];
}

export function useSupabaseArray(table, initialValue = []) {
  // Load from localStorage immediately — no blank screen
  const [value, setValue] = useState(() => {
    try {
      const local = localStorage.getItem(table);
      return local ? JSON.parse(local) : initialValue;
    } catch { return initialValue; }
  });
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
          // Supabase is empty — push localStorage data up
          const local = localStorage.getItem(table);
          if (local) {
            const items = JSON.parse(local);
            for (const item of items) {
              await dbSet(table, item.id?.toString(), item).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.warn("Supabase unavailable, using localStorage:", e.message);
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
    dbSet(table, item.id?.toString(), item).catch(() => {});
  };

  const updateItem = async (id, updatedItem) => {
    const newItems = value.map(i => i.id === id ? updatedItem : i);
    setValue(newItems);
    localStorage.setItem(table, JSON.stringify(newItems));
    dbSet(table, id?.toString(), updatedItem).catch(() => {});
  };

  const deleteItem = async (id) => {
    const newItems = value.filter(i => i.id !== id);
    setValue(newItems);
    localStorage.setItem(table, JSON.stringify(newItems));
    dbDelete(table, id?.toString()).catch(() => {});
  };

  const replaceAll = async (items) => {
    setValue(items);
    localStorage.setItem(table, JSON.stringify(items));
    for (const item of items) {
      dbSet(table, item.id?.toString(), item).catch(() => {});
    }
  };

  return { value, synced, addItem, updateItem, deleteItem, replaceAll, setValueAndSync };
}
