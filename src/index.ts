import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, Tenant, Point, Flight, FlightRecord, FlightPoint, Tracker, Aircraft, Pilot, InviteToken, Webhook, TileOverlay, FlightCorrection, DutyDay } from './types';
import { maybePoll, pollAllActive, pollAllActiveForce, testFeed } from './poller';
import { resegment } from './segmentation';
import { geocodePendingPoints, geocodeLivePoint, invalidateNamedPointsCache, computeLiveLabel, resolveRefPoint } from './geocoding';
import { haversineMiles } from './geo';
import { dashboardHTML } from './dashboard';
import { analyticsHTML } from './analytics';
import { generateToken, deviceNameFromUA, noAccessHTML, joinHTML, joinErrorHTML } from './auth';
import { loadSettings, invalidateSettingsCache } from './settings';
import { keyedBasemapPreset, readEnvSecret, substituteTileUrl } from './shared/map-controls';
import { lookupTileMetadata, sanitizeAttribution } from './tile-metadata';
import { MAX_DUTY_DAYS_PER_REQUEST, MAX_FLIGHT_TEXT_LENGTH, MAX_DUTY_NOTE_LENGTH } from './shared/record-limits';

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

type AuthUser = { id: number; name: string; role: string; sessionId: number; device_name: string | null };
type Variables = { user: AuthUser; db: D1Database; tenant: Tenant };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  return next();
};

const _defaultTrackerIdCache = new Map<string, number | null>();
function invalidateTrackerCache(tenantKey: string) { _defaultTrackerIdCache.delete(tenantKey); }

function meJson(u: AuthUser) {
  return { id: u.id, name: u.name, role: u.role, device_name: u.device_name, session_id: u.sessionId };
}

async function queryTrackers(db: D1Database) {
  const { results } = await db.prepare(
    'SELECT id, name, type, source_url, active, deleted, assigned_aircraft, assigned_pilot FROM trackers ORDER BY id ASC'
  ).all<Tracker>();
  return results;
}

async function queryAircraft(db: D1Database, activeOnly = false) {
  const query = activeOnly
    ? 'SELECT tail_number, name, active, hobbs_time, hobbs_recorded_at, hobbs_correction, tach_time, tach_recorded_at, tach_correction, maintenance_schedule FROM aircraft WHERE active = 1 ORDER BY tail_number ASC'
    : 'SELECT tail_number, name, active, hobbs_time, hobbs_recorded_at, hobbs_correction, tach_time, tach_recorded_at, tach_correction, maintenance_schedule FROM aircraft ORDER BY tail_number ASC';
  const { results } = await db.prepare(query).all<Aircraft & { maintenance_schedule: string | null }>();
  return results.map(r => ({ ...r, maintenance_schedule: r.maintenance_schedule ? JSON.parse(r.maintenance_schedule) : null }));
}

async function queryPilots(db: D1Database, activeOnly = false) {
  const query = activeOnly
    ? 'SELECT id, name, active, default_duty_start, default_duty_end FROM pilots WHERE active = 1 ORDER BY name ASC'
    : 'SELECT id, name, active, default_duty_start, default_duty_end FROM pilots ORDER BY name ASC';
  const { results } = await db.prepare(query).all<Pilot>();
  return results;
}

async function queryTileOverlays(db: D1Database) {
  const { results } = await db.prepare(
    'SELECT id, label, url, attribution, max_zoom, default_enabled, default_enabled_by_basemap FROM tile_overlays ORDER BY id ASC'
  ).all<Omit<TileOverlay, 'default_enabled_by_basemap'> & { default_enabled_by_basemap: string | null }>();
  // Attribution is rendered as HTML on every viewer's map, so it's sanitized on the
  // way out (which also covers rows saved before sanitizing existed).
  return results.map(r => ({
    ...r,
    attribution: r.attribution ? sanitizeAttribution(r.attribution) || null : null,
    default_enabled_by_basemap: r.default_enabled_by_basemap ? JSON.parse(r.default_enabled_by_basemap) : null,
  }));
}

/** Whether s is a real `YYYY-MM-DD` date (not e.g. 2026-02-31, which Date rolls over). */
function isDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
}

/** `YYYY-MM-DD` → UTC midnight; null when missing or malformed. */
function parseDateParam(s: string | undefined): Date | null {
  if (!s || !isDateKey(s)) return null;
  return new Date(s + 'T00:00:00Z');
}

/** Completed flights still missing an origin or destination label. */
async function countUnlabeledFlights(db: D1Database, trackerId: number): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS n FROM flights
    WHERE tracker_id = ? AND (origin_label IS NULL OR (destination_label IS NULL AND end_time IS NOT NULL))
  `).bind(trackerId).first<{ n: number }>();
  return row?.n ?? 0;
}

// Hostname only, no port: ports never distinguish tenants (production is all
// 443, and `wrangler dev` serves localhost:8787 while routing maps use "localhost").
function reqHost(url: string): string {
  try { return new URL(url).hostname; } catch { return 'localhost'; }
}

// ── Tenant routing ────────────────────────────────────────────────────────────

let _routingCache: { raw: string; map: Record<string, string> } | null = null;
function parseRouting(env: Env): Record<string, string> | null {
  if (_routingCache?.raw !== env.CUSTOMER_ROUTING) {
    try {
      _routingCache = { raw: env.CUSTOMER_ROUTING, map: JSON.parse(env.CUSTOMER_ROUTING) };
    } catch {
      return null;
    }
  }
  return _routingCache.map;
}

// D1 bindings are looked up dynamically by the name in CUSTOMER_ROUTING; this
// helper confines the cast so Env itself can stay strictly typed.
function tenantDb(env: Env, bindingName: string): D1Database | undefined {
  return (env as unknown as Record<string, D1Database | undefined>)[bindingName];
}

app.use('*', async (c, next) => {
  const routing = parseRouting(c.env);
  if (!routing) return c.text('CUSTOMER_ROUTING is not valid JSON', 500);

  const host = reqHost(c.req.url);
  const bindingName = routing[host];
  if (!bindingName) return c.text('Not Found', 404);

  const db = tenantDb(c.env, bindingName);
  if (!db) {
    console.error(`Binding "${bindingName}" not found for host ${host}`);
    return c.text('Internal Server Error', 500);
  }

  c.set('db', db);
  c.set('tenant', { db, key: bindingName, host });
  return next();
});

// ── Auth middleware ───────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;

  if (path === '/login' || path === '/location') return next();
  if (path.startsWith('/join/')) return next();

  if (path.startsWith('/api/admin')) {
    const auth = c.req.header('Authorization');
    if (!auth || auth !== `Bearer ${c.env.POLLER_SECRET}`) {
      return c.text('Unauthorized', 401);
    }
    return next();
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const row = await c.var.db.prepare(
      `SELECT s.id, s.user_id, u.name, u.role, s.device_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    ).bind(token).first<{ id: number; user_id: number; name: string; role: string; device_name: string | null }>();
    if (row) {
      c.set('user', { id: row.user_id, name: row.name, role: row.role, sessionId: row.id, device_name: row.device_name });
      return next();
    }
  }

  return c.redirect('/login');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveTrackerId(tenant: Tenant, param: string | undefined): Promise<number | null> {
  if (param) {
    const id = parseInt(param, 10);
    return isNaN(id) ? null : id;
  }
  const cached = _defaultTrackerIdCache.get(tenant.key);
  if (cached !== undefined) return cached;
  const row = await tenant.db.prepare(
    'SELECT id FROM trackers WHERE active = 1 AND deleted = 0 ORDER BY id ASC LIMIT 1'
  ).first<{ id: number }>();
  const id = row?.id ?? null;
  _defaultTrackerIdCache.set(tenant.key, id);
  return id;
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get('/login', async (c) => {
  const settings = await loadSettings(c.var.tenant);
  return c.html(noAccessHTML(settings.app_name));
});

app.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.var.db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  c.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`);
  return c.redirect('/login');
});

// ── Join routes (invite / device-link) ───────────────────────────────────────

// A device that already has a session here doesn't need another one: opening a device
// link (e.g. again, or from an old deployment's "moved" screen) just takes it to the app.
async function hasSession(c: Context<{ Bindings: Env; Variables: Variables }>): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return false;
  return (await c.var.db.prepare('SELECT 1 FROM sessions WHERE token = ?').bind(token).first()) !== null;
}

app.get('/join/:token', async (c) => {
  const token = c.req.param('token');
  const [row, settings] = await Promise.all([
    c.var.db.prepare('SELECT * FROM invite_tokens WHERE token = ?').bind(token).first<InviteToken>(),
    loadSettings(c.var.tenant),
  ]);

  const appName = settings.app_name;
  if (!row) return c.html(joinErrorHTML('This link is invalid.', appName), 404);
  if (row.type === 'device_link' && await hasSession(c)) return c.redirect('/');
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    return c.html(joinErrorHTML('This link has expired. Ask an admin for a new one.', appName), 410);
  }
  if (row.type === 'invite' && row.used) {
    return c.html(joinErrorHTML('This invite link has already been used.', appName), 410);
  }

  if (row.type === 'invite') {
    return c.html(joinHTML('invite', row.invited_name!, token, appName));
  }

  const user = await c.var.db.prepare('SELECT name FROM users WHERE id = ?')
    .bind(row.user_id).first<{ name: string }>();
  if (!user) return c.html(joinErrorHTML('This link is no longer valid.', appName), 404);
  return c.html(joinHTML('device_link', user.name, token, appName));
});

app.post('/join/:token', async (c) => {
  const token = c.req.param('token');
  const [row, settings] = await Promise.all([
    c.var.db.prepare('SELECT * FROM invite_tokens WHERE token = ?').bind(token).first<InviteToken>(),
    loadSettings(c.var.tenant),
  ]);

  const appName = settings.app_name;
  if (!row) return c.html(joinErrorHTML('This link is invalid.', appName), 404);
  if (row.type === 'device_link' && await hasSession(c)) return c.redirect('/');
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    return c.html(joinErrorHTML('This link has expired.', appName), 410);
  }
  if (row.type === 'invite' && row.used) {
    return c.html(joinErrorHTML('This invite link has already been used.', appName), 410);
  }

  const ua = c.req.header('User-Agent') ?? '';
  const deviceName = deviceNameFromUA(ua);
  const sessionToken = generateToken();

  if (row.type === 'invite') {
    const markResult = await c.var.db.prepare(
      'UPDATE invite_tokens SET used = 1 WHERE id = ? AND used = 0'
    ).bind(row.id).run();

    if (markResult.meta.changes === 0) {
      return c.html(joinErrorHTML('This invite link has already been used.', appName), 410);
    }

    const userResult = await c.var.db.prepare(
      'INSERT INTO users (name, role) VALUES (?, ?)'
    ).bind(row.invited_name!, row.invited_role!).run();
    const newUserId = userResult.meta.last_row_id;
    await c.var.db.prepare(
      'INSERT INTO sessions (user_id, token, device_name) VALUES (?, ?, ?)'
    ).bind(newUserId, sessionToken, deviceName).run();
  } else {
    await c.var.db.prepare(
      'INSERT INTO sessions (user_id, token, device_name) VALUES (?, ?, ?)'
    ).bind(row.user_id!, sessionToken, deviceName).run();
  }

  c.header('Set-Cookie', `${SESSION_COOKIE}=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/`);
  return c.redirect('/');
});

// ── Page routes ───────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const settings = await loadSettings(c.var.tenant);
  c.executionCtx.waitUntil(pollAllActive(c.var.tenant));
  return c.html(dashboardHTML(settings, c.env));
});

app.get('/analytics', async (c) => {
  const settings = await loadSettings(c.var.tenant);
  return c.html(analyticsHTML(settings, c.env));
});

app.get('/location', async (c) => {
  const row = await c.var.db.prepare(
    'SELECT lat, lon FROM points ORDER BY garmin_time DESC LIMIT 1'
  ).first<{ lat: number; lon: number }>();
  if (!row) return c.text('No data', 404);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  <lat>${row.lat}</lat>\n  <lon>${row.lon}</lon>\n</response>`;
  return c.body(xml, 200, { 'Content-Type': 'application/xml' });
});

