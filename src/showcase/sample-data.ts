/**
 * Deterministic sample data for the docs-site showcase: a three-aircraft floatplane
 * charter based in Kodiak, flying out to villages, fishing lakes, the Katmai coast and
 * Afognak over the last ~5 months, with demand shifting between them over the season.
 *
 * Built from sample/named-points.geojson (destinations and their labels) and
 * regions.geojson (analytics regions), so labels and region totals are what a deployment
 * using those datasets would show. Tracks stay above terrain.json (a coarse DEM grid,
 * see site/scripts/fetch-showcase-terrain.mjs): each leg cruises clear of the highest
 * ground along its route, and synthesizeTrack() lifts any fix that would still be low.
 *
 * Times are relative ("N days ago at HH:MM local"), with "now" at NOW_MINUTE today; the
 * browser shifts the whole schedule so that moment lands on the visitor's clock. Past
 * days are generated; today is planned by hand so each aircraft's legs connect, ending
 * in the two flights that are in the air right now.
 * Flights are shipped as compact tuples and expanded into full tracks in the browser by
 * synthesizeTrack() (tracks.ts), which keeps the payload small.
 */
import { computeLiveLabel } from '../geocoding';
import { haversineKm } from '../geo';
import { eventTitle, eventMessage, NotificationEvent } from '../notifications';
import { formatLocalDateTime } from '../shared/format';
import { synthesizeTrack, TrackFix, TrackTerrain } from './tracks';

export interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}
export interface GeoCollection {
  type: string;
  features: GeoFeature[];
}

/** [name, lat, lon] */
export type SamplePlace = [string, number, number];

/** [id, trackerId, pilotId, daysAgo, startMinuteLocal, fromPlace, toPlace, seed, cruiseKmh, cruiseAltM] */
export type SampleFlight = [number, number, number, number, number, number, number, number, number, number];

/** terrain.json: the highest elevation (m) in each lat/lon cell, row-major from the north-west corner. */
export type TerrainGrid = Omit<TrackTerrain, 'unitM' | 'elevations'> & { elevations: number[] };

/**
 * A push notification for the mockup, formatted by the app's own notification code.
 * The event happened `agoSec` before now; `message` has NOTIFICATION_TIME_TOKEN where
 * the event's local time goes, since that depends on the visitor's clock.
 */
export interface SampleNotification {
  title: string;
  message: string;
  agoSec: number;
}
export const NOTIFICATION_TIME_TOKEN = '{time}';

/** An aircraft in the air right now: `progress` of the way along its route, fix received `ageSec` ago. */
export interface SampleLiveFlight {
  id: number;
  trackerId: number;
  pilotId: number;
  from: number;
  to: number;
  seed: number;
  cruiseKmh: number;
  cruiseAltM: number;
  progress: number;
  ageSec: number;
  locationLabel: string | null;
}

export interface SampleMaintenanceItem {
  id: string;
  name: string;
  schedule_type: 'hobbs' | 'tach' | 'calendar';
  interval_hours?: number;
  interval_months?: number;
  /** Meter items: hours left until due, resolved against the estimated meter at runtime. */
  remaining_hours?: number;
  /** Calendar items: when it was last done. */
  last_done_days_ago?: number;
}

export interface SampleData {
  appName: string;
  timezone: string;
  intervalSec: number;
  /** Minutes after local midnight today that "now" falls at in the schedule. */
  nowMinute: number;
  places: SamplePlace[];
  trackers: { id: number; name: string; type: string; active: boolean; deleted: boolean; assigned_aircraft: string; assigned_pilot: number }[];
  aircraft: { tail_number: string; name: string; active: boolean }[];
  pilots: { id: number; name: string; active: boolean }[];
  flights: SampleFlight[];
  live: SampleLiveFlight[];
  /** Age of the newest fix from each tracker on the ground (inReach keeps reporting while parked). */
  groundFixAgeSec: number;
  notifications: SampleNotification[];
  /** The terrain grid synthesizeTrack() keeps tracks above, elevations as base64 bytes. */
  terrain: Omit<TrackTerrain, 'elevations'> & { elevations: string };
  terrainClearanceM: number;
  regions: GeoCollection;
  /** Meter readings + schedule for the aircraft shown in the maintenance demo. */
  maintenance: {
    tail: string;
    hobbs_time: number;
    tach_time: number;
    recorded_days_ago: number;
    hobbs_correction: number;
    tach_correction: number;
    items: SampleMaintenanceItem[];
  };
  /** Pilot shown in the duty log demo. */
  dutyPilotId: number;
}

