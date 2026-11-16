// Writes the map's SDF icons: assets/plane.png, the dashboard's plane
// (src/dashboard/scripts/icons.ts), nose up, for the plane markers, and assets/arrow.png, its
// direction arrow (makeArrowIcon), point up, for a tapped track point's heading.
// live-map.tsx tints each (a tracker's color, the accent) and outlines it with a halo. Both
// are drawn at 3x the web's size (36 px and 24 px), so the map shows them at icon-size 1/3.
// MapLibre reads an SDF icon's alpha as distance: 192 on the outline, 32 less for each pixel
// outside it (8 px of room for the halo).
// Run: node scripts/gen-map-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const PAD = 8;

const PLANE_PATH = 'm 32,10.2 0.4,0.7 0.2,0.6 4.7,0 0,0.2 -4.6,0.1 0.1,0.4 0.7,0 0.6,0.2 0.3,0.4 0.2,0.7 0.3,3.5 0.1,3 11.3,0 15.6,0.7 0.6,0.4 0.3,0.8 0,5.5 -17.5,2.5 -10.6,0 -1.8,14.1 8,1.2 0.4,0.5 0.2,1.1 0,1.2 -0.2,0.9 -0.4,0.7 -7.3,1.1 -1.3,-2.5 -0.1,5.6 -0.2,0.1 -0.2,-0.1 -0.1,-5.6 -1.3,2.5 -7.3,-1.1 -0.4,-0.7 -0.2,-0.9 0,-1.2 0.2,-1.1 0.4,-0.4 8,-1.3 -1.8,-14.1 -10.6,0 -17.5,-2.5 0,-5.5 0.3,-0.8 0.6,-0.3 15.6,-0.8 11.3,0 0.1,-3 0.3,-3.5 0.2,-0.7 0.3,-0.4 0.6,-0.2 0.7,0 0.1,-0.4 -4.7,-0.1 0,-0.2 4.8,0 0.2,-0.6 z';

// The path is one relative polyline in a 64-unit box. The web flips it vertically and turns it
// 180°, which for this left-right symmetric plane leaves it as drawn: nose up in image
// coordinates.
function planePolygon() {
  const pairs = PLANE_PATH.replace(/^m\s*|\s*z$/g, '').split(/\s+/).map((p) => p.split(',').map(Number));
  const poly = [];
  let x = 0, y = 0;
  for (const [dx, dy] of pairs) {
    x += dx; y += dy;
    poly.push([x, y]);
  }
  return poly;
}

// The web's arrow: points="0,-10 5,5 0,1 -5,5" in a -12…12 box, moved to 0…24.
const ARROW = [[0, -10], [5, 5], [0, 1], [-5, 5]].map(([x, y]) => [x + 12, y + 12]);

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}


/** An SDF PNG of poly (in a box `units` wide) drawn `px` wide, plus PAD each side. */
function sdfPng(poly, units, px) {
  const scale = px / units;
  const size = px + 2 * PAD;
  const pts = poly.map(([x, y]) => [PAD + x * scale, PAD + y * scale]);
  const rows = [];
  for (let j = 0; j < size; j++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let i = 0; i < size; i++) {
      const px = i + 0.5, py = j + 0.5;
      let d = Infinity, inside = false;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        d = Math.min(d, segDist(px, py, a, b));
        if ((a[1] > py) !== (b[1] > py) && px < a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
      }
      const alpha = Math.round(Math.max(0, Math.min(255, 192 - 32 * (inside ? -d : d))));
      row.set([255, 255, 255, alpha], 1 + i * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

fs.writeFileSync(new URL('../assets/plane.png', import.meta.url), sdfPng(planePolygon(), 64, 108));
fs.writeFileSync(new URL('../assets/arrow.png', import.meta.url), sdfPng(ARROW, 24, 72));