// ── Tile proxy route (keyed basemap providers) ───────────────────────────────
//
// Only presets with `secretEnvVar` set (see BASEMAP_PRESETS in shared/map-controls.ts)
// route through here — keyless presets are fetched by the browser directly from the
// upstream CDN, unchanged. This is the only route allowed to build an upstream tile
// URL or read a tile-provider secret.

const TILE_SUBDOMAINS = ['a', 'b', 'c']; // matches Leaflet's default `subdomains` option
const TILE_Y_FILE = /^(\d+)(@2x)?\.png$/;

app.get('/api/tiles/:providerId/:z/:x/:yFile', async (c) => {
  const preset = keyedBasemapPreset(c.req.param('providerId'));
  if (!preset || !preset.secretEnvVar) return c.text('Not Found', 404);

  const key = readEnvSecret(c.env, preset.secretEnvVar);
  if (!key) return c.text('Tile provider not configured', 503);

  const z = parseInt(c.req.param('z'), 10);
  const x = parseInt(c.req.param('x'), 10);
  const yMatch = TILE_Y_FILE.exec(c.req.param('yFile'));
  if (!yMatch || !Number.isInteger(z) || z < 0 || z > 24) return c.text('Bad Request', 400);
  const maxCoord = 2 ** z;
  const y = parseInt(yMatch[1], 10);
  if (!Number.isInteger(x) || x < 0 || x >= maxCoord || y < 0 || y >= maxCoord) {
    return c.text('Bad Request', 400);
  }

  const subdomain = TILE_SUBDOMAINS[(x + y) % TILE_SUBDOMAINS.length];
  const upstreamUrl = substituteTileUrl(preset.url, {
    s: subdomain, z: String(z), x: String(x), y: String(y), r: yMatch[2] ?? '', key,
  });

  // cacheEverything + cacheTtl: repeat requests for the same tile across every user
  // hit Cloudflare's edge cache rather than re-spending Worker CPU or Carto quota.
  // Referer: a key restricted to the deployment's domains (Carto's referrer allowlist)
  // rejects a request with none, and a server-side fetch sends none by default.
  const upstream = await fetch(upstreamUrl, {
    headers: { Referer: `${new URL(c.req.url).origin}/` },
    cf: { cacheTtl: 604800, cacheEverything: true },
  });
  if (!upstream.ok) {
    console.error(`[tiles] ${preset.id} upstream HTTP ${upstream.status}`);
    return c.text('Bad Gateway', 502);
  }

  // Only the upstream's image bytes and content-type cross back to the client — never
  // the key, and never any Carto-specific response header.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

// ── Me routes (any authenticated user) ───────────────────────────────────────

app.get('/api/me', (c) => {
  return c.json(meJson(c.get('user')));
});

app.get('/api/bootstrap', async (c) => {
  const [trackers, aircraft, pilots, overlays] = await Promise.all([
    queryTrackers(c.var.db),
    queryAircraft(c.var.db),
    queryPilots(c.var.db),
    queryTileOverlays(c.var.db),
  ]);
  return c.json({ me: meJson(c.get('user')), trackers, aircraft, pilots, overlays });
});

app.get('/api/me/sessions', async (c) => {
  const u = c.get('user');
  const { results } = await c.var.db.prepare(
    'SELECT id, device_name, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(u.id).all<{ id: number; device_name: string | null; created_at: number; last_seen_at: number }>();
  return c.json({ sessions: results });
});

app.patch('/api/me/sessions/:id', async (c) => {
  const u = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid session id' }, 400);

  const body = await c.req.json<{ device_name?: string }>();
  if (body.device_name === undefined) return c.json({ error: 'device_name is required' }, 400);

  const existing = await c.var.db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
    .bind(id, u.id).first();
  if (!existing) return c.json({ error: 'Session not found' }, 404);

  await c.var.db.prepare('UPDATE sessions SET device_name = ? WHERE id = ?')
    .bind(body.device_name || null, id).run();
  return c.json({ ok: true });
});

app.delete('/api/me/sessions/:id', async (c) => {
  const u = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid session id' }, 400);

  const existing = await c.var.db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
    .bind(id, u.id).first();
  if (!existing) return c.json({ error: 'Session not found' }, 404);

  await c.var.db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/me/device-link', async (c) => {
  const u = c.get('user');
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600;
  const token = generateToken();
  await c.var.db.prepare(
    `INSERT INTO invite_tokens (token, type, user_id, expires_at) VALUES (?, 'device_link', ?, ?)`
  ).bind(token, u.id, expiresAt).run();
  return c.json({ url: `/join/${token}` });
});

app.post('/api/me/ping', async (c) => {
  const u = c.get('user');
  await c.var.db.prepare(
    'UPDATE sessions SET last_seen_at = unixepoch() WHERE id = ?'
  ).bind(u.sessionId).run();
  return c.json({ ok: true });
});

// ── User management routes (admin only) ──────────────────────────────────────

app.get('/api/users', requireAdmin, async (c) => {
  const { results } = await c.var.db.prepare(`
    SELECT u.id, u.name, u.role, u.is_env_admin, u.created_at,
           COUNT(s.id) AS device_count
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all<{ id: number; name: string; role: string; is_env_admin: number; created_at: number; device_count: number }>();
  return c.json({ users: results });
});

app.delete('/api/users/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid user id' }, 400);

  const target = await c.var.db.prepare('SELECT id FROM users WHERE id = ?')
    .bind(id).first();
  if (!target) return c.json({ error: 'User not found' }, 404);

  await c.var.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── Invite management routes (admin only) ─────────────────────────────────────

app.get('/api/invites', requireAdmin, async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await c.var.db.prepare(`
    SELECT id, token, invited_name, invited_role, expires_at
    FROM invite_tokens
    WHERE type = 'invite' AND used = 0 AND expires_at > ?
    ORDER BY id DESC
  `).bind(now).all<{ id: number; token: string; invited_name: string; invited_role: string; expires_at: number }>();
  return c.json({ invites: results });
});

app.post('/api/invites', requireAdmin, async (c) => {
  const body = await c.req.json<{ name?: string; role?: string; expires_in_hours?: number }>();
  if (!body.name) return c.json({ error: 'name is required' }, 400);
  if (!body.role || !['admin', 'viewer'].includes(body.role)) {
    return c.json({ error: 'role must be admin or viewer' }, 400);
  }
  const expiresInHours = body.expires_in_hours ?? 7 * 24;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const token = generateToken();
  await c.var.db.prepare(
    `INSERT INTO invite_tokens (token, type, invited_name, invited_role, expires_at) VALUES (?, 'invite', ?, ?, ?)`
  ).bind(token, body.name, body.role, expiresAt).run();
  return c.json({ url: `/join/${token}`, token });
});

app.delete('/api/invites/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid invite id' }, 400);
  const existing = await c.var.db.prepare(`SELECT id FROM invite_tokens WHERE id = ? AND type = 'invite'`)
    .bind(id).first();
  if (!existing) return c.json({ error: 'Invite not found' }, 404);
  await c.var.db.prepare('DELETE FROM invite_tokens WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── Live data routes ──────────────────────────────────────────────────────────

app.get('/api/flights', async (c) => {
  const trackerId = await resolveTrackerId(c.var.tenant, c.req.query('tracker'));
  if (trackerId === null) return c.json({ flights: [], total: 0, page: 1, limit: 20 });

  const rawPage  = parseInt(c.req.query('page')  ?? '1',  10);
  const rawLimit = parseInt(c.req.query('limit') ?? '20', 10);
  const page  = Math.max(1,   isNaN(rawPage)  ? 1  : rawPage);
  const limit = Math.min(200, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));
  const offset = (page - 1) * limit;

  const [flightsResult, totalResult] = await Promise.all([
    c.var.db.prepare(
      `SELECT id, tracker_id, start_time, end_time, point_count, max_speed_kmh, notes, origin_label, destination_label
       FROM flights WHERE tracker_id = ? ORDER BY start_time DESC LIMIT ? OFFSET ?`
    ).bind(trackerId, limit, offset).all<Flight>(),
    c.var.db.prepare('SELECT COUNT(*) as count FROM flights WHERE tracker_id = ?').bind(trackerId).first<{ count: number }>(),
  ]);

  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    flights: flightsResult.results,
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

app.get('/api/flights/:id/points', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid flight id' }, 400);

  const result = await c.var.db.prepare(
    `SELECT p.lon, p.lat, p.elevation_m, p.velocity_kmh, p.course_deg, p.garmin_time
     FROM points p
     JOIN point_flights pf ON pf.point_id = p.id
     WHERE pf.flight_id = ?
     ORDER BY p.garmin_time ASC`
  ).bind(id).all<{ lon: number; lat: number; elevation_m: number | null; velocity_kmh: number | null; course_deg: number | null; garmin_time: number }>();

  if (result.results.length === 0) return c.json({ error: 'Flight not found' }, 404);

  const coordinates = result.results.map((r) => [r.lon, r.lat]);
  const point_data = result.results.map((r) => ({
    velocity_kmh: r.velocity_kmh,
    elevation_m: r.elevation_m,
    garmin_time: r.garmin_time,
    course_deg: r.course_deg,
  }));

  return c.json({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: { flight_id: id, point_count: result.results.length, point_data },
  });
});

app.post('/api/refresh', async (c) => {
  const trackerParam = c.req.query('tracker');
  if (trackerParam) {
    const trackerId = parseInt(trackerParam, 10);
    if (!isNaN(trackerId)) {
      const row = await c.var.db.prepare(
        'SELECT name, source_url, assigned_aircraft, assigned_pilot, credentials FROM trackers WHERE id = ?'
      ).bind(trackerId).first<{ name: string; source_url: string; assigned_aircraft: string | null; assigned_pilot: number | null; credentials: string | null }>();
      if (row) {
        await maybePoll(c.var.tenant, { id: trackerId, ...row }, { intervalSeconds: 30, throttleKey: 'last_quick_poll' });
      }
    }
  } else {
    await pollAllActive(c.var.tenant, { intervalSeconds: 30, throttleKey: 'last_quick_poll' });
  }
  return c.json({ ok: true });
});

app.get('/api/flights/complete', async (c) => {
  const trackerId = await resolveTrackerId(c.var.tenant, c.req.query('tracker'));
  if (trackerId === null) return c.json({ last_polled: null, live_label: null, geocode_pending: false, flights: [], warning: 'no_active_trackers' });

  // Freshness-passive: the every-minute cron owns Garmin polling (≤60s staleness
  // floor), so this handler only reads what's already in D1. Client tabs hitting
  // this on their 30/60s loop must not each pay a maybePoll claim attempt.
  const since = parseInt(c.req.query('since') ?? '0', 10) || 0;

  const [livePoint, pollState] = await Promise.all([
    c.var.db.prepare(
      `SELECT lat, lon, elevation_m, velocity_kmh, course_deg, garmin_time, location_label
       FROM points WHERE tracker_id = ? ORDER BY garmin_time DESC LIMIT 1`
    ).bind(trackerId).first<Pick<Point, 'lat' | 'lon' | 'elevation_m' | 'velocity_kmh' | 'course_deg' | 'garmin_time' | 'location_label'>>(),
    c.var.db.prepare(
      'SELECT last_polled FROM poll_state WHERE tracker_id = ?'
    ).bind(trackerId).first<{ last_polled: number }>(),
  ]);

  const { refPoint, fromNamedPoint } = await resolveRefPoint(c.var.tenant, trackerId, livePoint?.lat, livePoint?.lon);
  const liveLabel = computeLiveLabel(livePoint, refPoint);

  let geocodePending = false;
  if (!fromNamedPoint && refPoint && livePoint?.lat != null && livePoint?.lon != null) {
    const distMiles = haversineMiles(livePoint.lat, livePoint.lon, refPoint.place_lat, refPoint.place_lon);
    if (distMiles > 5) {
      geocodePending = true;
    }
  }

  interface CompleteRow {
    fid: number; start_time: number; end_time: number | null; modified_at: number;
    tracker_id: number;
    aircraft_tail: string | null; pilot_id: number | null; pilot_name: string | null;
    origin_label: string | null; destination_label: string | null;
    start_lat: number | null; start_lon: number | null;
    end_lat: number | null; end_lon: number | null;
    t: number; lat: number; lon: number;
    v: number | null; e: number | null; c: number | null;
  }
  const { results: rows } = await c.var.db.prepare(`
    SELECT
      f.id AS fid, f.tracker_id, f.start_time, f.end_time, f.modified_at,
      f.aircraft_tail, f.pilot_id, pi.name AS pilot_name,
      f.origin_label, f.destination_label,
      sp.lat AS start_lat, sp.lon AS start_lon,
      ep.lat AS end_lat,  ep.lon AS end_lon,
      p.garmin_time AS t, p.lat, p.lon,
      p.velocity_kmh AS v, p.elevation_m AS e, p.course_deg AS c
    FROM flights f
    LEFT JOIN pilots pi ON pi.id = f.pilot_id
    JOIN points sp ON sp.garmin_time = f.start_time AND sp.tracker_id = f.tracker_id
    LEFT JOIN points ep ON ep.garmin_time = f.end_time AND ep.tracker_id = f.tracker_id
    JOIN point_flights pf ON pf.flight_id = f.id
    JOIN points p ON p.id = pf.point_id
    WHERE f.tracker_id = ? AND f.modified_at > ?
    ORDER BY f.modified_at ASC, f.id ASC, p.garmin_time ASC
  `).bind(trackerId, since).all<CompleteRow>();

  const flightMap = new Map<number, FlightRecord>();
  for (const row of rows) {
    if (!flightMap.has(row.fid)) {
      flightMap.set(row.fid, {
        id: row.fid,
        tracker_id: row.tracker_id,
        start_time: row.start_time,
        end_time: row.end_time,
        modified_at: row.modified_at,
        aircraft_tail: row.aircraft_tail,
        pilot_id: row.pilot_id,
        pilot_name: row.pilot_name,
        origin_label: row.origin_label,
        destination_label: row.destination_label,
        start_lat: row.start_lat,
        start_lon: row.start_lon,
        end_lat: row.end_lat,
        end_lon: row.end_lon,
        points: [],
      });
    }
    (flightMap.get(row.fid) as FlightRecord).points.push({
      t: row.t, lat: row.lat, lon: row.lon, v: row.v, e: row.e, c: row.c,
    } as FlightPoint);
  }

  const allFlights = Array.from(flightMap.values());
  const lastModifiedAt = allFlights.length > 0
    ? allFlights.reduce((max, f) => Math.max(max, f.modified_at), 0)
    : null;

  return c.json({
    last_polled: pollState?.last_polled ?? null,
    live_label: liveLabel,
    geocode_pending: geocodePending,
    flights: allFlights,
    last_modified_at: lastModifiedAt,
  });
});

// ── Tracker management routes ─────────────────────────────────────────────────

app.get('/api/trackers', async (c) => {
  return c.json({ trackers: await queryTrackers(c.var.db) });
});

app.post('/api/trackers', requireAdmin, async (c) => {
  const body = await c.req.json<{
    name?: string; type?: string; source_url?: string;
    credentials?: Record<string, string> | null;
    assigned_aircraft?: string | null;
    assigned_pilot?: number | null;
  }>();
  const { name, type, source_url } = body;

  if (!name || !type || !source_url) {
    return c.json({ error: 'name, type, and source_url are required' }, 400);
  }

  let credJson: string | null = null;
  if (body.credentials) {
    if (type === 'inreach' && Object.keys(body.credentials).some(k => k !== 'password')) {
      return c.json({ error: 'Invalid credentials for inreach tracker' }, 400);
    }
    credJson = JSON.stringify(body.credentials);
  }

  const assigned_aircraft = body.assigned_aircraft ?? null;
  const assigned_pilot = body.assigned_pilot ?? null;

  const result = await c.var.db.prepare(
    'INSERT INTO trackers (name, type, source_url, credentials, assigned_aircraft, assigned_pilot) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(name, type, source_url, credJson, assigned_aircraft, assigned_pilot).run();

  const id = result.meta.last_row_id as number;
  await c.var.db.prepare(
    'INSERT INTO poll_state (tracker_id, last_polled, last_quick_poll) VALUES (?, 0, 0)'
  ).bind(id).run();

  invalidateTrackerCache(c.var.tenant.key);
  return c.json({ ok: true, id });
});

app.put('/api/trackers/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);

  const existing = await c.var.db.prepare('SELECT id FROM trackers WHERE id = ? AND deleted = 0')
    .bind(id).first();
  if (!existing) return c.json({ error: 'Tracker not found' }, 404);

  const body = await c.req.json<{
    name?: string; source_url?: string; active?: boolean;
    assigned_aircraft?: string | null; assigned_pilot?: number | null;
    credentials?: Record<string, string> | null;
  }>();

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
  if (body.source_url !== undefined) { sets.push('source_url = ?'); vals.push(body.source_url); }
  if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
  if (Object.prototype.hasOwnProperty.call(body, 'assigned_aircraft')) { sets.push('assigned_aircraft = ?'); vals.push(body.assigned_aircraft ?? null); }
  if (Object.prototype.hasOwnProperty.call(body, 'assigned_pilot')) { sets.push('assigned_pilot = ?'); vals.push(body.assigned_pilot ?? null); }
  if (Object.prototype.hasOwnProperty.call(body, 'credentials')) { sets.push('credentials = ?'); vals.push(body.credentials ? JSON.stringify(body.credentials) : null); }

  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  vals.push(id);
  await c.var.db.prepare(`UPDATE trackers SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals).run();

  invalidateTrackerCache(c.var.tenant.key);
  return c.json({ ok: true });
});

app.delete('/api/trackers/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);

  const existing = await c.var.db.prepare('SELECT id FROM trackers WHERE id = ? AND deleted = 0')
    .bind(id).first();
  if (!existing) return c.json({ error: 'Tracker not found' }, 404);

  await c.var.db.prepare('UPDATE trackers SET deleted = 1, active = 0 WHERE id = ?')
    .bind(id).run();

  invalidateTrackerCache(c.var.tenant.key);
  return c.json({ ok: true });
});

// Fetches a feed without storing anything, for the tracker form's "Test feed" button.
app.post('/api/trackers/test-feed', requireAdmin, async (c) => {
  type Body = { source_url?: string; credentials?: Record<string, string> | null };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  if (!body.source_url) return c.json({ error: 'source_url is required' }, 400);
  try { new URL(body.source_url); } catch { return c.json({ error: 'source_url must be a URL' }, 400); }
  const credentials = body.credentials ? JSON.stringify(body.credentials) : null;
  try {
    return c.json({ ok: true, ...await testFeed(c.var.tenant.host, body.source_url, credentials) });
  } catch (err) {
    return c.json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

// History import for tenant admins (the operator-only /api/admin/backfill does the same
// thing). Garmin returns everything from d1 onward in one response, so the client imports
// in windows (d1..d2, oldest first) and then drains geocoding a dozen boundary points at a
// time, paced for the public Overpass API. Backfills never send notifications.
app.post('/api/trackers/:id/import', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);
  const fromDate = parseDateParam(c.req.query('d1'));
  if (!fromDate) return c.json({ error: 'd1 must be a date (YYYY-MM-DD)' }, 400);
  const d2 = c.req.query('d2');
  const toDate = d2 ? parseDateParam(d2) : undefined;
  if (toDate === null) return c.json({ error: 'd2 must be a date (YYYY-MM-DD)' }, 400);
  const exists = await c.var.db.prepare('SELECT id FROM trackers WHERE id = ? AND deleted = 0').bind(id).first();
  if (!exists) return c.json({ error: 'Tracker not found' }, 404);
  try {
    const inserted = await pollAllActiveForce(c.var.tenant, id, fromDate, { toDate, updateLastPolled: false });
    return c.json({ ok: true, inserted });
  } catch (err) {
    console.error(`History import failed for tracker ${id}:`, String(err));
    return c.json({ error: String(err) }, 502);
  }
});

app.post('/api/trackers/:id/geocode', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);
  await geocodePendingPoints(c.var.tenant, id, 12);
  return c.json({ ok: true, remaining: await countUnlabeledFlights(c.var.db, id) });
});

// Points are stamped with the tracker's assignment at ingest, so anything polled (or
// backfilled) before an aircraft/pilot was assigned stays unassigned. These two routes let
// the settings UI offer to carry a new assignment over to that data. Only NULLs are
// touched, so deliberate per-flight reassignments are left alone.
app.get('/api/trackers/:id/unassigned', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);
  const row = await c.var.db.prepare(`
    SELECT
      COALESCE(SUM(aircraft_tail IS NULL), 0) AS without_aircraft,
      COALESCE(SUM(pilot_id IS NULL), 0) AS without_pilot
    FROM flights WHERE tracker_id = ?
  `).bind(id).first<{ without_aircraft: number; without_pilot: number }>();
  return c.json({ without_aircraft: row?.without_aircraft ?? 0, without_pilot: row?.without_pilot ?? 0 });
});

