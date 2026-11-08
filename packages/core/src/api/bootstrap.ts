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

/** GET /api/bootstrap */
export const BootstrapResponse = z.looseObject({
  me: Me,
  trackers: z.array(Tracker),
  aircraft: z.array(Aircraft),
  pilots: z.array(Pilot),
  overlays: z.array(TileOverlay),
});

export type Me = z.infer<typeof Me>;
export type BootstrapResponse = z.infer<typeof BootstrapResponse>;

/** The dashboard's first load. */
export function getBootstrap(client: ApiClient): Promise<BootstrapResponse> {
  return client.get('/api/bootstrap', BootstrapResponse);
}