const DAYS = 150;
const INTERVAL_SEC = 120; // inReach aviation tracking interval
const BASE = 'Kodiak';
const NOW_MINUTE = 14 * 60 + 20;
const GROUND_FIX_AGE_SEC = 190;

// Height kept above the terrain grid. The grid holds each cell's highest point, so the
// real margin is usually more.
const TERRAIN_CLEARANCE_M = 150;
// The grid ships to the browser as one byte per cell, in 10 m steps (rounded up).
const TERRAIN_UNIT_M = 10;
// Cruise is picked from the ground more than this far from either end: nearer than that,
// the aircraft is climbing out or descending in anyway.
const CRUISE_EXEMPT_KM = 8;
const FT = 0.3048;

const FLEET = [
  { tail: 'N100DM', name: 'Beaver', tracker: 'inReach · Beaver', kmh: 185, altM: 500 },
  { tail: 'N200DM', name: 'Beaver', tracker: 'inReach · Beaver 2', kmh: 185, altM: 500 },
  { tail: 'N300DM', name: 'Cessna 206', tracker: 'inReach · 206', kmh: 215, altM: 650 },
];
const PILOTS = ['Alex Rivera', 'Jordan Lee', 'Sam Okafor'];

// Destination groups with a seasonal bump in demand, keyed by days ago so the pattern is
// stable whenever the page is viewed: weight = base + peak·exp(−((daysAgo − peakAgo)/spread)²).
const GROUPS = [
  { names: ['Port Lions', 'Ouzinkie', 'Old Harbor', 'Larsen Bay', 'Akhiok', 'Karluk'], base: 1.0, peak: 0, peakAgo: 0, spread: 1 },
  { names: ['Karluk Lake', 'Frazer Lake', 'Uganik Lake', 'Zachar Bay', 'Amook Bay', 'Uyak Bay'], base: 0.2, peak: 1.6, peakAgo: 88, spread: 28 },
  { names: ['Geographic Harbor', 'Kukak Bay', 'Hallo Bay', 'Kaflia Bay', 'Swikshak Lagoon'], base: 0.05, peak: 1.9, peakAgo: 58, spread: 22 },
  { names: ['Olga Bay', 'Alitak Bay', 'Deadman Bay', 'Kiliuda Bay'], base: 0.15, peak: 0.9, peakAgo: 34, spread: 22 },
  { names: ['Afognak Lake', 'Kitoi Bay', 'Seal Bay', 'Perenosa Bay', 'Paramanof Bay'], base: 0.15, peak: 1.5, peakAgo: 4, spread: 18 },
  { names: ['Ugak Bay', 'Pasagshak Bay', 'Kalsin Bay'], base: 0.3, peak: 0.4, peakAgo: 70, spread: 40 },
];

