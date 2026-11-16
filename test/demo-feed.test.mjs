// The demo tenant's simulated trackers (src/demo-feed.ts): two of the three always flying,
// the same points however the window is split, places from the showcase's named points.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { importCore } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [path.join(ROOT, 'src/demo-feed.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning',
});
const { demoFeedPoints, demoTrackerIndex, demoTrackerOnGround, DEMO_BASE, DEMO_DESTINATIONS, DEMO_TRACKERS } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { SPEED_THRESHOLD_KMH } = await importCore('regions');

const EPOCH = Date.UTC(2026, 8, 1) / 1000;
const NOW = Date.UTC(2026, 10, 15, 20, 7) / 1000;
const FROM = NOW - 7 * 86400;
const PILOTS = [11, 12, 13, 14];
const CREDS = JSON.stringify({ pilots: PILOTS });
const feeds = [0, 1, 2].map((i) => demoFeedPoints(`demo:${i}`, CREDS, FROM, NOW));

/** Whether the tracker's latest fix at or before `t` is moving. */
function flyingAt(feed, t) {
  let last = null;
  for (const p of feed) {
    if (p.garmin_time > t) break;
    last = p;
  }
  return last !== null && last.velocity_kmh >= SPEED_THRESHOLD_KMH;
}

describe('demoFeedPoints', () => {
  test('two trackers are flying at every instant, and never the one on the ground', () => {
    // From 20 min in, so each tracker has a fix in the window.
    for (let t = FROM + 1200; t <= NOW; t += 37) {
      const flying = feeds.map((f) => flyingAt(f, t));
      assert.equal(flying.filter(Boolean).length, 2, new Date(t * 1000).toISOString());
      assert.equal(flying[demoTrackerOnGround(t)], false, new Date(t * 1000).toISOString());
    }
  });

  test('a window split in two gives the same points as the whole', () => {
    for (const [i, cut] of [[0, FROM + 5000], [1, FROM + 86400 + 1234], [2, NOW - 60]]) {
      const a = demoFeedPoints(`demo:${i}`, CREDS, FROM, cut);
      const b = demoFeedPoints(`demo:${i}`, CREDS, cut + 1, NOW);
      assert.deepEqual([...a, ...b], feeds[i]);
    }
  });

  test('every fix is in the window, in order, a fix every 2 minutes or less', () => {
    for (const feed of feeds) {
      assert.ok(feed.length > 7 * 24 * 25, `${feed.length} fixes in a week`);
      for (let k = 1; k < feed.length; k++) {
        assert.ok(feed[k].garmin_time > feed[k - 1].garmin_time);
        assert.ok(feed[k].garmin_time - feed[k - 1].garmin_time <= 120);
      }
      assert.ok(feed[0].garmin_time >= FROM && feed.at(-1).garmin_time <= NOW);
    }
  });

  test('cruise speeds and altitudes are plausible for a floatplane', () => {
    for (const feed of feeds) {
      const fast = feed.filter((p) => p.velocity_kmh >= SPEED_THRESHOLD_KMH);
      assert.ok(Math.max(...fast.map((p) => p.velocity_kmh)) < 260);
      // About 5,000 ft at most: Kodiak's ~1,360 m peaks plus the showcase's 150 m clearance.
      assert.ok(Math.max(...fast.map((p) => p.elevation_m)) < 1600);
      assert.ok(feed.filter((p) => p.velocity_kmh === 0).every((p) => p.elevation_m < 10));
    }
  });

  test('it lands only at Kodiak and the destinations', () => {
    const places = [DEMO_BASE, ...DEMO_DESTINATIONS];
    for (const feed of feeds) {
      for (const p of feed.filter((p) => p.velocity_kmh === 0)) {
        const near = places.some(([, lat, lon]) => Math.hypot(lat - p.lat, (lon - p.lon) * Math.cos(lat * Math.PI / 180)) < 0.02);
        assert.ok(near, `parked at ${p.lat},${p.lon}`);
      }
    }
  });

  test('the four pilots all fly, one pilot per leg', () => {
    for (const feed of feeds) {
      assert.deepEqual([...new Set(feed.map((p) => p.pilot_id))].sort(), PILOTS);
      // The pilot changes only on the ground: never between two moving fixes.
      for (let k = 1; k < feed.length; k++) {
        if (feed[k - 1].velocity_kmh > 0 && feed[k].velocity_kmh > 0) assert.equal(feed[k].pilot_id, feed[k - 1].pilot_id);
      }
    }
    const noPilots = demoFeedPoints('demo:0', null, FROM, NOW);
    assert.ok(noPilots.every((p) => p.pilot_id === null));
  });

  test('no points before the epoch, none for an empty window', () => {
    assert.deepEqual(demoFeedPoints('demo:0', CREDS, EPOCH - 86400, EPOCH - 1), []);
    assert.ok(demoFeedPoints('demo:1', CREDS, EPOCH - 86400, EPOCH + 3600).every((p) => p.garmin_time >= EPOCH));
    assert.deepEqual(demoFeedPoints('demo:2', CREDS, NOW, NOW - 1), []);
  });

  test('only demo:<n> sources are demo trackers', () => {
    assert.deepEqual([0, 1, 2].map((i) => demoTrackerIndex(`demo:${i}`)), [0, 1, 2]);
    for (const s of [`demo:${DEMO_TRACKERS}`, 'demo:', 'demo:01', 'https://share.garmin.com/Feed/Share/demo:0']) {
      assert.equal(demoTrackerIndex(s), null, s);
    }
    assert.throws(() => demoFeedPoints('https://share.garmin.com/Feed/Share/x', null, FROM, NOW));
  });
});

test("the feed's places are the showcase's named points", () => {
  const geojson = JSON.parse(readFileSync(path.join(ROOT, 'src/showcase/sample/named-points.geojson'), 'utf8'));
  const named = geojson.features.filter((f) => f.geometry?.type === 'Point')
    .map((f) => [f.properties.name, f.geometry.coordinates[1], f.geometry.coordinates[0]]);
  for (const place of [DEMO_BASE, ...DEMO_DESTINATIONS]) {
    assert.ok(named.some((n) => n[0] === place[0] && n[1] === place[1] && n[2] === place[2]), place[0]);
  }
});
