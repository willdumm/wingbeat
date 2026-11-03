// The Worker's SQL, through its real routes: the bulk flight-corrections upsert, the
// duty-day statement, the edit_history triggers (migration 0002), the
// incremental corrections sync (ENTRIES_SINCE_SQL) and the edit conflict check
// (base_history_id), plus route validation around them, and GET /api/flights/complete's
// ground trail, the flights and duty route groups' response shapes, the writes exactly as
// the web sends them (through @wingbeat/core's client, which checks their responses too),
// and the request validation (the core request schemas).
// test/worker.mjs runs src/index.ts in Miniflare on a fresh D1 database with every
// migration applied (Miniflare's SQLite may differ slightly from production D1's).
//
// One Worker and database serve the whole file, so each test uses its own flights (fresh
// start times from next()) and dates, and reads only the history written since its mark().

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';
import { importCore } from './core.mjs';

let w;
before(async () => {
  w = await startWorker();
  await w.db.batch([
    w.db.prepare("INSERT INTO aircraft (tail_number) VALUES ('N1'), ('N2')"),
    w.db.prepare("INSERT INTO pilots (id, name) VALUES (1, 'Pat'), (2, 'Quinn')"),
    w.db.prepare(`INSERT INTO trackers (id, name, type, source_url) VALUES
      (1, 'One', 'spot', 'https://example.com/1'), (2, 'Two', 'spot', 'https://example.com/2')`),
  ]);
});
after(() => w?.dispose());

let clock = 1_780_000_000;
/** A start time no other test uses. */
const next = () => (clock += 100_000);

/** Inserts a tracker's flight; returns its id. */
async function trackerFlight(start, end = start + 3600, { tracker = 1, pilot = 1, tail = 'N1' } = {}) {
  const r = await w.run('INSERT INTO flights (tracker_id, start_time, end_time, pilot_id, aircraft_tail) VALUES (?, ?, ?, ?, ?) RETURNING id',
    tracker, start, end, pilot, tail);
  return r.results[0].id;
}

/** The newest edit_history id. */
const mark = async () => (await w.first('SELECT COALESCE(MAX(id), 0) AS id FROM edit_history')).id;

/** edit_history rows after the mark, oldest first, with before/after parsed. */
async function historySince(m) {
  const rows = await w.all('SELECT * FROM edit_history WHERE id > ? ORDER BY id', m);
  return rows.map(r => ({ ...r, before: r.before && JSON.parse(r.before), after: r.after && JSON.parse(r.after) }));
}

const correction = (tracker, fst) =>
  w.first('SELECT * FROM flight_corrections WHERE tracker_id = ? AND flight_start_time = ?', tracker, fst);
const dutyDay = (pilot, date) => w.first('SELECT * FROM duty_days WHERE pilot_id = ? AND date = ?', pilot, date);

const bulk = (flights, set) => w.request('POST', '/api/flight-corrections/bulk', { flights, set });
const ref = (fst, tracker = 1) => ({ tracker_id: tracker, flight_start_time: fst });

describe('POST /api/flight-corrections/bulk', () => {
  test('Part 91 inserts rows for flights without one, attributed to the signed-in user', async () => {
    const a = next(), b = next();
    const m = await mark();
    const r = await bulk([ref(a), ref(b)], { part91: true });
    assert.equal(r.status, 200);
    for (const fst of [a, b]) {
      const row = await correction(1, fst);
      assert.equal(row.part91, 1);
      assert.equal(row.excluded, 0);
      assert.equal(row.unpaid, 0);
    }
    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.action, x.entity_key, x.user_id, x.user_name]),
      [['insert', `1/${a}`, 1, 'Ada Admin'], ['insert', `1/${b}`, 1, 'Ada Admin']]);
    // recordedBatch clears the actor in the same batch.
    assert.equal((await w.all('SELECT * FROM edit_actor')).length, 0);
  });

  test('keeps the other corrections, and Part 135 clears unpaid (tracked and manual)', async () => {
    const a = next();
    await w.run("INSERT INTO flight_corrections (tracker_id, flight_start_time, remark, part91, unpaid) VALUES (1, ?, 'Training', 1, 1)", a);
    const manual = await w.request('POST', '/api/flight-corrections',
      { pilot_id: 1, start_time: next(), end_time: clock + 3600, part91: true, unpaid: true, remark: 'Ferry' });
    assert.equal(manual.status, 200);
    const id = manual.body.entry.id;

    assert.equal((await bulk([ref(a), { entry_id: id }], { part91: false })).status, 200);
    const row = await correction(1, a);
    assert.deepEqual([row.part91, row.unpaid, row.remark], [0, 0, 'Training']);
    const m2 = await w.first('SELECT * FROM flight_corrections WHERE id = ?', id);
    assert.deepEqual([m2.part91, m2.unpaid, m2.remark, m2.pilot_id], [0, 0, 'Ferry', 1]);
  });

  test('removing keeps Part 91 and unpaid', async () => {
    const a = next();
    await w.run('INSERT INTO flight_corrections (tracker_id, flight_start_time, part91, unpaid) VALUES (1, ?, 1, 1)', a);
    await bulk([ref(a)], { excluded: true });
    const row = await correction(1, a);
    assert.deepEqual([row.part91, row.unpaid, row.excluded], [1, 1, 1]);
  });

  test('restore and Part 135 insert no rows for flights without corrections', async () => {
    const a = next(), b = next();
    const m = await mark();
    assert.equal((await bulk([ref(a), ref(b)], { excluded: false })).status, 200);
    assert.equal((await bulk([ref(a), ref(b)], { part91: false })).status, 200);
    assert.equal(await correction(1, a), null);
    assert.equal(await correction(1, b), null);
    assert.deepEqual(await historySince(m), []);
  });

  test('a row left empty is deleted, recorded as an update and a delete', async () => {
    const a = next();
    await bulk([ref(a)], { excluded: true });
    const m = await mark();
    await bulk([ref(a)], { excluded: false });
    assert.equal(await correction(1, a), null);
    assert.deepEqual((await historySince(m)).map(x => [x.action, x.entity_key]), [['update', `1/${a}`], ['delete', `1/${a}`]]);
  });

  test("the cleanup only touches the request's own tracked flights", async () => {
    // An empty row elsewhere (written outside the routes, say): not this request's to delete.
    const other = next(), a = next(), b = next();
    await w.run('INSERT INTO flight_corrections (tracker_id, flight_start_time) VALUES (2, ?)', other);
    await bulk([ref(a)], { excluded: true });
    await bulk([ref(b, 2)], { part91: true });
    const m = await mark();
    await bulk([ref(a), ref(b, 2)], { excluded: false });
    assert.equal(await correction(1, a), null);
    assert.notEqual(await correction(2, b), null);
    assert.notEqual(await correction(2, other), null, 'the unrelated empty row is kept');
    assert.ok((await historySince(m)).every(x => x.entity_key !== `2/${other}`));
  });

  test('setting what a flight already has records nothing', async () => {
    const a = next();
    await bulk([ref(a)], { part91: true });
    await w.run('UPDATE flight_corrections SET updated_at = 0 WHERE tracker_id = 1 AND flight_start_time = ?', a);
    const m = await mark();
    await bulk([ref(a)], { part91: true });
    assert.ok((await correction(1, a)).updated_at > 0, 'the row was written');
    assert.deepEqual(await historySince(m), []);
  });

  test('refuses an unknown tracker, a bad ref and a viewer', async () => {
    assert.equal((await bulk([ref(next(), 99)], { part91: true })).status, 400);
    assert.equal((await bulk([{ tracker_id: 1 }], { part91: true })).status, 400);
    assert.equal((await bulk([ref(next())], {})).status, 400);
    const r = await w.request('POST', '/api/flight-corrections/bulk', { flights: [ref(next())], set: { part91: true } }, { as: 'viewer' });
    assert.equal(r.status, 403);
  });
});

