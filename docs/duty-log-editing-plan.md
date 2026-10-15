# Design: Editable, Persistent Pilot Duty Log

## Problem

The pilot duty log (`src/shared/pilot-duty.ts`) is a read-only view of tracked flights,
exported to PDF. A Part 135 operator needs to correct it before it becomes a compliance
record, and needs the corrections to persist:

- adjust flight start/end times (the tracker started late, taxi time was clipped)
- fix origin/destination labels
- add flights the tracker missed (or commercial flying done elsewhere) and remove
  spurious ones
- mark flights as Part 91
- enter duty hours (e.g. 08:00–17:00)
- designate rest days in advance, with the designation date shown on the form

Goal: the simplest implementation that covers this, with as little new schema as
possible. The target is a single-pilot operator under §135.267.

## Regulatory background

Unscheduled operations (and any operation solely within Alaska) fall under
**14 CFR §135.267** (§135.261(c)). It gives the operator two ways to apply the daily limits,
and the operator picks one (FAA legal interpretations to Berry, 2009, and Jimenez, 2011):

- (a) Total flight time in all commercial flying may not exceed 500 h per calendar
  quarter, 800 h per two consecutive calendar quarters, or 1,400 h per calendar year.
- (b) In any 24 consecutive hours, the assigned flight time plus any other commercial
  flying may not exceed 8 h (one pilot) or 10 h (two pilots).
- (c) Instead, flight time may go past (b)'s window if it falls in a *regularly assigned*
  duty period of no more than 14 h. That period must be immediately preceded and followed
  by at least 10 consecutive hours of rest. The flight time in it, plus other commercial
  flying, may be at most 8 h (one pilot) or 10 h (two pilots), and the duty and rest periods
  add up to 24 h. "Regularly assigned" means the start and end times don't vary from day
  to day (Berry; SevenBar, 2016). The 14 h is a hard limit, except for unexpected en-route
  delays (SevenBar).
- (d) Each assignment under (b) must give 10 consecutive hours of rest during the 24 h
  before its planned completion.
- (e) A pilot who goes over the daily limit for reasons outside anyone's control needs
  11, 12 or 16 h of rest before the next flight assignment (over by at most 30 min, at most
  60 min, more than 60 min).
- (f) 13 rest periods of at least 24 consecutive hours each per calendar quarter.

Related rules:

- **§135.263:**
  - (b) No duty may be assigned during required rest.
  - (c) Non-local transportation that the operator requires and provides, to the airport
    of a flight or home from the airport where the pilot was relieved, is not rest.
  - (d) A flight planned to end within the limits that runs over for reasons beyond
    anyone's control isn't an over-assignment.
- **§135.63(a)(4)(vii):** the operator keeps each pilot's flight time "in sufficient detail
  to determine compliance," for 12 months. The PDF is that record, so edits should be
  visible as edits.
- **FAA interpretations on rest:** rest must be continuous, prospective (known in
  advance), and free from all restraint by the operator. On-call, standby or reserve time,
  or any obligation to answer the operator's calls, is duty, not rest (Berry, 2009;
  Jimenez, 2011; Orellana, 2015; Kleiner, 2016). That's why the log records when a rest day
  was designated.
- **FAA interpretations on "other commercial flying":** any non-military flying as a
  required crewmember, other than in air transportation, *for which the crewmember is
  paid* (Martindell, 2009; Rodriguez, 2012). Uncompensated flying isn't commercial.
- **FAA interpretations on Part 91 flights** (Converse, 2011, media 13546):
  - Paid Part 91 flying (a ferry, paid instruction) before the Part 135 flights counts
    toward the §135.267(b) 24-hour limit. Flying after them doesn't.
  - It always counts toward the quarterly and yearly limits in (a).
  - A ferry flight the operator assigns is duty, so it isn't rest for (d).

