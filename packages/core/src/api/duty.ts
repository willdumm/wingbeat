/**
 * The duty route group: the reads, GET /api/duty-days (one pilot's duty log records) and
 * GET /api/duty-methods (the operator's dated §135.267 method), and the duty log's and
 * Global Settings' writes (duty days, default duty, the method). Response objects allow unknown keys, so an instance may add fields without breaking
 * older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import type { DefaultDutyRequest, DutyDaysClearRequest, DutyDaysRequest, DutyMethodRequest } from './duty-requests';

export type { DefaultDutyRequest, DutyDaysClearRequest, DutyDaysRequest, DutyMethodRequest } from './duty-requests';

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

// ── Writes (the request schemas are in duty-requests.ts) ──

/** The duty-day writes. */
export const DutyOkResponse = z.looseObject({ ok: z.literal(true) });
/** The default-duty writes: the pilot's list after it (oldest first). */
export const DefaultDutiesResponse = z.looseObject({ default_duties: z.array(DefaultDutyEntry) });
/** The duty-method writes: the operator's list after it (oldest first). */
export const DutyMethodsWriteResponse = z.looseObject({ methods: z.array(DutyMethodEntry) });

export type DefaultDutiesResponse = z.infer<typeof DefaultDutiesResponse>;
export type DutyMethodsWriteResponse = z.infer<typeof DutyMethodsWriteResponse>;

const baseQuery = (baseHistoryId?: number | null) =>
  baseHistoryId == null ? '' : '?base_history_id=' + baseHistoryId;

/** Sets one pilot's dates; every day is saved, or none. */
export function putDutyDays(client: ApiClient, pilotId: number | string, body: DutyDaysRequest): Promise<z.infer<typeof DutyOkResponse>> {
  return client.write('PUT', '/api/duty-days/' + encodeURIComponent(pilotId), body, DutyOkResponse);
}

/** Clears one pilot's dates. */
export function clearDutyDays(client: ApiClient, pilotId: number | string, body: DutyDaysClearRequest): Promise<z.infer<typeof DutyOkResponse>> {
  return client.write('POST', '/api/duty-days/' + encodeURIComponent(pilotId) + '/clear', body, DutyOkResponse);
}

/** Sets a pilot's default duty from a date. */
export function putDefaultDuty(client: ApiClient, pilotId: number | string, body: DefaultDutyRequest): Promise<DefaultDutiesResponse> {
  return client.write('PUT', '/api/pilots/' + encodeURIComponent(pilotId) + '/default-duty', body, DefaultDutiesResponse);
}

/** Removes a pilot's default duty entry dated date. */
export function deleteDefaultDuty(client: ApiClient, pilotId: number | string, date: string, baseHistoryId?: number | null): Promise<DefaultDutiesResponse> {
  return client.write('DELETE', '/api/pilots/' + encodeURIComponent(pilotId) + '/default-duty/' + encodeURIComponent(date) +
    baseQuery(baseHistoryId), undefined, DefaultDutiesResponse);
}

/** Sets the operator's §135.267 method from a date. */
export function putDutyMethod(client: ApiClient, body: DutyMethodRequest): Promise<DutyMethodsWriteResponse> {
  return client.write('PUT', '/api/duty-methods', body, DutyMethodsWriteResponse);
}

/** Removes the method entry dated date. */
export function deleteDutyMethod(client: ApiClient, date: string, baseHistoryId?: number | null): Promise<DutyMethodsWriteResponse> {
  return client.write('DELETE', '/api/duty-methods/' + encodeURIComponent(date) + baseQuery(baseHistoryId), undefined, DutyMethodsWriteResponse);
}
