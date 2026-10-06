#!/usr/bin/env node
// Generates docs screenshots from the real dashboard UI. See docs/doc-screenshots-plan.md.
//
// Boots wrangler dev --local against a throwaway D1 persist directory (never the real
// database — see the plan doc's isolation notes), seeds it with fixture data, joins
// through the real invite-token flow to get an authenticated session, then drives
// Playwright through each manifest entry.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { manifest } from './doc-shots.manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NIX_FLAKE = 'path:./nix';
const PORT = 8799;
const BASE_URL = `http://localhost:${PORT}`;
const SEED_TOKEN = 'doc-shots-seed-token';
// Only the DB binding name matters for a --local D1, so a checkout without its own
// wrangler.toml can run this against the template.
const WRANGLER_CONFIG = existsSync(path.join(ROOT, 'wrangler.toml')) ? 'wrangler.toml' : 'wrangler.example.toml';

function wrangler(args) {
  execFileSync('nix', ['develop', NIX_FLAKE, '--command', 'wrangler', ...args, '--config', WRANGLER_CONFIG], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Playwright's own downloaded chromium doesn't run on NixOS (missing ELF interpreter);
// the project's nix/flake.nix vendors a NixOS-patched build instead. Resolve its path
// through the flake rather than hardcoding a /nix/store hash, since that hash changes
// whenever the flake lock is updated.
function resolveNixChromium() {
  const browsersPath = execFileSync(
    'nix',
    ['develop', NIX_FLAKE, '--command', 'sh', '-c', 'echo $PLAYWRIGHT_BROWSERS_PATH'],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  const dir = readdirSync(browsersPath).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) throw new Error(`No chromium-* build found under ${browsersPath}`);
  return path.join(browsersPath, dir, 'chrome-linux64', 'chrome');
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Dev server never became ready at ${url}`);
}

async function captureOne(context, entry) {
  const page = await context.newPage();
  await page.addInitScript((theme) => localStorage.setItem('ft_theme', theme), entry.theme ?? 'light');
  await page.goto(entry.route);

  for (const setupSlug of entry.setup ?? []) {
    await page.locator(`[data-doc-shot="${setupSlug}"]`).click();
  }

  const target = page.locator(`[data-doc-shot="${entry.slug}"]`);
  // No custom timeout catch here: an unmatched tag should fail the whole run loudly —
  // that's the drift detector for a UI change that orphaned a doc image (see plan doc).
  await target.waitFor({ state: 'attached', timeout: 10000 });

  await target.evaluate((el) => {
    const closed = el.matches('details:not([open])') ? el : el.querySelector('details:not([open])');
    closed?.querySelector('summary')?.click();
  });
  await page.waitForTimeout(150);

  const outPath = path.join(ROOT, 'site/static/img/generated', `${entry.output}.png`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  // deviceScaleFactor: 2 on the context captures at full 2x pixel density for retina
  // sharpness. Left at native pixel size on disk (not downsampled) — site/assets/_custom.scss
  // displays generated screenshots at zoom: 0.5 so they render at the correct CSS size
  // without a lossy resize softening them.
  await (await target.elementHandle()).screenshot({ path: outPath });
  console.log(`  ${entry.slug} -> ${path.relative(ROOT, outPath)}`);

  await page.close();
}

async function main() {
  const persistDir = mkdtempSync(path.join(tmpdir(), 'doc-shots-d1-'));
  let devServer;
  try {
    console.log('Applying migrations + fixture seed to an ephemeral local D1...');
    const migrationsDir = path.join(ROOT, 'migrations');
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', persistDir, '--file', path.join('migrations', file)]);
    }
    wrangler(['d1', 'execute', 'DB', '--local', '--persist-to', persistDir, '--file', 'site/scripts/doc-shots-seed.sql']);

    console.log('Starting local dev server...');
    devServer = spawn(
      'nix',
      [
        'develop', NIX_FLAKE, '--command', 'wrangler', 'dev',
        '--config', WRANGLER_CONFIG,
        '--port', String(PORT),
        '--persist-to', persistDir,
        '--var', 'CUSTOMER_ROUTING:{"localhost":"DB"}',
        '--var', 'POLLER_SECRET:doc-shots-local-secret',
      ],
      { cwd: ROOT, stdio: 'ignore' }
    );
    await waitForServer(`${BASE_URL}/login`);

    const browser = await chromium.launch({ executablePath: resolveNixChromium() });
    const context = await browser.newContext({ baseURL: BASE_URL, deviceScaleFactor: 2 });
    await context.request.post(`/join/${SEED_TOKEN}`);

    console.log(`Capturing ${manifest.length} screenshot(s)...`);
    for (const entry of manifest) await captureOne(context, entry);

    await browser.close();
    console.log('Done.');
  } finally {
    devServer?.kill();
    rmSync(persistDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