describe('PUT /api/duty-days/:pilot', () => {
  const put = (body, pilot = 1) => w.request('PUT', '/api/duty-days/' + pilot, body);

  test('rest_designated_at is set when rest is marked, kept on later edits, cleared when unmarked', async () => {
    const date = '2026-01-05';
    assert.equal((await put({ dates: [date], rest: true })).status, 200);
    const first = await dutyDay(1, date);
    assert.equal(first.rest, 1);
    assert.ok(first.rest_designated_at > 1_700_000_000, 'set to now');

    // An older designation survives an edit that keeps rest (the note, here).
    await w.run('UPDATE duty_days SET rest_designated_at = 1000 WHERE pilot_id = 1 AND date = ?', date);
    await put({ dates: [date], rest: true, note: 'Weathered in' });
    const kept = await dutyDay(1, date);
    assert.deepEqual([kept.rest, kept.rest_designated_at, kept.note], [1, 1000, 'Weathered in']);

    await put({ dates: [date], rest: false, note: 'Weathered in' });
    const unmarked = await dutyDay(1, date);
    assert.deepEqual([unmarked.rest, unmarked.rest_designated_at], [0, null]);
  });

  test('duty times replace rest, and a range writes every date', async () => {
    const dates = ['2026-01-10', '2026-01-11', '2026-01-12'];
    await put({ dates, rest: true });
    await put({ dates, duty_start: '07:00', duty_end: '01:30' });
    for (const date of dates) {
      const d = await dutyDay(1, date);
      assert.deepEqual([d.duty_start, d.duty_end, d.rest, d.rest_designated_at], ['07:00', '01:30', 0, null]);
    }
  });

  test('a note-only day is stored with null times; a day with nothing is deleted', async () => {
    const date = '2026-01-20';
    await put({ dates: [date], duty_start: '08:00', duty_end: '17:00' });
    await put({ dates: [date], note: '  Sim checkride  ' });
    const d = await dutyDay(1, date);
    assert.deepEqual([d.duty_start, d.duty_end, d.rest, d.rest_designated_at, d.note], [null, null, 0, null, 'Sim checkride']);

    const m = await mark();
    await put({ dates: [date, '2026-01-21'], note: '' });
    assert.equal(await dutyDay(1, date), null);
    assert.deepEqual((await historySince(m)).map(x => [x.entity, x.action, x.entity_key]), [['duty_days', 'delete', `1/${date}`]]);
  });

  test('refuses equal duty start and end', async () => {
    const r = await put({ dates: ['2026-01-25'], duty_start: '08:00', duty_end: '08:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /differ/);
    assert.equal(await dutyDay(1, '2026-01-25'), null);
  });
});

describe('edit_history triggers (migration 0002)', () => {
  test('flight_corrections: insert, update and delete, with the row before and after', async () => {
    const a = next();
    const m = await mark();
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a, remark: 'Check' });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a, remark: 'Checkride' });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a });
    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.entity, x.entity_key, x.action, x.user_name]), [
      ['flight_corrections', `1/${a}`, 'insert', 'Ada Admin'],
      ['flight_corrections', `1/${a}`, 'update', 'Ada Admin'],
      ['flight_corrections', `1/${a}`, 'delete', 'Ada Admin'],
    ]);
    assert.equal(h[0].before, null);
    assert.equal(h[0].after.remark, 'Check');
    assert.equal('updated_at' in h[0].after, false);
    assert.deepEqual([h[1].before.remark, h[1].after.remark], ['Check', 'Checkride']);
    assert.equal(h[2].before.remark, 'Checkride');
    assert.equal(h[2].after, null);
  });

  test("a manual flight's key is manual/<id>", async () => {
    const m = await mark();
    const r = await w.request('POST', '/api/flight-corrections', { pilot_id: 2, start_time: next(), end_time: clock + 600 });
    const id = r.body.entry.id;
    assert.equal((await w.request('DELETE', '/api/flight-corrections/' + id)).status, 200);
    assert.deepEqual((await historySince(m)).map(x => [x.entity_key, x.action]), [[`manual/${id}`, 'insert'], [`manual/${id}`, 'delete']]);
  });

  test('duty_days: insert, update and delete', async () => {
    const date = '2026-02-01';
    const m = await mark();
    await w.request('PUT', '/api/duty-days/2', { dates: [date], duty_start: '06:00', duty_end: '14:00' });
    await w.request('PUT', '/api/duty-days/2', { dates: [date], duty_start: '06:00', duty_end: '15:00' });
    await w.request('POST', '/api/duty-days/2/clear', { dates: [date] });
    const h = await historySince(m);
    assert.deepEqual(h.map(x => [x.entity, x.entity_key, x.action, x.user_id]),
      [['duty_days', `2/${date}`, 'insert', 1], ['duty_days', `2/${date}`, 'update', 1], ['duty_days', `2/${date}`, 'delete', 1]]);
    assert.deepEqual([h[1].before.duty_end, h[1].after.duty_end], ['14:00', '15:00']);
  });

  test('an update that changes nothing, or only updated_at, is not recorded', async () => {
    const a = next(), date = '2026-02-05';
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a, remark: 'Same' });
    await w.request('PUT', '/api/duty-days/1', { dates: [date], rest: true });
    const m = await mark();
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a, remark: 'Same' });
    await w.run('UPDATE flight_corrections SET updated_at = updated_at + 5 WHERE tracker_id = 1 AND flight_start_time = ?', a);
    await w.request('PUT', '/api/duty-days/1', { dates: [date], rest: true });
    assert.deepEqual(await historySince(m), []);
  });

  test('a write outside the routes is recorded with no user', async () => {
    const a = next();
    const m = await mark();
    await w.run("INSERT INTO flight_corrections (tracker_id, flight_start_time, remark) VALUES (2, ?, 'Script')", a);
    const [h] = await historySince(m);
    assert.deepEqual([h.entity_key, h.action, h.user_id, h.user_name], [`2/${a}`, 'insert', null, null]);
  });

  test('edit_history is append-only', async () => {
    await w.run("INSERT INTO flight_corrections (tracker_id, flight_start_time, remark) VALUES (2, ?, 'x')", next());
    await assert.rejects(w.run("UPDATE edit_history SET user_name = 'Mallory'"), /append-only/);
    await assert.rejects(w.run('DELETE FROM edit_history'), /append-only/);
  });

  test('a failed write records nothing (the batch is one transaction)', async () => {
    const m = await mark();
    // The CHECK on unpaid fails the upsert after edit_actor was set.
    await assert.rejects(w.db.batch([
      w.db.prepare("INSERT INTO edit_actor (id, user_id, user_name) VALUES (1, 1, 'Ada Admin')"),
      w.db.prepare('INSERT INTO flight_corrections (tracker_id, flight_start_time) VALUES (1, ?)').bind(next()),
      w.db.prepare('INSERT INTO flight_corrections (tracker_id, flight_start_time, unpaid) VALUES (1, ?, 1)').bind(next()),
      w.db.prepare('DELETE FROM edit_actor'),
    ]));
    assert.deepEqual(await historySince(m), []);
    assert.equal((await w.all('SELECT * FROM edit_actor')).length, 0);
  });
});

