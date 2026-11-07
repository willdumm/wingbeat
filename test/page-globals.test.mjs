// The page scripts call @wingbeat/core through globals that src/client/core-entry.ts binds
// by hand, and tsc can't see into the script strings, so a dropped or renamed global would
// only be a ReferenceError in the browser. This takes the real pages from the Worker:
// everything core-entry.ts assigns must be defined once the shipped bundle has run, and every
// identifier the pages' scripts use without declaring must be a bundle global, a browser
// global (lib.dom, through TypeScript's checker) or a vendored library's.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { startWorker } from './worker.mjs';
import { coreBundle } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['/', '/analytics'];
// Loaded by <script src> on the pages. (Leaflet, pmtiles on the dashboard, qrcode.)
const VENDORED = new Set(['L', 'pmtiles', 'QRCode']);

/** The names in core-entry.ts's Object.assign(globalThis, { … }) calls. */
function assignedNames() {
  const file = 'src/client/core-entry.ts';
  const sf = ts.createSourceFile(file, readFileSync(path.join(ROOT, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  const names = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText() === 'Object.assign' && n.arguments[0]?.getText() === 'globalThis') {
      for (const p of n.arguments[1].properties) names.push(p.name.getText());
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** The identifiers a classic script uses but neither it nor lib.dom declares. */
function freeIdentifiers(source) {
  const options = {
    allowJs: true, noEmit: true, noResolve: true, types: [], target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists } = host;
  host.getSourceFile = (name, version) => name === 'page.js'
    ? ts.createSourceFile(name, source, version, true, ts.ScriptKind.JS)
    : getSourceFile.call(host, name, version);
  host.fileExists = (name) => name === 'page.js' || fileExists.call(host, name);
  const program = ts.createProgram(['page.js'], options, host);
  const checker = program.getTypeChecker();
  const free = new Set();
  const isName = (n) => (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
    || (ts.isBindingElement(n.parent) && n.parent.propertyName === n)
    || ts.isLabeledStatement(n.parent) || ts.isBreakOrContinueStatement(n.parent);
  const visit = (n) => {
    if (ts.isIdentifier(n) && !isName(n)) {
      const symbol = ts.isShorthandPropertyAssignment(n.parent)
        ? checker.getShorthandAssignmentValueSymbol(n.parent)
        : checker.getSymbolAtLocation(n);
      if (!symbol) free.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(program.getSourceFile('page.js'));
  return free;
}

describe('the page globals', () => {
  let w;
  const inlineScripts = {};
  const bundles = {};
  let globals;
  before(async () => {
    w = await startWorker();
    for (const page of PAGES) {
      const html = await (await w.adminFetch('http://localhost' + page)).text();
      const src = /<script\b[^>]*\bsrc="(\/core-bundle\.\w+\.js)"/.exec(html)?.[1];
      bundles[page] = src && await (await w.adminFetch('http://localhost' + src)).text();
      inlineScripts[page] = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
        .filter(m => !/\bsrc=/.test(m[1])).map(m => m[2]);
    }
    const context = vm.createContext({
      window: { APP_SETTINGS: { timezone: 'America/Anchorage' }, addEventListener: () => {} },
      localStorage: { getItem: () => null, setItem: () => {} },
    });
    vm.runInContext(coreBundle, context);
    globals = context;
  });
  after(() => w?.dispose());

  test('everything core-entry.ts assigns is defined by the shipped bundle', () => {
    const names = assignedNames();
    assert.ok(names.length > 100, 'found ' + names.length + ' names');
    assert.deepEqual(names.filter(name => globals[name] === undefined), []);
  });

  for (const page of PAGES) {
    test(page + ' ships the bundle, and its scripts use no global that nothing defines', () => {
      assert.equal(bundles[page], coreBundle, 'the page loads the bundle');
      const free = freeIdentifiers(inlineScripts[page].join('\n;\n'));
      assert.deepEqual([...free].filter(name => globals[name] === undefined && !VENDORED.has(name)), []);
      // Guards the check itself: a walk that found nothing would pass the line above.
      assert.ok([...free].filter(name => globals[name] !== undefined).length > 100);
    });
  }

  test('the check finds what a script uses undeclared, and only that', () => {
    const free = freeIdentifiers(`
      const here = 1;
      function fn(arg) { return arg + here; }
      fn(missingCall());
      const o = { key: missingValue, missingShorthand };
      document.title = o.notAGlobal + window.notAGlobalEither;
      const { renamed: local } = o;
      label: for (;;) { break label; }
      typeof missingTypeof;
      local;
    `);
    assert.deepEqual([...free].sort(), ['missingCall', 'missingShorthand', 'missingTypeof', 'missingValue']);
  });
});
