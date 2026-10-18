// Test harness for the Worker's routes and SQL (src/index.ts, migrations/): the real
// Worker, bundled with esbuild, runs in Miniflare against a fresh in-memory D1 database
// with every migration applied in order, and tests send it requests as a signed-in admin.
//
// Miniflare runs workerd's local SQLite build, which can differ slightly from the one
// behind production D1 (version, compile options, which functions are authorized), so a
// passing test here is strong evidence, not proof, that a statement behaves the same in
// production.
//
// Miniflare and workerd versions are tied together (Miniflare's own services need a
// compatibility date its workerd supports). The npm workerd binary doesn't run on NixOS,
// so the nix dev shell sets WINGBEAT_MINIFLARE to the Miniflare package shipped with its
// patched wrangler; elsewhere the one in node_modules is used.

import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { Miniflare } = await import(process.env.WINGBEAT_MINIFLARE
  ? pathToFileURL(path.join(process.env.WINGBEAT_MINIFLARE, 'dist/src/index.js')).href
  : 'miniflare');

const ADMIN_TOKEN = 'test-admin-session';
const VIEWER_TOKEN = 'test-viewer-session';

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Splits a migration file into statements: `--` comments dropped, split on `;` outside
 * string literals, except inside a CREATE TRIGGER, which runs to its `END;`.
 */
export function splitSql(sql) {
  const text = sql.split('\n').map(line => {
    // A `--` outside a string starts a comment.
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "'") inStr = !inStr;
      else if (!inStr && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
    }
    return line;
  }).join('\n');
  const stmts = [];
  let buf = '', inStr = false;
  for (const ch of text) {
    buf += ch;
    if (ch === "'") inStr = !inStr;
    if (ch !== ';' || inStr) continue;
    const s = buf.trim();
    if (/^CREATE\s+TRIGGER/i.test(s) && !/\bEND\s*;$/i.test(s)) continue;
    stmts.push(s);
    buf = '';
  }
  if (buf.trim()) stmts.push(buf.trim());
  return stmts;
}

/**
 * Starts the Worker on a fresh database: migrations applied, an admin (user 1, "Ada
 * Admin") and a viewer (user 2) signed in. Call dispose() when done (it stops workerd).
 *
 * Returns { db, request, sql, all, first, dispose, migrations }:
 *   request(method, path, body?, { as: 'admin' | 'viewer' | null, headers })  → { status, body }
 *                                         (as: null sends no session cookie; headers are added to the request; the result also has the response `headers`)
 * startWorker({ bindings }) overrides Worker bindings (a value of undefined leaves one unset).
 *   db                                    the D1 binding, for seeding and checking rows
 *   all(sql, ...params) / first(sql, ...params) / run(sql, ...params)  shorthands on it
 */
export async function startWorker({ bindings: overrides = {} } = {}) {
  const bundle = await build({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    bundle: true,
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    format: 'esm',
    write: false,
    loader: { '.svg': 'text' },
    logLevel: 'warning',
  });
  // A binding overridden to undefined is left unset.
  const bindings = { CUSTOMER_ROUTING: JSON.stringify({ localhost: 'DB' }), POLLER_SECRET: 'test-secret', ...overrides };
  for (const k of Object.keys(bindings)) if (bindings[k] === undefined) delete bindings[k];
  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2024-11-01',
    d1Databases: ['DB'],
    bindings,
  });
  try {
    const db = await mf.getD1Database('DB');
    const migrations = readdirSync(path.join(ROOT, 'migrations')).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of migrations) {
      const stmts = splitSql(readFileSync(path.join(ROOT, 'migrations', file), 'utf8'));
      await db.batch(stmts.map(s => db.prepare(s)));
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, name, role) VALUES (1, 'Ada Admin', 'admin'), (2, 'Vic Viewer', 'viewer')"),
      db.prepare('INSERT INTO sessions (user_id, token, token_hashed) VALUES (1, ?, 1), (2, ?, 1)')
        .bind(await sha256Hex(ADMIN_TOKEN), await sha256Hex(VIEWER_TOKEN)),
    ]);

    async function request(method, urlPath, body, { as = 'admin', headers = {} } = {}) {
      const resp = await mf.dispatchFetch('http://localhost' + urlPath, {
        method,
        headers: {
          ...(as === null ? {} : { cookie: 'session=' + (as === 'admin' ? ADMIN_TOKEN : VIEWER_TOKEN) }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      const text = await resp.text();
      let parsed = text;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      return { status: resp.status, body: parsed, headers: resp.headers };
    }

    const stmt = (sql, params) => db.prepare(sql).bind(...params);
    return {
      db,
      migrations,
      request,
      all: async (sql, ...params) => (await stmt(sql, params).all()).results,
      first: (sql, ...params) => stmt(sql, params).first(),
      run: (sql, ...params) => stmt(sql, params).run(),
      dispose: () => mf.dispose(),
    };
  } catch (err) {
    await mf.dispose();
    throw err;
  }
}
