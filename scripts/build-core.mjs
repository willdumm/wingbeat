#!/usr/bin/env node
// Builds the browser bundle of @wingbeat/core: esbuild bundles src/client/core-entry.ts to
// an IIFE that assigns the core functions to the global names the pages' inline scripts
// call, and writes it to build/core-bundle.txt, with its SHA-256 prefix in
// build/core-bundle-hash.txt. The Worker imports both as Text modules
// (src/shared/core-bundle.ts) and serves the bundle at that content-hashed path, which pages load
// with a <script nonce src> ahead of the page script, so a missing bundle fails
// `wrangler deploy` instead of 404ing in the browser.
//
// This is Wrangler's [build] command (wrangler.example.toml, and the hosting repo's
// generated wrangler.toml), so `wrangler dev`, `wrangler deploy` and Workers Builds all run
// it. The tests (test/harness.mjs, test/worker.mjs) and `docs:showcase` build the same
// bundle in memory instead, through coreBundlePlugin().
//
//   nix develop path:./nix --command npm run build:core

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE_BUNDLE_PATH = path.join(ROOT, 'build/core-bundle.txt');
export const CORE_BUNDLE_HASH_PATH = path.join(ROOT, 'build/core-bundle-hash.txt');

/**
 * The bundle's name in its URL: 64 bits of SHA-256. Browsers cache that URL for a year with no
 * way to purge it, so two versions must never share one.
 */
export function coreBundleHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** The bundle's source text. */
export async function coreBundleText() {
  const result = await build({
    entryPoints: [path.join(ROOT, 'src/client/core-entry.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    // Minified: zod/mini makes up most of it.
    minify: true,
    write: false,
    banner: { js: '/* @wingbeat/core browser bundle (src/client/core-entry.ts) */' },
    logLevel: 'warning',
  });
  const text = result.outputFiles[0].text;
  // The showcase inlines it in a <script> element, which a literal "</script" would end early.
  if (/<\/script/i.test(text)) throw new Error('core bundle contains "</script"');
  return text;
}

/**
 * An esbuild plugin that resolves the Worker's imports of build/core-bundle.txt and
 * build/core-bundle-hash.txt to a freshly built bundle and its hash, without writing them to
 * disk (test files run in parallel).
 */
export function coreBundlePlugin() {
  let text;
  return {
    name: 'core-bundle',
    setup(b) {
      b.onResolve({ filter: /core-bundle(-hash)?\.txt$/ }, (args) => ({ path: path.basename(args.path), namespace: 'core-bundle' }));
      b.onLoad({ filter: /.*/, namespace: 'core-bundle' }, async (args) => {
        text ??= coreBundleText();
        const bundle = await text;
        return { contents: args.path === 'core-bundle-hash.txt' ? coreBundleHash(bundle) : bundle, loader: 'text' };
      });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = await coreBundleText();
  mkdirSync(path.dirname(CORE_BUNDLE_PATH), { recursive: true });
  writeFileSync(CORE_BUNDLE_PATH, text);
  writeFileSync(CORE_BUNDLE_HASH_PATH, coreBundleHash(text));
  console.log(`wrote ${path.relative(ROOT, CORE_BUNDLE_PATH)} (${(text.length / 1024).toFixed(1)} KB)`);
}
