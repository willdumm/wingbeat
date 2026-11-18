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

/**
 * The app's Android notification channels, one per kind of push, so a user sets each one's
 * sound and importance in system settings. The app creates them; each push names its own.
 */
export const PUSH_CHANNELS = { flights: 'flights', gaps: 'signal-gaps', alerts: 'alerts' } as const;
export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

/** A subscription's channel: takeoff and landing are flights, gap (with its follow-ups) gaps. */
export function pushChannel(event: PushEvent): PushChannel {
  return event === 'gap' ? PUSH_CHANNELS.gaps : event === 'alerts' ? PUSH_CHANNELS.alerts : PUSH_CHANNELS.flights;
}

/**
 * The notification category of a tracker event whose tracker has a MapShare page (its data
 * carries mapshare_url): touch and hold it for View on Map or Open MapShare.
 */
export const TRACKER_PUSH_CATEGORY = 'tracker';
export const PUSH_ACTIONS = { viewOnMap: 'view-on-map', openMapShare: 'open-mapshare' } as const;

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
