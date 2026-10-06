import { Tenant } from './types';
import { loadSettings } from './settings';
import { toKnots, toFeet, formatLocalDateTime } from './shared/format';

interface BaseNotificationEvent {
  tracker_id: number;
  tracker_name: string;
  time: number;
  lat: number;
  lon: number;
  // Already-computed label (dashboard-style, e.g. "1.2 miles E of Red Lake") — see
  // computeLiveLabel/resolveRefPoint in geocoding.ts. Null when no reference point is
  // known yet (e.g. brand-new tenant with nothing geocoded).
  location_label: string | null;
  // Speed/altitude at the time of the event. For takeoff this is the most recent point
  // (not the takeoff point itself — see poller.ts's processNotifications), for everything
  // else it's the point the event is anchored to (e.g. the last point seen before a gap).
  // Null when the feed didn't report a value.
  velocity_kmh: number | null;
  elevation_m: number | null;
  mapshare_url: string | null;
  instance_url: string;
}

export type NotificationEvent =
  | (BaseNotificationEvent & { type: 'takeoff' })
  | (BaseNotificationEvent & { type: 'landing' })
  | (BaseNotificationEvent & { type: 'gap'; gap_minutes: number })
  | (BaseNotificationEvent & { type: 'gap_resolved'; gap_minutes: number });

/**
 * The stored subscription key for an event. `gap_resolved` rides the `gap` subscription —
 * it only ever follows a gap alert, so anyone who got the alert should get the all-clear
 * without editing existing targets (whose stored events lists predate the type).
 */
function subscriptionKey(eventType: NotificationEvent['type']): string {
  return eventType === 'gap_resolved' ? 'gap' : eventType;
}

interface NotificationTarget {
  id: number;
  type: string; // 'webhook' | 'pushover'
  url: string;
  pushover_user_key: string | null;
  events: string;
}

/**
 * How a tracker is identified in a notification: the assigned aircraft's tail number when
 * one is set, otherwise the tracker's own name — same precedence as the dashboard's status
 * card (`updateAircraftStatusCards` in dashboard/scripts/live.ts: `tail || tracker.name`).
 */
export function trackerLabel(tracker: { name: string; assigned_aircraft: string | null }): string {
  return tracker.assigned_aircraft || tracker.name;
}

/**
 * Converts a stored InReach MapShare feed URL (the "Raw KML Data" link, e.g.
 * `https://share.garmin.com/Feed/Share/yourname`) into the human-viewable MapShare page
 * (`https://share.garmin.com/yourname`) — same transform the dashboard's location popup
 * uses for its "Open Garmin MapShare" link. Falls back to the feed URL itself if it doesn't
 * match the expected `/Feed/Share/` shape (e.g. a future non-InReach tracker type).
 */