describe('flights_assignment_history_au (migration 0002)', () => {
  test("a tracked flight's reassignment is recorded under <tracker_id>/<start_time>", async () => {
    const s = next();
    const id = await trackerFlight(s);
    const m = await mark();
    const r = await w.request('PUT', '/api/flights/assignment', { flight_ids: [id], pilot_id: 2, aircraft_tail: 'N2' });
    assert.equal(r.status, 200);
    const h = await historySince(m);
    assert.equal(h.length, 1);
    assert.deepEqual([h[0].entity, h[0].entity_key, h[0].action, h[0].user_name], ['flight_assignment', `1/${s}`, 'update', 'Ada Admin']);
    assert.deepEqual(h[0].before, { pilot_id: 1, aircraft_tail: 'N1' });
    assert.deepEqual(h[0].after, { pilot_id: 2, aircraft_tail: 'N2' });
  });

  test('assigning what a flight already has, or changing other columns, records nothing', async () => {
    const id = await trackerFlight(next());
    const m = await mark();
    await w.request('PUT', '/api/flights/assignment', { flight_ids: [id], pilot_id: 1 });
    await w.run("UPDATE flights SET origin_label = 'PANC', modified_at = 5 WHERE id = ?", id);
    assert.deepEqual(await historySince(m), []);
  });
});

