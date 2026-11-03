/**
 * The pilots route group's read: GET /api/pilots (each pilot with their dated default
 * duties). Response objects allow unknown keys, so an instance may add fields without
 * breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import { DefaultDutyEntry } from './duty';

/** A pilot. active is SQLite's 0/1; default_duties oldest first. */
export const Pilot = z.looseObject({
  id: z.number(),
  name: z.string(),
  active: z.number(),
  default_duties: z.array(DefaultDutyEntry),
});

/** GET /api/pilots */
export const PilotsResponse = z.looseObject({ pilots: z.array(Pilot) });

export type Pilot = z.infer<typeof Pilot>;
export type PilotsResponse = z.infer<typeof PilotsResponse>;

/** Every pilot. */
export function getPilots(client: ApiClient): Promise<PilotsResponse> {
  return client.get('/api/pilots', PilotsResponse);
}
