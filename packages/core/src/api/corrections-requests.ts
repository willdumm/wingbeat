/**
 * The corrections route group's request schemas (api/corrections.ts has the responses and
 * the client calls), which the Worker validates its writes with (src/index.ts). In their
 * own module so the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';
import { BaseHistoryId, flag } from './requests';

const int = z.int();
const optInt = z.nullish(int);
const optStr = z.nullish(z.string());

/** A flight the bulk route changes: a tracked flight by its tracker's original start time, or a manual flight by its row. */
export const FlightRef = z.union([
  z.object({ entry_id: int }),
  z.object({ tracker_id: int, flight_start_time: int }),
]);

/** PUT /api/flights/assignment: a key left out leaves that field as it is. */
export const AssignmentRequest = z.object({
  flight_ids: z.nullish(z.array(int)),
  entry_ids: z.nullish(z.array(int)),
  aircraft_tail: optStr,
  pilot_id: optInt,
});

/**
 * POST /api/flight-corrections (a tracked flight's correction, keyed by tracker_id and
 * flight_start_time, or a new manual flight) and PUT /api/flight-corrections/:id (a manual
 * flight): the form's full state.
 */
export const CorrectionRequest = z.object({
  tracker_id: optInt,
  flight_start_time: optInt,
  start_time: optInt,
  end_time: optInt,
  origin_label: optStr,
  destination_label: optStr,
  remark: optStr,
  start_lat: z.nullish(z.number()),
  start_lon: z.nullish(z.number()),
  end_lat: z.nullish(z.number()),
  end_lon: z.nullish(z.number()),
  part91: flag,
  unpaid: flag,
  excluded: flag,
  pilot_id: optInt,
  aircraft_tail: optStr,
  /** A tracked flight's aircraft/pilot change, written with the correction. */
  assign: z.nullish(z.object({ aircraft_tail: optStr, pilot_id: optInt })),
  base_history_id: BaseHistoryId,
});

/** POST /api/flight-corrections/bulk */
export const BulkFlagsRequest = z.object({
  flights: z.array(FlightRef),
  set: z.nullish(z.object({ part91: flag, excluded: flag })),
});

export type FlightRef = z.infer<typeof FlightRef>;
export type AssignmentRequest = z.input<typeof AssignmentRequest>;
export type CorrectionRequest = z.input<typeof CorrectionRequest>;
export type BulkFlagsRequest = z.input<typeof BulkFlagsRequest>;
