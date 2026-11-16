/**
 * The `demo` tenant's simulated trackers (docs/mobile-app-plan.md, "Store review and privacy
 * requirements"): a feed the poller reads in place of Garmin's for a tracker whose source is
 * `demo:<n>`, on a tenant the hosting config marks as a demo (`Tenant.demo`, from
 * `DEMO_BINDINGS`). A real tenant never reads it: on one, a `demo:` source is fetched like any
 * other URL and fails.
 *
 * The feed is a pure function of the tracker and the time, so the poller's usual machinery
 * (the watermark, segmentation, notifications, the history import) works on it unchanged,
 * and a poll that comes late or twice gets the same points.
 *
 * Three trackers share a grid of SLOT_S slots. In slot k, tracker k mod 3 is on the ground and
 * the other two are in the air: each tracker rests for one slot and then flies one leg that
 * lasts exactly two, so one lands as the resting one takes off and two are always flying.
 * The legs go out from Kodiak to a destination 100–135 km away and back, the showcase's
 * floatplane charter (src/showcase/sample-data.ts) with its places and terrain. Pilots work
 * fixed 8-hour shifts by local time, and a relief pilot flies each one's shift on their day
 * off, once a week (each tracker's `credentials` lists its four pilots), so the duty log
 * stays within the limits.
 */
import { unixToTzDateStr, unixToTzTime } from '@wingbeat/core/time';
import { cruiseAltitudeM, cruiseKmhForDuration, mulberry32, synthesizeTrack, TERRAIN_CLEARANCE_M, TrackFix, TrackTerrain } from './showcase/tracks';
import terrainGrid from './showcase/terrain.json';
import type { ParsedPoint } from './types';

export const DEMO_TZ = 'America/Anchorage';
/** How many trackers the rotation has (`demo:0` to `demo:2`). */
export const DEMO_TRACKERS = 3;
const SLOT_S = 20 * 60;
const LEG_S = 2 * SLOT_S;
const INTERVAL_S = 120; // inReach aviation tracking interval
/** Slot 0 starts here; there are no points before it. */
const EPOCH = Date.UTC(2026, 8, 1) / 1000;
const SHIFT_HOURS = 8;
/** Where the relief pilot is in a tracker's `credentials` pilots, after the three shifts'. */
const RELIEF = 3;
const GROUND_ELEVATION_M = 2;

/** [name, lat, lon], from src/showcase/sample/named-points.geojson (test/demo-feed.test.mjs checks). */
export const DEMO_BASE: [string, number, number] = ['Kodiak', 57.790166, -152.406707];
export const DEMO_DESTINATIONS: [string, number, number][] = [
  ['Larsen Bay', 57.536559, -153.981606],
  ['Karluk', 57.571944, -154.455556],
  ['Karluk Lake', 57.326472, -154.034262],
  ['Frazer Lake', 57.304339, -154.192559],
  ['Deadman Bay', 57.077731, -153.915549],
  ['Olga Bay', 57.132778, -154.263611],
  ['Geographic Harbor', 58.112222, -154.585278],
  ['Kukak Bay', 58.262801, -154.288748],
  ['Kaflia Bay', 58.251003, -154.160852],
  ['Hallo Bay', 58.446809, -153.999605],
  ['Swikshak Lagoon', 58.616667, -153.7525],
];

const terrain: TrackTerrain = { ...terrainGrid, unitM: 1 };

