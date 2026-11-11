/**
 * State kept in expo-sqlite/kv-store as JSON (the keys and parse functions are in prefs.ts).
 * It's read synchronously, so a screen starts with the stored value rather than flashing the
 * default; a write goes out in the background.
 */
import { useCallback, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

export function readStored<T>(key: string, parse: (stored: unknown) => T): T {
  try {
    const s = Storage.getItemSync(key);
    return parse(s == null ? undefined : JSON.parse(s));
  } catch {
    return parse(undefined);
  }
}

/**
 * useState backed by the store under key, re-read when key changes (an account switch).
 * With a null key (no account) it's kept in memory only.
 */
export function useStoredState<T>(key: string | null, parse: (stored: unknown) => T): [T, (next: T | ((prev: T) => T)) => void] {
  const read = (k: string | null) => (k ? readStored(k, parse) : parse(undefined));
  const [state, setState] = useState(() => ({ key, value: read(key) }));
  const current = state.key === key ? state : { key, value: read(key) };
  if (current !== state) setState(current);

  const latest = useRef(current);
  latest.current = current;
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(latest.current.value) : next;
    latest.current = { key, value };
    setState(latest.current);
    if (key) Storage.setItemAsync(key, JSON.stringify(value)).catch(() => {});
  }, [key]);

  return [current.value, set];
}
