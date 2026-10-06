#!/usr/bin/env node
// Builds the docs-site home page (the "showcase") from src/showcase/: bundles it with
// esbuild, feeds it the sample data in src/showcase/sample/ (named-points.geojson and
// regions.geojson, plus the committed terrain grid, src/showcase/terrain.json), and writes
//   site/data/showcase.json           — the page's code-derived parts (styles, scripts, logo,
//                                       phone mockup) for layouts/home.html; the prose is
//                                       content/_index.md
//   site/static/showcase/showcase.js  — the demos' client script
// Both are committed, like the doc screenshots. Re-run after changing any UI the demos
// render (they reuse the dashboard/analytics renderers, so that's most of src/):
//
//   nix develop path:./nix --command npm run docs:showcase
//   nix develop path:./nix --command npm run docs:showcase -- --check   # exit 1 if stale

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUTS = {
  data: path.join(ROOT, 'site/data/showcase.json'),
  js: path.join(ROOT, 'site/static/showcase/showcase.js'),
};
const check = process.argv.includes('--check');

const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/showcase/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  loader: { '.svg': 'text' },
  logLevel: 'warning',
});
const { buildShowcase } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
const out = buildShowcase({
  namedPoints: readJson('src/showcase/sample/named-points.geojson'),
  regions: readJson('src/showcase/sample/regions.geojson'),
  terrain: readJson('src/showcase/terrain.json'),
});

let stale = [];
for (const [key, file] of Object.entries(OUTPUTS)) {
  const rel = path.relative(ROOT, file);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === out[key]) continue;
  if (check) {
    stale.push(rel);
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, out[key]);
    console.log(`wrote ${rel} (${(out[key].length / 1024).toFixed(0)} KB)`);
  }
}

if (check) {
  if (stale.length) {
    console.error(`Showcase is out of date: ${stale.join(', ')}\nRun: npm run docs:showcase`);
    process.exit(1);
  }
  console.log('Showcase is up to date.');
}
