// Seeds a `demo` tenant (docs/mobile-app-plan.md, "Store review and privacy requirements"):
// the showcase's Kodiak floatplane charter, flown by the simulated trackers in
// src/demo-feed.ts. Tenant data stays out of migrations, so this is how a demo D1 gets it.
//
//   node scripts/demo-seed.mjs sql > demo-seed.sql
//     SQL for a freshly migrated D1: settings (with the demo code), aircraft, pilots and
//     their default duty, the three demo trackers (inactive), the demo user (an admin who
//     is a pilot), named points and regions. Apply it with the hosting repo's
//     `scripts/d1-query.mjs --customer demo --env <env> --file demo-seed.sql`. It only
//     inserts, so it fails on a D1 that already has them rather than overwrite anything.
//
//   node scripts/demo-seed.mjs history --host demo.staging.wingbeat.dummthings.dev [--days 30]
//     Then, with the Worker deployed and the tenant listed in DEMO_BINDINGS: signs in with
//     the demo code, imports each tracker's history a day at a time (oldest first, so
//     segmentation stays incremental), labels the flights, and turns the trackers on, after
//     which the cron keeps them moving.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTs(file) {
  const bundle = await build({ entryPoints: [path.join(ROOT, file)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning' });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}

const { DEMO_CODE } = await importTs('packages/core/src/app-connect.ts');
const { DEMO_TZ, DEMO_BASE, DEMO_TRACKERS } = await importTs('src/demo-feed.ts');

const FLEET = [
  { tail: 'N100DM', name: 'Beaver', tracker: 'inReach · Beaver' },
  { tail: 'N200DM', name: 'Beaver', tracker: 'inReach · Beaver 2' },
  { tail: 'N300DM', name: 'Cessna 206', tracker: 'inReach · 206' },
];
if (FLEET.length !== DEMO_TRACKERS) throw new Error(`demo-feed.ts rotates ${DEMO_TRACKERS} trackers, FLEET has ${FLEET.length}`);
// Per aircraft: the night, day and evening shift pilots, then the relief pilot
// (demo-feed.ts's cyclePilot). Ids are 1–12 in this order.
const PILOTS_PER_AIRCRAFT = 4;
const PILOTS = [
  'Alex Rivera', 'Jordan Lee', 'Sam Okafor', 'Casey Morgan',
  'Riley Chen', 'Taylor Brooks', 'Morgan Ellis', 'Jamie Novak',
  'Avery Patel', 'Quinn Harper', 'Drew Kowalski', 'Reese Nakamura',
];
/** Each shift's default duty: half an hour before its first takeoff to 45 min after its last landing. */
const SHIFT_DUTY = [['00:00', '08:45'], ['07:30', '16:45'], ['15:30', '00:45']];
/** The demo user: Jordan Lee, N100DM's day pilot, so the app opens on a busy duty log. */
const DEMO_PILOT_ID = 2;
const DEFAULT_DUTY_FROM = '2026-01-01';

const sqlStr = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const insert = (table, row) => `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(sqlStr).join(', ')});`;

function seedSql() {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const out = ['-- The demo tenant (scripts/demo-seed.mjs sql). For a freshly migrated D1 only.'];
  const setting = (key, value) => out.push(`INSERT OR REPLACE INTO settings (key, value) VALUES (${sqlStr(key)}, ${sqlStr(value)});`);
  setting('app_name', 'Wingbeat Demo');
  setting('timezone', DEMO_TZ);
  setting('map_default_lat', '57.75');
  setting('map_default_lng', '-153.4');
  setting('map_default_zoom', '7');
  setting('demo_code', DEMO_CODE);

  // N100DM carries the showcase's maintenance schedule (src/showcase/sample-data.ts).
  const hobbs = 4172.4, tach = 3688.9;
  const schedule = [
    { id: 'oil', name: 'Oil change', schedule_type: 'hobbs', interval_hours: 50, last_done_value: hobbs - (50 - 17.3) },
    { id: '100hr', name: '100-hour inspection', schedule_type: 'hobbs', interval_hours: 100, last_done_value: hobbs - (100 - 6.2) },
    { id: 'prop', name: 'Propeller overhaul', schedule_type: 'tach', interval_hours: 2000, last_done_value: tach - (2000 - 311.5) },
    { id: 'annual', name: 'Annual inspection', schedule_type: 'calendar', interval_months: 12, last_done_at: now - 128 * day },
    { id: 'elt', name: 'ELT battery', schedule_type: 'calendar', interval_months: 24, last_done_at: now - 745 * day },
  ].map((item) => (item.last_done_value === undefined ? item : { ...item, last_done_value: Math.round(item.last_done_value * 10) / 10 }));
  FLEET.forEach((ac, i) => out.push(insert('aircraft', {
    tail_number: ac.tail, name: ac.name,
    ...(i === 0 ? {
      hobbs_time: hobbs, hobbs_recorded_at: now - 24 * day, hobbs_correction: 1.04,
      tach_time: tach, tach_recorded_at: now - 24 * day, tach_correction: 0.88,
      maintenance_schedule: JSON.stringify(schedule),
    } : {}),
  })));

  PILOTS.forEach((name, i) => {
    out.push(insert('pilots', { id: i + 1, name }));
    // The relief pilot (the last of each aircraft's) has no shift, so no default duty.
    const shift = i % PILOTS_PER_AIRCRAFT;
    if (shift < SHIFT_DUTY.length) {
      out.push(insert('pilot_default_duty', { pilot_id: i + 1, effective_date: DEFAULT_DUTY_FROM, duty_start: SHIFT_DUTY[shift][0], duty_end: SHIFT_DUTY[shift][1] }));
    }
  });

  FLEET.forEach((ac, i) => {
    out.push(insert('trackers', {
      id: i + 1, name: ac.tracker, type: 'demo', source_url: `demo:${i}`, active: 0,
      assigned_aircraft: ac.tail, credentials: JSON.stringify({ pilots: Array.from({ length: PILOTS_PER_AIRCRAFT }, (_, p) => PILOTS_PER_AIRCRAFT * i + p + 1) }),
    }));
    out.push(insert('poll_state', { tracker_id: i + 1 }));
  });

  out.push(insert('users', { name: PILOTS[DEMO_PILOT_ID - 1], role: 'admin', pilot_id: DEMO_PILOT_ID }));
  out.push(`INSERT OR REPLACE INTO settings (key, value) SELECT 'demo_user_id', CAST(id AS TEXT) FROM users WHERE pilot_id = ${DEMO_PILOT_ID};`);

  const geo = (name) => JSON.parse(readFileSync(path.join(ROOT, 'src/showcase/sample', name), 'utf8'));
  const points = geo('named-points.geojson').features.filter((f) => f.geometry?.type === 'Point');
  for (const f of points) {
    const [lon, lat] = f.geometry.coordinates;
    out.push(insert('named_points', { name: f.properties.name, lat, lon, max_km: f.properties.maxKm ?? null }));
  }
  for (const f of geo('regions.geojson').features) {
    out.push(insert('regions', { name: f.properties.Name ?? f.properties.name, geojson: JSON.stringify(f.geometry) }));
  }
  return out.join('\n') + '\n';
}

async function seedHistory(host, days) {
  const base = `https://${host}`;
  const signIn = await fetch(`${base}/demo/sign-in`, {
    method: 'POST',
    body: new URLSearchParams({ code: DEMO_CODE, return: '/' }),
    redirect: 'manual',
  });
  const cookie = /session=[^;]+/.exec(signIn.headers.get('set-cookie') ?? '')?.[0];
  if (!cookie) throw new Error(`Demo sign-in failed (${signIn.status}): is ${host} listed in DEMO_BINDINGS and seeded?`);
  // Every call is safe to repeat (imports skip points already stored), so a dropped
  // connection is retried rather than ending a run of a hundred-odd requests.
  const send = async (url, init, tries = 3) => {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (tries <= 1) throw err;
      return send(url, init, tries - 1);
    }
  };
  const api = async (method, p, body) => {
    const r = await send(base + p, {
      method,
      headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${JSON.stringify(json)}`);
    return json;
  };

  const { trackers } = await api('GET', '/api/trackers');
  const today = new Date().toISOString().slice(0, 10);
  const dateKey = (offset) => new Date(Date.parse(today) + offset * 86400_000).toISOString().slice(0, 10);
  for (const t of trackers.filter((t) => t.type === 'demo' && !t.deleted)) {
    let inserted = 0;
    for (let d = -days; d <= 0; d++) {
      inserted += (await api('POST', `/api/trackers/${t.id}/import?d1=${dateKey(d)}&d2=${dateKey(d + 1)}`)).inserted;
    }
    // Named points cover every place the demo flies to, so this rarely needs Overpass; a
    // flight it can't name stays unlabeled rather than hold this up.
    for (let round = 0; round < 50; round++) {
      if ((await api('POST', `/api/trackers/${t.id}/geocode`)).remaining === 0) break;
    }
    await api('PUT', `/api/trackers/${t.id}`, { active: true });
    console.log(`${t.name}: ${inserted} points imported, active`);
  }
}

const [command] = process.argv.slice(2);
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (command === 'sql') {
  process.stdout.write(seedSql());
} else if (command === 'history' && flag('host')) {
  await seedHistory(flag('host'), Number(flag('days') ?? 30));
} else {
  console.error('usage: node scripts/demo-seed.mjs sql | history --host <host> [--days 30]');
  process.exit(1);
}
