#!/usr/bin/env node
// The vector basemap's theme editor: color pickers for the parts that matter (water, land,
// parks, roads, labels, …) beside the live map, drawn by core's own mapStyle(). Save writes
// packages/core/src/map-theme.ts. Local only, and only while it runs (Ctrl-C).
//
//   nix develop path:./nix --command npm run map:theme
//
// Then open http://localhost:8797. PORT and ARCHIVE (a .pmtiles URL) override the defaults.

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME_FILE = path.join(ROOT, 'packages/core/src/map-theme.ts');
const PORT = Number(process.env.PORT ?? 8797);
const ARCHIVE = process.env.ARCHIVE ?? 'https://tiledata.dummthings.dev/pmtiles/alaska-basemap.pmtiles';
const BASES = ['light', 'white', 'grayscale', 'dark', 'black'];

/** Bundles an entry: a file (`entryPoints`) or source text (`stdin`). */
async function bundle(options) {
  const result = await build({ bundle: true, write: false, target: 'es2022', logLevel: 'warning', ...options });
  return result.outputFiles[0].text;
}

async function page() {
  const script = await bundle({
    entryPoints: [path.join(ROOT, 'scripts/map-theme-editor-page.ts')],
    platform: 'browser', format: 'iife', define: { ARCHIVE_URL: JSON.stringify(ARCHIVE) },
  });
  // The pages' own tags and tokens, so the editor draws with the same MapLibre.
  const head = await bundle({ platform: 'node', format: 'esm', stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    import { maplibreHeadTags } from './src/shared/maplibre';
    import { themeVars } from './src/shared/theme';
    import { PMTILES_SCRIPT_URL, PMTILES_SCRIPT_SRI } from '@wingbeat/core/elevation';
    export default maplibreHeadTags()
      + '<script src="' + PMTILES_SCRIPT_URL + '" integrity="' + PMTILES_SCRIPT_SRI + '" crossorigin="anonymous"></' + 'script>'
      + '<style>' + themeVars() + '</style>';
  ` } });
  const { default: tags } = await import('data:text/javascript;base64,' + Buffer.from(head).toString('base64'));
  return `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><title>Map theme</title>${tags}
<style>
  body { margin: 0; height: 100vh; display: flex; font: 14px var(--font-body); color: var(--text-primary); background: var(--bg-base); }
  #map { flex: 1; }
  aside { width: 320px; overflow-y: auto; padding: var(--space-4); box-sizing: border-box; background: var(--surface-1); border-right: 1px solid var(--border); }
  h2 { font-size: 13px; margin: var(--space-4) 0 var(--space-1); }
  label { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 2px 0; }
  label.changed span { font-weight: 700; }
  .actions { position: sticky; top: calc(-1 * var(--space-4)); background: var(--surface-1); padding: var(--space-2) 0; display: flex; gap: var(--space-2); z-index: 1; }
  textarea { width: 100%; height: 9rem; box-sizing: border-box; margin-top: var(--space-2); font: 12px var(--font-mono); }
</style>
<aside>
  <div class="actions"><button id="save">Save</button><button id="reset">Start over</button><span id="status"></span></div>
  <label><span>Starting from</span><select id="base">${BASES.map((b) => `<option>${b}</option>`).join('')}</select></label>
  <div id="groups"></div>
  <h2>As JSON</h2><textarea id="json" readonly></textarea>
</aside>
<div id="map"></div>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script></html>`;
}

/** A theme that's only a known base and plain hex colors, whatever the page sent. */
function checked({ base, colors }) {
  if (!BASES.includes(base)) throw new Error('unknown base');
  const colorsOf = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => {
    if (!/^[a-z_]+$/.test(k)) throw new Error('bad key ' + k);
    if (k === 'landcover') return [k, colorsOf(v)];
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('bad color for ' + k);
    return [k, v];
  }));
  return { base, colors: colorsOf(colors) };
}

function saveTheme(theme) {
  const source = readFileSync(THEME_FILE, 'utf8');
  const marker = 'export const MAP_THEME: MapTheme = ';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('no MAP_THEME in ' + THEME_FILE);
  writeFileSync(THEME_FILE, source.slice(0, at) + marker + JSON.stringify(theme, null, 2) + ';\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(async (req, res) => {
    // This machine's own page only, so another site can't write the file.
    const host = req.headers.host;
    const local = host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`;
    if (!local || (req.headers.origin && req.headers.origin !== 'http://' + host)) { res.writeHead(403).end(); return; }
    try {
      if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        for await (const chunk of req) body += chunk;
        saveTheme(checked(JSON.parse(body)));
        res.end('Saved');
      } else if (req.url === '/') {
        // Built on each load, so a reload shows the saved theme.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(await page());
      } else {
        res.writeHead(404).end();
      }
    } catch (err) {
      res.writeHead(400).end(String(err.message ?? err));
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`Map theme editor: http://localhost:${PORT} (Ctrl-C to stop)`));
}