describe('GET /api/flight-corrections?since=', () => {
  const since = (n) => w.request('GET', '/api/flight-corrections?since=' + n);
  const byKey = (entries) => Object.fromEntries(entries.map(e => [e.tracker_id == null ? 'manual/' + e.id : e.tracker_id + '/' + e.flight_start_time, e]));

  test('returns each key changed after the cursor once: rows for live keys, deleted keys for gone ones', async () => {
    const kept = next(), gone = next(), reinserted = next();
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: gone, remark: 'Old' });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 2, flight_start_time: reinserted, remark: 'First' });
    const firstId = (await correction(2, reinserted)).id;
    const doomed = (await w.request('POST', '/api/flight-corrections', { pilot_id: 1, start_time: next(), end_time: clock + 60 })).body.entry.id;

    const cursor = await mark();
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: kept, remark: 'A' });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: kept, remark: 'B' });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: gone });   // deletes it
    await w.request('POST', '/api/flight-corrections', { tracker_id: 2, flight_start_time: reinserted });
    await w.request('POST', '/api/flight-corrections', { tracker_id: 2, flight_start_time: reinserted, remark: 'Second' });
    const manual = (await w.request('POST', '/api/flight-corrections', { pilot_id: 2, start_time: next(), end_time: clock + 60 })).body.entry.id;
    await w.request('DELETE', '/api/flight-corrections/' + doomed);
    // Other entities' history doesn't show up here.
    await w.request('PUT', '/api/duty-days/1', { dates: ['2026-03-01'], rest: true });

    const r = await since(cursor);
    assert.equal(r.status, 200);
    assert.equal(r.body.full, undefined);
    const entries = byKey(r.body.entries);
    assert.deepEqual(Object.keys(entries).sort(), [`1/${kept}`, `2/${reinserted}`, `manual/${manual}`].sort());
    assert.equal(r.body.entries.length, 3, 'each key once');
    assert.equal(entries[`1/${kept}`].remark, 'B');
    assert.equal(entries[`2/${reinserted}`].remark, 'Second');
    assert.notEqual(entries[`2/${reinserted}`].id, firstId, 'the re-inserted row, under its new id');
    assert.equal('key' in entries[`1/${kept}`], false);
    assert.deepEqual([...r.body.deleted].sort(), [`1/${gone}`, `manual/${doomed}`].sort());
    // The cursor is the newest id of any entity (the duty day's here), so it doubles as the
    // flight form's base_history_id.
    const newest = await mark();
    assert.equal(r.body.last_history_id, newest);

    // Caught up: nothing.
    const again = await since(newest);
    assert.deepEqual([again.body.entries.length, again.body.deleted.length, again.body.last_history_id], [0, 0, newest]);
  });

  test('without a cursor, or with one past the newest id, returns every row and full', async () => {
    const all = await w.all('SELECT id FROM flight_corrections ORDER BY id');
    for (const n of [0, 10_000_000]) {
      const r = await since(n);
      assert.equal(r.body.full, true);
      assert.deepEqual(r.body.entries.map(e => e.id), all.map(e => e.id));
      assert.deepEqual(r.body.deleted, []);
    }
  });
});

