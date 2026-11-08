// Every time and date the pages show is in the operator's timezone (docs/mobile-app-plan.md,
// "Times and the operator's timezone"): client code gets the time from Date.now() and
// formats or splits it only through @wingbeat/core/time. This scans the client script
// sources outside core for `new Date(`, `Intl.DateTimeFormat(`, `toLocaleDateString` and
// `toLocaleTimeString`, so a new device-time display can't slip in. (`toLocaleString()` on a
// number is still fine.)
//
// KNOWN lists the uses that are still there, per file, until the phase 1 step that moves
// each file's logic to core removes them. The counts are exact: lower one when you remove
// a use, and the test fails if a file gains one.
//
// Core itself may not read the device's clock or timezone at all: it takes `tz` and `now` as
// parameters. The second test scans packages/core/src, comments aside, and allows no use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src/shared', 'src/dashboard', 'src/analytics', 'src/showcase', 'src/client'];
const PATTERN = /new Date\(|Intl\.DateTimeFormat\(|toLocaleDateString|toLocaleTimeString/g;

const KNOWN = {
  // Server-side: notification text, with an explicit timeZone. (Also inlined in the showcase.)
  'src/shared/format.ts': 1,
  // Docs-site sample dates (UTC date math) and the phone mockup's clock (explicit timeZone).
  'src/showcase/scripts.ts': 3,
};

function* tsFiles(dir) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(rel);
    else if (e.name.endsWith('.ts')) yield rel;
  }
}

test('client scripts show times only through core time (no new device-time uses)', () => {
  const found = {};
  for (const dir of DIRS) {
    for (const file of tsFiles(dir)) {
      const n = (readFileSync(path.join(ROOT, file), 'utf8').match(PATTERN) ?? []).length;
      if (n) found[file] = n;
    }
  }
  assert.deepEqual(found, KNOWN);
});

/** What in a core source reads the device's clock or timezone: one message per use. */
function deviceTimeUses(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const uses = [];
  const rules = [
    /Date\.now\(/g,
    /new Date\((?!Date\.UTC\()/g,
    /Date\.parse\(/g,
    /\.get(?:Hours|Minutes|Seconds|Milliseconds|Date|Day|Month|FullYear|Year|TimezoneOffset)\(/g,
    /resolvedOptions\(\)/g,
    /toLocale(?:Date|Time)String\(/g,
  ];
  for (const rule of rules) for (const m of code.matchAll(rule)) uses.push(m[0]);
  // A formatter must name its zone: without one it formats in the device's.
  for (const m of code.matchAll(/Intl\.DateTimeFormat\(/g)) {
    let depth = 1, i = m.index + m[0].length;
    while (depth > 0 && i < code.length) { if (code[i] === '(') depth++; else if (code[i] === ')') depth--; i++; }
    if (!/\btimeZone\b/.test(code.slice(m.index, i))) uses.push('Intl.DateTimeFormat( without timeZone');
  }
  return uses;
}

test('core never reads the device clock or timezone', () => {
  const found = {};
  for (const file of tsFiles('packages/core/src')) {
    const uses = deviceTimeUses(readFileSync(path.join(ROOT, file), 'utf8'));
    if (uses.length) found[file] = uses;
  }
  assert.deepEqual(found, {});
});

test('the core scan catches each kind of use, and allows the safe forms', () => {
  for (const bad of ['Date.now()', 'new Date()', 'new Date(unix * 1000)', "Date.parse('2026-01-01')", 'd.getHours()', 'd.getDate()',
    'd.getTimezoneOffset()', 'new Intl.DateTimeFormat().resolvedOptions().timeZone', "new Intl.DateTimeFormat('en-US', { hour: 'numeric' })",
    "x.toLocaleTimeString('en-US')"]) {
    assert.notDeepEqual(deviceTimeUses(bad), [], bad);
  }
  for (const ok of ['new Date(Date.UTC(2026, 0, 1))', 'd.getUTCHours()', "new Intl.DateTimeFormat('en-US', { timeZone: tz })", 'map.get(key)',
    'n.toLocaleString("en-US")', '// Date.now() in a comment', '/* new Date() */', 'const fmts = new Map<string, Intl.DateTimeFormat>();']) {
    assert.deepEqual(deviceTimeUses(ok), [], ok);
  }
});
