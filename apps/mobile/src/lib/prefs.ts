/**
 * What the app keeps between launches besides the accounts and the flights: the theme, and
 * for each account the map's basemap and overlays and the Flights tab's filter. Each is a
 * JSON value in expo-sqlite/kv-store (stored-state.ts) under a key from here, and its parse
 * function turns whatever is stored (nothing, or an older version's value) into a valid one.
 */
import { normalizeFilterState, type FilterState } from '@wingbeat/core/filters';
import { DATE_PRESETS, type DatePresetId } from './flights';

export const THEME_KEY = 'prefs.theme';

const ACCOUNT_PREFIX = 'prefs.account.';

export function accountPrefKey(host: string, userId: number, name: 'map' | 'flight-filter'): string {
  return `${ACCOUNT_PREFIX}${host}.${userId}.${name}`;
}

/** The stored keys of accounts that are no longer in the list. */
export function staleAccountPrefKeys(keys: string[], accounts: { host: string; user: { id: number } }[]): string[] {
  const live = accounts.map((a) => `${ACCOUNT_PREFIX}${a.host}.${a.user.id}.`);
  return keys.filter((k) => k.startsWith(ACCOUNT_PREFIX) && !live.some((p) => k.startsWith(p)));
}

// ── Theme ──

export type ThemeChoice = 'light' | 'dark' | 'system';

/** The web's Settings → Appearance choices, in its order. */
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const parseTheme = (stored: unknown): ThemeChoice => (stored === 'light' || stored === 'dark' ? stored : 'system');

// ── Map ──

/** The basemap and overlays picked over the map; null is the default (the basemap's overlays). */
export interface MapChoice {
  basemap: string | null;
  overlays: number[] | null;
}

export function parseMapChoice(stored: unknown): MapChoice {
  const o = (stored && typeof stored === 'object' ? stored : {}) as Partial<MapChoice>;
  return {
    basemap: typeof o.basemap === 'string' ? o.basemap : null,
    overlays: Array.isArray(o.overlays) ? o.overlays.filter((id) => typeof id === 'number') : null,
  };
}

// ── Flight filter ──

/** The Flights tab's filter and the date preset that sets its dates. */
export interface FlightFilterPref {
  filter: FilterState;
  preset: DatePresetId;
}

export function parseFlightFilter(stored: unknown): FlightFilterPref {
  const o = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof FlightFilterPref, unknown>>;
  const preset = DATE_PRESETS.find((p) => p.id === o.preset)?.id ?? 'all';
  return { filter: normalizeFilterState(o.filter), preset };
}