describe('POST /api/flight-corrections validation', () => {
  const post = (body) => w.request('POST', '/api/flight-corrections', body);

  test("refuses a corrected departure after the tracker's arrival, allows one equal to it", async () => {
    const s = next();
    await trackerFlight(s, s + 3600);
    const late = await post({ tracker_id: 1, flight_start_time: s, start_time: s + 3660 });
    assert.equal(late.status, 400);
    assert.match(late.body.error, /arrival would be before the departure/);
    const equal = await post({ tracker_id: 1, flight_start_time: s, start_time: s + 3600 });
    assert.equal(equal.status, 200);
    assert.equal(equal.body.entry.start_time, s + 3600);
  });

  test('refuses a corrected arrival before the tracked departure', async () => {
    const s = next();
    await trackerFlight(s, s + 3600);
    const r = await post({ tracker_id: 1, flight_start_time: s, end_time: s - 60 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /arrival would be before the departure/);
  });

  test('equal departure and arrival: allowed for a tracked flight, refused for a manual one', async () => {
    const s = next();
    await trackerFlight(s);
    assert.equal((await post({ tracker_id: 1, flight_start_time: s, start_time: s + 60, end_time: s + 60 })).status, 200);
    const manual = await post({ pilot_id: 1, start_time: s, end_time: s });
    assert.equal(manual.status, 400);
    assert.match(manual.body.error, /end_time must be after start_time/);
  });

  test('assign goes to the flight at (tracker_id, flight_start_time) only', async () => {
    const s = next(), other = next();
    const target = await trackerFlight(s, s + 3600, { tracker: 1 });
    const sameStartOtherTracker = await trackerFlight(s, s + 3600, { tracker: 2 });
    const otherFlight = await trackerFlight(other, other + 3600, { tracker: 1 });
    const m = await mark();
    const r = await post({ tracker_id: 1, flight_start_time: s, remark: 'Swap', assign: { pilot_id: 2 } });
    assert.equal(r.status, 200);
    const pilots = await w.all('SELECT id, pilot_id, aircraft_tail FROM flights WHERE id IN (?, ?, ?) ORDER BY id', target, sameStartOtherTracker, otherFlight);
    assert.deepEqual(pilots.map(f => [f.id, f.pilot_id, f.aircraft_tail]),
      [[target, 2, 'N1'], [sameStartOtherTracker, 1, 'N1'], [otherFlight, 1, 'N1']]);
    // The correction and the assignment in one write, both attributed.
    assert.deepEqual((await historySince(m)).map(x => [x.entity, x.entity_key, x.user_name]),
      [['flight_corrections', `1/${s}`, 'Ada Admin'], ['flight_assignment', `1/${s}`, 'Ada Admin']]);
  });

  test('an assign with no correction leaves no row; an assign with no flight is refused', async () => {
    const s = next();
    const id = await trackerFlight(s);
    const r = await post({ tracker_id: 1, flight_start_time: s, assign: { aircraft_tail: 'N2' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.entry, null);
    assert.equal(await correction(1, s), null);
    assert.equal((await w.first('SELECT aircraft_tail FROM flights WHERE id = ?', id)).aircraft_tail, 'N2');

    const missing = await post({ tracker_id: 1, flight_start_time: next(), remark: 'x', assign: { pilot_id: 2 } });
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /no flight starting at flight_start_time/);
  });
});

describe('edit conflicts (base_history_id)', () => {
  const post = (body) => w.request('POST', '/api/flight-corrections', body);
  const putDays = (body, pilot = 1) => w.request('PUT', '/api/duty-days/' + pilot, body);
  /** Writes fn()'s statements as another admin would (edit_actor set, as recordedBatch does). */
  async function asOther(fn) {
    await w.db.batch([
      w.db.prepare("INSERT OR REPLACE INTO edit_actor (id, user_id, user_name) VALUES (1, 3, 'Bea Other')"),
      ...fn(),
      w.db.prepare('DELETE FROM edit_actor'),
    ]);
  }

  test('a tracked flight: refused after a change to its corrections or its assignment, with who and when', async () => {
    const s = next();
    const id = await trackerFlight(s);
    const base = await mark();
    const save = { tracker_id: 1, flight_start_time: s, remark: 'Mine', base_history_id: base };

    await asOther(() => [w.db.prepare("INSERT INTO flight_corrections (tracker_id, flight_start_time, remark) VALUES (1, ?, 'Theirs')").bind(s)]);
    const r = await post(save);
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.user_name, 'Bea Other');
    assert.ok(r.body.conflict.at > 1_700_000_000);
    assert.equal(r.body.conflict.id, await mark());
    assert.match(r.body.error, /Changed by Bea Other/);
    assert.equal((await correction(1, s)).remark, 'Theirs', 'nothing written');
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM edit_actor')).n, 0);

    // From the new base it goes through.
    assert.equal((await post({ ...save, base_history_id: await mark() })).status, 200);
    assert.equal((await correction(1, s)).remark, 'Mine');

    // An aircraft/pilot change (PUT /api/flights/assignment) counts too.
    const base2 = await mark();
    assert.equal((await w.request('PUT', '/api/flights/assignment', { flight_ids: [id], pilot_id: 2 })).status, 200);
    const r2 = await post({ ...save, remark: 'Again', base_history_id: base2 });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.conflict.user_name, 'Ada Admin');
    assert.equal((await correction(1, s)).remark, 'Mine');
  });

  test("other records' changes, and a save without base_history_id, aren't conflicts", async () => {
    const s = next(), other = next();
    await trackerFlight(s);
    const base = await mark();
    await post({ tracker_id: 1, flight_start_time: other, remark: 'Elsewhere' });
    await putDays({ dates: ['2026-04-01'], rest: true });
    assert.equal((await post({ tracker_id: 1, flight_start_time: s, remark: 'A', base_history_id: base })).status, 200);
    // Stale, but unchecked: the API stays as it was for callers that don't send one.
    assert.equal((await post({ tracker_id: 1, flight_start_time: s, remark: 'B' })).status, 200);
    assert.equal((await correction(1, s)).remark, 'B');
  });

  test('a manual flight: PUT and DELETE are checked against its row', async () => {
    const created = (await post({ pilot_id: 1, start_time: next(), end_time: clock + 600 })).body.entry;
    const base = await mark();
    const body = { pilot_id: 1, start_time: created.start_time, end_time: created.end_time, remark: 'Mine', base_history_id: base };
    await asOther(() => [w.db.prepare("UPDATE flight_corrections SET remark = 'Theirs' WHERE id = ?").bind(created.id)]);
    const r = await w.request('PUT', '/api/flight-corrections/' + created.id, body);
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.user_name, 'Bea Other');
    const del = await w.request('DELETE', `/api/flight-corrections/${created.id}?base_history_id=${base}`);
    assert.equal(del.status, 409);
    assert.ok(await w.first('SELECT 1 FROM flight_corrections WHERE id = ?', created.id), 'not deleted');
    assert.equal((await w.request('DELETE', `/api/flight-corrections/${created.id}?base_history_id=${await mark()}`)).status, 200);
  });

  test('a Through range: a change to any of its days is a conflict, for a save and a clear', async () => {
    const dates = ['2026-05-01', '2026-05-02', '2026-05-03'];
    const base = await mark();
    await asOther(() => [w.db.prepare("INSERT INTO duty_days (pilot_id, date, note) VALUES (1, '2026-05-03', 'Theirs')")]);
    const r = await putDays({ dates, rest: true, base_history_id: base });
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.user_name, 'Bea Other');
    assert.equal(await dutyDay(1, '2026-05-01'), null, 'none of the days written');
    assert.equal((await w.request('POST', '/api/duty-days/1/clear', { dates, base_history_id: base })).status, 409);
    assert.equal((await dutyDay(1, '2026-05-03')).note, 'Theirs');

    // Another pilot's same date isn't this range.
    const base2 = await mark();
    await putDays({ dates: ['2026-05-02'], rest: true }, 2);
    assert.equal((await putDays({ dates, rest: true, base_history_id: base2 })).status, 200);
  });

  test("GET /api/duty-days returns the newest history id of any entity, the day form's base", async () => {
    await post({ tracker_id: 1, flight_start_time: next(), remark: 'x' });
    const r = await w.request('GET', '/api/duty-days?pilot=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.last_history_id, await mark());
    assert.ok(Array.isArray(r.body.days));
  });

  test('refuses a malformed base_history_id', async () => {
    const r = await putDays({ dates: ['2026-05-10'], rest: true, base_history_id: -1 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /base_history_id/);
    assert.equal((await w.request('DELETE', '/api/flight-corrections/1?base_history_id=abc')).status, 400);
  });
});

