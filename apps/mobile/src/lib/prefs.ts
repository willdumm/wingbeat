/**
 * What the app keeps between launches besides the accounts and the flights: the theme, which
 * tracker events this phone gets as Time Sensitive notifications, and
 * for each account the map's basemap and overlays, the Live tab's pinned status card, the Flights tab's filter, whether the Duty tab shows, the Duty
 * log's pilot and the last copy of each pilot's duty records it fetched. Each is a
 * JSON value in expo-sqlite/kv-store (stored-state.ts) under a key from here, and its parse
 * function turns whatever is stored (nothing, or an older version's value) into a valid one.
 */
import { DutyLogResponse } from '@wingbeat/core/api/duty';
import { DEFAULT_TIME_SENSITIVE, TRACKER_PUSH_EVENTS, type TrackerPushEvent } from '@wingbeat/core/api/push';
import { normalizeFilterState, type FilterState } from '@wingbeat/core/filters';
import { DATE_PRESETS, type DatePresetId } from './flights';

export const THEME_KEY = 'prefs.theme';

const ACCOUNT_PREFIX = 'prefs.account.';

export function accountPrefKey(host: string, userId: number, name: 'map' | 'live-pinned' | 'flight-filter' | 'elevation' | 'duty-tab' | 'duty-pilot' | `duty-log.${number}`): string {
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

// ── Notifications ──

/** This phone's, for every account: sent with each account's push registration (push.ts). */
export const TIME_SENSITIVE_KEY = 'prefs.time-sensitive';

export function parseTimeSensitive(stored: unknown): TrackerPushEvent[] {
  if (!Array.isArray(stored)) return DEFAULT_TIME_SENSITIVE;
  return TRACKER_PUSH_EVENTS.filter((e) => stored.includes(e));
}

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

/** The Live tab's pinned status card's tracker, or null. */
export function parseLivePinned(stored: unknown): number | null {
  return typeof stored === 'number' && Number.isInteger(stored) ? stored : null;
}

// ── Elevation tool ──

/** The elevation tint's range either side of the reference and its opacity (the web's sliders and defaults). */
export interface ElevationPref {
  rangeM: number;
  opacity: number;
}

export const ELEVATION_RANGES_M = [50, 100, 200, 300, 500, 1000, 2000];
export const ELEVATION_OPACITIES = [25, 40, 55, 70, 85];

export function parseElevationPref(stored: unknown): ElevationPref {
  const o = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof ElevationPref, unknown>>;
  const within = (v: unknown, min: number, max: number, fallback: number) =>
    (typeof v === 'number' && v >= min && v <= max ? v : fallback);
  return { rangeM: within(o.rangeM, 50, 2000, 300), opacity: within(o.opacity, 0, 100, 55) };
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

// ── Duty ──

/** Whether the Duty tab shows, as picked in Settings; null until one is picked (dutyTabShown's default). */
export const parseDutyTab = (stored: unknown): boolean | null => (typeof stored === 'boolean' ? stored : null);

/** The Duty tab shows by default to those who keep a duty log: an admin, or a pilot. Settings opens the log either way. */
export const dutyTabShown = (stored: boolean | null, user: { role: string; pilot_id?: number | null }): boolean =>
  stored ?? (user.role === 'admin' || user.pilot_id != null);


/** The pilot the Duty tab shows; null until one is picked. */
export const parseDutyPilot = (stored: unknown): number | null => (typeof stored === 'number' ? stored : null);

/** The last copy of a pilot's duty records (GET /api/duty-days), shown until the next fetch; null when there's none or it no longer parses. */
export function parseDutyLog(stored: unknown): DutyLogResponse | null {
  const parsed = DutyLogResponse.safeParse(stored);
  return parsed.success ? parsed.data : null;
}
