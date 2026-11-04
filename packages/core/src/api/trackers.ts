/**
 * The trackers route group: the read, GET /api/trackers (every tracker, deleted ones too),
 * and Settings' writes (add, edit, pause, delete, the feed test, the history import and its
 * place labeling, and carrying a new assignment over to the tracker's flights). The request
 * schemas are in trackers-requests.ts. Response objects allow unknown keys, so an instance
 * may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { ApplyAssignmentRequest, TestFeedRequest, TrackerCreateRequest, TrackerUpdateRequest } from './trackers-requests';

export type { ApplyAssignmentRequest, TestFeedRequest, TrackerCreateRequest, TrackerUpdateRequest } from './trackers-requests';

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

// ── Writes (the request schemas are in trackers-requests.ts) ──

/** POST /api/trackers: the new tracker's id and MapShare page (inReach only). */
export const TrackerCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number(), mapshare_url: nullableStr });

/**
 * PUT /api/trackers/:id. credentials_cleared: the feed moved to another site, so its stored
 * access code was dropped.
 */
export const TrackerUpdateResponse = z.looseObject({
  ok: z.literal(true),
  mapshare_url: nullableStr,
  credentials_cleared: z.optional(z.literal(true)),
});

/**
 * POST /api/trackers/test-feed: the feed's positions in the last 30 days and the newest's
 * time (null with none), or, when fetching it failed, ok false and why (still a 200).
 */
export const TestFeedResponse = z.union([
  z.looseObject({ ok: z.literal(true), points: z.number(), latest: z.nullable(z.number()) }),
  z.looseObject({ ok: z.literal(false), error: z.string() }),
]);

/** POST /api/trackers/:id/import: the positions stored from that window. */
export const TrackerImportResponse = z.looseObject({ ok: z.literal(true), inserted: z.number() });

/** POST /api/trackers/:id/geocode: the tracker's flights still without a place label. */
export const TrackerGeocodeResponse = z.looseObject({ ok: z.literal(true), remaining: z.number() });

/** GET /api/trackers/:id/unassigned: the tracker's flights without an aircraft, and without a pilot. */
export const TrackerUnassignedResponse = z.looseObject({ without_aircraft: z.number(), without_pilot: z.number() });

/** POST /api/trackers/:id/apply-assignment: the flights given an aircraft or pilot. */
export const ApplyAssignmentResponse = z.looseObject({ ok: z.literal(true), flights: z.number() });

export type TrackerCreateResponse = z.infer<typeof TrackerCreateResponse>;
export type TrackerUpdateResponse = z.infer<typeof TrackerUpdateResponse>;
export type TestFeedResponse = z.infer<typeof TestFeedResponse>;
export type TrackerImportResponse = z.infer<typeof TrackerImportResponse>;
export type TrackerGeocodeResponse = z.infer<typeof TrackerGeocodeResponse>;
export type TrackerUnassignedResponse = z.infer<typeof TrackerUnassignedResponse>;
export type ApplyAssignmentResponse = z.infer<typeof ApplyAssignmentResponse>;

/** Adds a tracker (polling starts right away). */
export function createTracker(client: ApiClient, body: TrackerCreateRequest): Promise<TrackerCreateResponse> {
  return client.write('POST', '/api/trackers', body, TrackerCreateResponse);
}

/** Changes a tracker's fields (those in body). */
export function updateTracker(client: ApiClient, id: number, body: TrackerUpdateRequest): Promise<TrackerUpdateResponse> {
  return client.write('PUT', '/api/trackers/' + id, body, TrackerUpdateResponse);
}

/** Hides a tracker (its data is kept). */
export function deleteTracker(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/trackers/' + id, undefined, OkResponse);
}

/** Fetches a feed without storing anything. */
export function testTrackerFeed(client: ApiClient, body: TestFeedRequest): Promise<TestFeedResponse> {
  return client.write('POST', '/api/trackers/test-feed', body, TestFeedResponse);
}

/** Imports a tracker's history from d1 to d2 (YYYY-MM-DD; no d2: to now). */
export function importTrackerHistory(client: ApiClient, id: number, d1: string, d2: string | null): Promise<TrackerImportResponse> {
  return client.write('POST', '/api/trackers/' + id + '/import?d1=' + d1 + (d2 ? '&d2=' + d2 : ''), undefined, TrackerImportResponse);
}

/** Labels a dozen of the tracker's flight origins and destinations. */
export function geocodeTracker(client: ApiClient, id: number): Promise<TrackerGeocodeResponse> {
  return client.write('POST', '/api/trackers/' + id + '/geocode', undefined, TrackerGeocodeResponse);
}

/** How many of the tracker's flights have no aircraft, and no pilot. */
export function getTrackerUnassigned(client: ApiClient, id: number): Promise<TrackerUnassignedResponse> {
  return client.get('/api/trackers/' + id + '/unassigned', TrackerUnassignedResponse);
}

/** Gives the tracker's flights without an aircraft or pilot the tracker's own. */
export function applyTrackerAssignment(client: ApiClient, id: number, body: ApplyAssignmentRequest): Promise<ApplyAssignmentResponse> {
  return client.write('POST', '/api/trackers/' + id + '/apply-assignment', body, ApplyAssignmentResponse);
}
