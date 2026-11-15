// The Export PDF form's period presets and range check (dutyExportPresets,
// dutyExportRangeError, @wingbeat/core/duty) and the PDF's Typst source (dutyLogTypstSource,
// @wingbeat/core/duty-pdf): warnings sit inside their day's block, between day rules only.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, TZ } from './core.mjs';
import { fixtures } from './duty-fixtures.mjs';

const { dutyExportPresets, dutyExportEarliest, dutyExportRangeError } = await importCore('duty');
const { dutyLogTypstSource, dutyLogPdfName } = await importCore('duty-pdf');
const { flight, duty, dutyMonth, nowSecs } = fixtures({ now: '2026-10-16 12:00' });
const typstSource = input => dutyLogTypstSource(TZ, nowSecs, input, 'Test');
const idx = (y, m) => y * 12 + m - 1;
const ranges = (shown, cur, earliest) =>
  Object.fromEntries(dutyExportPresets(shown, cur, earliest).map(p => [p.key, [p.from, p.to]]));

describe('export presets', () => {
  const cur = idx(2026, 10), earliest = cur - 11;

  test('on the first month of a quarter: the quarter so far, and the one before', () => {
    assert.deepEqual(ranges(cur, cur, earliest), {
      month: [cur, cur],
      quarter: [cur, cur],              // Q4 so far: October
      prevQuarter: [idx(2026, 7), idx(2026, 9)],
      year: [cur - 11, cur],
    });
  });

  test('a shown month earlier in the year', () => {
    const r = ranges(idx(2026, 5), cur, earliest);
    assert.deepEqual(r.quarter, [idx(2026, 4), idx(2026, 6)]);
    assert.deepEqual(r.prevQuarter, [idx(2026, 1), idx(2026, 3)]);
  });

  test('the previous quarter crosses the year boundary', () => {
    assert.deepEqual(ranges(idx(2026, 2), cur, cur - 24).prevQuarter, [idx(2025, 10), idx(2025, 12)]);
  });

  test('presets are clamped to the months offered; an empty one is left out', () => {
    const early = idx(2026, 2);
    const r = ranges(idx(2026, 2), cur, early);
    assert.deepEqual(r.quarter, [early, idx(2026, 3)]);
    assert.equal('prevQuarter' in r, false);
    assert.deepEqual(ranges(idx(2026, 8), cur, idx(2026, 8)).prevQuarter, undefined);
  });
});

describe('a custom range', () => {
  const cur = idx(2026, 10);

  test('From after To, or more than 24 months, is refused', () => {
    assert.equal(dutyExportRangeError(cur, cur), null);
    assert.equal(dutyExportRangeError(cur - 23, cur), null);
    assert.equal(dutyExportRangeError(cur, cur - 1), 'From has to be before To.');
    assert.equal(dutyExportRangeError(cur - 24, cur), 'Export at most 24 months at a time.');
  });
});

describe('the earliest month offered', () => {
  const cur = idx(2026, 10);

  test('at least the shown month and the last 12 months', () => {
    assert.equal(dutyExportEarliest(TZ, [], 1, cur, cur), cur - 11);
    assert.equal(dutyExportEarliest(TZ, [], 1, idx(2025, 6), cur), idx(2025, 6));
  });

  test('back to the pilot’s first flight, in the operator’s timezone; other pilots’ don’t count', () => {
    // 20:00 on Feb 28 in Anchorage is already March 1 in UTC.
    const flights = [flight('2025-02-28 20:00', '21:00'), flight('2024-01-05 08:00', '09:00', { pilot: 2 })];
    assert.equal(dutyExportEarliest(TZ, flights, 1, cur, cur), idx(2025, 2));
  });
});

describe('PDF day grouping', () => {
  const data = dutyMonth([
    flight('2026-09-03 07:00', '12:00'), flight('2026-09-03 13:00', '17:30'),
    flight('2026-09-04 08:00', '09:00'),
  ], '2026-09', { days: [duty('2026-09-03', '06:00', '20:30')] });
  const src = typstSource(data);
  const table = src.slice(src.indexOf('#table('), src.indexOf('Month total'));

  test('the month table has no per-row rule, only the header and day rules', () => {
    assert.match(table, /^#table\(\n  stroke: none,/);
    assert.match(src, /table\.hline\(stroke: 0\.6pt \+ rule\)/);
  });

  test('warnings start after the DATE column, and each stays before the next day\'s rule', () => {
    const lines = table.split('\n');
    const warns = lines.filter(l => l.includes('warning('));
    assert.ok(warns.length >= 2);
    for (const l of warns) assert.match(l, /^ {2}\[\], warning\(/);
    // Each warning is followed by another warning or the next day's rule, never a new day's row.
    lines.forEach((l, i) => {
      if (l.includes('warning(') && lines[i + 1]) assert.match(lines[i + 1], /warning\(|table\.hline/);
    });
    assert.match(src, /#let warning\(body\) = table\.cell\(colspan: 7,/);
  });
});

describe('what the PDF leaves out', () => {
  const months = ['2026-08', '2026-09'].map(m => dutyMonth([flight(m + '-03 07:00', '12:00')], m));
  const srcs = [typstSource(months[1]), typstSource(months)];

  test('no totals footnote, disclaimer or "Limits:" line; the screen keeps the limits label', () => {
    assert.match(months[1].limitsLabel, /^Limits: /);
    for (const src of srcs) {
      assert.doesNotMatch(src, /Hour totals count commercial flying|Converse/);
      assert.doesNotMatch(src, /aid only|remain responsible for compliance/);
      assert.doesNotMatch(src, /Limits:/);
    }
  });

  test('the page footer leaves out the app name; the document metadata keeps it', () => {
    for (const src of srcs) {
      const footer = src.slice(src.indexOf('footer: context'), src.indexOf('Generated '));
      assert.doesNotMatch(footer, /Test/);
      assert.match(footer, /"Pilot · /);
      assert.match(src, /#set document\(.*author: "Test"\)/);
    }
  });

  test('with no notes, the PDF ends after the body', () => {
    for (const src of srcs) assert.doesNotMatch(src, /#set text\(size: 7pt, fill: muted\)/);
  });
});

describe('the PDF file name', () => {
  const months = ['2026-08', '2026-09'].map(m => dutyMonth([flight(m + '-03 07:00', '12:00')], m));

  test('a month, and a range', () => {
    assert.equal(dutyLogPdfName(months[1]), 'duty-log-pilot-2026-09.pdf');
    assert.equal(dutyLogPdfName(months), 'duty-log-pilot-2026-08-to-2026-09.pdf');
  });
});
