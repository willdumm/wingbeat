/**
 * One synthesized tracker fix: [secondsSinceStart, lat, lon, velocityKmh, elevationM, courseDeg].
 */
export type TrackFix = [number, number, number, number, number, number];

/**
 * Coarse terrain grid: the highest elevation in each lat/lon cell, row-major from the
 * north-west corner, in `unitM`-metre steps (see src/showcase/sample-data.ts).
 */
export interface TrackTerrain {
  north: number;
  west: number;
  cellLat: number;
  cellLon: number;
  rows: number;
  cols: number;
  unitM: number;
  elevations: ArrayLike<number>;
}

/**
 * Synthesizes an inReach-style track between two places for the showcase's sample data:
 * one fix every `intervalSec`, a takeoff/landing speed ramp, a climb and descent at
 * light-aircraft rates, and a gentle seeded bow so no route is ruler-straight. Every fix
 * between takeoff and landing is kept `clearanceM` above `terrain`, which on a climb out
 * of a valley reads as the steeper climb a pilot would fly there. The last fix is at
 * landing speed, below the flight-detection threshold, so a finished track reads as
 * "on ground".
 *
 * Self-contained (no free variables): src/showcase/scripts.ts embeds it into the browser
 * script via `.toString()` to expand the compact flight schedule into full tracks, and the
 * build calls it directly to place the in-flight aircraft — the same function either way.
 */
export function synthesizeTrack(
  from: [number, number],
  to: [number, number],
  seed: number,
  cruiseKmh: number,
  cruiseAltM: number,
  intervalSec: number,
  terrain: TrackTerrain,
  clearanceM: number,
): TrackFix[] {
  // mulberry32
  let a = seed >>> 0;
  const rand = (): number => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const toRad = (d: number): number => d * Math.PI / 180;

  // Local flat-earth frame in km — plenty accurate over a 200 km hop.
  const kmPerDegLat = 110.57;
  const kmPerDegLon = 111.32 * Math.cos(toRad((from[0] + to[0]) / 2));
  const dx = (to[1] - from[1]) * kmPerDegLon;
  const dy = (to[0] - from[0]) * kmPerDegLat;
  const dist = Math.max(0.5, Math.hypot(dx, dy));
  const px = -dy / dist, py = dx / dist; // unit perpendicular
  const bow = (rand() - 0.5) * 0.24 * dist;

  // Linear speed ramps of `ramp` seconds at each end, cruise in between.
  const ramp = 90;
  const vs = cruiseKmh / 3600; // km/s
  const total = dist / vs + ramp;
  const along = (t: number): number => {
    if (t < ramp) return vs * t * t / (2 * ramp);
    if (t > total - ramp) return dist - vs * (total - t) * (total - t) / (2 * ramp);
    return vs * (t - ramp / 2);
  };
  const climbMps = 3.5, descentMps = 3; // ≈ 700 and 600 ft/min
  const terrainAt = (lat: number, lon: number): number => {
    const row = Math.floor((terrain.north - lat) / terrain.cellLat);
    const col = Math.floor((lon - terrain.west) / terrain.cellLon);
    if (row < 0 || row >= terrain.rows || col < 0 || col >= terrain.cols) return 0;
    return terrain.elevations[row * terrain.cols + col] * terrain.unitM;
  };

  const times: number[] = [];
  for (let t = 0; t < total - intervalSec / 3; t += intervalSec) times.push(t);
  times.push(total);

  const fixes: TrackFix[] = times.map((t) => {
    const f = Math.min(1, along(t) / dist);
    const lateral = bow * Math.sin(Math.PI * f) + (f > 0 && f < 1 ? (rand() - 0.5) * 0.4 : 0);
    const xKm = dx * f + px * lateral;
    const yKm = dy * f + py * lateral;
    const lat = from[0] + yKm / kmPerDegLat;
    const lon = from[1] + xKm / kmPerDegLon;
    const speedFrac = Math.min(1, t / ramp, (total - t) / ramp);
    const v = t >= total ? 28 : Math.max(45, cruiseKmh * speedFrac) + (rand() - 0.5) * 8;
    const e = Math.max(2, Math.min(cruiseAltM, climbMps * t, descentMps * (total - t)) + (rand() - 0.5) * 30);
    return [Math.round(t), Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, Math.round(v), Math.round(e), 0];
  });

  // Hold each airborne fix above the highest terrain between it and its neighbours.
  for (let i = 1; i < fixes.length - 1; i++) {
    const [, lat, lon] = fixes[i];
    const ground = Math.max(
      terrainAt(lat, lon),
      terrainAt((lat + fixes[i - 1][1]) / 2, (lon + fixes[i - 1][2]) / 2),
      terrainAt((lat + fixes[i + 1][1]) / 2, (lon + fixes[i + 1][2]) / 2),
    );
    fixes[i][4] = Math.max(fixes[i][4], Math.round(ground + clearanceM));
  }

  // Course over ground toward the next fix (the last fix keeps the previous heading).
  for (let i = 0; i < fixes.length; i++) {
    const p = fixes[Math.max(0, Math.min(i, fixes.length - 2))];
    const q = fixes[Math.max(1, Math.min(i + 1, fixes.length - 1))];
    const brg = Math.atan2((q[2] - p[2]) * kmPerDegLon, (q[1] - p[1]) * kmPerDegLat) * 180 / Math.PI;
    fixes[i][5] = Math.round((brg + 360) % 360);
  }
  return fixes;
}
