// The dated default duty and duty method through the Worker's routes (migration 0002):
// PUT/DELETE /api/pilots/:id/default-duty and /api/duty-methods, their edit_history
// triggers and attribution, the edit conflict check against the whole list, the reads
// that carry the lists (GET /api/duty-days, /api/pilots, /api/duty-methods), the old
// single-value fields refused, and the migration's first (b) entry.
// test/worker.mjs runs src/index.ts in Miniflare on a fresh D1 database with every
// migration applied.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

let w;
before(async () => {
  w = await startWorker();
  await w.db.prepare("INSERT INTO pilots (id, name) VALUES (1, 'Pat'), (2, 'Quinn'), (3, 'Remy')").run();
});
after(() => w?.dispose());

const mark = async () => (await w.first('SELECT COALESCE(MAX(id), 0) AS id FROM edit_history')).id;
async function historySince(m) {
  const rows = await w.all('SELECT * FROM edit_history WHERE id > ? ORDER BY id', m);
  return rows.map(r => ({ ...r, before: r.before && JSON.parse(r.before), after: r.after && JSON.parse(r.after) }));
}
/** Writes stmts as another admin would (edit_actor set, as recordedBatch does). */
async function asOther(...stmts) {
  await w.db.batch([
    w.db.prepare("INSERT OR REPLACE INTO edit_actor (id, user_id, user_name) VALUES (1, 3, 'Bea Other')"),
    ...stmts,
    w.db.prepare('DELETE FROM edit_actor'),
  ]);
}

const putDefault = (pilot, body) => w.request('PUT', `/api/pilots/${pilot}/default-duty`, body);
const entry = (effective_date, duty_start, duty_end) => ({ effective_date, duty_start, duty_end });

