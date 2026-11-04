/**
 * The pilots route group: the read, GET /api/pilots (each pilot with their dated default
 * duties), and Settings' writes (add, rename, hide). The default duty's writes are the duty
 * route group's (api/duty.ts). The request schemas are in pilots-requests.ts. Response
 * objects allow unknown keys, so an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { PilotCreateRequest, PilotUpdateRequest } from './pilots-requests';

export type { PilotCreateRequest, PilotUpdateRequest } from './pilots-requests';
import { DefaultDutyEntry } from './duty';

/** A pilot. active is SQLite's 0/1; default_duties oldest first. */
export const Pilot = z.looseObject({
  id: z.number(),
  name: z.string(),
  active: z.number(),
  default_duties: z.array(DefaultDutyEntry),
});

/** GET /api/pilots */
export const PilotsResponse = z.looseObject({ pilots: z.array(Pilot) });

export type Pilot = z.infer<typeof Pilot>;
export type PilotsResponse = z.infer<typeof PilotsResponse>;

/** Every pilot. */
export function getPilots(client: ApiClient): Promise<PilotsResponse> {
  return client.get('/api/pilots', PilotsResponse);
}

/** POST /api/pilots */
export const PilotCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number() });

export type PilotCreateResponse = z.infer<typeof PilotCreateResponse>;

/** Adds a pilot. */
export function createPilot(client: ApiClient, body: PilotCreateRequest): Promise<PilotCreateResponse> {
  return client.write('POST', '/api/pilots', body, PilotCreateResponse);
}

/** Changes a pilot's name or whether they're shown (those in body). */
export function updatePilot(client: ApiClient, id: number, body: PilotUpdateRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/pilots/' + id, body, OkResponse);
}
