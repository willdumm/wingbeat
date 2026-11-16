/**
 * The push route group's request schemas (api/push.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In its own module so
 * the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

/** What a subscription is to: a tracker's takeoffs, landings or signal gaps, or the alerts feed. */
export const PUSH_EVENTS = ['takeoff', 'landing', 'gap', 'alerts'] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number];

/** A tracker's events, the ones a device can get as iOS Time Sensitive pushes. */
export const TRACKER_PUSH_EVENTS = ['takeoff', 'landing', 'gap'] as const;
export type TrackerPushEvent = (typeof TRACKER_PUSH_EVENTS)[number];

/** What a device that hasn't said gets as Time Sensitive. */
export const DEFAULT_TIME_SENSITIVE: TrackerPushEvent[] = ['gap'];

/** The longest push token or endpoint stored. Expo's are about 40 characters. */
export const MAX_PUSH_ENDPOINT_LENGTH = 512;

/**
 * POST /api/me/push-devices: this device's Expo push token, and the tracker events it gets as
 * Time Sensitive pushes (left out: unchanged, or DEFAULT_TIME_SENSITIVE for a new device).
 */
export const PushDeviceRequest = z.object({
  kind: z.literal('expo'),
  token: z.string().check(z.minLength(1), z.maxLength(MAX_PUSH_ENDPOINT_LENGTH)),
  time_sensitive: z.optional(z.array(z.enum(TRACKER_PUSH_EVENTS)).check(z.maxLength(TRACKER_PUSH_EVENTS.length))),
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
