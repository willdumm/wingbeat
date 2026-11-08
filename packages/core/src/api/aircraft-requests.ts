/**
 * The aircraft route group's request schemas (api/aircraft.ts has the responses and the
 * client calls), which the Worker validates its writes with (src/index.ts). In their own
 * module so the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

const optNum = z.nullish(z.number());

/** POST /api/aircraft. The handler checks that tail_number is there. */
export const AircraftCreateRequest = z.object({
  tail_number: z.optional(z.string()),
  name: z.nullish(z.string()),
});

/**
 * PUT /api/aircraft/:tail: only the fields it sends change. A meter reading without its
 * recorded_at is recorded now; a correction factor can't be cleared. The maintenance
 * schedule is stored as it's sent (MaintenanceItem in api/aircraft.ts).
 */
export const AircraftUpdateRequest = z.object({
  name: z.nullish(z.string()),
  active: z.optional(z.boolean()),
  hobbs_time: optNum,
  hobbs_recorded_at: optNum,
  hobbs_correction: z.optional(z.number()),
  tach_time: optNum,
  tach_recorded_at: optNum,
  tach_correction: z.optional(z.number()),
  maintenance_schedule: z.nullish(z.array(z.looseObject({}))),
});

export type AircraftCreateRequest = z.input<typeof AircraftCreateRequest>;
export type AircraftUpdateRequest = z.input<typeof AircraftUpdateRequest>;
