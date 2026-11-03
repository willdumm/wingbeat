/**
 * The flights route group's response schemas: GET /api/flights/complete (one tracker's
 * flights changed since a cursor, with their points) and GET /api/flight-corrections
 * (corrections changed since an edit_history id). Response objects allow unknown keys, so
 * an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';

const num = z.number();
const nullableNum = z.nullable(z.number());
const nullableStr = z.nullable(z.string());

/** A track point: time, position, speed (km/h), elevation (m) and course (degrees). */
export const FlightPoint = z.looseObject({
  t: num, lat: num, lon: num, v: nullableNum, e: nullableNum, c: nullableNum,
});

/** A tracker's flight as the server segments it. */
export const TrackedFlight = z.looseObject({
  id: num,
  tracker_id: num,
  start_time: num,
  end_time: nullableNum,
  modified_at: num,
  aircraft_tail: nullableStr,
  pilot_id: nullableNum,
  pilot_name: nullableStr,
  origin_label: nullableStr,
  destination_label: nullableStr,
  start_lat: nullableNum,
  start_lon: nullableNum,
  end_lat: nullableNum,
  end_lon: nullableNum,
  points: z.array(FlightPoint),
});

/** GET /api/flights/complete?tracker=&since= */
export const FlightsCompleteResponse = z.looseObject({
  last_polled: nullableNum,
  live_label: nullableStr,
  geocode_pending: z.boolean(),
  last_point_time: z.optional(nullableNum),
  ground_trail: z.optional(z.array(FlightPoint)),
  flights: z.array(TrackedFlight),
  last_modified_at: z.optional(nullableNum),
  /** Set (with no flights) when the tenant has no active tracker. */
  warning: z.optional(z.string()),
});

/** A flight_corrections row (see FlightCorrection in flight-edits.ts). */
export const FlightCorrectionRow = z.looseObject({
  id: num,
  tracker_id: nullableNum,
  flight_start_time: nullableNum,
  start_time: nullableNum,
  end_time: nullableNum,
  origin_label: nullableStr,
  destination_label: nullableStr,
  remark: nullableStr,
  start_lat: nullableNum,
  start_lon: nullableNum,
  end_lat: nullableNum,
  end_lon: nullableNum,
  part91: num,
  unpaid: num,
  excluded: num,
  pilot_id: nullableNum,
  aircraft_tail: nullableStr,
  updated_at: num,
});

/**
 * GET /api/flight-corrections?since=: the rows changed after the cursor and the keys
 * deleted ('<tracker_id>/<flight_start_time>' or 'manual/<id>'), or with full, every row.
 */
export const FlightCorrectionsResponse = z.looseObject({
  entries: z.array(FlightCorrectionRow),
  deleted: z.array(z.string()),
  last_history_id: num,
  full: z.optional(z.boolean()),
});

export type FlightPoint = z.infer<typeof FlightPoint>;
export type TrackedFlight = z.infer<typeof TrackedFlight>;
export type FlightsCompleteResponse = z.infer<typeof FlightsCompleteResponse>;
export type FlightCorrectionRow = z.infer<typeof FlightCorrectionRow>;
export type FlightCorrectionsResponse = z.infer<typeof FlightCorrectionsResponse>;