describe('GET /api/flights/complete ground trail', () => {
  const now = () => Math.floor(Date.now() / 1000);

  /** Seeds tracker id with a flight over [start, end] and ground points at groundTimes. */
  async function seed(id, start, end, groundTimes) {
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (?, 'T', 'spot', ?)",
      id, 'https://example.com/' + id);
    const fid = (await w.run('INSERT INTO flights (tracker_id, start_time, end_time, modified_at) VALUES (?, ?, ?, 1) RETURNING id',
      id, start, end)).results[0].id;
    for (const [t, v] of [[start, 50], [end, 20]]) {
      const pid = (await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, ?, ?) RETURNING id',
        t, v, id)).results[0].id;
      await w.run('INSERT INTO point_flights (point_id, flight_id) VALUES (?, ?)', pid, fid);
    }
    for (const t of groundTimes) {
      await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58.01, -154.01, 4, ?)', t, id);
    }
  }
  const complete = async (id) => (await w.request('GET', '/api/flights/complete?tracker=' + id)).body;

  test("is the points after the last flight's end, oldest first; last_point_time is the newest point", async () => {
    const t = now();
    await seed(10, t - 3 * 3600, t - 2 * 3600, [t - 4 * 3600, t - 5400, t - 600]);
    const body = await complete(10);
    assert.deepEqual(body.ground_trail.map(p => p.t), [t - 5400, t - 600]);
    assert.deepEqual(Object.keys(body.ground_trail[0]).sort(), ['c', 'e', 'lat', 'lon', 't', 'v']);
    assert.equal(body.last_point_time, t - 600);
    // The status card's other fields still come from the flight's points.
    assert.equal(body.flights[0].points.at(-1).t, t - 2 * 3600);
  });

  test('reaches back 12 hours only; last_point_time still counts older points', async () => {
    const t = now();
    await seed(11, t - 20 * 3600, t - 19 * 3600, [t - 13 * 3600]);
    let body = await complete(11);
    assert.deepEqual(body.ground_trail, []);
    assert.equal(body.last_point_time, t - 13 * 3600);
    await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, 3, 11)', t - 3600);
    body = await complete(11);
    assert.deepEqual(body.ground_trail.map(p => p.t), [t - 3600]);
  });

  test("starts after the newest fast point, so flights lagging the points don't make one in flight", async () => {
    const t = now();
    const point = (id, time, v) =>
      w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, ?, ?)', time, v, id);
    // runSegmentation has deleted the in-progress flight and not yet written it again: the
    // last flight is the previous one, and the current flight's points follow it.
    await seed(14, t - 5 * 3600, t - 4 * 3600, [t - 3600]);
    for (const dt of [1800, 1680, 1560, 120]) await point(14, t - dt, 150);
    assert.deepEqual((await complete(14)).ground_trail, []);
    // A poll stored new points and hasn't segmented them yet: fast ones past the flight's end
    // are no trail; slow ones after the newest fast one (a landing) are.
    await seed(15, t - 1800, t - 600, []);
    await point(15, t - 480, 150);
    assert.deepEqual((await complete(15)).ground_trail, []);
    await point(15, t - 360, 5);
    assert.deepEqual((await complete(15)).ground_trail.map(p => p.t), [t - 360]);
  });

  test('is empty while the latest flight is in progress, and for a tracker with no flights', async () => {
    const t = now();
    await seed(12, t - 1800, t - 60, []);
    assert.deepEqual((await complete(12)).ground_trail, []);
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (13, 'T', 'spot', 'https://example.com/13')");
    await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, 3, 13)', t - 60);
    const body = await complete(13);
    assert.deepEqual(body.ground_trail, []);
    assert.equal(body.last_point_time, t - 60);
  });
});

// Each route's real response parses with its response schema in @wingbeat/core/api, so a
// handler drifting from the contract the clients parse with fails here.
describe('response shapes: the flights route group', async () => {
  const z = await import('zod/mini');
  const api = await importCore('api/flights');
  const assertShape = (schema, body) => {
    const r = z.safeParse(schema, body);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  };

  test('GET /api/flights/complete, with flights, with nothing new, and with no tracker', async () => {
    const t = next();
    const fid = await trackerFlight(t, t + 1800, { tracker: 2 });
    await w.run('UPDATE flights SET modified_at = ? WHERE id = ?', t, fid);
    for (const [time, v] of [[t, 60], [t + 1800, 10]]) {
      const pid = (await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, ?, 2) RETURNING id', time, v)).results[0].id;
      await w.run('INSERT INTO point_flights (point_id, flight_id) VALUES (?, ?)', pid, fid);
    }
    const full = (await w.request('GET', '/api/flights/complete?tracker=2')).body;
    assert.ok(full.flights.some(f => f.id === fid));
    assertShape(api.FlightsCompleteResponse, full);
    assertShape(api.FlightsCompleteResponse,
      (await w.request('GET', '/api/flights/complete?tracker=2&since=' + full.last_modified_at)).body);
    assertShape(api.FlightsCompleteResponse, (await w.request('GET', '/api/flights/complete?tracker=999')).body);
  });

  test('GET /api/flight-corrections, full and as a delta with a deleted key', async () => {
    const a = next();
    await trackerFlight(a);
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a, remark: 'Shape' });
    await w.request('POST', '/api/flight-corrections', { pilot_id: 1, start_time: next(), end_time: clock + 600 });
    const full = (await w.request('GET', '/api/flight-corrections')).body;
    assert.equal(full.full, true);
    assert.ok(full.entries.length >= 2);
    assertShape(api.FlightCorrectionsResponse, full);
    const m = await mark();
    await w.request('POST', '/api/flight-corrections', { tracker_id: 1, flight_start_time: a });
    const delta = (await w.request('GET', '/api/flight-corrections?since=' + m)).body;
    assert.deepEqual(delta.deleted, ['1/' + a]);
    assertShape(api.FlightCorrectionsResponse, delta);
  });
});

