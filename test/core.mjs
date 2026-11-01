// Imports a @wingbeat/core module's TypeScript directly, for tests of core itself: esbuild
// bundles it in memory (node can't import .ts) and the result is imported as a data URL.
// The browser bundle the pages ship is tested through test/harness.mjs instead.
//
//   const time = await importCore('time');   // packages/core/src/time.ts

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function importCore(name) {
  const bundle = await build({
    entryPoints: [path.join(ROOT, 'packages/core/src', name + '.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'warning',
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
