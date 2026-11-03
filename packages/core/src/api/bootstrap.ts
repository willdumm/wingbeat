/**
 * GET /api/bootstrap: what the dashboard loads first, in one request (the signed-in user,
 * and the trackers, aircraft, pilots and tile overlays). Response objects allow unknown
 * keys, so an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import { Aircraft } from './aircraft';
import { Pilot } from './pilots';
import { Tracker } from './trackers';

const nullableStr = z.nullable(z.string());

/** The signed-in user (GET /api/me has the same shape). */
export const Me = z.looseObject({
  id: z.number(),
  name: z.string(),
  role: z.enum(['admin', 'viewer']),
  device_name: nullableStr,
  session_id: z.number(),
});

/** A tile overlay. default_enabled is SQLite's 0/1; attribution is sanitized HTML. */
export const TileOverlay = z.looseObject({
  id: z.number(),
  label: z.string(),
  url: z.string(),
  attribution: nullableStr,
  max_zoom: z.nullable(z.number()),
  default_enabled: z.number(),
  default_enabled_by_basemap: z.nullable(z.record(z.string(), z.boolean())),
});

/** GET /api/bootstrap */
export const BootstrapResponse = z.looseObject({
  me: Me,
  trackers: z.array(Tracker),
  aircraft: z.array(Aircraft),
  pilots: z.array(Pilot),
  overlays: z.array(TileOverlay),
});

export type Me = z.infer<typeof Me>;
export type TileOverlay = z.infer<typeof TileOverlay>;
export type BootstrapResponse = z.infer<typeof BootstrapResponse>;

/** The dashboard's first load. */
export function getBootstrap(client: ApiClient): Promise<BootstrapResponse> {
  return client.get('/api/bootstrap', BootstrapResponse);
}