describe('response shapes: the duty route group', async () => {
  const z = await import('zod/mini');
  const api = await importCore('api/duty');
  const assertShape = (schema, body) => {
    const r = z.safeParse(schema, body);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  };

  test('GET /api/duty-days, empty and with a duty day, a rest day, a note and a default duty', async () => {
    assertShape(api.DutyLogResponse, (await w.request('GET', '/api/duty-days?pilot=999')).body);
    await w.request('PUT', '/api/duty-days/2', { dates: ['2027-02-01'], duty_start: '08:00', duty_end: '17:00' });
    await w.request('PUT', '/api/duty-days/2', { dates: ['2027-02-02'], rest: true, note: 'Shape' });
    await w.request('PUT', '/api/pilots/2/default-duty', { effective_date: '2027-01-01', duty_start: '07:00', duty_end: '16:00' });
    const log = (await w.request('GET', '/api/duty-days?pilot=2')).body;
    assert.ok(log.days.length >= 2 && log.default_duties.length >= 1);
    assertShape(api.DutyLogResponse, log);
  });

  test('GET /api/duty-methods', async () => {
    await w.request('PUT', '/api/duty-methods', { effective_date: '2027-03-01', method: 'c' });
    const body = (await w.request('GET', '/api/duty-methods')).body;
    assert.ok(body.methods.some(m => m.method === 'c'));
    assertShape(api.DutyMethodsResponse, body);
    // The duty log carries the same list.
    assertShape(api.DutyLogResponse, (await w.request('GET', '/api/duty-days?pilot=1')).body);
  });
});

// The write routes validate their requests with @wingbeat/core/api's request schemas, so
// these send exactly what the pages send: the bodies built by core's corrections helpers
// and the duty forms' bodies, through core's own API client, as the page's client sends
// them. The client is strict here, so each response must also parse with its schema.
describe('the requests the web sends, through the core client', async () => {
  const { createApiClient, ApiHttpError } = await importCore('api/client');
  const capi = await importCore('api/corrections');
  const dapi = await importCore('api/duty');
  const { getEditHistory } = await importCore('api/edit-history');
  const corrections = await importCore('corrections');
  const time = await importCore('time');
  const TZ = 'America/Anchorage';
  let client;
  before(() => { client = createApiClient({ baseUrl: 'http://localhost', fetch: () => w.adminFetch }); });

  // The flight form's fields for a flight from start to end.
  const fields = (start, end, over = {}) => ({
    date: time.unixToTzDateStr(TZ, start), dep: time.unixToTzTime(TZ, start), arr: time.unixToTzTime(TZ, end),
    origin: '', dest: '', aircraft: '', pilot: '', part: '135', pay: 'paid', remark: '', ...over,
  });
  const noCoords = () => [null, null];

  test('the flight form: a tracked flight’s correction with its pilot change, then Revert to tracker', async () => {
    const a = Math.floor(next() / 60) * 60;   // on a minute, as the form’s times are
    const fid = await trackerFlight(a, a + 3600);
    const orig = { tracker_id: 1, start_time: a, end_time: a + 3600, origin_label: null, destination_label: null, aircraft_tail: 'N1', pilot_id: 1 };
    const target = { tracked: true, orig };
    const base = await mark();
    const v = corrections.readFlightForm(TZ, fields(a, a + 3600, { remark: 'Checkride', pilot: '2', aircraft: 'N1', part: '91' }), target);
    const req = corrections.flightSaveRequest(v, target, { removed: false, baseHistoryId: base, coords: noCoords });
    const { entry } = await capi.saveFlightCorrection(client, req.body);
    assert.equal(entry.remark, 'Checkride');
    assert.equal(entry.part91, 1);
    assert.equal((await w.first('SELECT pilot_id FROM flights WHERE id = ?', fid)).pilot_id, 2);
    // Its history, as the form's "Last changed by …" reads it.
    const { history } = await getEditHistory(client, ['flight_corrections', 'flight_assignment'], '1/' + a, 2);
    assert.deepEqual(history.map(h => h.entity).sort(), ['flight_assignment', 'flight_corrections']);
    assert.deepEqual(await capi.deleteFlightCorrection(client, entry.id, await mark()), { ok: true });
    assert.equal(await correction(1, a), null);
  });

  test('the flight form: a manual flight added, edited against its base, then deleted', async () => {
    const s = Math.floor(next() / 60) * 60;
    const target = { tracked: false, entryId: null };
    const v = corrections.readFlightForm(TZ, fields(s, s + 1800, { pilot: '1', origin: 'PAKN', part: '91', pay: 'unpaid' }), target);
    const req = corrections.flightSaveRequest(v, target, { removed: false, baseHistoryId: await mark(), coords: () => [58.7, -157] });
    const { entry } = await capi.saveFlightCorrection(client, req.body);
    assert.deepEqual([entry.origin_label, entry.unpaid, entry.start_lat], ['PAKN', 1, 58.7]);
    const edit = { tracked: false, entryId: entry.id };
    const v2 = corrections.readFlightForm(TZ, fields(s, s + 2400, { pilot: '2' }), edit);
    const req2 = corrections.flightSaveRequest(v2, edit, { removed: false, baseHistoryId: await mark(), coords: noCoords });
    const updated = (await capi.updateManualFlight(client, req2.entryId, req2.body)).entry;
    assert.deepEqual([updated.pilot_id, updated.end_time - updated.start_time], [2, 2400]);
    assert.deepEqual(await capi.deleteFlightCorrection(client, entry.id, await mark()), { ok: true });
  });

  test('the flight editor’s bulk actions: Part 91, remove and restore, and aircraft/pilot', async () => {
    const a = next();
    const fid = await trackerFlight(a);
    const manual = (await w.request('POST', '/api/flight-corrections', { pilot_id: 1, start_time: next(), end_time: clock + 600 })).body.entry;
    const flights = [
      { id: fid, tracker_id: 1, start_time: a, end_time: a + 3600, edit: null },
      { id: 'm', tracker_id: null, start_time: manual.start_time, end_time: manual.end_time, edit: { entry: manual, original: {} } },
    ];
    assert.deepEqual(await capi.setFlightFlags(client, corrections.flightFlagsRequest(flights, { part91: true })), { ok: true });
    assert.equal((await correction(1, a)).part91, 1);
    await capi.setFlightFlags(client, corrections.flightFlagsRequest(flights, { excluded: true }));
    await capi.setFlightFlags(client, corrections.flightFlagsRequest(flights, { excluded: false }));
    assert.equal((await correction(1, a)).excluded, 0);
    const r = await capi.setFlightAssignment(client, corrections.flightAssignmentRequest(flights, { pilot_id: 2 }));
    assert.deepEqual(r, { ok: true, pilot_id: 2, pilot_name: 'Quinn' });
    assert.deepEqual(await capi.setFlightAssignment(client, corrections.flightAssignmentRequest(flights.slice(0, 1), { aircraft_tail: null })),
      { ok: true, aircraft_tail: null });
    // The flight editor's delete of corrections no flight has any more: no base.
    assert.deepEqual(await capi.deleteFlightCorrection(client, manual.id), { ok: true });
  });

  test('the day form: a duty day with an empty note, a rest range, then Clear', async () => {
    const days = ['2027-05-01', '2027-05-02'];
    const base = await mark();
    // The form's body: rest a boolean, note the field's text ('' when empty).
    assert.deepEqual(await dapi.putDutyDays(client, 1, { dates: days.slice(0, 1), duty_start: '07:00', duty_end: '15:00', rest: false, note: '', base_history_id: base }), { ok: true });
    assert.equal((await dutyDay(1, days[0])).note, null);
    await dapi.putDutyDays(client, 1, { dates: days, duty_start: null, duty_end: null, rest: true, note: 'Off', base_history_id: await mark() });
    assert.equal((await dutyDay(1, days[1])).rest, 1);
    assert.deepEqual(await dapi.clearDutyDays(client, 1, { dates: days, base_history_id: await mark() }), { ok: true });
    assert.equal(await dutyDay(1, days[0]), null);
  });

  test('the default-duty form: an entry, moved (replaces), and removed', async () => {
    const first = await dapi.putDefaultDuty(client, 2, { effective_date: '2027-06-01', duty_start: '08:00', duty_end: '17:00', base_history_id: await mark() });
    assert.ok(first.default_duties.some(d => d.effective_date === '2027-06-01'));
    const moved = await dapi.putDefaultDuty(client, 2, { effective_date: '2027-06-02', duty_start: null, duty_end: null,
      base_history_id: await mark(), replaces: '2027-06-01' });
    assert.deepEqual(moved.default_duties.filter(d => d.effective_date.startsWith('2027-06')),
      [{ effective_date: '2027-06-02', duty_start: null, duty_end: null }]);
    const after = await dapi.deleteDefaultDuty(client, 2, '2027-06-02', await mark());
    assert.ok(!after.default_duties.some(d => d.effective_date.startsWith('2027-06')));
  });

  test('Global Settings’ duty method: an entry, moved, and removed', async () => {
    await dapi.putDutyMethod(client, { effective_date: '2027-07-01', method: 'c', base_history_id: await mark() });
    const moved = await dapi.putDutyMethod(client, { effective_date: '2027-07-02', method: 'b', base_history_id: await mark(), replaces: '2027-07-01' });
    assert.deepEqual(moved.methods.filter(m => m.effective_date.startsWith('2027-07')), [{ effective_date: '2027-07-02', method: 'b' }]);
    const after = await dapi.deleteDutyMethod(client, '2027-07-02', await mark());
    assert.ok(!after.methods.some(m => m.effective_date.startsWith('2027-07')));
  });

  test('a save refused as a conflict throws with the server’s message and its conflict', async () => {
    const date = '2027-08-01';
    const base = await mark();
    await w.request('PUT', '/api/duty-days/1', { dates: [date], rest: true });
    await assert.rejects(dapi.putDutyDays(client, 1, { dates: [date], duty_start: null, duty_end: null, rest: false, note: '', base_history_id: base }),
      (e) => e instanceof ApiHttpError && e.status === 409 && /^Changed by Ada Admin/.test(e.message) && e.conflict.user_name === 'Ada Admin');
  });
});