Sources:
- [14 CFR 135.261–135.273](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-G/part-135/subpart-F)
- [14 CFR 135.63](https://www.law.cornell.edu/cfr/text/14/135.63)
- FAA legal interpretations: [Berry, 14441](https://www.faa.gov/media/14441),
  [Jimenez, 13701](https://www.faa.gov/media/13701),
  [SevenBar, 11331](https://www.faa.gov/media/11331),
  [Converse, 13546](https://www.faa.gov/media/13546) (Part 91 before/after the Part 135
  flights), [Martindell, 14636](https://www.faa.gov/media/14636),
  [Rodriguez, 13326](https://www.faa.gov/media/13326),
  [Schwarz, 15076](https://www.faa.gov/media/15076),
  [Orellana, 11941](https://www.faa.gov/media/11941) (rolling rest),
  [Kleiner, 11541](https://www.faa.gov/media/11541),
  [Sonnenberg, 11166](https://www.faa.gov/media/11166). An earlier version of this doc cited
  11941 for the Part 91 before/after rule; that rule is in 13546 (Converse).

## Current state

- `computeDutyData` filters the flight store to one pilot's completed flights. It groups
  them by local date, and calendar days with no flights show as "Rest".
- The flight store is synced from `/api/flights/complete` and holds every tracker's full
  history client-side.
- The rolling totals use the last 24 h, 7 d, 30 d, 90 d and 12 months, plus "rest days
  (last 90 d)". The regulation instead uses calendar quarters and calendar years, and
  24-hour rest periods rather than days without flights.
- The "Block" column is really tracker movement time (`end_time - start_time` of the
  segmented flight).
- `renderDutyLog` (screen) and `_buildTypstSource` (PDF) each have their own copy of the
  day/flight loop, and `_buildTypstSource` builds the rolling-totals block twice (once
  as `rollingTotalsTypst`, which is never used).
- `flights` rows are derived data:
  - `runSegmentation()` deletes and re-inserts the newest flight on every poll that has
    new points, so it gets a new id, and its `end_time` keeps growing while it's in
    progress.
  - `resegment()` rebuilds all of a tracker's flights. It runs automatically when a
    history import adds points before the last completed flight (`poller.ts`), and via
    the operator-only `/api/admin/resegment`.
  - `flights.start_time` is the join key to `points` (`/api/flights/complete`,
    `writeFlights`), so it can't be edited in place.
  - Pilot/aircraft assignments survive this because they're also written to `points`
    (`PUT /api/flights/assignment`), and `segmentPoints` copies them from each flight's
    first point.
  - Origin/destination labels come from the boundary points' `location_label`
    (`updateFlightLabelsFromCache`), filled in asynchronously by geocoding.
- `(tracker_id, start_time)` is already treated as a flight's stable identity across
  re-insertion (`src/dashboard/scripts/refresh.ts:45`). Resegmenting the same points
  produces the same start times.

## Approach

Leave `flights`, `points` and segmentation untouched. Add two small tables. The first is
an overlay of duty-log corrections keyed on the stable `(tracker_id, start_time)`
identity, which also holds manual flights. The second holds per-day duty/rest records.
Only the duty log reads them.

Why an overlay rather than new columns on `flights`:

- Edits to the newest flight would be lost on the next poll.
- Time edits would need separate override columns anyway, because `start_time` is a join
  key.
- Manual flights have no points, so they'd be dropped by the inner join in
  `/api/flights/complete`.

Why the overlay stores **only the corrected fields** (NULL = use the tracker's value)
rather than a full copy of the flight:

- Values the tracker is still filling in (a geocoded `destination_label`, the newest
  flight's growing `end_time`) aren't frozen at whatever they were when someone first
  edited the flight.
- "Edited" is just "column is not NULL", and the tracker's original value is always
  available for the PDF footnote.

What stays out of the overlay:

- **Pilot and aircraft of tracked flights.** These already have a persistent home
  (`PUT /api/flights/assignment`, written to `flights` and `points`). Storing a second
  copy would let them disagree: a flight reassigned to another pilot would then appear
  in both pilots' logs, or neither. The overlay has `pilot_id`/`aircraft_tail` for manual
  flights only.

Why labels are in the overlay rather than written to the boundary point: a label can be
wrong because tracking started partway through the flight, in which case the point's own
label is correct and only the duty-log entry should change. (Correcting a raw point's
label everywhere is a separate, later feature.)

### 1. Schema — `migrations/0002_duty_log.sql`

(As built, renamed: the migration is `0002_flight_corrections.sql`, the table
`flight_corrections`, the routes `/api/flight-corrections` and `GET /api/duty-days?pilot=`;
see flight-editor-plan.md, "After review".)

```sql
-- Duty-log corrections. A row with tracker_id + flight_start_time corrects the tracked
-- flight with that start time: each NULL field means "use the tracker's value". A row
-- with both NULL is a manual flight, which sets its own pilot, aircraft and times.
CREATE TABLE IF NOT EXISTS flight_log_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id        INTEGER REFERENCES trackers(id),
  flight_start_time INTEGER,
  start_time        INTEGER,
  end_time          INTEGER,
  origin_label      TEXT,
  destination_label TEXT,
  part91            INTEGER NOT NULL DEFAULT 0,
  excluded          INTEGER NOT NULL DEFAULT 0,   -- removed from the duty log
  pilot_id          INTEGER REFERENCES pilots(id),            -- manual flights only
  aircraft_tail     TEXT REFERENCES aircraft(tail_number),    -- manual flights only
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (tracker_id, flight_start_time),
  CHECK ((tracker_id IS NULL) = (flight_start_time IS NULL)),
  CHECK (tracker_id IS NULL OR (pilot_id IS NULL AND aircraft_tail IS NULL)),
  CHECK (tracker_id IS NOT NULL OR
         (pilot_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
);

-- Per-pilot, per-local-date duty times or rest designation (not both).
CREATE TABLE IF NOT EXISTS duty_days (
  pilot_id           INTEGER NOT NULL REFERENCES pilots(id),
  date               TEXT NOT NULL,       -- YYYY-MM-DD in the tenant timezone
  duty_start         TEXT,                -- HH:MM local
  duty_end           TEXT,                -- HH:MM local; may be < duty_start (past midnight)
  rest               INTEGER NOT NULL DEFAULT 0,
  rest_designated_at INTEGER,             -- set when rest is first marked; kept on later edits
  note               TEXT,
  PRIMARY KEY (pilot_id, date),
  CHECK (rest = 0 OR (duty_start IS NULL AND duty_end IS NULL))
);
```

Notes:

- `UNIQUE (tracker_id, flight_start_time)` doesn't constrain manual rows, because SQLite
  treats NULLs as distinct.
- **Editing a tracked flight** upserts its row on `(tracker_id, flight_start_time)`,
  setting only the fields that differ from the tracker's values. `flight_start_time` is
  always the tracker's original start time; a corrected departure goes in `start_time`,
  so editing it never breaks the match.
- **Part 91** is a classification, not a correction of tracker data, so it's a plain
  flag (default Part 135) on both kinds of row and isn't marked as an edit.
- **Reverting to the tracker** deletes the row.
- **A tracked flight with no row** appears in the log as it does today.
- **Matching a row to its flight** is by exact `(tracker_id, flight_start_time)`. If no
  flight has that start time (a history import moved the flight's first point earlier),
  the row is **unmatched**: it's shown on its `flight_start_time` date, flagged "tracked
  flight no longer found" with its corrections listed and a delete action, and doesn't
  count toward any totals. The new flight shows as an ordinary tracked flight, so nothing
  is counted twice and nothing silently disappears.
- **A rest day** is a whole local calendar day. That gives the 24-hour rest periods
  §135.267(f) counts, provided the previous day's duty ends by midnight (checked; see
  §3).

### 2. API — `src/index.ts`

All routes are `requireAdmin`, matching the existing flight assignment routes. (As built,
reads are open to any signed-in user; see flight-editor-plan.md, "After review".)

- `GET /api/duty-log?pilot=<id>` returns `{ entries, days }`: every tracked-flight row
  (they carry no pilot; the client matches them against that pilot's flights), the
  pilot's manual rows, and the pilot's `duty_days`. There's no date range: this is a few
  rows per flown day, and the flight store it's merged with already holds full history.
- `POST /api/flight-log-entries` either upserts a tracked-flight row (body has
  `tracker_id` and `flight_start_time`; `INSERT … ON CONFLICT (tracker_id,
  flight_start_time) DO UPDATE`) or inserts a manual flight.
- `PUT /api/flight-log-entries/:id` updates a row. The body is the form's full state;
  the client sends NULL for any field equal to the tracker's value.
- `DELETE /api/flight-log-entries/:id` reverts a tracked flight to the tracker's values,
  or deletes a manual flight or an unmatched row.
- `PUT /api/duty-days/:pilot/:date` upserts a day. `rest_designated_at` is set the first
  time `rest` goes 0→1 and cleared when rest is unset.
- `DELETE /api/duty-days/:pilot/:date` clears a day.
- Pilot/aircraft changes to a tracked flight go through the existing
  `PUT /api/flights/assignment`.
- Validation:
  - `end_time > start_time` when both are set (the client checks the effective times).
  - `date` is `YYYY-MM-DD`; duty times are `HH:MM`.
  - The pilot exists.
  - `aircraft_tail` is null or exists.

### 3. Duty computation — `pilotDutyRenderScript()`

`computeDutyData` gains `entries` and `days` arguments and keeps taking data as
arguments, as the showcase requires. It returns a **single row model** that both the
screen and PDF renderers only format, so neither re-derives days, flights or warnings:
roughly `days: [{ dateKey, label, duty, rest, restDesignatedAt, flights, unmatched,
daySecs, warnings }]` plus `totals`.

1. **Effective flights:**
   - Start from the pilot's completed tracked flights.
   - Apply each matching row's non-NULL fields, and drop flights whose row has
     `excluded = 1`.
   - Add the pilot's manual rows.
   - Each flight carries `manual`, `part91`, and the set of edited fields with the
     tracker's original values.
   - Rows that match no flight become the day's `unmatched` list.
2. **Days:** attach each `duty_days` row to its date.
   - A day with no flights and no record shows as a blank "—", not "Rest".
   - A day marked rest shows "Rest", with "designated <date>". If designated on or after
     that day, it's flagged as not prospective.
   - Flights on a rest day are a warning.
   - A rest day after a day whose duty ran past midnight is a warning (not a full 24 h).
3. **Limits for §135.267, one pilot**, replacing the current rolling list:
   - Per day: if flight time in the 24 h ending at any of that day's flights exceeds
     8:00, excluding Part 91 flights, the day gets a warning.
   - Per day: duty period length over 14 h is a warning. When duty times are set, a gap
     under 10 h since the previous duty end is a warning.
   - Totals panel: current calendar quarter (500 h), this plus the previous quarter
     (800 h), and calendar year (1,400 h), all including Part 91 flights; and 24-hour
     rest periods this calendar quarter, counted as days marked rest (13 required).
   - Over a limit means a warning colour (`var(--danger)`); nothing is blocked.
   - Totals are "as of now" for the current month and "as of month end" for past months,
     so a past month's PDF is reproducible.

Simplification: Part 91 flights are always left out of the 24-hour total. Strictly,
the exemption only covers Part 91 flights flown after the Part 135 legs. The totals
panel says so in a footnote. (Superseded: see "Compliance review", G1. Paid Part 91 flying
before a Part 135 flight now counts.)

### 4. Duty log UI — `src/shared/pilot-duty.ts`

Reuse `buttons.ts`, `segmented-control.ts`, `status.ts`, the `icon()` helper and existing
modal patterns (follow `docs/frontend-patterns.md` for the scrollable overlay). Take
colors, radii and fonts from theme tokens.

- **Table columns:** Date | Duty (start–end, or "Rest · designated Oct 3") | A/C | Origin |
  Dep | Dest | Arr | Time | 91. Edited cells get a marker; manual and unmatched rows get
  a small status chip.
- **Per-flight edit** (pencil on each row) opens a small form:
  - dep/arr time (local, in `APP_SETTINGS.timezone`)
  - origin and destination
  - aircraft (and pilot), saved through `PUT /api/flights/assignment` for tracked flights
  - a Part 91 / 135 toggle (segmented control)
  - "Remove from log", and for edited tracked flights "Revert to tracker", with the
    tracker's values shown for reference
- **Per-day edit** (click the date cell, which carries a calendar icon, or "Duty / rest"
  in the toolbar): duty start/end, or a "Rest day" toggle, plus a note. An optional
  "Through" date applies the same to a range of days (one `PUT` each, up to 62), so a
  block of rest can be designated in one go.
- **Toolbar:** "Add flight" opens the flight form with a date picker.
- **Future months:** the month navigation goes up to 12 months ahead so rest can be
  designated in advance. A future month's totals are as of now, with its rest days
  counted as planned.
- The narrow (`@container`) layout keeps working: edit affordances move into the
  compact cell.

After `pilot-duty.ts` changes, re-run `nix develop path:./nix --command npm run docs:showcase`
and update the sample data in `src/showcase/` so the home page demo includes an edited
flight, a manual flight, a Part 91 flight and a designated rest day.

### 5. PDF — `_buildTypstSource`

Rebuilt on the row model from §3:

- **Columns and totals:** the same columns, warnings and totals as the screen.
- **Edited cells:** marked †, with a footnote listing the original tracker values for
  each edited flight.
- **Rest days:** show "Rest (designated <date>)".
- **Unmatched rows:** listed with their flag, as on screen.
- **Footer:** "Generated <timestamp>".
- **Cleanup:** remove the duplicated rolling-totals block (`rollingTotalsTypst` is built
  but unused).

## Out of scope / later

- Showing duty-log edits in the dashboard flight list, analytics or maintenance views.
- Bulk duty-log edits (Part 91 / remove) from the dashboard's bulk-edit modal, and
  merging that modal with the single-flight assignment modal into one flight editor.
- Correcting a raw boundary point's label everywhere (adding a named point only labels
  points that have no label yet).
- A toggle in the duty log screen to show removed (`excluded`) flights, greyed out, so
  they can be reviewed and restored. Until then they're hidden on screen and in the PDF.
- Re-linking an unmatched row to the flight that replaced it; for now it's deleted and
  re-entered.
- Two-pilot crews and §135.265 (scheduled operations). (The per-tenant choice between
  §135.267(b) and (c) is now built; see "Compliance review".)
- Pilot self-service. Users aren't linked to pilots (`users` has no `pilot_id`).
- Monthly sign-off or locking. (Edit history is now built; see "Compliance review".)
- Deadhead/transport tracking as its own record. (The exact Part 91 before/after rule and
  §135.267(e) extended rest are now built; see "Compliance review".)

## Open questions for the operator

- Does their manual (GOM) define duty start/end, e.g. report time before the first
  flight and release after the last? If so, default to that when a day has flights but
  no duty times.
- Does their inspector expect original tracker times on the form, or only the
  corrected ones? (The plan shows both.)
- Do their pilots fly commercially for anyone else? Manual entries cover that, but it
  affects how prominent "Add flight" should be.

## Implementation order

1. Migration and API routes.
2. `computeDutyData` row model, merge and new limits; `renderDutyLog` and
   `_buildTypstSource` moved onto the row model; showcase sample data updated.
3. Duty log edit UI (flight form, day form, Add flight).
4. PDF additions (edit footnotes, rest designation, footer).

## Compliance review (October 2026)

A review of the duty log against the regulation text and the interpretations listed under
"Regulatory background" found gaps in the checks and in record integrity. This section
records what changes and why. The checks stay warnings: nothing is blocked.

### Compliance fixes

- **G1. Other commercial flying in the 24-hour limit.** `flightTime24` sums every
  *commercial* flight in the window: Part 135, plus Part 91 that isn't marked unpaid. It
  still evaluates windows only at the end of each Part 135 flight, which applies Converse
  exactly: paid Part 91 flown before the last Part 135 flight of a window counts, and Part
  91 flown after it falls outside every window. The dashboard's "Last 24 h" (`dutyTotals`'s
  `flight24`) is a check on the *next* assignment, so all commercial flying in the 24 h
  before now counts there, Part 91 included.
- **G2. Flying days without duty times.** A day with flights but no duty period gets a
  warning ("No duty times recorded"), since the duty and rest checks can't run without
  one. `dutyOf` treats a `duty_days` record with only a note (no times, not rest) like a
  missing record: the pilot's default duty applies.
- **G3. §135.267(e) extended rest.** After a day whose daily flight time went over the
  limit, the rest before the next duty must be 11 h (over by up to 30 min), 12 h (up to
  60 min) or 16 h (more). The rest runs from the end of the over-limit day's duty or last
  flight, whichever is later, to the start of the next day's duty or first flight. A
  shorter rest is a warning on the later day. The regulation only requires this when the
  overrun was beyond anyone's control; any other overrun is a violation of (b) or (c)
  itself, which the day's own warning already shows.

### The §135.267 method: (b) or (c)

A tenant-wide setting, `duty_method` (`b` or `c`, default `b`), in the `settings` table
like the other global settings: edited under Settings → Global Settings, served to the
page as `APP_SETTINGS.dutyMethod`, and passed into `computeDutyData` as an option (the
render chunks don't read page state). The row model carries the method and a label
("Limits: §135.267(b), one-pilot crew"), which the screen and PDF print.

Both methods keep the rest-day checks, the outside-duty and no-duty-times warnings, (e)
and the totals: (a) and (f) apply either way.

**Under (b)** (the default):

- Flight time in the 24 h ending at each Part 135 flight's end, over 8 h (G1).
- **(d) look-back**, replacing "rest since previous duty ≥ 10 h": for each day's duty
  period, the 24 h before its end must contain at least 10 consecutive hours outside every
  duty period and flight. Busy time is the union of the duty periods of the surrounding
  days and all the pilot's flights (a flight outside the recorded duty is still duty).
  The duty period's end stands in for the assignment's planned completion. The old check
  was an approximation of this: it compared only the gap since the previous duty end, so
  it flagged a short gap even when a full 10 h rest came earlier in the window, and missed
  rest broken up by a flight outside duty.
- **No separate 14-hour duty warning.** In this model it's a consequence of (d): a duty
  period over 14 h leaves less than 10 h of the 24 h before its end, so (d) always fires
  for it. The (d) warning names the duty length in that case ("Duty period 15:00 leaves at
  most 9:00 of rest…") so the cause is still obvious. §135.267(b) itself has no duty limit
  (Jimenez, Kleiner).

**Under (c):**

- Duty period over 14 h: a hard limit (SevenBar).
- Less than 10 h of rest between consecutive duty periods. Each gap is checked once and
  reported on the later day, which covers both "preceded by" and "followed by" (the rest
  after the last duty so far isn't known yet).
- Commercial flight time in the duty period over 8 h: commercial flights clipped to the
  duty period, up to the end of its last Part 135 flight (the Converse ordering again).
- Duty times that differ from the regularly assigned times, which are the pilot's default
  duty. With no default set, flying days get a "No regularly assigned duty period" warning.
- Duty plus rest equals 24 h: a duty period starting earlier on the clock than the
  previous day's started (so the previous duty plus the rest after it is under 24 h).
  Comparing clock times rather than epochs keeps DST days from warning.

`_DUTY_LIMITS` stays the one place the numbers live (including the (e) thresholds), so
crew size can change them later (see "Not yet implemented").

### Unpaid flights

A flight can be marked **Unpaid** (`flight_corrections.unpaid`, migration `0003`, default
paid), stored like `part91`. Unpaid flying isn't commercial (Martindell, Rodriguez), so it
doesn't count toward the (a) totals or the daily limits. The flight stays in the log, the
day and month totals and everywhere else (aircraft hours, maintenance), and its remarks
read "Part 91 (unpaid)", on screen and in the PDF.

Only Part 91 flights can be unpaid: Part 135 is air transportation for compensation by
definition, so an unpaid Part 135 flight would be a contradiction. The flight form shows
a Pay control (Paid / Unpaid, the same segmented control as Operated under) next to the
Part 135 / Part 91 control only while Part 91 is selected (and sends `unpaid: false`
otherwise); the bulk "Part 135" action clears it; the server
rejects `unpaid` without `part91`, and a CHECK constraint backs that up. An unpaid flight
still counts as busy time for the rest checks: the log can't tell whether it was done for
the operator, so it errs on the side of a warning.

### Edit history

`duty_days` and `flight_corrections` are overwritten and deleted in place and didn't
record who changed them. Migration `0003` adds one append-only table, `edit_history`:
when, which user (id and name at the time; no foreign key, since users can be deleted),
which table and row (`entity`, `entity_key`), the action (insert, update or delete), and
the row before and after as JSON. Triggers on both tables write it, and BEFORE UPDATE /
DELETE triggers on `edit_history` refuse changes.

Triggers rather than per-route inserts, following `flight_corrections_version`: every
write is recorded whichever route makes it, including the bulk `json_each` upsert, the
cleanup of emptied rows and manual flights' assignment, with exact before/after values.
They learn the user from a one-row `edit_actor` table: `recordedBatch()` in `src/index.ts`
(the one shared helper) runs a route's writes as one `db.batch` that sets `edit_actor` to
`c.var.user` first and clears it last. A D1 batch is a transaction, so the history rows
land with the change or not at all. Every route that writes either table goes through it.
A write made any other way is still recorded, with no user. An update that changes
nothing (or only `updated_at`) isn't recorded.

The day form and the flight form show "Last changed by <user>, <date time>" from
`GET /api/edit-history`. A full history view is a follow-up.

### Not yet implemented: multi-pilot crews

The limits assume a one-pilot crew. A two-pilot crew gets 10 h instead of 8 h under (b)
and (c), and §135.269 covers three- and four-pilot crews. That needs the crew size per
flight, which nothing records today (a flight has one `pilot_id`). The likely shape is a
crew-size column on `flight_corrections` (or a crew list), with `_DUTY_LIMITS` keyed by
crew size. The user docs say the log assumes one-pilot crews.

### Exporting a range of months

§135.63 doesn't set a record period, and a monthly log is the usual sign-off unit, but
the limits run over calendar quarters and years, and the rolling checks at the start of a
month reach back into the previous one. So Export PDF asks for a range: Month (the one
shown, the default), Quarter (its calendar quarter, through this month), 12 months, or
any From/To months up to 24. `_buildTypstSource` takes one month's row model or several:

- each month is its own section, as before, starting on a new page;
- each month's table opens with the previous day (`prevDay` in the row model): its duty,
  flight time and flights, so the first day's 24-hour and rest checks can be followed;
- each calendar quarter in a multi-month export ends with a summary page: flight time,
  rest periods and days with warnings by month, the totals as of the quarter's last
  exported month, and every warning in it.

### Follow-ups (not built)

- The duty log only sees flights from active, non-deleted trackers (the flight store's
  source), so a retired tracker's history can be missing from the log and its totals.
- Rest-day edge cases: a flight that starts the evening before and lands on a rest day
  doesn't invalidate the rest day; on the DST spring-forward day a 23-hour calendar day
  counts as a 24-hour rest period.
- Flights with no pilot never appear in any pilot's log.
- PDF: a timezone label, the pilot's full legal name (§135.63(a)(4)(i)), and a list of
  flights removed that month.
- `fmtBlock` rounds down, so a warning can read "8:00 (limit 8:00)" for 8:00:40.
- A full edit-history view (per flight, per day, per pilot and month).
- A pilot's default duty (`pilots.default_duty_start/end`) isn't in the edit history,
  though under (c) it's the regularly assigned duty period the days are checked against.
  Adding the same triggers to `pilots` (and routing `PUT /api/pilots/:id` through
  `recordedBatch`) would cover it.
- §135.263(d) / SevenBar: an overrun caused by unexpected en-route delays isn't a
  violation, but the log can't know the cause, so it keeps warning. The day's note and
  the flight's remark record the cause.
