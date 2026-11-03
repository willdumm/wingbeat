// Every time and date the pages show is in the operator's timezone (docs/mobile-app-plan.md,
// "Times and the operator's timezone"): client code gets the time from Date.now() and
// formats or splits it only through @wingbeat/core/time. This scans the client script
// sources outside core for `new Date(`, `toLocaleDateString` and `toLocaleTimeString`, so a
// new device-time display can't slip in. (`toLocaleString()` on a number is still fine.)
//
// KNOWN lists the uses that are still there, per file, until the phase 1 step that moves
// each file's logic to core removes them. The counts are exact: lower one when you remove
// a use, and the test fails if a file gains one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src/shared', 'src/dashboard', 'src/analytics', 'src/showcase', 'src/client'];
const PATTERN = /new Date\(|toLocaleDateString|toLocaleTimeString/g;

const KNOWN = {
  // Server-side: notification text, with an explicit timeZone. (Also inlined in the showcase.)
  'src/shared/format.ts': 1,
  // live / maintenance / alerts step.
  'src/shared/aircraft-info.ts': 9,
  'src/dashboard/scripts/alerts.ts': 4,
  'src/dashboard/scripts/hover.ts': 1,
  'src/dashboard/scripts/point-picker.ts': 1,
  // regions / accounting / analytics step.
  'src/analytics/scripts/streamgraph.ts': 6,
  'src/analytics/scripts/accounting.ts': 1,
  // Settings (device last seen, invite expiry, webhook last triggered, feed test).
  'src/shared/settings.ts': 11,
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
