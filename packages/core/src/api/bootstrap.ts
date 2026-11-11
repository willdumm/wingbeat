/**
 * GET /api/bootstrap: what the dashboard and the app load first, in one request: the
 * signed-in user, the trackers, aircraft, pilots, tile overlays and basemaps, the instance's
 * settings, and the version handshake (api/version.ts). Response objects allow unknown
 * keys, so an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import { Aircraft } from './aircraft';
import { Pilot } from './pilots';
import { Tracker } from './trackers';
import { TileOverlay } from './overlays';

export { TileOverlay } from './overlays';

const nullableStr = z.nullable(z.string());

/** The signed-in user (GET /api/me has the same shape). */
export const Me = z.looseObject({
  id: z.number(),
  name: z.string(),
  role: z.enum(['admin', 'viewer']),
  device_name: nullableStr,
  session_id: z.number(),
});

/**
 * The instance's non-secret settings, the ones every web page gets: its name, the
 * operator's timezone (every date and time is read in it) and the map's default view.
 */
export const InstanceSettings = z.looseObject({
  app_name: z.string(),
  timezone: z.string(),
  map_default_lat: z.number(),
  map_default_lng: z.number(),
  map_default_zoom: z.number(),
});

/**
 * A built-in basemap as the client sees it (clientBasemapPresets() in ../basemaps.ts):
 * `url` is a tile template with `{z}`/`{x}`/`{y}`, and may have `{s}` (a subdomain,
 * TILE_SUBDOMAINS) and `{r}` (`@2x` on a high-density screen, or nothing). A keyed one's
 * `url` is a path on the instance (`/api/tiles/…`) that needs the session. attribution is HTML.
 */
export const Basemap = z.looseObject({
  id: z.string(),
  label: z.string(),
  url: z.string(),
  attribution: z.string(),
  maxZoom: z.number(),
  detectRetina: z.optional(z.boolean()),
});

/** GET /api/bootstrap */
export const BootstrapResponse = z.looseObject({
  me: Me,
  trackers: z.array(Tracker),
  aircraft: z.array(Aircraft),
  pilots: z.array(Pilot),
  overlays: z.array(TileOverlay),
  /** The built-in basemaps, in display order (absent from servers older than the app). */
  basemaps: z.optional(z.array(Basemap)),
  /** Absent from servers older than the handshake, like api_version. */
  instance: z.optional(InstanceSettings),
  /** The server's API level (absent from servers older than the handshake). */
  api_version: z.optional(z.number()),
  /** The oldest client level the server serves (absent like api_version). */
  min_client_level: z.optional(z.number()),
});

export type Me = z.infer<typeof Me>;
export type Basemap = z.infer<typeof Basemap>;
export type InstanceSettings = z.infer<typeof InstanceSettings>;
export type BootstrapResponse = z.infer<typeof BootstrapResponse>;

/** The dashboard's first load. */
export function getBootstrap(client: ApiClient): Promise<BootstrapResponse> {
  return client.get('/api/bootstrap', BootstrapResponse);
}