app.post('/api/trackers/:id/apply-assignment', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid tracker id' }, 400);
  const tracker = await c.var.db.prepare(
    'SELECT assigned_aircraft, assigned_pilot FROM trackers WHERE id = ? AND deleted = 0'
  ).bind(id).first<{ assigned_aircraft: string | null; assigned_pilot: number | null }>();
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404);

  const body = await c.req.json<{ aircraft?: boolean; pilot?: boolean }>().catch(() => ({} as { aircraft?: boolean; pilot?: boolean }));
  const stmts: D1PreparedStatement[] = [];
  if (body.aircraft && tracker.assigned_aircraft) {
    stmts.push(
      c.var.db.prepare('UPDATE flights SET aircraft_tail = ?, modified_at = unixepoch() WHERE tracker_id = ? AND aircraft_tail IS NULL')
        .bind(tracker.assigned_aircraft, id),
      c.var.db.prepare('UPDATE points SET aircraft_tail = ? WHERE tracker_id = ? AND aircraft_tail IS NULL')
        .bind(tracker.assigned_aircraft, id),
    );
  }
  if (body.pilot && tracker.assigned_pilot != null) {
    stmts.push(
      c.var.db.prepare('UPDATE flights SET pilot_id = ?, modified_at = unixepoch() WHERE tracker_id = ? AND pilot_id IS NULL')
        .bind(tracker.assigned_pilot, id),
      c.var.db.prepare('UPDATE points SET pilot_id = ? WHERE tracker_id = ? AND pilot_id IS NULL')
        .bind(tracker.assigned_pilot, id),
    );
  }
  if (stmts.length === 0) return c.json({ error: 'Nothing to apply' }, 400);
  // Recorded: each flight given an aircraft or pilot gets an edit_history row (migration 0004).
  const results = await recordedBatch(c, stmts);
  // Flight UPDATEs are at even indices (each is followed by its points UPDATE); a flight
  // missing both fields is counted by both, so report the larger count.
  const flights = Math.max(...results.filter((_, i) => i % 2 === 0).map((r) => r.meta.changes ?? 0));
  return c.json({ ok: true, flights });
});

// ── Tile overlay endpoints ─────────────────────────────────────────────────────
//
// Tenant-scoped extra tile layers shown in the map legend (see
// shared/map-controls.ts for the client-side rendering/toggling). Read is open to
// any authenticated user (same as /api/trackers); only admins can configure them.
// Requires a tile URL template with lowercase {z}/{x}/{y} tokens (or their
// uppercase equivalents, which the client normalizes to lowercase before handing
// the template to Leaflet — see _ftNormalizeTileTemplate in map-controls.ts).

function validOverlayUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  try { new URL(url); } catch { return false; }
  return /\{x\}/i.test(url) && /\{y\}/i.test(url) && /\{z\}/i.test(url);
}

