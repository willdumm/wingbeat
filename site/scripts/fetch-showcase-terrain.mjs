#!/usr/bin/env node
// One-off: samples Mapterhorn's DEM (the same planet.pmtiles the elevation tool reads)
// into a coarse max-elevation grid around Kodiak and writes src/showcase/terrain.json.
// The showcase sample data (src/showcase/sample-data.ts) uses it to pick cruise
// altitudes that clear the terrain along each route. The grid is committed, so
// `npm run docs:showcase` stays offline and deterministic; re-run this only if the
// sample data moves to a different area.
//
// Needs the go-pmtiles CLI (not in the dev shell) and sharp (a dev dependency):
//
//   nix shell nixpkgs#pmtiles --command \
//     nix develop path:./nix --command node site/scripts/fetch-showcase-terrain.mjs

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src/showcase/terrain.json');
const DEM_URL = 'https://download.mapterhorn.com/planet.pmtiles';
const Z = 8; // ~165 m pixels at 512 px per tile; plenty for a ~2 km max grid
const TILE = 512;

// Output grid: lat/lon cells, each the highest DEM pixel inside it.
const BOUNDS = { south: 56.6, north: 58.9, west: -155.2, east: -151.8 };
const CELL = { lat: 0.02, lon: 0.03 }; // ≈ 2.2 km × 1.8 km at 57.5°N
const rows = Math.round((BOUNDS.north - BOUNDS.south) / CELL.lat);
const cols = Math.round((BOUNDS.east - BOUNDS.west) / CELL.lon);

const n = 2 ** Z;
const lonToX = (lon) => (lon + 180) / 360 * n;
const latToY = (lat) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
};
const yToLat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

const x0 = Math.floor(lonToX(BOUNDS.west)), x1 = Math.floor(lonToX(BOUNDS.east));
const y0 = Math.floor(latToY(BOUNDS.north)), y1 = Math.floor(latToY(BOUNDS.south));

const grid = new Array(rows * cols).fill(0);
for (let tx = x0; tx <= x1; tx++) {
  for (let ty = y0; ty <= y1; ty++) {
    const bytes = execFileSync('pmtiles', ['tile', DEM_URL, String(Z), String(tx), String(ty)], { maxBuffer: 1 << 26 });
    if (!bytes.length) continue; // no tile: open ocean, elevation 0
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    if (info.width !== TILE) throw new Error(`unexpected tile size ${info.width}`);
    for (let py = 0; py < TILE; py++) {
      const lat = yToLat(ty + (py + 0.5) / TILE);
      const row = Math.floor((BOUNDS.north - lat) / CELL.lat);
      if (row < 0 || row >= rows) continue;
      for (let px = 0; px < TILE; px++) {
        const lon = (tx + (px + 0.5) / TILE) / n * 360 - 180;
        const col = Math.floor((lon - BOUNDS.west) / CELL.lon);
        if (col < 0 || col >= cols) continue;
        const i = (py * TILE + px) * info.channels;
        // Terrarium encoding, as in shared/elevation.ts.
        const elev = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        const cell = row * cols + col;
        if (elev > grid[cell]) grid[cell] = Math.round(elev);
      }
    }
    process.stdout.write('.');
  }
}

writeFileSync(OUT, JSON.stringify({
  source: 'Mapterhorn planet.pmtiles, z8, max elevation (m) per cell; see site/scripts/fetch-showcase-terrain.mjs',
  north: BOUNDS.north, west: BOUNDS.west, cellLat: CELL.lat, cellLon: CELL.lon, rows, cols,
  // Row-major from the north-west corner.
  elevations: grid,
}) + '\n');
console.log(`\nwrote ${path.relative(ROOT, OUT)} (${rows}×${cols}, max ${Math.max(...grid)} m)`);
