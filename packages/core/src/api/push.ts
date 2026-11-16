/**
 * The push route group: registering this device for push (its Expo push token) and the
 * signed-in user's subscriptions (per tracker, per event, and the alerts feed). The request
 * schemas are in push-requests.ts. Response objects allow unknown keys, so an instance may
 * add fields without breaking older clients.
 */
import * as z from 'zod/mini';
import type { ApiClient } from './client';
import { PUSH_EVENTS, type PushDeviceRequest, type PushSubscriptionsRequest } from './push-requests';

export {
  PUSH_EVENTS, TRACKER_PUSH_EVENTS, DEFAULT_TIME_SENSITIVE,
  type PushEvent, type TrackerPushEvent, type PushDeviceRequest, type PushSubscriptionsRequest,
} from './push-requests';

/** POST /api/me/push-devices: the device's row. */
export const PushDeviceResponse = z.looseObject({ id: z.number() });

/** GET and PUT /api/me/push-subscriptions */
export const PushSubscriptionsResponse = z.looseObject({
  subscriptions: z.array(z.looseObject({ tracker_id: z.nullable(z.number()), event: z.enum(PUSH_EVENTS) })),
});

export type PushDeviceResponse = z.infer<typeof PushDeviceResponse>;
export type PushSubscriptionsResponse = z.infer<typeof PushSubscriptionsResponse>;

/** Registers this device's push token for the signed-in session (again is harmless). */
export function registerPushDevice(client: ApiClient, body: PushDeviceRequest): Promise<PushDeviceResponse> {
  return client.write('POST', '/api/me/push-devices', body, PushDeviceResponse);
}

/** The signed-in user's subscriptions. */
export function getPushSubscriptions(client: ApiClient): Promise<PushSubscriptionsResponse> {
  return client.get('/api/me/push-subscriptions', PushSubscriptionsResponse);
}

/** Replaces the signed-in user's subscriptions; answers the set now stored. */
export function setPushSubscriptions(client: ApiClient, body: PushSubscriptionsRequest): Promise<PushSubscriptionsResponse> {
  return client.write('PUT', '/api/me/push-subscriptions', body, PushSubscriptionsResponse);
}