// Per-basemap-preset-id override of default_enabled (e.g. {"topo": true, "satellite":
// false}) — undefined/null is valid (no overrides, just use default_enabled), but if
// present every value must be a plain boolean map, not e.g. an array or nested object.
function validBasemapDefaults(v: unknown): v is Record<string, boolean> | null | undefined {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'boolean');
}

// Backs the "Look up details" button in the add-layer and overlay forms (see
// src/tile-metadata.ts). Admin-only, like Test feed: it fetches a user-supplied URL
// server-side. A source with no published metadata is a normal, empty result.
app.get('/api/tile-metadata', requireAdmin, async (c) => {
  const url = c.req.query('url')?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);
  try {
    return c.json({ metadata: await lookupTileMetadata(url) });
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 400);
  }
});

app.get('/api/overlays', async (c) => {
  return c.json({ overlays: await queryTileOverlays(c.var.db) });
});

app.post('/api/overlays', requireAdmin, async (c) => {
  const body = await c.req.json<{
    label?: string; url?: string; attribution?: string | null; max_zoom?: number | null;
    default_enabled?: boolean; default_enabled_by_basemap?: Record<string, boolean> | null;
  }>();
  if (!body.label) return c.json({ error: 'label is required' }, 400);
  if (!validOverlayUrl(body.url)) return c.json({ error: 'url must include {z}, {x}, and {y} placeholders' }, 400);
  if (!validBasemapDefaults(body.default_enabled_by_basemap)) return c.json({ error: 'default_enabled_by_basemap must be a map of basemap id to boolean' }, 400);

  const result = await c.var.db.prepare(
    'INSERT INTO tile_overlays (label, url, attribution, max_zoom, default_enabled, default_enabled_by_basemap) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    body.label, body.url, body.attribution || null, body.max_zoom ?? null, body.default_enabled ? 1 : 0,
    body.default_enabled_by_basemap ? JSON.stringify(body.default_enabled_by_basemap) : null,
  ).run();

  return c.json({ ok: true, id: result.meta.last_row_id as number });
});

