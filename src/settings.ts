import { Tenant } from './types';

export interface AppSettings {
  app_name: string;
  timezone: string;
  map_default_lat: number;
  map_default_lng: number;
  map_default_zoom: number;
  gap_alert_minutes: number;
  pushover_api_token: string;
}

const DEFAULTS: AppSettings = {
  app_name:           'Wingbeat',
  timezone:           'UTC',
  map_default_lat:    30,
  map_default_lng:    0,
  map_default_zoom:   2,
  gap_alert_minutes:  5,
  pushover_api_token: '',
};

// The TTL bounds cross-isolate staleness: invalidateSettingsCache only reaches the
// isolate that served the PATCH, but gap_alert_minutes / pushover_api_token now feed the
// cron-driven notification pipeline, which may run in a different isolate. One settings
// read per isolate per minute is noise next to the cron's own per-tick queries.
const CACHE_TTL_MS = 60_000;

const _cache = new Map<string, { at: number; values: Record<string, string> }>();

export function invalidateSettingsCache(tenantKey: string): void {
  _cache.delete(tenantKey);
}

export async function loadSettings(tenant: Tenant): Promise<AppSettings> {
  const hit = _cache.get(tenant.key);
  let c = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.values : undefined;
  if (!c) {
    try {
      const { results } = await tenant.db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
      c = Object.fromEntries(results.map(r => [r.key, r.value]));
      _cache.set(tenant.key, { at: Date.now(), values: c });
    } catch {
      // Don't cache the failure: a transient D1 error must not pin default
      // branding for the rest of the isolate's life. Serve the stale entry if
      // one exists — old settings beat defaults.
      c = hit?.values ?? {};
    }
  }
  return {
    app_name:         c.app_name         ?? DEFAULTS.app_name,
    timezone:         c.timezone         ?? DEFAULTS.timezone,
    map_default_lat:  parseFloat(c.map_default_lat  ?? String(DEFAULTS.map_default_lat)),
    map_default_lng:  parseFloat(c.map_default_lng  ?? String(DEFAULTS.map_default_lng)),
    map_default_zoom: parseFloat(c.map_default_zoom ?? String(DEFAULTS.map_default_zoom)),
    gap_alert_minutes: parseFloat(c.gap_alert_minutes ?? String(DEFAULTS.gap_alert_minutes)),
    pushover_api_token: c.pushover_api_token ?? DEFAULTS.pushover_api_token,
  };
}

export function settingsAsClientObject(s: AppSettings): string {
  return JSON.stringify({
    appName:        s.app_name,
    timezone:       s.timezone,
    mapDefaultLat:  s.map_default_lat,
    mapDefaultLng:  s.map_default_lng,
    mapDefaultZoom: s.map_default_zoom,
  });
}
