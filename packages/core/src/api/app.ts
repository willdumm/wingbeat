/**
 * The app route group: the routes only the app calls. Pairing exchanges a device-link or
 * invite token for a session the app sends as a bearer (docs/mobile-app-plan.md, "Auth and
 * pairing"). The request schema is in app-requests.ts. Response objects allow unknown keys,
 * so an instance may add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import { Me } from './bootstrap';
import type { PairRequest } from './app-requests';

export type { PairRequest } from './app-requests';

/** POST /api/app/pair: the new session's token and the signed-in user. */
export const PairResponse = z.looseObject({ token: z.string(), me: Me });

export type PairResponse = z.infer<typeof PairResponse>;

/**
 * Pairs this device: redeems the token for a session. The client needs no auth for this
 * one; later calls send the returned token as a bearer.
 */
export function pair(client: ApiClient, body: PairRequest): Promise<PairResponse> {
  return client.write('POST', '/api/app/pair', body, PairResponse);
}