/** The tracker's place in the rotation, from a `demo:<n>` source; null for any other source. */
export function demoTrackerIndex(sourceUrl: string): number | null {
  const m = /^demo:([0-9])$/.exec(sourceUrl);
  return m && +m[1] < DEMO_TRACKERS ? +m[1] : null;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Where tracker `i`'s cycle `n` starts: its slot on the ground, followed by leg `n`. */
const cycleStart = (i: number, n: number): number => EPOCH + (3 * n + i) * SLOT_S;

/** Leg `n` of tracker `i`: out from the base on even legs, back on odd ones. */
function legPlaces(i: number, n: number): [[number, number], [number, number]] {
  const trip = Math.floor(n / 2);
  const dest = DEMO_DESTINATIONS[Math.floor(mulberry32((i + 1) * 7919 + trip * 104729)() * DEMO_DESTINATIONS.length)];
  const base: [number, number] = [DEMO_BASE[1], DEMO_BASE[2]];
  const there: [number, number] = [dest[1], dest[2]];
  return n % 2 === 0 ? [base, there] : [there, base];
}

/**
 * Leg `n` of tracker `i`, timed from its takeoff: the cruise speed is whatever makes it last
 * LEG_S (150–210 km/h over these distances), the altitude about 500 m or higher over high
 * ground, as the showcase plans its legs.
 */
function legTrack(i: number, n: number): TrackFix[] {
  const [from, to] = legPlaces(i, n);
  const seed = Math.floor(mulberry32((i + 1) * 15485863 + n * 32452843)() * 2 ** 31);
  const kmh = cruiseKmhForDuration(from, to, LEG_S);
  const synth = (altM: number): TrackFix[] =>
    synthesizeTrack(from, to, seed, kmh, altM, INTERVAL_S, terrain, TERRAIN_CLEARANCE_M);
  const usual = 500 + Math.round((mulberry32(seed)() - 0.5) * 200);
  return synth(cruiseAltitudeM(terrain, synth(usual), usual));
}

/**
 * The pilot flying tracker `i`'s cycle `n`: whose shift its takeoff is in, by local time, or
 * the relief pilot on that pilot's day off. The shifts' days off are offset by 2 days each
 * (`2 * shift`), so the relief pilot never flies two days running.
 */
function cyclePilot(i: number, n: number, pilots: number[]): number | null {
  const takeoff = cycleStart(i, n) + SLOT_S;
  const shift = Math.floor(+unixToTzTime(DEMO_TZ, takeoff).slice(0, 2) / SHIFT_HOURS);
  const day = Date.parse(unixToTzDateStr(DEMO_TZ, takeoff) + 'T00:00:00Z') / 86400_000;
  const off = mod(day + 2 * shift + i, 7) === 0;
  return pilots[off ? RELIEF : shift] ?? null;
}

/** The pilots a demo tracker's `credentials` names: one per shift, then the relief ({"pilots": [id, id, id, id]}). */
function shiftPilots(credentials: string | null): number[] {
  if (!credentials) return [];
  let parsed: { pilots?: unknown };
  try {
    parsed = JSON.parse(credentials);
  } catch {
    throw new Error('A demo tracker\'s credentials must be JSON: {"pilots": [night, day, evening, relief]}');
  }
  return Array.isArray(parsed.pilots) ? parsed.pilots.filter((p): p is number => Number.isInteger(p)) : [];
}

/**
 * The fixes tracker `sourceUrl` reported from `fromSec` to `toSec` (both inclusive): each leg's
 * track, and a fix every INTERVAL_S while it's parked, as an inReach left on does.
 */
export function demoFeedPoints(sourceUrl: string, credentials: string | null, fromSec: number, toSec: number): ParsedPoint[] {
  const i = demoTrackerIndex(sourceUrl);
  if (i === null) throw new Error(`Not a demo tracker source: ${sourceUrl}`);
  const pilots = shiftPilots(credentials);
  const from = Math.max(fromSec, EPOCH);
  if (toSec < from) return [];

  const points: ParsedPoint[] = [];
  const push = (time: number, fix: TrackFix, velocity: number, elevation: number, pilot: number | null): void => {
    if (time < from || time > toSec) return;
    points.push({
      garmin_time: time, lat: fix[1], lon: fix[2], elevation_m: elevation, velocity_kmh: velocity,
      course_deg: fix[5], event: null, raw_kml: null, pilot_id: pilot,
    });
  };

  // Every cycle that has a fix in the window: a cycle spans 3 slots, and its leg's landing fix
  // is at the next cycle's start, so the window can begin with the previous cycle's landing.
  // The leg before the first cycle says where the tracker is parked.
  const firstCycle = Math.floor(((from - EPOCH) / SLOT_S - i) / 3) - 1;
  const lastCycle = Math.floor(((toSec - EPOCH) / SLOT_S - i) / 3);
  let previousLeg = firstCycle > 0 ? legTrack(i, firstCycle - 1) : null;
  for (let n = Math.max(0, firstCycle); n <= lastCycle; n++) {
    const start = cycleStart(i, n);
    const pilot = cyclePilot(i, n, pilots);
    const leg = legTrack(i, n);
    // Parked where the last leg landed (or where this one takes off, before the first).
    const parked = previousLeg ? previousLeg[previousLeg.length - 1] : leg[0];
    for (let t = INTERVAL_S; t < SLOT_S; t += INTERVAL_S) push(start + t, parked, 0, GROUND_ELEVATION_M, pilot);
    for (const fix of leg) push(start + SLOT_S + fix[0], fix, fix[3], fix[4], pilot);
    previousLeg = leg;
  }
  return points.sort((a, b) => a.garmin_time - b.garmin_time);
}

/** Which of the three demo trackers is on the ground at `unix` (the others are flying). For tests. */
export function demoTrackerOnGround(unix: number): number {
  return mod(Math.floor((unix - EPOCH) / SLOT_S), DEMO_TRACKERS);
}