// Today, planned by hand: each aircraft's legs in order, ending on the ground at
// `landedAgoMin` or in the air on `live`, `progress` of the way along it with its last
// fix `ageSec` old.
const TODAY = [
  { route: ['Kodiak', 'Port Lions', 'Kodiak'], live: { to: 'Geographic Harbor', progress: 0.55, ageSec: 75 } },
  { route: ['Kodiak', 'Uganik Lake', 'Kodiak', 'Larsen Bay'], live: { to: 'Kodiak', progress: 0.4, ageSec: 130 } },
  { route: ['Kodiak', 'Old Harbor', 'Akhiok', 'Kodiak'], landedAgoMin: 38 },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPlaces(namedPoints: GeoCollection): { places: SamplePlace[]; index: Map<string, number> } {
  const wanted = [BASE, ...GROUPS.flatMap((g) => g.names)];
  const places: SamplePlace[] = [];
  const index = new Map<string, number>();
  for (const name of wanted) {
    const f = namedPoints.features.find((x) => x.properties.name === name && x.geometry.type === 'Point');
    if (!f) throw new Error(`showcase sample data: no named point called "${name}"`);
    const [lon, lat] = f.geometry.coordinates as [number, number];
    index.set(name, places.length);
    places.push([name, lat, lon]);
  }
  return { places, index };
}

/** Highest terrain under a track, sampled about every 500 m, away from its ends. */
function highestGround(terrain: TrackTerrain, track: TrackFix[]): number {
  const kmPerDegLat = 110.57;
  const kmPerDegLon = 111.32 * Math.cos(track[0][1] * Math.PI / 180);
  const km = (a: TrackFix, b: TrackFix): number => Math.hypot((b[1] - a[1]) * kmPerDegLat, (b[2] - a[2]) * kmPerDegLon);
  const total = track.slice(1).reduce((sum, p, i) => sum + km(track[i], p), 0);
  let highest = 0, along = 0;
  for (let i = 0; i < track.length - 1; i++) {
    const [a, b] = [track[i], track[i + 1]];
    const segKm = km(a, b);
    const steps = Math.max(1, Math.ceil(segKm / 0.5));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const d = along + segKm * f;
      if (d < CRUISE_EXEMPT_KM || total - d < CRUISE_EXEMPT_KM) continue;
      const row = Math.floor((terrain.north - (a[1] + (b[1] - a[1]) * f)) / terrain.cellLat);
      const col = Math.floor((a[2] + (b[2] - a[2]) * f - terrain.west) / terrain.cellLon);
      if (row < 0 || row >= terrain.rows || col < 0 || col >= terrain.cols) continue;
      highest = Math.max(highest, terrain.elevations[row * terrain.cols + col] * terrain.unitM);
    }
    along += segKm;
  }
  return highest;
}

