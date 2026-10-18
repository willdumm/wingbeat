// The server-side escapers (src/shared/html.ts): escapeHtml for element text and quoted
// attributes, jsonForScript for data embedded in an inline <script>, and the client-side
// escHtml script chunk, which must escape the same characters.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [path.join(ROOT, 'src/shared/html.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { escapeHtml, jsonForScript, htmlEscapeScript } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const PAYLOAD = '</script><script>alert(1)</script><!-- "x" \'y\' & ' + String.fromCharCode(0x2028, 0x2029);

describe('escapeHtml', () => {
  test('escapes & < > " \'', () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`),
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  test('null and undefined are empty, other values stringified', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
  });
  test('the client escHtml agrees', () => {
    const ctx = vm.createContext({});
    vm.runInContext(htmlEscapeScript(), ctx);
    for (const s of [PAYLOAD, `'"<>&`, 'plain']) assert.equal(ctx.escHtml(s), escapeHtml(s));
    assert.equal(ctx.escHtml(null), '');
  });
});

describe('jsonForScript', () => {
  test('round-trips through JSON.parse', () => {
    const v = { appName: PAYLOAD, n: [1, 2, { k: '</script>' }], t: true, z: null };
    assert.deepEqual(JSON.parse(jsonForScript(v)), v);
  });
  test('cannot close the script element or open a comment', () => {
    const s = jsonForScript({ a: PAYLOAD });
    assert.ok(!new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']').test(s), s);
    assert.ok(!s.includes('</script>') && !s.includes('<!--'));
  });
  test('undefined becomes null', () => {
    assert.equal(jsonForScript(undefined), 'null');
  });
});
