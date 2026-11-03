/**
 * The duty route group's response schemas, for the reads: GET /api/duty-days (one pilot's
 * duty log records) and GET /api/duty-methods (the operator's dated §135.267 method).
 * Response objects allow unknown keys, so an instance may add fields without breaking
 * older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';

const nullableStr = z.nullable(z.string());

/** A duty_days row (DutyDay in duty.ts). */
export const DutyDayRow = z.looseObject({
  pilot_id: z.number(),
  date: z.string(),
  duty_start: nullableStr,
  duty_end: nullableStr,
  rest: z.number(),
  rest_designated_at: z.nullable(z.number()),
  note: nullableStr,
});

/** A pilot's default duty from a date (duty_start null: none from then on). */
export const DefaultDutyEntry = z.looseObject({
  effective_date: z.string(),
  duty_start: nullableStr,
  duty_end: nullableStr,
});

/** The operator's §135.267 method from a date. */
export const DutyMethodEntry = z.looseObject({
  effective_date: z.string(),
  method: z.enum(['b', 'c']),
});

/** GET /api/duty-days?pilot= (default_duties and duty_methods oldest first). */
export const DutyLogResponse = z.looseObject({
  days: z.array(DutyDayRow),
  default_duties: z.array(DefaultDutyEntry),
  duty_methods: z.array(DutyMethodEntry),
  last_history_id: z.number(),
});

/** GET /api/duty-methods */
export const DutyMethodsResponse = z.looseObject({
  methods: z.array(DutyMethodEntry),
  last_history_id: z.number(),
});

export type DutyLogResponse = z.infer<typeof DutyLogResponse>;
export type DutyMethodsResponse = z.infer<typeof DutyMethodsResponse>;

/** One pilot's duty log records. */
export function getDutyLog(client: ApiClient, pilotId: number | string): Promise<DutyLogResponse> {
  return client.get('/api/duty-days?pilot=' + encodeURIComponent(pilotId), DutyLogResponse);
}

/** The operator's dated §135.267 method. */
export function getDutyMethods(client: ApiClient): Promise<DutyMethodsResponse> {
  return client.get('/api/duty-methods', DutyMethodsResponse);
}
