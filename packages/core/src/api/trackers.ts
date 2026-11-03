/**
 * The trackers route group's read: GET /api/trackers (every tracker, deleted ones too).
 * Response objects allow unknown keys, so an instance may add fields without breaking
 * older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';

const nullableStr = z.nullable(z.string());

/** A tracker. active and deleted are SQLite's 0/1. */
export const Tracker = z.looseObject({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  /** Admins only: the feed URL can embed a share id/key. */
  source_url: z.optional(z.string()),
  /** The MapShare page derived from the feed URL (inReach trackers only). */
  mapshare_url: nullableStr,
  active: z.number(),
  deleted: z.number(),
  assigned_aircraft: nullableStr,
  assigned_pilot: z.nullable(z.number()),
});

/** GET /api/trackers */
export const TrackersResponse = z.looseObject({ trackers: z.array(Tracker) });

export type Tracker = z.infer<typeof Tracker>;
export type TrackersResponse = z.infer<typeof TrackersResponse>;

/** Every tracker. */
export function getTrackers(client: ApiClient): Promise<TrackersResponse> {
  return client.get('/api/trackers', TrackersResponse);
}