export function mapshareUrl(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    u.pathname = u.pathname.replace(/^\/Feed\/Share\//i, '/');
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

// ── Shared message formatting (used by every delivery mechanism) ─────────────

export function eventTitle(event: NotificationEvent): string {
  switch (event.type) {
    case 'takeoff': return `${event.tracker_name} took off`;
    case 'landing': return `${event.tracker_name} landed`;
    case 'gap': return `${event.tracker_name}: signal gap`;
    case 'gap_resolved': return `${event.tracker_name}: signal restored`;
  }
}

// Notifications have no browser to pick up an implicit local zone (the way the dashboard's
// fmtTime/fmtDay do), so they render in the tenant's configured operating timezone (Settings
// → Global Settings) via formatLocalDateTime — see shared/format.ts.
function formatSpeedAlt(velocity_kmh: number | null, elevation_m: number | null): string | null {
  const parts: string[] = [];
  if (velocity_kmh != null) parts.push(toKnots(velocity_kmh));
  if (elevation_m != null) parts.push(toFeet(elevation_m));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function eventMessage(event: NotificationEvent, timezone: string): string {
  const coords = `${event.lat.toFixed(3)}, ${event.lon.toFixed(3)}`;
  const loc = event.location_label ? `${event.location_label} (${coords})` : coords;
  const time = formatLocalDateTime(event.time, timezone);
  const speedAlt = formatSpeedAlt(event.velocity_kmh, event.elevation_m);
  const speedAltSuffix = speedAlt ? ` (${speedAlt})` : '';
  const links = [
    event.mapshare_url ? `MapShare: ${event.mapshare_url}` : null,
    `Tracker: ${event.instance_url}`,
  ].filter(Boolean).join(' — ');

  if (event.type === 'gap') {
    return `No location update for ${event.gap_minutes} min while in flight (last seen ${time} near ${loc}${speedAltSuffix}). ${links}`;
  }
  if (event.type === 'gap_resolved') {
    return `Location updates resumed after a ${event.gap_minutes} min gap, near ${loc} at ${time}${speedAltSuffix}. ${links}`;
  }
  return `${event.type === 'takeoff' ? 'Takeoff' : 'Landing'} detected near ${loc} at ${time}${speedAltSuffix}. ${links}`;
}

/**
 * Sends each event to every active target subscribed to its type. Takes the whole batch
 * so the webhooks table is read once per poll, not once per event (a short flight can
 * produce takeoff+landing in a single batch). Best-effort per-target: failures are
 * recorded, never thrown.
 */
export async function dispatchNotifications(tenant: Tenant, events: NotificationEvent[]): Promise<void> {
  if (events.length === 0) return;

  const { results } = await tenant.db.prepare(
    'SELECT id, type, url, pushover_user_key, events FROM webhooks WHERE active = 1'
  ).all<NotificationTarget>();
  if (results.length === 0) return;

  const { timezone } = await loadSettings(tenant);

  const subscribed = (w: NotificationTarget, eventType: string): boolean => {
    try {
      return (JSON.parse(w.events) as string[]).includes(eventType);
    } catch {
      return false;
    }
  };

  for (const event of events) {
    const targets = results.filter((w) => subscribed(w, subscriptionKey(event.type)));
    if (targets.length === 0) continue;
    await Promise.allSettled(targets.map((t) => sendTarget(tenant, t, event, timezone)));
  }
}

async function sendTarget(tenant: Tenant, target: NotificationTarget, event: NotificationEvent, timezone: string): Promise<void> {
  if (target.type === 'pushover') return sendPushover(tenant, target, event, timezone);
  return sendGenericWebhook(tenant, target, event, timezone);
}

async function sendGenericWebhook(tenant: Tenant, target: NotificationTarget, event: NotificationEvent, timezone: string): Promise<void> {
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // title/message are plain-text convenience fields for receivers (Slack/Discord-style
      // incoming webhooks, simple relays, ...) that don't want to parse the structured event.
      body: JSON.stringify({ ...event, title: eventTitle(event), message: eventMessage(event, timezone) }),
      signal: AbortSignal.timeout(10_000),
    });
    await recordDelivery(tenant, target.id, res.status, null);
  } catch (err) {
    await recordDelivery(tenant, target.id, null, String(err).slice(0, 500));
  }
}

async function sendPushover(tenant: Tenant, target: NotificationTarget, event: NotificationEvent, timezone: string): Promise<void> {
  try {
    const { pushover_api_token: token } = await loadSettings(tenant);
    if (!token) throw new Error('Pushover API token is not configured (Settings → Global Settings → Notifications)');

    const body = new URLSearchParams({
      token,
      user: target.pushover_user_key ?? '',
      title: eventTitle(event),
      message: eventMessage(event, timezone),
    });
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      await recordDelivery(tenant, target.id, res.status, null);
    } else {
      // Pushover's error body (JSON {status:0, errors:[...]}) is far more useful for
      // debugging a bad token/user-key than a bare status code.
      const text = await res.text().catch(() => '');
      await recordDelivery(tenant, target.id, res.status, text.slice(0, 500));
    }
  } catch (err) {
    await recordDelivery(tenant, target.id, null, String(err).slice(0, 500));
  }
}

async function recordDelivery(tenant: Tenant, id: number, status: number | null, error: string | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await tenant.db.prepare(
    'UPDATE webhooks SET last_triggered_at = ?, last_status = ?, last_error = ? WHERE id = ?'
  ).bind(now, status, error, id).run();
}
