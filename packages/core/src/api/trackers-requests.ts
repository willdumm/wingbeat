/**
 * The trackers route group's request schemas (api/trackers.ts has the responses and the
 * client calls), which the Worker validates its writes with (src/index.ts). In their own
 * module so the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

const optStr = z.optional(z.string());
/** A feed's access code, as { password } (inReach). */
const credentials = z.nullish(z.record(z.string(), z.string()));

/** POST /api/trackers. The handler checks that name, type and a public https source_url are there. */
export const TrackerCreateRequest = z.object({
  name: optStr,
  type: optStr,
  source_url: optStr,
  credentials,
  assigned_aircraft: z.nullish(z.string()),
  assigned_pilot: z.nullish(z.int()),
});

/** PUT /api/trackers/:id: only the fields it sends change (null clears an assignment or the access code). */
export const TrackerUpdateRequest = z.object({
  name: optStr,
  source_url: optStr,
  active: z.optional(z.boolean()),
  credentials,
  assigned_aircraft: z.nullish(z.string()),
  assigned_pilot: z.nullish(z.int()),
});

/** POST /api/trackers/test-feed: only an access code typed into the form is used. */
export const TestFeedRequest = z.object({
  source_url: optStr,
  credentials,
});

/** POST /api/trackers/:id/apply-assignment: which of the tracker's assignments to carry over. */
export const ApplyAssignmentRequest = z.object({
  aircraft: z.optional(z.boolean()),
  pilot: z.optional(z.boolean()),
});

export type TrackerCreateRequest = z.input<typeof TrackerCreateRequest>;
export type TrackerUpdateRequest = z.input<typeof TrackerUpdateRequest>;
export type TestFeedRequest = z.input<typeof TestFeedRequest>;
export type ApplyAssignmentRequest = z.input<typeof ApplyAssignmentRequest>;
