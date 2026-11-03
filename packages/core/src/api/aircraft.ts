/**
 * The aircraft route group's read: GET /api/aircraft (each aircraft with its meter
 * readings and maintenance schedule). Response objects allow unknown keys, so an instance
 * may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';

const nullableNum = z.nullable(z.number());
const optionalNum = z.nullish(z.number());

/** A maintenance schedule item (MaintenanceItem in maintenance.ts): meter items have hours, calendar items months. */
export const MaintenanceItem = z.looseObject({
  id: z.string(),
  name: z.string(),
  schedule_type: z.enum(['hobbs', 'tach', 'calendar']),
  interval_hours: optionalNum,
  last_done_value: optionalNum,
  interval_months: optionalNum,
  last_done_at: optionalNum,
});

/** An aircraft. active is SQLite's 0/1; a meter's time and recorded_at are null until recorded. */
export const Aircraft = z.looseObject({
  tail_number: z.string(),
  name: z.nullable(z.string()),
  active: z.number(),
  hobbs_time: nullableNum,
  hobbs_recorded_at: nullableNum,
  hobbs_correction: z.number(),
  tach_time: nullableNum,
  tach_recorded_at: nullableNum,
  tach_correction: z.number(),
  maintenance_schedule: z.nullable(z.array(MaintenanceItem)),
});

/** GET /api/aircraft */
export const AircraftResponse = z.looseObject({ aircraft: z.array(Aircraft) });

export type Aircraft = z.infer<typeof Aircraft>;
export type AircraftResponse = z.infer<typeof AircraftResponse>;

/** Every aircraft. */
export function getAircraft(client: ApiClient): Promise<AircraftResponse> {
  return client.get('/api/aircraft', AircraftResponse);
}
