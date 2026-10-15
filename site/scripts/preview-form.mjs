// Render a markup snippet with the dashboard's real stylesheet at phone width in headless
// Chromium, print every form control's box, flag any two that overlap, and save a
// screenshot. --ios simulates iOS Safari's date/time input sizing, which no browser we can
// run here reproduces. See docs/frontend-patterns.md ("Checking form layout at phone width").
//
//   nix develop path:./nix --command node site/scripts/preview-form.mjs [--ios] \
//     [--width 375] [--out shot.png] snippet.html
//
// snippet.html is body markup, e.g. a .form-modal > .form-modal-panel > .form-modal-body
// with the .form-field / .form-field-row markup copied from the JS that builds the dialog.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { ios: { type: 'boolean' }, width: { type: 'string', default: '375' }, out: { type: 'string', default: 'preview-form.png' } },
});
if (positionals.length !== 1) throw new Error('usage: preview-form.mjs [--ios] [--width N] [--out file.png] snippet.html');

// The stylesheet, straight from the TypeScript that serves it.
const bundled = await build({
  stdin: {
    contents: `import { themeVars } from './src/shared/theme';
      import { dashboardPageStyles } from './src/dashboard';
      export const css = themeVars() + dashboardPageStyles();`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.svg': 'text' }, logLevel: 'error',
});
let { css } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

if (opts.ios) {
  // iOS sizes date/time inputs as content-box whatever box-sizing says (WebKit bug 301648):
  // force that, and turn on the iOS-only rules (@supports (-webkit-touch-callout: none)).
  // Chromium has no ::-webkit-date-and-time-value, so rules on it (the value's inset and
  // height) don't show here.
  css = css.replaceAll('@supports (-webkit-touch-callout: none)', '@supports (display: block)') +
    ' input:is([type="date"], [type="time"], [type="datetime-local"]) { box-sizing: content-box !important; }';
}

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${css}</style></head><body>${readFileSync(positionals[0], 'utf8')}</body></html>`;

// Playwright's downloaded browsers don't run on NixOS, and its chrome-headless-shell from
// the flake crashes on this page; the flake's full Chromium works (as gen-doc-shots.mjs).
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browsersPath) throw new Error('Run inside the dev shell: nix develop path:./nix --command node ...');
const chromiumDir = readdirSync(browsersPath).find((d) => /^chromium-\d+$/.test(d));
const browser = await chromium.launch({ executablePath: path.join(browsersPath, chromiumDir, 'chrome-linux64', 'chrome') });
try {
  const page = await browser.newPage({ viewport: { width: Number(opts.width), height: 800 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')].map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.id || el.className || el.tagName, type: el.type, value: el.value, left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    }));
  for (const b of boxes) {
    console.log(`${b.name} (${b.type}${b.value ? ', filled' : ', empty'}): x ${b.left.toFixed(1)}–${b.right.toFixed(1)}, height ${b.height.toFixed(1)}`);
  }
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) console.log(`OVERLAP: ${a.name} and ${b.name}`);
    }
  }
  await page.screenshot({ path: opts.out });
  console.log(`screenshot: ${opts.out}`);
} finally {
  await browser.close();
}