describe('PUT/DELETE /api/pilots/:id/default-duty', () => {
  test('adds entries by date, recorded under the pilot, and the reads carry them', async () => {
    const m = await mark();
    const r1 = await putDefault(1, entry('2026-05-01', '08:00', '17:00'));
    assert.equal(r1.status, 200);
    const r2 = await putDefault(1, entry('2026-06-15', '07:00', '16:00'));
    assert.deepEqual(r2.body.default_duties, [entry('2026-05-01', '08:00', '17:00'), entry('2026-06-15', '07:00', '16:00')]);

    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.entity, x.entity_key, x.action, x.user_name]),
      [['pilot_default_duty', '1', 'insert', 'Ada Admin'], ['pilot_default_duty', '1', 'insert', 'Ada Admin']]);
    assert.deepEqual(h[1].after, { pilot_id: 1, ...entry('2026-06-15', '07:00', '16:00') });
    assert.equal((await w.all('SELECT * FROM edit_actor')).length, 0);

    const log = await w.request('GET', '/api/duty-days?pilot=1');
    assert.deepEqual(log.body.default_duties, r2.body.default_duties);
    assert.ok(Array.isArray(log.body.duty_methods));
    assert.equal(log.body.last_history_id, await mark());
    const pilots = (await w.request('GET', '/api/pilots')).body.pilots;
    assert.deepEqual(pilots.find(p => p.id === 1).default_duties, r2.body.default_duties);
    assert.deepEqual(pilots.find(p => p.id === 3).default_duties, []);
    assert.equal('default_duty_start' in pilots[0], false);

    const last = await w.request('GET', '/api/edit-history?entity=pilot_default_duty&key=1&limit=1');
    assert.equal(last.status, 200);
    assert.equal(last.body.history[0].id, await mark());
  });

  test('an entry on the same date is updated; replaces moves one to a new date; null times clear from a date', async () => {
    await putDefault(2, entry('2026-05-01', '08:00', '17:00'));
    const m = await mark();
    await putDefault(2, entry('2026-05-01', '08:30', '17:30'));
    let h = await historySince(m);
    assert.deepEqual(h.map(x => x.action), ['update']);
    assert.deepEqual([h[0].before.duty_start, h[0].after.duty_start], ['08:00', '08:30']);

    const m2 = await mark();
    const moved = await putDefault(2, { ...entry('2026-05-03', '08:30', '17:30'), replaces: '2026-05-01' });
    assert.deepEqual(moved.body.default_duties, [entry('2026-05-03', '08:30', '17:30')]);
    h = await historySince(m2);
    assert.deepEqual(h.map(x => [x.action, x.before?.effective_date ?? null, x.after?.effective_date ?? null]),
      [['delete', '2026-05-01', null], ['insert', null, '2026-05-03']]);

    const cleared = await putDefault(2, entry('2026-07-01', null, null));
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.default_duties.at(-1), entry('2026-07-01', null, null));
  });

  test('DELETE removes one entry, recorded; a date with none is 404', async () => {
    await putDefault(3, entry('2026-05-01', '08:00', '17:00'));
    await putDefault(3, entry('2026-06-01', '09:00', '18:00'));
    const m = await mark();
    const r = await w.request('DELETE', '/api/pilots/3/default-duty/2026-06-01');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.default_duties, [entry('2026-05-01', '08:00', '17:00')]);
    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.entity, x.entity_key, x.action, x.user_name]), [['pilot_default_duty', '3', 'delete', 'Ada Admin']]);
    assert.equal((await w.request('DELETE', '/api/pilots/3/default-duty/2026-06-01')).status, 404);
    assert.equal((await w.request('DELETE', '/api/pilots/3/default-duty/2026-02-31')).status, 400);
  });

  test('validation: times, dates, the pilot, and admins only', async () => {
    const bad = async (pilot, body, re, status = 400) => {
      const r = await putDefault(pilot, body);
      assert.equal(r.status, status, JSON.stringify(body));
      assert.match(r.body.error, re);
    };
    await bad(1, entry('2026-05-01', '08:00', '08:00'), /must differ/);
    await bad(1, entry('2026-05-01', '08:00', null), /both/);
    await bad(1, entry('2026-05-01', '8am', '17:00'), /HH:MM/);
    await bad(1, entry('2026-02-31', '08:00', '17:00'), /effective_date/);
    await bad(1, { ...entry('2026-05-01', '08:00', '17:00'), replaces: 'soon' }, /replaces/);
    await bad(1, { ...entry('2026-05-01', '08:00', '17:00'), base_history_id: -1 }, /base_history_id/);
    await bad(99, entry('2026-05-01', '08:00', '17:00'), /not found/, 404);
    const viewer = await w.request('PUT', '/api/pilots/1/default-duty', entry('2026-05-01', '08:00', '17:00'), { as: 'viewer' });
    assert.equal(viewer.status, 403);
  });

  test('PUT /api/pilots/:id refuses the old single default duty fields', async () => {
    const r = await w.request('PUT', '/api/pilots/1', { default_duty_start: '08:00', default_duty_end: '17:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /default-duty/);
    assert.equal((await w.request('PUT', '/api/pilots/1', { name: 'Pat' })).status, 200);
  });

  test('edit conflicts: a change to any of the pilot’s entries since the base is refused', async () => {
    await putDefault(1, entry('2026-08-01', '08:00', '17:00'));
    const base = await mark();
    await asOther(w.db.prepare("UPDATE pilot_default_duty SET duty_end = '18:00' WHERE pilot_id = 1 AND effective_date = '2026-05-01'"));
    const r = await putDefault(1, { ...entry('2026-08-01', '09:00', '17:00'), base_history_id: base });
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.user_name, 'Bea Other');
    assert.equal((await w.first("SELECT duty_start FROM pilot_default_duty WHERE pilot_id = 1 AND effective_date = '2026-08-01'")).duty_start, '08:00');
    assert.equal((await w.request('DELETE', `/api/pilots/1/default-duty/2026-08-01?base_history_id=${base}`)).status, 409);

    // Another pilot's list, a duty day or the method aren't this list.
    const base2 = await mark();
    await putDefault(2, entry('2026-09-01', '08:00', '17:00'));
    await w.request('PUT', '/api/duty-days/1', { dates: ['2026-08-02'], rest: true });
    await w.request('PUT', '/api/duty-methods', { effective_date: '2026-09-01', method: 'c' });
    assert.equal((await putDefault(1, { ...entry('2026-08-01', '09:00', '17:00'), base_history_id: base2 })).status, 200);
    await w.request('DELETE', '/api/duty-methods/2026-09-01');
  });
});

