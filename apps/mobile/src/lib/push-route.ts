/**
 * App push without the native module, for tests: where a notification tap goes, and the
 * subscription set the Notifications screen edits (docs/mobile-app-plan.md, "Native
 * details").
 */
import type { PushEvent } from '@wingbeat/core/api/push';

/** A tracker's events (takeoff, landing, gap); `gap_resolved` and `gap_timeout` ride `gap`. */
const TRACKER_EVENT_TYPES = ['takeoff', 'landing', 'gap', 'gap_resolved', 'gap_timeout'];

export interface PushRoute {
  /** The instance the push came from, to pick its account; null when it doesn't say. */
  host: string | null;
  href: { pathname: '/live'; params: { tracker: string } } | { pathname: '/flights/alerts' };
}

/**
 * Where a tap on a push with this `data` goes: a tracker's event to it on Live, an alert to
 * the alerts sheet. A type this version doesn't know is null: the app just opens.
 */
export function pushRoute(data: Record<string, unknown> | null | undefined): PushRoute | null {
  if (!data || typeof data.type !== 'string') return null;
  const host = typeof data.host === 'string' ? data.host : null;
  if (TRACKER_EVENT_TYPES.includes(data.type) && typeof data.tracker_id === 'number') {
    return { host, href: { pathname: '/live', params: { tracker: String(data.tracker_id) } } };
  }
  if (data.type === 'alert') return { host, href: { pathname: '/flights/alerts' } };
  return null;
}

export interface Subscription { tracker_id: number | null; event: PushEvent }

/** On for `sub` itself, or for its event on every tracker. */
export function isSubscribed(subs: Subscription[], sub: Subscription): boolean {
  return subs.some((s) => s.event === sub.event && (s.tracker_id === sub.tracker_id || s.tracker_id === null));
}

/**
 * The set with `sub` turned on or off. Turning an event on for every tracker drops its
 * per-tracker rows, which it covers.
 */
export function setSubscribed(subs: Subscription[], sub: Subscription, on: boolean): Subscription[] {
  const rest = subs.filter((s) => s.event !== sub.event || (s.tracker_id !== sub.tracker_id && (sub.tracker_id !== null || !on)));
  return on ? [...rest, sub] : rest;
}
