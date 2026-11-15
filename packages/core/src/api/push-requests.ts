/**
 * The push route group's request schemas (api/push.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In its own module so
 * the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

/** What a subscription is to: a tracker's takeoffs, landings or signal gaps, or the alerts feed. */
export const PUSH_EVENTS = ['takeoff', 'landing', 'gap', 'alerts'] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number];

/** The longest push token or endpoint stored. Expo's are about 40 characters. */
export const MAX_PUSH_ENDPOINT_LENGTH = 512;

/** POST /api/me/push-devices: this device's Expo push token. */
export const PushDeviceRequest = z.object({
  kind: z.literal('expo'),
  token: z.string().check(z.minLength(1), z.maxLength(MAX_PUSH_ENDPOINT_LENGTH)),
});

/** One subscription: tracker_id null is every tracker (and the only one for alerts). */
export const PushSubscription = z.object({
  tracker_id: z.nullable(z.int()),
  event: z.enum(PUSH_EVENTS),
});

/** PUT /api/me/push-subscriptions: the user's whole set, replacing the one stored. */
export const PushSubscriptionsRequest = z.object({ subscriptions: z.array(PushSubscription) });

export type PushDeviceRequest = z.input<typeof PushDeviceRequest>;
export type PushSubscriptionsRequest = z.input<typeof PushSubscriptionsRequest>;