describe('/api/duty-methods', () => {
  test('dated entries: add, update, move, remove, all recorded under one key', async () => {
    // A fresh database starts with the migration's (b) entry.
    const seed = { effective_date: '2000-01-01', method: 'b' };
    assert.deepEqual((await w.request('GET', '/api/duty-methods')).body.methods, [seed]);
    const m = await mark();
    assert.equal((await w.request('PUT', '/api/duty-methods', { effective_date: '2026-01-01', method: 'b' })).status, 200);
    const r = await w.request('PUT', '/api/duty-methods', { effective_date: '2026-06-15', method: 'c' });
    assert.deepEqual(r.body.methods, [seed, { effective_date: '2026-01-01', method: 'b' }, { effective_date: '2026-06-15', method: 'c' }]);
    await w.request('PUT', '/api/duty-methods', { effective_date: '2026-01-01', method: 'c' });
    await w.request('PUT', '/api/duty-methods', { effective_date: '2026-06-16', method: 'c', replaces: '2026-06-15' });
    const del = await w.request('DELETE', '/api/duty-methods/2026-06-16');
    assert.deepEqual(del.body.methods, [seed, { effective_date: '2026-01-01', method: 'c' }]);
    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.entity, x.entity_key, x.action, x.user_name]), [
      ['duty_method', 'tenant', 'insert', 'Ada Admin'], ['duty_method', 'tenant', 'insert', 'Ada Admin'],
      ['duty_method', 'tenant', 'update', 'Ada Admin'],
      ['duty_method', 'tenant', 'delete', 'Ada Admin'], ['duty_method', 'tenant', 'insert', 'Ada Admin'],
      ['duty_method', 'tenant', 'delete', 'Ada Admin'],
    ]);
    assert.deepEqual([h[2].before.method, h[2].after.method], ['b', 'c']);

    const read = await w.request('GET', '/api/duty-methods');
    assert.deepEqual(read.body, { methods: del.body.methods, last_history_id: await mark() });
    assert.deepEqual((await w.request('GET', '/api/duty-days?pilot=1')).body.duty_methods, del.body.methods);
    assert.equal((await w.request('GET', '/api/edit-history?entity=duty_method&key=tenant')).body.history[0].id, await mark());
  });

  test('validation, admins only, and the old settings key refused', async () => {
    assert.equal((await w.request('PUT', '/api/duty-methods', { effective_date: '2026-01-01', method: 'd' })).status, 400);
    assert.equal((await w.request('PUT', '/api/duty-methods', { effective_date: '2026-13-01', method: 'b' })).status, 400);
    assert.equal((await w.request('DELETE', '/api/duty-methods/2030-01-01')).status, 404);
    assert.equal((await w.request('PUT', '/api/duty-methods', { effective_date: '2026-01-01', method: 'c' }, { as: 'viewer' })).status, 403);
    const patch = await w.request('PATCH', '/api/settings', { duty_method: 'c' });
    assert.equal(patch.status, 400);
    assert.match(patch.body.error, /duty-methods/);
  });

  test('edit conflicts: a change since the base is refused, with who', async () => {
    const base = await mark();
    await asOther(w.db.prepare("INSERT INTO duty_method_history (effective_date, method) VALUES ('2026-03-01', 'c')"));
    const r = await w.request('PUT', '/api/duty-methods', { effective_date: '2026-04-01', method: 'c', base_history_id: base });
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.user_name, 'Bea Other');
    assert.equal(await w.first("SELECT 1 FROM duty_method_history WHERE effective_date = '2026-04-01'"), null);
    assert.equal((await w.request('DELETE', `/api/duty-methods/2026-03-01?base_history_id=${base}`)).status, 409);
    assert.equal((await w.request('DELETE', `/api/duty-methods/2026-03-01?base_history_id=${await mark()}`)).status, 200);
  });

  test('edit_history stays append-only', async () => {
    await assert.rejects(w.run("UPDATE edit_history SET user_name = 'x' WHERE entity = 'duty_method'"), /append-only/);
  });
});

describe('migration 0002', () => {
  test('the method starts with one (b) entry, unrecorded; pilots keep their columns', async () => {
    assert.deepEqual(await w.all("SELECT * FROM duty_method_history WHERE effective_date = '2000-01-01'"),
      [{ effective_date: '2000-01-01', method: 'b' }]);
    assert.equal(await w.first("SELECT 1 FROM edit_history WHERE entity = 'duty_method' AND after LIKE '%2000-01-01%' AND action = 'insert'"), null);
    assert.deepEqual((await w.all('PRAGMA table_info(pilots)')).map(c => c.name), ['id', 'name', 'active']);
  });
});