app.put('/api/overlays/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid overlay id' }, 400);

  const existing = await c.var.db.prepare('SELECT id FROM tile_overlays WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Overlay not found' }, 404);

  const body = await c.req.json<{
    label?: string; url?: string; attribution?: string | null; max_zoom?: number | null;
    default_enabled?: boolean; default_enabled_by_basemap?: Record<string, boolean> | null;
  }>();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (body.label !== undefined) {
    if (!body.label) return c.json({ error: 'label cannot be empty' }, 400);
    sets.push('label = ?'); vals.push(body.label);
  }
  if (body.url !== undefined) {
    if (!validOverlayUrl(body.url)) return c.json({ error: 'url must include {z}, {x}, and {y} placeholders' }, 400);
    sets.push('url = ?'); vals.push(body.url);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'attribution')) { sets.push('attribution = ?'); vals.push(body.attribution || null); }
  if (Object.prototype.hasOwnProperty.call(body, 'max_zoom')) { sets.push('max_zoom = ?'); vals.push(body.max_zoom ?? null); }
  if (body.default_enabled !== undefined) { sets.push('default_enabled = ?'); vals.push(body.default_enabled ? 1 : 0); }
  if (Object.prototype.hasOwnProperty.call(body, 'default_enabled_by_basemap')) {
    if (!validBasemapDefaults(body.default_enabled_by_basemap)) return c.json({ error: 'default_enabled_by_basemap must be a map of basemap id to boolean' }, 400);
    sets.push('default_enabled_by_basemap = ?');
    vals.push(body.default_enabled_by_basemap ? JSON.stringify(body.default_enabled_by_basemap) : null);
  }

  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  vals.push(id);
  await c.var.db.prepare(`UPDATE tile_overlays SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/overlays/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid overlay id' }, 400);
  const result = await c.var.db.prepare('DELETE FROM tile_overlays WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'Overlay not found' }, 404);
  return c.json({ ok: true });
});

// ── Edit history ──────────────────────────────────────────────────────────────

// Runs a route's writes as one batch with the signed-in user recorded for the
// edit_history triggers on flight_corrections and duty_days (migration 0003) and on
// flights' aircraft/pilot (0004): edit_actor is set first and cleared last, and a D1 batch
// is one transaction, so each change and its history rows land together or not at all.
// Every route that writes those goes through it. Returns the results of stmts.
async function recordedBatch(c: Context<{ Bindings: Env; Variables: Variables }>, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const db = c.var.db;
  const results = await db.batch([
    db.prepare('INSERT OR REPLACE INTO edit_actor (id, user_id, user_name) VALUES (1, ?, ?)').bind(c.var.user.id, c.var.user.name),
    ...stmts,
    db.prepare('DELETE FROM edit_actor'),
  ]);
  return results.slice(1, -1);
}

const EDIT_HISTORY_ENTITIES = new Set(['flight_corrections', 'duty_days', 'flight_assignment']);

// One record's history, newest first:
// ?entity=flight_corrections|duty_days|flight_assignment&key=<entity_key> (see migrations
// 0003 and 0004) and optionally &limit=<n> (default and maximum 100).
app.get('/api/edit-history', requireAdmin, async (c) => {
  const entity = c.req.query('entity') ?? '';
  const key = c.req.query('key') ?? '';
  if (!EDIT_HISTORY_ENTITIES.has(entity) || !key) return c.json({ error: 'entity and key required' }, 400);
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 100);
  const { results } = await c.var.db.prepare(
    'SELECT * FROM edit_history WHERE entity = ? AND entity_key = ? ORDER BY id DESC LIMIT ?'
  ).bind(entity, key, limit).all();
  c.header('Cache-Control', 'no-store');
  return c.json({ history: results });
});

// ── Bulk flight assignment route ──────────────────────────────────────────────

// The writes that set aircraft and/or pilot (undefined = unchanged) on tracked flights
// (ids: flights and their points, optionally limited to trackerId) and manual flights
// (entryIds: flight_corrections rows with no tracker). Shared by the assignment route and
// the flight form's save (POST /api/flight-corrections with assign), which batches them
// with the correction so the two land together.
function assignmentStatements(db: D1Database, { ids, entryIds, trackerId = null, aircraft_tail, pilot_id }: {
  ids: number[]; entryIds: number[]; trackerId?: number | null;
  aircraft_tail: string | null | undefined; pilot_id: number | null | undefined;
}): D1PreparedStatement[] {
  const flightSets = ['modified_at = unixepoch()'];
  const flightValsBase: (string | number | null)[] = [];
  const pointSets: string[] = [];
  const pointValsBase: (string | number | null)[] = [];

  if (aircraft_tail !== undefined) {
    flightSets.push('aircraft_tail = ?'); flightValsBase.push(aircraft_tail);
    pointSets.push('aircraft_tail = ?'); pointValsBase.push(aircraft_tail);
  }
  if (pilot_id !== undefined) {
    flightSets.push('pilot_id = ?'); flightValsBase.push(pilot_id);
    pointSets.push('pilot_id = ?'); pointValsBase.push(pilot_id);
  }

  // D1 limits to 100 bound parameters per statement; subtract the SET vars
  // (and tracker_id if present) to stay under the limit.
  const paramOverhead = Math.max(
    flightValsBase.length + (trackerId !== null ? 1 : 0),
    pointValsBase.length
  );
  const CHUNK = 100 - paramOverhead;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(', ');

    const flightVals = [...flightValsBase, ...chunk];
    stmts.push(
      trackerId !== null
        ? db.prepare(`UPDATE flights SET ${flightSets.join(', ')} WHERE id IN (${ph}) AND tracker_id = ?`).bind(...flightVals, trackerId)
        : db.prepare(`UPDATE flights SET ${flightSets.join(', ')} WHERE id IN (${ph})`).bind(...flightVals)
    );

    if (pointSets.length > 0) {
      const pointVals = [...pointValsBase, ...chunk];
      stmts.push(
        db.prepare(
          `UPDATE points SET ${pointSets.join(', ')} WHERE id IN (SELECT point_id FROM point_flights WHERE flight_id IN (${ph}))`
        ).bind(...pointVals)
      );
    }
  }
  if (pointSets.length > 0) {
    const entrySets = [...pointSets, 'updated_at = unixepoch()'];
    const ENTRY_CHUNK = 100 - pointValsBase.length;
    for (let i = 0; i < entryIds.length; i += ENTRY_CHUNK) {
      const chunk = entryIds.slice(i, i + ENTRY_CHUNK);
      stmts.push(db.prepare(
        `UPDATE flight_corrections SET ${entrySets.join(', ')} WHERE tracker_id IS NULL AND id IN (${chunk.map(() => '?').join(', ')})`
      ).bind(...pointValsBase, ...chunk));
    }
  }
  return stmts;
}

// Sets aircraft and/or pilot on tracked flights (flight_ids, written to flights and their
// points) and manual flights (entry_ids, flight_corrections rows with no tracker).
app.put('/api/flights/assignment', requireAdmin, async (c) => {
  const body = await c.req.json<{ flight_ids?: unknown; entry_ids?: unknown; aircraft_tail?: string | null; pilot_id?: number | null }>();

  const intList = (v: unknown) => Array.isArray(v)
    ? (v as unknown[]).filter((id): id is number => typeof id === 'number' && Number.isInteger(id))
    : null;
  const ids = intList(body.flight_ids ?? []);
  const entryIds = intList(body.entry_ids ?? []);
  if (ids === null || entryIds === null) return c.json({ error: 'flight_ids and entry_ids must be arrays' }, 400);
  if (ids.length === 0 && entryIds.length === 0) return c.json({ error: 'No valid flight IDs' }, 400);

  const hasAircraft = Object.prototype.hasOwnProperty.call(body, 'aircraft_tail');
  const hasPilot = Object.prototype.hasOwnProperty.call(body, 'pilot_id');
  if (!hasAircraft && !hasPilot) return c.json({ error: 'aircraft_tail or pilot_id required' }, 400);

  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerParam !== undefined && (trackerId === null || Number.isNaN(trackerId))) {
    return c.json({ error: 'tracker must be an integer' }, 400);
  }

  const aircraft_tail = hasAircraft ? (body.aircraft_tail ?? null) : undefined;
  const pilot_id = hasPilot ? (body.pilot_id ?? null) : undefined;
  // A manual flight always has a pilot (flight_corrections CHECK).
  if (entryIds.length > 0 && hasPilot && pilot_id === null) {
    return c.json({ error: 'Manual flights need a pilot' }, 400);
  }

  const stmts = assignmentStatements(c.var.db, { ids, entryIds, trackerId, aircraft_tail, pilot_id });
  await recordedBatch(c, stmts);

  let pilot_name: string | null = null;
  if (pilot_id != null) {
    const pilot = await c.var.db.prepare('SELECT name FROM pilots WHERE id = ?')
      .bind(pilot_id).first<{ name: string }>();
    pilot_name = pilot?.name ?? null;
  }

  const responseBody: Record<string, unknown> = { ok: true };
  if (aircraft_tail !== undefined) responseBody.aircraft_tail = aircraft_tail;
  if (pilot_id !== undefined) { responseBody.pilot_id = pilot_id; responseBody.pilot_name = pilot_name; }
  return c.json(responseBody);
});

// ── Flight corrections and pilot duty log routes ──────────────────────────────
// Corrections and manual flights (flight_corrections), applied by the client's flight
// store to every page's flights, and duty/rest days (duty_days), read by the duty log.
// See docs/duty-log-editing-plan.md and docs/flight-editor-plan.md.

type EntryFields = Pick<FlightCorrection,
  'start_time' | 'end_time' | 'origin_label' | 'destination_label' | 'remark' |
  'start_lat' | 'start_lon' | 'end_lat' | 'end_lon' | 'part91' | 'unpaid' | 'excluded' | 'pilot_id' | 'aircraft_tail'>;

const ENTRY_COLUMNS = [
  'start_time', 'end_time', 'origin_label', 'destination_label', 'remark',
  'start_lat', 'start_lon', 'end_lat', 'end_lon', 'part91', 'unpaid', 'excluded', 'pilot_id', 'aircraft_tail',
] as const;

// A tracked-flight row that no longer changes anything; such rows are deleted rather than
// kept, so "has a row" stays the same as "has corrections".
const EMPTY_TRACKED_ENTRY_SQL =
  `tracker_id IS NOT NULL AND start_time IS NULL AND end_time IS NULL AND origin_label IS NULL
   AND destination_label IS NULL AND remark IS NULL AND part91 = 0 AND excluded = 0`;

// "HH:MM" → itself, null/'' → null, anything else → undefined (invalid).
function hhmm(v: unknown): string | null | undefined {
  if (v == null || v === '') return null;
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
}

// Validates a flight_corrections body (the form's full state) for a tracked-flight
// correction or a manual flight. Returns the column values or an error message.
async function parseEntryFields(db: D1Database, body: Record<string, unknown>, tracked: boolean): Promise<EntryFields | string> {
  const int = (k: string): number | null | string => {
    const v = body[k];
    if (v == null) return null;
    return typeof v === 'number' && Number.isInteger(v) ? v : `${k} must be an integer or null`;
  };
  const num = (k: string, max: number): number | null | string => {
    const v = body[k];
    if (v == null) return null;
    return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : `${k} must be a coordinate or null`;
  };
  const text = (k: string): string | null | { error: string } => {
    const v = body[k];
    if (v == null) return null;
    if (typeof v !== 'string') return { error: `${k} must be a string or null` };
    const t = v.trim();
    if (t.length > MAX_FLIGHT_TEXT_LENGTH) return { error: `${k} must be at most ${MAX_FLIGHT_TEXT_LENGTH} characters` };
    return t || null;
  };
  const start_time = int('start_time');
  const end_time = int('end_time');
  const pilot_id = int('pilot_id');
  const start_lat = num('start_lat', 90), start_lon = num('start_lon', 180);
  const end_lat = num('end_lat', 90), end_lon = num('end_lon', 180);
  for (const v of [start_time, end_time, pilot_id, start_lat, start_lon, end_lat, end_lon]) if (typeof v === 'string') return v;
  const origin_label = text('origin_label');
  const destination_label = text('destination_label');
  const remark = text('remark');
  const aircraft_tail = text('aircraft_tail');
  for (const v of [origin_label, destination_label, remark, aircraft_tail]) if (v && typeof v === 'object') return v.error;

  const fields: EntryFields = {
    start_time: start_time as number | null,
    end_time: end_time as number | null,
    origin_label: origin_label as string | null,
    destination_label: destination_label as string | null,
    remark: remark as string | null,
    start_lat: start_lat as number | null,
    start_lon: start_lon as number | null,
    end_lat: end_lat as number | null,
    end_lon: end_lon as number | null,
    part91: body.part91 ? 1 : 0,
    unpaid: body.unpaid ? 1 : 0,
    excluded: body.excluded ? 1 : 0,
    pilot_id: pilot_id as number | null,
    aircraft_tail: aircraft_tail as string | null,
  };
  if (fields.start_time != null && fields.end_time != null && fields.end_time <= fields.start_time) {
    return 'end_time must be after start_time';
  }
  // Part 135 is flying for compensation, so only Part 91 can be unpaid.
  if (fields.unpaid && !fields.part91) return 'Only a Part 91 flight can be unpaid';
  if ((fields.start_lat == null) !== (fields.start_lon == null) || (fields.end_lat == null) !== (fields.end_lon == null)) {
    return 'Set both latitude and longitude of an endpoint, or neither';
  }
  if (tracked) {
    // A tracked flight's pilot and aircraft live on the flight (PUT /api/flights/assignment).
    if (fields.pilot_id != null || fields.aircraft_tail != null) {
      return 'pilot_id and aircraft_tail are set through /api/flights/assignment for tracked flights';
    }
    // Its coordinates come from its points.
    if (fields.start_lat != null || fields.end_lat != null) return 'Tracked flights take coordinates from their points';
  } else {
    if (fields.pilot_id == null) return 'pilot_id is required';
    if (fields.start_time == null || fields.end_time == null) return 'start_time and end_time are required';
  }
  if (fields.pilot_id != null &&
      !await db.prepare('SELECT 1 FROM pilots WHERE id = ?').bind(fields.pilot_id).first()) {
    return 'Pilot not found';
  }
  if (fields.aircraft_tail != null &&
      !await db.prepare('SELECT 1 FROM aircraft WHERE tail_number = ?').bind(fields.aircraft_tail).first()) {
    return 'Aircraft not found';
  }
  return fields;
}

function isEmptyTrackedEntry(f: EntryFields): boolean {
  return f.start_time == null && f.end_time == null && f.origin_label == null &&
    f.destination_label == null && f.remark == null && !f.part91 && !f.excluded;
}

// A tracked-flight save's optional assignment: { flight_id, aircraft_tail?, pilot_id? }
// (a key left out = unchanged). Returns null when there's nothing to assign, the
// validated change, or an error message.
async function parseTrackedAssign(db: D1Database, v: unknown, trackerId: number): Promise<
  { flight_id: number; set: { aircraft_tail: string | null | undefined; pilot_id: number | null | undefined } } | null | string> {
  if (v == null) return null;
  if (typeof v !== 'object') return 'assign must be an object';
  const a = v as Record<string, unknown>;
  if (!Number.isInteger(a.flight_id)) return 'assign.flight_id must be an integer';
  const has = (k: string) => Object.prototype.hasOwnProperty.call(a, k);
  if (!has('aircraft_tail') && !has('pilot_id')) return null;
  const aircraft_tail = has('aircraft_tail') ? a.aircraft_tail ?? null : undefined;
  const pilot_id = has('pilot_id') ? a.pilot_id ?? null : undefined;
  if (aircraft_tail != null && typeof aircraft_tail !== 'string') return 'assign.aircraft_tail must be a string or null';
  if (pilot_id != null && !Number.isInteger(pilot_id)) return 'assign.pilot_id must be an integer or null';
  if (!await db.prepare('SELECT 1 FROM flights WHERE id = ? AND tracker_id = ?').bind(a.flight_id, trackerId).first()) {
    return 'Flight not found (it may have just been re-recorded; reload and try again)';
  }
  if (pilot_id != null && !await db.prepare('SELECT 1 FROM pilots WHERE id = ?').bind(pilot_id).first()) return 'Pilot not found';
  if (aircraft_tail != null && !await db.prepare('SELECT 1 FROM aircraft WHERE tail_number = ?').bind(aircraft_tail).first()) {
    return 'Aircraft not found';
  }
  return { flight_id: a.flight_id as number, set: { aircraft_tail: aircraft_tail as string | null | undefined, pilot_id: pilot_id as number | null | undefined } };
}

// Every row, for the flight store to apply to its flights. ?version=<n> (the client's
// cached flight_corrections_version) returns { version, unchanged: true } when nothing has been
// written since, so a refresh costs one single-row read. Readable by anyone signed in,
// like the flights it's applied to; only writes are admin-only.
// The client's cache key for the rows: the write counter plus the row count and newest
// updated_at, so a counter that restarts (a reset or recreated database) can't match a
// stale cached copy by accident. Opaque to the client.
const ENTRIES_VERSION_SQL =
  `SELECT version || '.' || (SELECT COUNT(*) FROM flight_corrections) || '.' ||
          (SELECT COALESCE(MAX(updated_at), 0) FROM flight_corrections) AS version
   FROM flight_corrections_version WHERE id = 1`;

app.get('/api/flight-corrections', async (c) => {
  c.header('Cache-Control', 'no-store');
  const current = await c.var.db.prepare(ENTRIES_VERSION_SQL).first<{ version: string }>();
  const version = current?.version ?? '0';
  if (c.req.query('version') === version) return c.json({ version, unchanged: true });
  // Re-read the version alongside the rows, so they match even if a write came in between.
  const [v, entries] = await c.var.db.batch([
    c.var.db.prepare(ENTRIES_VERSION_SQL),
    c.var.db.prepare('SELECT * FROM flight_corrections ORDER BY id'),
  ]);
  return c.json({
    version: (v.results[0] as { version: string } | undefined)?.version ?? '0',
    entries: entries.results as FlightCorrection[],
  });
});

// One pilot's duty/rest days. Flights (with corrections) come from the flight store.
app.get('/api/duty-days', async (c) => {
  const pilotId = parseInt(c.req.query('pilot') ?? '', 10);
  if (Number.isNaN(pilotId)) return c.json({ error: 'pilot must be an integer' }, 400);
  const { results } = await c.var.db.prepare('SELECT * FROM duty_days WHERE pilot_id = ? ORDER BY date')
    .bind(pilotId).all<DutyDay>();
  c.header('Cache-Control', 'no-store');
  return c.json({ days: results });
});

app.post('/api/flight-corrections', requireAdmin, async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const tracked = body.tracker_id != null || body.flight_start_time != null;
  if (tracked && !(Number.isInteger(body.tracker_id) && Number.isInteger(body.flight_start_time))) {
    return c.json({ error: 'tracker_id and flight_start_time must both be integers' }, 400);
  }
  const fields = await parseEntryFields(c.var.db, body, tracked);
  if (typeof fields === 'string') return c.json({ error: fields }, 400);
  const vals = ENTRY_COLUMNS.map(k => fields[k]);

  let entry: FlightCorrection | null;
  if (tracked) {
    if (!await c.var.db.prepare('SELECT 1 FROM trackers WHERE id = ?').bind(body.tracker_id).first()) {
      return c.json({ error: 'Tracker not found' }, 400);
    }
    // The flight form's aircraft/pilot change ({ flight_id, aircraft_tail?, pilot_id? }),
    // written in the same batch as the correction so a save lands whole or not at all.
    const assign = await parseTrackedAssign(c.var.db, body.assign, body.tracker_id as number);
    if (typeof assign === 'string') return c.json({ error: assign }, 400);
    const assignStmts = assign ? assignmentStatements(c.var.db, { ids: [assign.flight_id], entryIds: [], ...assign.set }) : [];
    if (isEmptyTrackedEntry(fields)) {
      await recordedBatch(c, [
        c.var.db.prepare('DELETE FROM flight_corrections WHERE tracker_id = ? AND flight_start_time = ?')
          .bind(body.tracker_id, body.flight_start_time),
        ...assignStmts,
      ]);
      return c.json({ entry: null });
    }
    const [upsert] = await recordedBatch(c, [
      c.var.db.prepare(
        `INSERT INTO flight_corrections (tracker_id, flight_start_time, ${ENTRY_COLUMNS.join(', ')})
         VALUES (?, ?, ${ENTRY_COLUMNS.map(() => '?').join(', ')})
         ON CONFLICT (tracker_id, flight_start_time) DO UPDATE SET
           ${ENTRY_COLUMNS.map(k => `${k} = excluded.${k}`).join(', ')}, updated_at = unixepoch()
         RETURNING *`
      ).bind(body.tracker_id, body.flight_start_time, ...vals),
      ...assignStmts,
    ]);
    entry = (upsert.results[0] as FlightCorrection | undefined) ?? null;
  } else {
    const [insert] = await recordedBatch(c, [c.var.db.prepare(
      `INSERT INTO flight_corrections (${ENTRY_COLUMNS.join(', ')})
       VALUES (${ENTRY_COLUMNS.map(() => '?').join(', ')}) RETURNING *`
    ).bind(...vals)]);
    entry = (insert.results[0] as FlightCorrection | undefined) ?? null;
  }
  return c.json({ entry });
});

// Updates a manual flight (the body is the form's full state).
app.put('/api/flight-corrections/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const existing = await c.var.db.prepare('SELECT tracker_id FROM flight_corrections WHERE id = ?')
    .bind(id).first<{ tracker_id: number | null }>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  // A tracked flight's correction is saved by POST (keyed by tracker and start time), which
  // also takes the flight's aircraft/pilot change and drops a row left empty.
  if (existing.tracker_id != null) {
    return c.json({ error: 'Tracked-flight corrections are saved with POST /api/flight-corrections' }, 400);
  }
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const fields = await parseEntryFields(c.var.db, body, false);
  if (typeof fields === 'string') return c.json({ error: fields }, 400);
  const [update] = await recordedBatch(c, [c.var.db.prepare(
    `UPDATE flight_corrections SET ${ENTRY_COLUMNS.map(k => `${k} = ?`).join(', ')}, updated_at = unixepoch()
     WHERE id = ? RETURNING *`
  ).bind(...ENTRY_COLUMNS.map(k => fields[k]), id)]);
  return c.json({ entry: (update.results[0] as FlightCorrection | undefined) ?? null });
});

// Sets Part 91 and/or removed on many flights at once (the flight editor's bulk actions),
// in one batch. Tracked flights are upserted keeping their other corrections; manual
// flights are updated by id. Setting Part 135 clears unpaid (only Part 91 can be unpaid).
// Tracked rows left with nothing in them are deleted.
app.post('/api/flight-corrections/bulk', requireAdmin, async (c) => {
  let body: { flights?: unknown; set?: { part91?: unknown; excluded?: unknown } };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (!Array.isArray(body.flights) || body.flights.length === 0) return c.json({ error: 'flights must be a non-empty array' }, 400);
  if (body.flights.length > 5000) return c.json({ error: 'At most 5000 flights at a time' }, 400);
  const set = body.set ?? {};
  const flag = (v: unknown): number | null => v === undefined ? null : (v ? 1 : 0);
  const part91 = flag(set.part91), excluded = flag(set.excluded);
  if (part91 === null && excluded === null) return c.json({ error: 'set.part91 or set.excluded required' }, 400);

  const tracked: { tracker_id: number; flight_start_time: number }[] = [];
  const entryIds: number[] = [];
  for (const f of body.flights as Record<string, unknown>[]) {
    if (f && Number.isInteger(f.entry_id)) entryIds.push(f.entry_id as number);
    else if (f && Number.isInteger(f.tracker_id) && Number.isInteger(f.flight_start_time)) {
      tracked.push({ tracker_id: f.tracker_id as number, flight_start_time: f.flight_start_time as number });
    } else {
      return c.json({ error: 'Each flight needs tracker_id and flight_start_time, or entry_id' }, 400);
    }
  }
  const trackerIds = [...new Set(tracked.map(f => f.tracker_id))];
  if (trackerIds.length) {
    const { results } = await c.var.db.prepare(
      `SELECT id FROM trackers WHERE id IN (${trackerIds.map(() => '?').join(', ')})`
    ).bind(...trackerIds).all<{ id: number }>();
    if (results.length !== trackerIds.length) return c.json({ error: 'Tracker not found' }, 400);
  }

  // One statement per kind of flight, whatever the selection's size (json_each over the
  // refs), so a large selection stays well inside D1's per-request query limit.
  const stmts: D1PreparedStatement[] = [];
  if (tracked.length) {
    // A flight with no row only needs one when this sets Part 91 or removed; otherwise
    // (Part 135, restore) only existing rows are updated, so a flight with no corrections
    // doesn't get a row inserted and then deleted as empty (two pointless history rows).
    stmts.push(part91 === 1 || excluded === 1
      ? c.var.db.prepare(
        `INSERT INTO flight_corrections (tracker_id, flight_start_time, part91, excluded)
         SELECT json_extract(value, '$.tracker_id'), json_extract(value, '$.flight_start_time'), COALESCE(?2, 0), COALESCE(?3, 0)
         FROM json_each(?1) WHERE true
         ON CONFLICT (tracker_id, flight_start_time) DO UPDATE SET
           part91 = COALESCE(?2, part91), unpaid = CASE WHEN COALESCE(?2, part91) = 0 THEN 0 ELSE unpaid END,
           excluded = COALESCE(?3, excluded), updated_at = unixepoch()`
      ).bind(JSON.stringify(tracked), part91, excluded)
      : c.var.db.prepare(
        `UPDATE flight_corrections SET part91 = COALESCE(?2, part91), unpaid = CASE WHEN COALESCE(?2, part91) = 0 THEN 0 ELSE unpaid END,
           excluded = COALESCE(?3, excluded), updated_at = unixepoch()
         WHERE (tracker_id, flight_start_time) IN
           (SELECT json_extract(value, '$.tracker_id'), json_extract(value, '$.flight_start_time') FROM json_each(?1))`
      ).bind(JSON.stringify(tracked), part91, excluded));
  }
  if (entryIds.length) {
    stmts.push(c.var.db.prepare(
      `UPDATE flight_corrections SET part91 = COALESCE(?2, part91), unpaid = CASE WHEN COALESCE(?2, part91) = 0 THEN 0 ELSE unpaid END,
         excluded = COALESCE(?3, excluded), updated_at = unixepoch()
       WHERE id IN (SELECT value FROM json_each(?1))`
    ).bind(JSON.stringify(entryIds), part91, excluded));
  }
  stmts.push(c.var.db.prepare(`DELETE FROM flight_corrections WHERE ${EMPTY_TRACKED_ENTRY_SQL}`));
  await recordedBatch(c, stmts);
  return c.json({ ok: true });
});

app.delete('/api/flight-corrections/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const [result] = await recordedBatch(c, [c.var.db.prepare('DELETE FROM flight_corrections WHERE id = ?').bind(id)]);
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

function parseDutyDayKey(c: Context<{ Bindings: Env; Variables: Variables }>): { pilotId: number; date: string } | string {
  const pilotId = parseInt(c.req.param('pilot') ?? '', 10);
  const date = c.req.param('date') ?? '';
  if (Number.isNaN(pilotId)) return 'Invalid pilot id';
  if (!isDateKey(date)) return 'date must be YYYY-MM-DD';
  return { pilotId, date };
}

type DutyDayFields = { dutyStart: string | null; dutyEnd: string | null; rest: number; note: string | null };

// Validates a duty-day body ({ duty_start, duty_end, rest, note }). Returns the fields or
// an error message.
function parseDutyDayFields(body: { duty_start?: unknown; duty_end?: unknown; rest?: unknown; note?: unknown }): DutyDayFields | string {
  const dutyStart = hhmm(body.duty_start);
  const dutyEnd = hhmm(body.duty_end);
  if (dutyStart === undefined || dutyEnd === undefined) return 'Duty times must be HH:MM';
  if ((dutyStart == null) !== (dutyEnd == null)) return 'Set both duty start and end, or neither';
  const rest = body.rest ? 1 : 0;
  if (rest && dutyStart != null) return 'A rest day has no duty times';
  if (body.note != null && typeof body.note !== 'string') return 'note must be a string';
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (note != null && note.length > MAX_DUTY_NOTE_LENGTH) return `The note must be at most ${MAX_DUTY_NOTE_LENGTH} characters`;
  return { dutyStart, dutyEnd, rest, note };
}

// The write that sets one pilot's dates to fields: one statement whatever the number of
// dates (json_each over them), since D1 counts each statement in a batch against its
// per-request query limit. A day with nothing left to record is cleared rather than kept
// as an empty row. rest_designated_at records when rest was first marked (FAA
// interpretations require rest to be known in advance), so later edits to the note keep
// it; unmarking rest clears it.
function dutyDayStatement(db: D1Database, pilotId: number, dates: string[], f: DutyDayFields): D1PreparedStatement {
  if (!f.rest && f.dutyStart == null && f.note == null) {
    return db.prepare('DELETE FROM duty_days WHERE pilot_id = ? AND date IN (SELECT value FROM json_each(?))')
      .bind(pilotId, JSON.stringify(dates));
  }
  // WHERE true: SQLite needs it to parse an upsert's ON CONFLICT after a SELECT.
  return db.prepare(
    `INSERT INTO duty_days (pilot_id, date, duty_start, duty_end, rest, rest_designated_at, note)
     SELECT ?1, value, ?3, ?4, ?5, CASE WHEN ?5 = 1 THEN unixepoch() END, ?6 FROM json_each(?2) WHERE true
     ON CONFLICT (pilot_id, date) DO UPDATE SET
       duty_start = excluded.duty_start, duty_end = excluded.duty_end, rest = excluded.rest, note = excluded.note,
       rest_designated_at = CASE WHEN excluded.rest = 1 THEN COALESCE(duty_days.rest_designated_at, unixepoch()) END`
  ).bind(pilotId, JSON.stringify(dates), f.dutyStart, f.dutyEnd, f.rest, f.note);
}

// { dates: [YYYY-MM-DD, …] } of a range request, or an error message.
function parseDutyDates(v: unknown): string[] | string {
  if (!Array.isArray(v) || v.length === 0) return 'dates must be a non-empty array';
  if (v.length > MAX_DUTY_DAYS_PER_REQUEST) return `At most ${MAX_DUTY_DAYS_PER_REQUEST} days at a time`;
  for (const d of v) {
    if (typeof d !== 'string' || !isDateKey(d)) {
      return 'dates must be YYYY-MM-DD';
    }
  }
  return [...new Set(v as string[])];
}

async function pilotExists(db: D1Database, pilotId: number): Promise<boolean> {
  return !!await db.prepare('SELECT 1 FROM pilots WHERE id = ?').bind(pilotId).first();
}

app.put('/api/duty-days/:pilot/:date', requireAdmin, async (c) => {
  const key = parseDutyDayKey(c);
  if (typeof key === 'string') return c.json({ error: key }, 400);
  let body: { duty_start?: unknown; duty_end?: unknown; rest?: unknown; note?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const fields = parseDutyDayFields(body);
  if (typeof fields === 'string') return c.json({ error: fields }, 400);
  if (!await pilotExists(c.var.db, key.pilotId)) return c.json({ error: 'Pilot not found' }, 404);
  await recordedBatch(c, [dutyDayStatement(c.var.db, key.pilotId, [key.date], fields)]);
  return c.json({ ok: true });
});

// The same for many dates at once ({ dates, duty_start, duty_end, rest, note }), in one
// statement: the day form's Through range. All the days are written, or none.
app.put('/api/duty-days/:pilot', requireAdmin, async (c) => {
  const pilotId = parseInt(c.req.param('pilot') ?? '', 10);
  if (Number.isNaN(pilotId)) return c.json({ error: 'Invalid pilot id' }, 400);
  let body: { dates?: unknown; duty_start?: unknown; duty_end?: unknown; rest?: unknown; note?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const dates = parseDutyDates(body.dates);
  if (typeof dates === 'string') return c.json({ error: dates }, 400);
  const fields = parseDutyDayFields(body);
  if (typeof fields === 'string') return c.json({ error: fields }, 400);
  if (!await pilotExists(c.var.db, pilotId)) return c.json({ error: 'Pilot not found' }, 404);
  await recordedBatch(c, [dutyDayStatement(c.var.db, pilotId, dates, fields)]);
  return c.json({ ok: true });
});

app.delete('/api/duty-days/:pilot/:date', requireAdmin, async (c) => {
  const key = parseDutyDayKey(c);
  if (typeof key === 'string') return c.json({ error: key }, 400);
  await recordedBatch(c, [c.var.db.prepare('DELETE FROM duty_days WHERE pilot_id = ? AND date = ?').bind(key.pilotId, key.date)]);
  return c.json({ ok: true });
});

// Clears many dates at once ({ dates }), in one statement.
app.post('/api/duty-days/:pilot/clear', requireAdmin, async (c) => {
  const pilotId = parseInt(c.req.param('pilot') ?? '', 10);
  if (Number.isNaN(pilotId)) return c.json({ error: 'Invalid pilot id' }, 400);
  let body: { dates?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const dates = parseDutyDates(body.dates);
  if (typeof dates === 'string') return c.json({ error: dates }, 400);
  await recordedBatch(c, [c.var.db.prepare('DELETE FROM duty_days WHERE pilot_id = ? AND date IN (SELECT value FROM json_each(?))')
    .bind(pilotId, JSON.stringify(dates))]);
  return c.json({ ok: true });
});

// ── Aircraft management routes ────────────────────────────────────────────────

app.get('/api/aircraft', async (c) => {
  return c.json({ aircraft: await queryAircraft(c.var.db, c.req.query('active') === '1') });
});

app.post('/api/aircraft', requireAdmin, async (c) => {
  const body = await c.req.json<{ tail_number?: string; name?: string }>();
  if (!body.tail_number) return c.json({ error: 'tail_number is required' }, 400);
  await c.var.db.prepare('INSERT INTO aircraft (tail_number, name) VALUES (?, ?)')
    .bind(body.tail_number.toUpperCase(), body.name ?? null).run();
  return c.json({ ok: true });
});

app.put('/api/aircraft/:tail', requireAdmin, async (c) => {
  const tail = c.req.param('tail');
  const existing = await c.var.db.prepare('SELECT tail_number FROM aircraft WHERE tail_number = ?')
    .bind(tail).first();
  if (!existing) return c.json({ error: 'Aircraft not found' }, 404);

  type AircraftUpdateBody = {
    name?: string | null;
    active?: boolean;
    hobbs_time?: number | null;
    hobbs_recorded_at?: number | null;
    hobbs_correction?: number;
    tach_time?: number | null;
    tach_recorded_at?: number | null;
    tach_correction?: number;
    maintenance_schedule?: unknown[] | null;
  };
  const body = await c.req.json<AircraftUpdateBody>();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name')) { sets.push('name = ?'); vals.push(body.name ?? null); }
  if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
  if (has('hobbs_time')) {
    sets.push('hobbs_time = ?'); vals.push(body.hobbs_time ?? null);
    if (!has('hobbs_recorded_at')) { sets.push('hobbs_recorded_at = ?'); vals.push(Math.floor(Date.now() / 1000)); }
  }
  if (has('hobbs_recorded_at')) { sets.push('hobbs_recorded_at = ?'); vals.push(body.hobbs_recorded_at ?? null); }
  if (has('hobbs_correction')) { sets.push('hobbs_correction = ?'); vals.push(body.hobbs_correction!); }
  if (has('tach_time')) {
    sets.push('tach_time = ?'); vals.push(body.tach_time ?? null);
    if (!has('tach_recorded_at')) { sets.push('tach_recorded_at = ?'); vals.push(Math.floor(Date.now() / 1000)); }
  }
  if (has('tach_recorded_at')) { sets.push('tach_recorded_at = ?'); vals.push(body.tach_recorded_at ?? null); }
  if (has('tach_correction')) { sets.push('tach_correction = ?'); vals.push(body.tach_correction!); }
  if (has('maintenance_schedule')) {
    sets.push('maintenance_schedule = ?');
    vals.push(body.maintenance_schedule != null ? JSON.stringify(body.maintenance_schedule) : null);
  }

  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);
  vals.push(tail);
  await c.var.db.prepare(`UPDATE aircraft SET ${sets.join(', ')} WHERE tail_number = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ── Pilot management routes ───────────────────────────────────────────────────

app.get('/api/pilots', async (c) => {
  return c.json({ pilots: await queryPilots(c.var.db, c.req.query('active') === '1') });
});

app.post('/api/pilots', requireAdmin, async (c) => {
  const body = await c.req.json<{ name?: string }>();
  if (!body.name) return c.json({ error: 'name is required' }, 400);
  const result = await c.var.db.prepare('INSERT INTO pilots (name) VALUES (?)').bind(body.name).run();
  return c.json({ ok: true, id: result.meta.last_row_id as number });
});

app.put('/api/pilots/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid pilot id' }, 400);
  const existing = await c.var.db.prepare('SELECT id FROM pilots WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Pilot not found' }, 404);

  const body = await c.req.json<{ name?: string; active?: boolean; default_duty_start?: unknown; default_duty_end?: unknown }>();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
  if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
  // The usual duty period: both HH:MM, or both null to clear it.
  if (body.default_duty_start !== undefined || body.default_duty_end !== undefined) {
    const start = hhmm(body.default_duty_start), end = hhmm(body.default_duty_end);
    if (start === undefined || end === undefined) return c.json({ error: 'Default duty times must be HH:MM' }, 400);
    if ((start == null) !== (end == null)) return c.json({ error: 'Set both default duty start and end, or neither' }, 400);
    sets.push('default_duty_start = ?', 'default_duty_end = ?'); vals.push(start, end);
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);
  vals.push(id);
  await c.var.db.prepare(`UPDATE pilots SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

app.post('/api/admin/bootstrap', async (c) => {
  let body: { name?: string; expires_in_hours?: number } = {};
  try { body = await c.req.json(); } catch { /* no body */ }
  const name = body.name ?? 'Admin';
  const expiresInHours = body.expires_in_hours ?? 24;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const token = generateToken();
  await c.var.db.prepare(
    `INSERT INTO invite_tokens (token, type, invited_name, invited_role, expires_at) VALUES (?, 'invite', ?, 'admin', ?)`
  ).bind(token, name, expiresAt).run();
  return c.json({ url: `/join/${token}`, token });
});

app.post('/api/admin/wipe-points', async (c) => {
  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerId !== null && !isNaN(trackerId)) {
    await c.var.db.batch([
      c.var.db.prepare('DELETE FROM point_flights WHERE flight_id IN (SELECT id FROM flights WHERE tracker_id = ?)').bind(trackerId),
      c.var.db.prepare('DELETE FROM flights WHERE tracker_id = ?').bind(trackerId),
      c.var.db.prepare('DELETE FROM points WHERE tracker_id = ?').bind(trackerId),
    ]);
  } else {
    await c.var.db.batch([
      c.var.db.prepare('DELETE FROM point_flights'),
      c.var.db.prepare('DELETE FROM flights'),
      c.var.db.prepare('DELETE FROM points'),
    ]);
  }
  return c.json({ ok: true });
});

app.post('/api/admin/resegment', async (c) => {
  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerId !== null && !isNaN(trackerId)) {
    await resegment(c.var.db, trackerId);
  } else {
    const { results } = await c.var.db.prepare(
      'SELECT id FROM trackers WHERE deleted = 0 ORDER BY id ASC'
    ).all<{ id: number }>();
    for (const row of results) {
      await resegment(c.var.db, row.id);
    }
  }
  const count = await c.var.db.prepare('SELECT COUNT(*) as count FROM flights').first<{ count: number }>();
  return c.json({ ok: true, flights: count?.count ?? 0 });
});

app.post('/api/admin/poll', async (c) => {
  const geocode = c.req.query('geocode') === '1';
  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerId !== null && isNaN(trackerId)) return c.json({ error: 'tracker must be an integer' }, 400);
  const inserted = await pollAllActiveForce(c.var.tenant, trackerId, undefined, { geocode });
  return c.json({ ok: true, inserted });
});

app.post('/api/admin/geocode-pending', async (c) => {
  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerId !== null && !isNaN(trackerId)) {
    c.executionCtx.waitUntil(geocodePendingPoints(c.var.tenant, trackerId, 12));
  } else {
    const { results } = await c.var.db.prepare(
      'SELECT id FROM trackers WHERE deleted = 0 ORDER BY id ASC'
    ).all<{ id: number }>();
    c.executionCtx.waitUntil(
      (async () => { for (const r of results) await geocodePendingPoints(c.var.tenant, r.id, 12); })()
    );
  }
  return c.json({ ok: true });
});

app.post('/api/admin/geocode-live', async (c) => {
  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  if (trackerId !== null && !isNaN(trackerId)) {
    c.executionCtx.waitUntil(geocodeLivePoint(c.var.tenant, trackerId));
  } else {
    const { results } = await c.var.db.prepare(
      'SELECT id FROM trackers WHERE deleted = 0 ORDER BY id ASC'
    ).all<{ id: number }>();
    c.executionCtx.waitUntil(
      (async () => { for (const r of results) await geocodeLivePoint(c.var.tenant, r.id); })()
    );
  }
  return c.json({ ok: true });
});

app.post('/api/admin/backfill', async (c) => {
  const d1Str = c.req.query('d1');
  const fromDate = parseDateParam(d1Str);
  if (!fromDate) return c.json({ error: 'd1 must be a date (YYYY-MM-DD)' }, 400);

  // Optional end date: Garmin returns everything from d1 onward in one response, so a
  // long history is backfilled in windows, oldest first.
  const d2Str = c.req.query('d2');
  const toDate = d2Str ? parseDateParam(d2Str) : undefined;
  if (toDate === null) return c.json({ error: 'd2 must be a date (YYYY-MM-DD)' }, 400);

  const trackerParam = c.req.query('tracker');
  const trackerId = trackerParam ? parseInt(trackerParam, 10) : null;
  const inserted = await pollAllActiveForce(c.var.tenant, trackerId ?? null, fromDate, { toDate });
  return c.json({ ok: true, inserted, from: d1Str, to: d2Str ?? null });
});

// ── Analytics endpoints ───────────────────────────────────────────────────────

interface AnalyticFlightRow {
  id: number; start_time: number; end_time: number;
  start_lat: number; start_lon: number; end_lat: number; end_lon: number;
}

interface AnalyticPointRow { lat: number; lon: number; flight_id: number; }

app.get('/api/analytics/flights', async (c) => {
  const cacheKey = new Request(c.req.url);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const result = await c.var.db.prepare(`
    SELECT f.id, f.start_time, f.end_time,
           sp.lat AS start_lat, sp.lon AS start_lon,
           ep.lat AS end_lat,   ep.lon AS end_lon
    FROM flights f
    JOIN points sp ON sp.garmin_time = f.start_time AND sp.tracker_id = f.tracker_id
    JOIN points ep ON ep.garmin_time = f.end_time   AND ep.tracker_id = f.tracker_id
    WHERE f.end_time IS NOT NULL
    ORDER BY f.start_time ASC
  `).all<AnalyticFlightRow>();

  c.header('Cache-Control', 'public, max-age=172800');
  const response = c.json({ flights: result.results });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
});

app.get('/api/analytics/points', async (c) => {
  const rawStart = parseInt(c.req.query('start') ?? '', 10);
  const rawEnd   = parseInt(c.req.query('end')   ?? '', 10);
  if (isNaN(rawStart) || isNaN(rawEnd)) {
    return c.json({ error: 'Missing required query params: start, end' }, 400);
  }
  if (rawEnd - rawStart > 365 * 86400) {
    return c.json({ error: 'Date range exceeds maximum of 1 year' }, 400);
  }

  const cacheKey = new Request(c.req.url);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const result = await c.var.db.prepare(`
    SELECT p.lat, p.lon, pf.flight_id
    FROM points p
    JOIN point_flights pf ON p.id = pf.point_id
    JOIN flights f ON pf.flight_id = f.id
    WHERE f.start_time >= ? AND f.start_time <= ?
      AND f.end_time IS NOT NULL
    ORDER BY pf.flight_id, p.garmin_time ASC
  `).bind(rawStart, rawEnd).all<AnalyticPointRow>();

  c.header('Cache-Control', 'public, max-age=172800');
  const response = c.json({ points: result.results });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
});

// ── Named points endpoint ─────────────────────────────────────────────────────

app.get('/api/named-points', async (c) => {
  const { results } = await c.var.db.prepare(
    'SELECT id, name, lat, lon, max_km FROM named_points'
  ).all<{ id: number; name: string; lat: number; lon: number; max_km: number | null }>();
  const geojson = {
    type: 'FeatureCollection',
    features: results.map(p => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, maxKm: p.max_km },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
  c.header('Cache-Control', 'no-store');
  return c.json(geojson);
});

app.post('/api/named-points', requireAdmin, async (c) => {
  let body: { name?: string; lat?: number; lon?: number; max_km?: number | null };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const { name, lat, lon } = body;
  if (typeof name !== 'string' || !name) return c.json({ error: 'name is required' }, 400);
  if (typeof lat !== 'number' || typeof lon !== 'number') return c.json({ error: 'lat and lon are required' }, 400);
  const maxKm = typeof body.max_km === 'number' ? body.max_km : null;
  const result = await c.var.db.prepare(
    'INSERT INTO named_points (name, lat, lon, max_km) VALUES (?, ?, ?, ?)'
  ).bind(name, lat, lon, maxKm).run();
  invalidateNamedPointsCache(c.var.tenant.key);
  return c.json({ id: result.meta.last_row_id, name, lat, lon, max_km: maxKm }, 201);
});

app.put('/api/named-points/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  let body: { name?: string; max_km?: number | null };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const updates: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.name === 'string' && body.name) { updates.push('name = ?'); binds.push(body.name); }
  if ('max_km' in body) { updates.push('max_km = ?'); binds.push(body.max_km ?? null); }
  if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400);
  binds.push(id);
  const result = await c.var.db.prepare(
    'UPDATE named_points SET ' + updates.join(', ') + ' WHERE id = ?'
  ).bind(...binds).run();
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  invalidateNamedPointsCache(c.var.tenant.key);
  return c.json({ ok: true });
});

app.delete('/api/named-points/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const result = await c.var.db.prepare('DELETE FROM named_points WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  invalidateNamedPointsCache(c.var.tenant.key);
  return c.json({ ok: true });
});

// ── Regions endpoints ─────────────────────────────────────────────────────────

app.get('/api/regions', async (c) => {
  const { results } = await c.var.db.prepare(
    'SELECT id, name, geojson FROM regions'
  ).all<{ id: number; name: string; geojson: string }>();
  const geojson = {
    type: 'FeatureCollection',
    features: results.map(r => ({
      type: 'Feature',
      properties: { id: r.id, Name: r.name },
      geometry: JSON.parse(r.geojson),
    })),
  };
  c.header('Cache-Control', 'no-store');
  return c.json(geojson);
});

app.post('/api/regions', requireAdmin, async (c) => {
  let body: { name?: string; geojson?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (typeof body.name !== 'string' || !body.name) return c.json({ error: 'name required' }, 400);
  if (!body.geojson) return c.json({ error: 'geojson required' }, 400);
  const result = await c.var.db.prepare(
    'INSERT INTO regions (name, geojson) VALUES (?, ?)'
  ).bind(body.name, JSON.stringify(body.geojson)).run();
  return c.json({ id: result.meta.last_row_id, ok: true });
});

app.put('/api/regions/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  let body: { name?: string; geojson?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const updates: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.name === 'string' && body.name) { updates.push('name = ?'); binds.push(body.name); }
  if (body.geojson != null) { updates.push('geojson = ?'); binds.push(JSON.stringify(body.geojson)); }
  if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400);
  binds.push(id);
  const result = await c.var.db.prepare(
    'UPDATE regions SET ' + updates.join(', ') + ' WHERE id = ?'
  ).bind(...binds).run();
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

app.delete('/api/regions/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const result = await c.var.db.prepare('DELETE FROM regions WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

// ── Regions import (admin only) ───────────────────────────────────────────────

app.post('/api/regions/import', requireAdmin, async (c) => {
  let body: { type?: string; features?: Array<{ properties: Record<string, unknown>; geometry: unknown }> };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
    return c.json({ error: 'Expected a GeoJSON FeatureCollection' }, 400);
  }
  const stmts: D1PreparedStatement[] = [c.var.db.prepare('DELETE FROM regions')];
  for (const f of body.features) {
    const name = (f.properties?.Name ?? f.properties?.name) as string | undefined;
    if (typeof name !== 'string' || !name) continue;
    stmts.push(c.var.db.prepare('INSERT INTO regions (name, geojson) VALUES (?, ?)').bind(name, JSON.stringify(f.geometry)));
  }
  await c.var.db.batch(stmts);
  return c.json({ ok: true });
});

// ── Named points import (admin only) ─────────────────────────────────────────

app.post('/api/named-points/import', requireAdmin, async (c) => {
  let body: { type?: string; features?: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: [number, number] } }> };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
    return c.json({ error: 'Expected a GeoJSON FeatureCollection' }, 400);
  }
  const stmts: D1PreparedStatement[] = [c.var.db.prepare('DELETE FROM named_points')];
  for (const f of body.features) {
    const name = f.properties?.name as string | undefined;
    if (typeof name !== 'string' || !name) continue;
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;
    const maxKm = typeof f.properties?.maxKm === 'number' ? f.properties.maxKm : null;
    stmts.push(c.var.db.prepare('INSERT INTO named_points (name, lat, lon, max_km) VALUES (?, ?, ?, ?)').bind(name, coords[1], coords[0], maxKm));
  }
  await c.var.db.batch(stmts);
  invalidateNamedPointsCache(c.var.tenant.key);
  return c.json({ ok: true });
});

// ── App Settings endpoints (admin only) ───────────────────────────────────────

app.get('/api/settings', requireAdmin, async (c) => {
  const { results } = await c.var.db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return c.json(Object.fromEntries(results.map(r => [r.key, r.value])));
});

app.patch('/api/settings', requireAdmin, async (c) => {
  const ALLOWED_KEYS = new Set(['app_name', 'timezone', 'map_default_lat', 'map_default_lng', 'map_default_zoom', 'gap_alert_minutes', 'gap_alert_stop_minutes', 'pushover_api_token', 'setup_dismissed', 'duty_method']);
  const body = await c.req.json<Record<string, string | number>>();
  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) return c.json({ error: `Unknown setting key: ${key}` }, 400);
    if (typeof value !== 'string' && typeof value !== 'number') return c.json({ error: `Value for ${key} must be a string or number` }, 400);
    if (key === 'duty_method' && value !== 'b' && value !== 'c') return c.json({ error: 'duty_method must be b or c' }, 400);
    stmts.push(c.var.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, String(value)));
  }
  if (stmts.length > 0) {
    await c.var.db.batch(stmts);
    invalidateSettingsCache(c.var.tenant.key);
  }
  return c.json({ ok: true });
});

// ── Webhook notification endpoints (admin only) ───────────────────────────────
//
// A target is either a generic webhook (`type: 'webhook'`, delivered to `url`) or a
// Pushover recipient (`type: 'pushover'`, delivered via the tenant's shared
// `pushover_api_token` setting to `pushover_user_key`). `url`/`pushover_user_key` are
// always written together as a pair matching `type` so a row can never end up with a
// type and no corresponding target.

const NOTIFICATION_EVENT_TYPES = new Set(['takeoff', 'landing', 'gap']);

function parseWebhookEvents(events: unknown): string[] | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const filtered = events.filter((e): e is string => typeof e === 'string' && NOTIFICATION_EVENT_TYPES.has(e));
  return filtered.length > 0 ? filtered : null;
}

app.get('/api/webhooks', requireAdmin, async (c) => {
  // pushover_user_key is intentionally omitted here, same as trackers.credentials in
  // /api/trackers — write-only from the admin's perspective once saved.
  const { results } = await c.var.db.prepare(
    'SELECT id, type, url, label, events, active, created_at, last_triggered_at, last_status, last_error FROM webhooks ORDER BY id ASC'
  ).all<Omit<Webhook, 'pushover_user_key'>>();
  return c.json({ webhooks: results });
});

app.post('/api/webhooks', requireAdmin, async (c) => {
  let body: { type?: string; url?: string; pushover_user_key?: string; label?: string | null; events?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const type = body.type === 'pushover' ? 'pushover' : 'webhook';
  if (type === 'webhook') {
    if (typeof body.url !== 'string' || !body.url) return c.json({ error: 'url is required' }, 400);
    try { new URL(body.url); } catch { return c.json({ error: 'url must be a valid URL' }, 400); }
  } else {
    if (typeof body.pushover_user_key !== 'string' || !body.pushover_user_key) {
      return c.json({ error: 'pushover_user_key is required' }, 400);
    }
  }

  const events = body.events === undefined
    ? ['takeoff', 'landing', 'gap']
    : parseWebhookEvents(body.events);
  if (!events) return c.json({ error: 'events must be a non-empty array of takeoff/landing/gap' }, 400);

  const result = await c.var.db.prepare(
    'INSERT INTO webhooks (type, url, pushover_user_key, label, events) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    type,
    type === 'webhook' ? body.url! : '',
    type === 'pushover' ? body.pushover_user_key! : null,
    body.label ?? null,
    JSON.stringify(events),
  ).run();
  return c.json({ ok: true, id: result.meta.last_row_id }, 201);
});

app.put('/api/webhooks/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid webhook id' }, 400);

  const existing = await c.var.db.prepare(
    'SELECT type, url, pushover_user_key, label, events, active FROM webhooks WHERE id = ?'
  ).bind(id).first<{ type: string; url: string; pushover_user_key: string | null; label: string | null; events: string; active: number }>();
  if (!existing) return c.json({ error: 'Webhook not found' }, 404);

  let body: { type?: string; url?: string; pushover_user_key?: string | null; label?: string | null; events?: unknown; active?: boolean };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  // Merge onto the existing row first so url/pushover_user_key/type are always written
  // together as a consistent triple, never left half-updated by a partial SET list.
  const type = body.type === 'pushover' || body.type === 'webhook' ? body.type : existing.type;
  const url = body.url !== undefined ? body.url : existing.url;
  const pushoverKey = body.pushover_user_key !== undefined ? body.pushover_user_key : existing.pushover_user_key;

  if (type === 'webhook') {
    if (typeof url !== 'string' || !url) return c.json({ error: 'url is required for webhook type' }, 400);
    try { new URL(url); } catch { return c.json({ error: 'url must be a valid URL' }, 400); }
  } else {
    if (typeof pushoverKey !== 'string' || !pushoverKey) return c.json({ error: 'pushover_user_key is required for pushover type' }, 400);
  }

  let events = existing.events;
  if (body.events !== undefined) {
    const parsed = parseWebhookEvents(body.events);
    if (!parsed) return c.json({ error: 'events must be a non-empty array of takeoff/landing/gap' }, 400);
    events = JSON.stringify(parsed);
  }

  const label = Object.prototype.hasOwnProperty.call(body, 'label') ? (body.label ?? null) : existing.label;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;

  await c.var.db.prepare(
    'UPDATE webhooks SET type = ?, url = ?, pushover_user_key = ?, label = ?, events = ?, active = ? WHERE id = ?'
  ).bind(
    type,
    type === 'webhook' ? url : '',
    type === 'pushover' ? pushoverKey : null,
    label, events, active, id,
  ).run();
  return c.json({ ok: true });
});

app.delete('/api/webhooks/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid webhook id' }, 400);
  const result = await c.var.db.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

// ── Scheduled handler ─────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const routing = parseRouting(env);
    if (!routing) {
      console.error('CUSTOMER_ROUTING is not valid JSON; skipping scheduled poll');
      return;
    }

    // Dedupe by binding: several hostnames may alias one customer, who must
    // still be polled exactly once. Keep the first hostname for the User-Agent.
    const byBinding = new Map<string, string>();
    for (const [hostname, bindingName] of Object.entries(routing)) {
      if (!byBinding.has(bindingName)) byBinding.set(bindingName, hostname);
    }

    // Runs every minute (see wrangler.toml); pollAllActive is throttled per-tracker via
    // poll_state so most ticks are a cheap no-op read and the Garmin feed is only actually
    // fetched roughly every POLL_INTERVAL_SECONDS. This replaces the old once-daily forced
    // catch-up: continuous polling means takeoff/landing/gap notifications fire even with
    // no dashboard client open.
    ctx.waitUntil((async () => {
      for (const [bindingName, hostname] of byBinding) {
        const db = tenantDb(env, bindingName);
        if (!db) {
          console.error(`Binding "${bindingName}" not found for host ${hostname}; skipping`);
          continue;
        }
        try {
          await pollAllActive({ db, key: bindingName, host: hostname }, { geocode: true });
        } catch (err) {
          console.error(`Scheduled poll failed for ${hostname} ("${bindingName}"):`, String(err));
        }
      }
    })());
  },
};