describe('request validation', () => {
  test('a field of the wrong type is a 400 naming it', async () => {
    const r = await w.request('POST', '/api/flight-corrections', { pilot_id: 1, start_time: next(), end_time: clock + 60, remark: 5 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /^remark: /);
    const ids = await w.request('PUT', '/api/flights/assignment', { flight_ids: ['1'], pilot_id: 1 });
    assert.equal(ids.status, 400);
    assert.match(ids.body.error, /^flight_ids\.0: /);
    const method = await w.request('PUT', '/api/duty-methods', { effective_date: '2027-09-01', method: 'x' });
    assert.equal(method.status, 400);
    assert.match(method.body.error, /^method: /);
    const days = await w.request('POST', '/api/duty-days/1/clear', { dates: '2027-09-01' });
    assert.match(days.body.error, /^dates: /);
  });

  test('unknown keys are dropped, not refused', async () => {
    const r = await w.request('POST', '/api/flight-corrections', { pilot_id: 1, start_time: next(), end_time: clock + 60, id: 999_999, updated_at: 1, extra: 'x' });
    assert.equal(r.status, 200);
    assert.notEqual(r.body.entry.id, 999_999);
    assert.notEqual(r.body.entry.updated_at, 1);
  });

  test('a body that isn’t JSON is a 400 with a JSON error', async () => {
    const r = await w.request('PUT', '/api/duty-days/1', '{"dates": [', { raw: true });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Malformed JSON in request body');
  });

  test('the handlers’ own checks still apply', async () => {
    const r = await w.request('POST', '/api/flight-corrections/bulk', { flights: [], set: { part91: true } });
    assert.deepEqual([r.status, r.body.error], [400, 'flights must be a non-empty array']);
    const bad = await w.request('PUT', '/api/duty-days/1', { dates: ['2027-09-01'], duty_start: '25:00', duty_end: '26:00' });
    assert.deepEqual([bad.status, bad.body.error], [400, 'Duty times must be HH:MM']);
  });
});
