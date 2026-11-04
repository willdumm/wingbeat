/**
 * The corrections route group's writes: the flight form and the flight editor's bulk
 * actions (POST/PUT/DELETE /api/flight-corrections, POST /api/flight-corrections/bulk, PUT
 * /api/flights/assignment). Their response schemas and the client calls; the request
 * schemas are in corrections-requests.ts. Response objects allow unknown keys, so an
 * instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import { FlightCorrectionRow } from './flights';
import type { AssignmentRequest, BulkFlagsRequest, CorrectionRequest } from './corrections-requests';

export type { AssignmentRequest, BulkFlagsRequest, CorrectionRequest, FlightRef } from './corrections-requests';

/** POST and PUT /api/flight-corrections: the row as saved (null: a tracked flight's row left empty, so deleted). */
export const CorrectionWriteResponse = z.looseObject({ entry: z.nullable(FlightCorrectionRow) });

/** The bulk route and the delete (shared by every route group's writes: client.ts). */
export { OkResponse };

/** PUT /api/flights/assignment: what was set (pilot_name with pilot_id). */
export const AssignmentResponse = z.looseObject({
  ok: z.literal(true),
  aircraft_tail: z.optional(z.nullable(z.string())),
  pilot_id: z.optional(z.nullable(z.number())),
  pilot_name: z.optional(z.nullable(z.string())),
});

export type CorrectionWriteResponse = z.infer<typeof CorrectionWriteResponse>;
export type AssignmentResponse = z.infer<typeof AssignmentResponse>;

const baseQuery = (baseHistoryId?: number | null) =>
  baseHistoryId == null ? '' : '?base_history_id=' + baseHistoryId;

/** Saves a tracked flight's correction, or adds a manual flight. */
export function saveFlightCorrection(client: ApiClient, body: CorrectionRequest): Promise<CorrectionWriteResponse> {
  return client.write('POST', '/api/flight-corrections', body, CorrectionWriteResponse);
}

/** Updates manual flight id. */
export function updateManualFlight(client: ApiClient, id: number, body: CorrectionRequest): Promise<CorrectionWriteResponse> {
  return client.write('PUT', '/api/flight-corrections/' + id, body, CorrectionWriteResponse);
}

/** Deletes row id: a tracked flight's corrections (a revert) or a manual flight. */
export function deleteFlightCorrection(client: ApiClient, id: number, baseHistoryId?: number | null): Promise<z.infer<typeof OkResponse>> {
  return client.write('DELETE', '/api/flight-corrections/' + id + baseQuery(baseHistoryId), undefined, OkResponse);
}

/** Sets Part 91 and/or removed on many flights. */
export function setFlightFlags(client: ApiClient, body: BulkFlagsRequest): Promise<z.infer<typeof OkResponse>> {
  return client.write('POST', '/api/flight-corrections/bulk', body, OkResponse);
}

/** Sets aircraft and/or pilot on many flights. */
export function setFlightAssignment(client: ApiClient, body: AssignmentRequest): Promise<AssignmentResponse> {
  return client.write('PUT', '/api/flights/assignment', body, AssignmentResponse);
}