export function buildSampleData(namedPoints: GeoCollection, regions: GeoCollection, terrainGrid: TerrainGrid): SampleData {
  const { places, index } = buildPlaces(namedPoints);
  // lookupNamedPoint (src/geocoding.ts) over the same dataset: the closest named point
  // whose radius (maxKm, default 10) covers the fix.
  const namedPlaces = namedPoints.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return { name: String(f.properties.name), lat, lon, maxKm: Number(f.properties.maxKm ?? 10) };
    });
  const nearestNamedPoint = (lat: number, lon: number) => {
    let best: { location_label: string; place_lat: number; place_lon: number; km: number } | null = null;
    for (const p of namedPlaces) {
      const km = haversineKm(lat, lon, p.lat, p.lon);
      if (km <= p.maxKm && (!best || km < best.km)) best = { location_label: p.name, place_lat: p.lat, place_lon: p.lon, km };
    }
    return best;
  };
  const terrainBytes = Uint8Array.from(terrainGrid.elevations, (e) => Math.min(255, Math.max(0, Math.ceil(e / TERRAIN_UNIT_M))));
  const terrain: TrackTerrain = { ...terrainGrid, unitM: TERRAIN_UNIT_M, elevations: terrainBytes };
  const synth = (from: number, to: number, seed: number, kmh: number, altM: number): TrackFix[] =>
    synthesizeTrack(at(from), at(to), seed, kmh, altM, INTERVAL_SEC, terrain, TERRAIN_CLEARANCE_M);
  const rand = mulberry32(20260924);
  const base = index.get(BASE)!;
  const at = (i: number): [number, number] => [places[i][1], places[i][2]];
  const placeIndex = (name: string): number => {
    const i = index.get(name);
    if (i == null) throw new Error(`showcase sample data: "${name}" is not a sample place`);
    return i;
  };

  function pickDestination(daysAgo: number): number {
    const weights = GROUPS.map((g) => g.base + g.peak * Math.exp(-(((daysAgo - g.peakAgo) / g.spread) ** 2)));
    let r = rand() * weights.reduce((s, w) => s + w, 0);
    let g = 0;
    while (r > weights[g] && g < GROUPS.length - 1) r -= weights[g++];
    const names = GROUPS[g].names;
    return index.get(names[Math.floor(rand() * names.length)])!;
  }

  // One leg: the aircraft's usual altitude, or the next 500 ft above the highest ground
  // along the route plus clearance, whichever is higher. (The route's shape comes from the
  // seed alone, so the first track finds the ground the second one cruises over.)
  function planLeg(from: number, to: number, ac: typeof FLEET[number]): { seed: number; altM: number; track: TrackFix[] } {
    const seed = Math.floor(rand() * 2 ** 31);
    const usual = ac.altM + Math.round((rand() - 0.5) * 200);
    const ground = highestGround(terrain, synth(from, to, seed, ac.kmh, usual));
    const altM = Math.max(usual, Math.round(Math.ceil((ground + TERRAIN_CLEARANCE_M) / (500 * FT)) * 500 * FT));
    return { seed, altM, track: synth(from, to, seed, ac.kmh, altM) };
  }
  const legSeconds = (track: TrackFix[]): number => track[track.length - 1][0];

  const flights: SampleFlight[] = [];
  let nextId = 1;
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    if (rand() < 0.12) continue; // weather day, fleet stays tied up
    const rotation = Math.floor(daysAgo / 7);
    FLEET.forEach((ac, i) => {
      if (rand() < 0.12) return; // aircraft idle
      const pilot = (i + rotation) % PILOTS.length;
      if ((daysAgo + pilot * 2) % 7 === 0) return; // pilot's day off
      let t = 7.5 * 60 + Math.floor(rand() * 100); // minutes after local midnight
      const trips = 1 + Math.floor(rand() * 3);
      for (let trip = 0; trip < trips && t < 18 * 60; trip++) {
        const stops = [pickDestination(daysAgo)];
        if (rand() < 0.25) stops.push(pickDestination(daysAgo));
        const route = [base, ...stops, base];
        for (let leg = 0; leg < route.length - 1; leg++) {
          if (route[leg] === route[leg + 1]) continue;
          const { seed, altM, track } = planLeg(route[leg], route[leg + 1], ac);
          flights.push([nextId++, i + 1, pilot + 1, daysAgo, t, route[leg], route[leg + 1], seed, ac.kmh, altM]);
          t += Math.ceil(legSeconds(track) / 60) + 15 + Math.floor(rand() * 35);
        }
        t += 30 + Math.floor(rand() * 60);
      }
    });
  }

  // Today, laid out backwards from now so each aircraft's legs join up with a 20–45 min
  // turnaround between them. Pilots follow this week's rotation (tracker n flies with pilot n).
  const nowSec = NOW_MINUTE * 60;
  const live: SampleLiveFlight[] = [];
  const events: NotificationEvent[] = [];
  const turnaround = (): number => (20 + Math.floor(rand() * 25)) * 60;
  const eventBase = (trackerId: number, time: number, fix: TrackFix) => ({
    tracker_id: trackerId,
    tracker_name: FLEET[trackerId - 1].tail,
    time,
    lat: fix[1],
    lon: fix[2],
    velocity_kmh: fix[3],
    elevation_m: fix[4],
    mapshare_url: `https://share.garmin.com/${FLEET[trackerId - 1].tail}`,
    instance_url: 'https://flights.example.com/',
  });
  // Same labels the poller sends: the takeoff or landing point, named from the sample
  // place it's at (resolveEventLocationLabel in poller.ts).
  const labelAt = (fix: TrackFix, place: number): string | null => computeLiveLabel(
    { lat: fix[1], lon: fix[2], location_label: null },
    { location_label: places[place][0], place_lat: places[place][1], place_lon: places[place][2] },
  );
  // Takeoff: named from the takeoff point, with speed and altitude from the newest fix the
  // same poll picked up (poller.ts), here the one a poll interval later.
  const pushTakeoff = (trackerId: number, start: number, track: TrackFix[], from: number): void => {
    events.push({ type: 'takeoff', ...eventBase(trackerId, start, track[Math.min(2, track.length - 1)]), location_label: labelAt(track[0], from) });
  };

  TODAY.forEach((plan, i) => {
    const ac = FLEET[i];
    const trackerId = i + 1;
    const route = plan.route.map(placeIndex);
    let legEnd: number;
    if (plan.live) {
      const from = route[route.length - 1];
      const to = placeIndex(plan.live.to);
      const { seed, altM, track } = planLeg(from, to, ac);
      const cutoff = legSeconds(track) * plan.live.progress;
      const last = track.filter((p) => p[0] <= cutoff).pop()!;
      const start = nowSec - plan.live.ageSec - last[0];
      pushTakeoff(trackerId, start, track, from);
      // Same live label the Worker computes (resolveRefPoint + computeLiveLabel in
      // src/geocoding.ts): bearing/distance off the nearest named point the fix is within
      // range of, else off the flight's origin, standing in for the last geocoded point.
      const near = nearestNamedPoint(last[1], last[2]);
      const locationLabel = computeLiveLabel(
        { lat: last[1], lon: last[2], location_label: null },
        near ?? { location_label: places[from][0], place_lat: places[from][1], place_lon: places[from][2] },
      );
      live.push({
        id: 0, trackerId, pilotId: trackerId, from, to, seed, cruiseKmh: ac.kmh, cruiseAltM: altM,
        progress: plan.live.progress, ageSec: plan.live.ageSec, locationLabel,
      });
      legEnd = start - turnaround();
    } else {
      legEnd = nowSec - (plan.landedAgoMin ?? 0) * 60;
    }
    const legs: SampleFlight[] = [];
    for (let leg = route.length - 2; leg >= 0; leg--) {
      const [from, to] = [route[leg], route[leg + 1]];
      const { seed, altM, track } = planLeg(from, to, ac);
      const startMin = Math.floor((legEnd - legSeconds(track)) / 60);
      legs.unshift([0, trackerId, trackerId, 0, startMin, from, to, seed, ac.kmh, altM]);
      pushTakeoff(trackerId, startMin * 60, track, from);
      const landing = track[track.length - 1];
      events.push({ type: 'landing', ...eventBase(trackerId, startMin * 60 + landing[0], landing), location_label: labelAt(landing, to) });
      legEnd = startMin * 60 - turnaround();
    }
    for (const f of legs) { f[0] = nextId++; flights.push(f); }
  });
  for (const lv of live) lv.id = nextId++;

  // Newest first, as they'd stack up on a phone. The time in each message depends on the
  // visitor's clock, so it's formatted at a fixed moment here and swapped for a token.
  const refTime = 1_750_000_000;
  const refTimeText = formatLocalDateTime(refTime, 'America/Anchorage');
  const notifications = events
    .sort((a, b) => b.time - a.time)
    .map((e): SampleNotification => {
      const message = eventMessage({ ...e, time: refTime }, 'America/Anchorage');
      if (!message.includes(refTimeText)) throw new Error('showcase sample data: notification message has no time to replace');
      return { title: eventTitle(e), message: message.replace(refTimeText, NOTIFICATION_TIME_TOKEN), agoSec: nowSec - e.time };
    });

  return {
    appName: 'Wingbeat',
    timezone: 'America/Anchorage',
    intervalSec: INTERVAL_SEC,
    nowMinute: NOW_MINUTE,
    places,
    trackers: FLEET.map((ac, i) => ({
      id: i + 1, name: ac.tracker, type: 'inreach', active: true, deleted: false,
      assigned_aircraft: ac.tail, assigned_pilot: i + 1,
    })),
    aircraft: FLEET.map((ac) => ({ tail_number: ac.tail, name: ac.name, active: true })),
    pilots: PILOTS.map((name, i) => ({ id: i + 1, name, active: true })),
    flights,
    live,
    groundFixAgeSec: GROUND_FIX_AGE_SEC,
    notifications,
    terrain: { ...terrain, elevations: btoa(String.fromCharCode(...terrainBytes)) },
    terrainClearanceM: TERRAIN_CLEARANCE_M,
    regions,
    maintenance: {
      tail: 'N100DM',
      hobbs_time: 4172.4,
      tach_time: 3688.9,
      recorded_days_ago: 24,
      hobbs_correction: 1.04,
      tach_correction: 0.88,
      items: [
        { id: 'oil', name: 'Oil change', schedule_type: 'hobbs', interval_hours: 50, remaining_hours: 17.3 },
        { id: '100hr', name: '100-hour inspection', schedule_type: 'hobbs', interval_hours: 100, remaining_hours: 6.2 },
        { id: 'prop', name: 'Propeller overhaul', schedule_type: 'tach', interval_hours: 2000, remaining_hours: 311.5 },
        { id: 'annual', name: 'Annual inspection', schedule_type: 'calendar', interval_months: 12, last_done_days_ago: 128 },
        { id: 'elt', name: 'ELT battery', schedule_type: 'calendar', interval_months: 24, last_done_days_ago: 745 },
      ],
    },
    dutyPilotId: 1,
  };
}
