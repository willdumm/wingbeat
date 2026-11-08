/**
 * The aircraft route group: the read, GET /api/aircraft (each aircraft with its meter
 * readings and maintenance schedule), and the writes (Settings adds an aircraft, the
 * aircraft info panel saves the rest). The request schemas are in aircraft-requests.ts.
 * Response objects allow unknown keys, so an instance may add fields without breaking older
 * clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { AircraftCreateRequest, AircraftUpdateRequest } from './aircraft-requests';

export type { AircraftCreateRequest, AircraftUpdateRequest } from './aircraft-requests';

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

/** Adds an aircraft (its tail number is stored upper-case). */
export function createAircraft(client: ApiClient, body: AircraftCreateRequest): Promise<OkResponse> {
  return client.write('POST', '/api/aircraft', body, OkResponse);
}

/** Changes an aircraft's fields (those in body). */
export function updateAircraft(client: ApiClient, tail: string, body: AircraftUpdateRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/aircraft/' + encodeURIComponent(tail), body, OkResponse);
}
