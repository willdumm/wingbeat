#!/usr/bin/env node
// Builds the browser bundle of @wingbeat/core: esbuild bundles src/client/core-entry.ts to
// an IIFE that assigns the core functions to the global names the pages' inline scripts
// call, and writes it to build/core-bundle.txt. The Worker imports that file as a Text
// module (src/shared/core-bundle.ts) and inlines it in a <script nonce> ahead of the page
// script, so a missing bundle fails `wrangler deploy` instead of 404ing in the browser.
//
// This is Wrangler's [build] command (wrangler.example.toml, and the hosting repo's
// generated wrangler.toml), so `wrangler dev`, `wrangler deploy` and Workers Builds all run
// it. The tests (test/harness.mjs, test/worker.mjs) and `docs:showcase` build the same
// bundle in memory instead, through coreBundlePlugin().
//
//   nix develop path:./nix --command npm run build:core

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE_BUNDLE_PATH = path.join(ROOT, 'build/core-bundle.txt');

/** The bundle's source text. */
export async function coreBundleText() {
  const result = await build({
    entryPoints: [path.join(ROOT, 'src/client/core-entry.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    write: false,
    banner: { js: '/* @wingbeat/core browser bundle (src/client/core-entry.ts) */' },
    logLevel: 'warning',
  });
  const text = result.outputFiles[0].text;
  // It's inlined in a <script> element, which a literal "</script" would end early.
  if (/<\/script/i.test(text)) throw new Error('core bundle contains "</script"');
  return text;
}

/**
 * An esbuild plugin that resolves the Worker's `import … from '../../build/core-bundle.txt'`
 * to a freshly built bundle, without writing it to disk (test files run in parallel).
 */
export function coreBundlePlugin() {
  return {
    name: 'core-bundle',
    setup(b) {
      b.onResolve({ filter: /core-bundle\.txt$/ }, () => ({ path: 'core-bundle', namespace: 'core-bundle' }));
      b.onLoad({ filter: /.*/, namespace: 'core-bundle' }, async () => ({ contents: await coreBundleText(), loader: 'text' }));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = await coreBundleText();
  mkdirSync(path.dirname(CORE_BUNDLE_PATH), { recursive: true });
  writeFileSync(CORE_BUNDLE_PATH, text);
  console.log(`wrote ${path.relative(ROOT, CORE_BUNDLE_PATH)} (${(text.length / 1024).toFixed(1)} KB)`);
}
