import { Tenant } from './types';

// App push through Expo's push service (docs/mobile-app-plan.md, "Step 2: app push for hosted
// instances"). Expo delivers through APNs/FCM with the EAS project's credentials; with
// enhanced push security on, a send needs the publisher's access token (the
// EXPO_ACCESS_TOKEN Worker secret, set only on hosted instances). Without it, app push is
// skipped entirely.

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
// Expo's per-request limits.
const SEND_CHUNK = 100;
const RECEIPTS_CHUNK = 1000;
// Receipts are usually ready within 15 minutes, and Expo keeps them for a day: a ticket
// with no receipt after that is dropped unchecked.
const RECEIPT_MIN_AGE_SECONDS = 15 * 60;
const TICKET_MAX_AGE_SECONDS = 24 * 3600;

/** One push to every expo device of the given users' sessions. */
export interface AppPush {
  title: string;
  body: string;
  // The app routes a tap by data.type; a type it doesn't know opens its home screen.
  data: Record<string, unknown>;
  timeSensitive?: boolean;
}

interface ExpoTicket { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }
interface ExpoReceipt { status: 'ok' | 'error'; message?: string; details?: { error?: string } }

function expoHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}

/**
 * The expo devices whose user has a subscription matching `event` (a subscription key:
 * takeoff/landing/gap/alerts) for `trackerId`, or for every tracker (tracker_id NULL).
 * `trackerId` null matches only every-tracker subscriptions (the alerts feed).
 */
export async function subscribedDevices(tenant: Tenant, event: string, trackerId: number | null): Promise<{ id: number; endpoint: string }[]> {
  const { results } = await tenant.db.prepare(
    `SELECT DISTINCT d.id, d.endpoint FROM push_devices d
     JOIN sessions s ON s.id = d.session_id
     JOIN push_subscriptions ps ON ps.user_id = s.user_id
     WHERE d.kind = 'expo' AND ps.event = ? AND (ps.tracker_id IS NULL OR ps.tracker_id = ?)`
  ).bind(event, trackerId).all<{ id: number; endpoint: string }>();
  return results;
}

/**
 * Sends each push to its devices, keeping Expo's tickets for the next cron run's receipt
 * check. Best-effort: each device's outcome is recorded on push_devices (last_ok_at or
 * last_error; DeviceNotRegistered deletes it), never thrown.
 */
export async function sendAppPushes(tenant: Tenant, pushes: { push: AppPush; devices: { id: number; endpoint: string }[] }[]): Promise<void> {
  const token = tenant.expoAccessToken;
  if (!token) return;

  const messages = pushes.flatMap(({ push, devices }) => devices.map((d) => ({
    deviceId: d.id,
    message: {
      to: d.endpoint,
      title: push.title,
      body: push.body,
      data: push.data,
      sound: 'default',
      // iOS Time Sensitive gets through Focus; it needs the app's entitlement and is
      // ignored without it.
      ...(push.timeSensitive ? { interruptionLevel: 'time-sensitive' } : {}),
    },
  })));

  for (let i = 0; i < messages.length; i += SEND_CHUNK) {
    const chunk = messages.slice(i, i + SEND_CHUNK);
    const now = Math.floor(Date.now() / 1000);
    let tickets: ExpoTicket[];
    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers: expoHeaders(token),
        body: JSON.stringify(chunk.map((m) => m.message)),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Expo push ${res.status}: ${text}`);
      tickets = (JSON.parse(text) as { data: ExpoTicket[] }).data;
      if (!Array.isArray(tickets) || tickets.length !== chunk.length) throw new Error('Expo push: unexpected response');
    } catch (err) {
      const error = String(err).slice(0, 500);
      await tenant.db.batch(chunk.map((m) =>
        tenant.db.prepare('UPDATE push_devices SET last_error = ? WHERE id = ?').bind(error, m.deviceId)));
      continue;
    }

    await tenant.db.batch(chunk.map((m, j) => {
      const t = tickets[j];
      if (t.status === 'ok' && t.id) {
        return tenant.db.prepare('INSERT OR IGNORE INTO push_tickets (ticket_id, device_id, created_at) VALUES (?, ?, ?)')
          .bind(t.id, m.deviceId, now);
      }
      if (t.details?.error === 'DeviceNotRegistered') {
        return tenant.db.prepare('DELETE FROM push_devices WHERE id = ?').bind(m.deviceId);
      }
      return tenant.db.prepare('UPDATE push_devices SET last_error = ? WHERE id = ?')
        .bind(String(t.message ?? t.details?.error ?? 'Expo push error').slice(0, 500), m.deviceId);
    }));
  }
}

/**
 * Checks the receipts of tickets old enough to have one (cron only): an ok receipt sets the
 * device's last_ok_at, DeviceNotRegistered deletes the device, any other error is its
 * last_error. A checked ticket is deleted, and so is one with no receipt past Expo's day.
 */
export async function checkAppPushReceipts(tenant: Tenant): Promise<void> {
  const token = tenant.expoAccessToken;
  if (!token) return;
  const now = Math.floor(Date.now() / 1000);

  const { results: tickets } = await tenant.db.prepare(
    'SELECT ticket_id, device_id, created_at FROM push_tickets WHERE created_at <= ? ORDER BY created_at LIMIT ?'
  ).bind(now - RECEIPT_MIN_AGE_SECONDS, RECEIPTS_CHUNK).all<{ ticket_id: string; device_id: number; created_at: number }>();
  if (tickets.length === 0) return;

  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(token),
    body: JSON.stringify({ ids: tickets.map((t) => t.ticket_id) }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Expo receipts ${res.status}: ${text.slice(0, 500)}`);
  const receipts = (JSON.parse(text) as { data: Record<string, ExpoReceipt> }).data ?? {};

  const stmts: D1PreparedStatement[] = [];
  for (const t of tickets) {
    const r = receipts[t.ticket_id];
    if (!r) {
      if (t.created_at <= now - TICKET_MAX_AGE_SECONDS) {
        stmts.push(tenant.db.prepare('DELETE FROM push_tickets WHERE ticket_id = ?').bind(t.ticket_id));
      }
      continue;
    }
    if (r.status === 'ok') {
      stmts.push(tenant.db.prepare('UPDATE push_devices SET last_ok_at = MAX(COALESCE(last_ok_at, 0), ?), last_error = NULL WHERE id = ?')
        .bind(t.created_at, t.device_id));
    } else if (r.details?.error === 'DeviceNotRegistered') {
      stmts.push(tenant.db.prepare('DELETE FROM push_devices WHERE id = ?').bind(t.device_id));
    } else {
      stmts.push(tenant.db.prepare('UPDATE push_devices SET last_error = ? WHERE id = ?')
        .bind(String(r.message ?? r.details?.error ?? 'Expo receipt error').slice(0, 500), t.device_id));
    }
    stmts.push(tenant.db.prepare('DELETE FROM push_tickets WHERE ticket_id = ?').bind(t.ticket_id));
  }
  if (stmts.length > 0) await tenant.db.batch(stmts);
}
