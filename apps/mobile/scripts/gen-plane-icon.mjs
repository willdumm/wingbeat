// Writes assets/plane.png: the dashboard's plane (src/dashboard/scripts/icons.ts) as a
// signed distance field, nose up, for the map's plane markers (live-map.tsx), which tint it
// with each tracker's color and outline it with a halo. Drawn at 3x (108 px for the web's
// 36 px icon), so the map shows it at icon-size 1/3. MapLibre reads an SDF icon's alpha as
// distance: 192 on the outline, 32 less for each pixel outside it (6 px of room for the halo).
// Run: node scripts/gen-plane-icon.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const PATH = 'm 32,10.2 0.4,0.7 0.2,0.6 4.7,0 0,0.2 -4.6,0.1 0.1,0.4 0.7,0 0.6,0.2 0.3,0.4 0.2,0.7 0.3,3.5 0.1,3 11.3,0 15.6,0.7 0.6,0.4 0.3,0.8 0,5.5 -17.5,2.5 -10.6,0 -1.8,14.1 8,1.2 0.4,0.5 0.2,1.1 0,1.2 -0.2,0.9 -0.4,0.7 -7.3,1.1 -1.3,-2.5 -0.1,5.6 -0.2,0.1 -0.2,-0.1 -0.1,-5.6 -1.3,2.5 -7.3,-1.1 -0.4,-0.7 -0.2,-0.9 0,-1.2 0.2,-1.1 0.4,-0.4 8,-1.3 -1.8,-14.1 -10.6,0 -17.5,-2.5 0,-5.5 0.3,-0.8 0.6,-0.3 15.6,-0.8 11.3,0 0.1,-3 0.3,-3.5 0.2,-0.7 0.3,-0.4 0.6,-0.2 0.7,0 0.1,-0.4 -4.7,-0.1 0,-0.2 4.8,0 0.2,-0.6 z';
const SCALE = 108 / 64;
const PAD = 8;
const SIZE = 108 + 2 * PAD;

// The path is one relative polyline. The web flips it vertically and turns it 180°, which
// for this left-right symmetric plane leaves it as drawn: nose up in image coordinates.
const pairs = PATH.replace(/^m\s*|\s*z$/g, '').split(/\s+/).map((p) => p.split(',').map(Number));
const poly = [];
let x = 0, y = 0;
for (const [dx, dy] of pairs) {
  x += dx; y += dy;
  poly.push([PAD + x * SCALE, PAD + y * SCALE]);
}

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const rows = [];
for (let j = 0; j < SIZE; j++) {
  const row = Buffer.alloc(1 + SIZE * 4);
  for (let i = 0; i < SIZE; i++) {
    const px = i + 0.5, py = j + 0.5;
    let d = Infinity, inside = false;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      d = Math.min(d, segDist(px, py, a, b));
      if ((a[1] > py) !== (b[1] > py) && px < a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
    }
    const alpha = Math.round(Math.max(0, Math.min(255, 192 - 32 * (inside ? -d : d))));
    row.set([255, 255, 255, alpha], 1 + i * 4);
  }
  rows.push(row);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(new URL('../assets/plane.png', import.meta.url), png);
