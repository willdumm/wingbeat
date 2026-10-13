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

Unscheduled one-pilot crews fall under **14 CFR §135.267**:

- (a) Total flight time in all commercial flying may not exceed 500 h per calendar
  quarter, 800 h per two consecutive calendar quarters, or 1,400 h per calendar year.
- (b) Flight time in any 24 consecutive hours may not exceed 8 h (one pilot).
- (c) A regularly assigned duty period of no more than 14 h, preceded and followed by
  10 h of rest, is the alternative framing.
- (d) Each assignment must provide 10 consecutive hours of rest during the 24 h before its
  planned completion.
- (e) Going over the daily limit for reasons outside anyone's control requires 11, 12 or
  16 h of rest afterwards.
- (f) 13 rest periods of at least 24 consecutive hours each per calendar quarter.

Related rules:

- **§135.263:** no duty may be assigned during required rest. Deadhead transport the
  operator requires is not rest.
- **§135.63(a)(4)(vii):** the operator keeps each pilot's flight time "in sufficient detail
  to determine compliance," for 12 months. The PDF is that record, so edits should be
  visible as edits.
- **FAA interpretations on rest:** rest must be continuous, prospective (known in
  advance), and free from all restraint by the operator. Hence recording when a rest day
  was designated.
- **FAA interpretations on Part 91 flights:**
  - Part 91 flights flown after the Part 135 legs (e.g. a ferry home) don't count toward
    the §135.267(b) 24-hour limit.
  - They do count toward the quarterly and yearly limits in (a).
  - Part 91 flights before or between Part 135 legs are not rest.

Sources:
- [14 CFR 135.267](https://www.law.cornell.edu/cfr/text/14/135.267)
- [14 CFR 135.263](https://www.law.cornell.edu/cfr/text/14/135.263)
- [14 CFR 135.63](https://www.law.cornell.edu/cfr/text/14/135.63)
- FAA legal interpretations: [13546](https://www.faa.gov/media/13546),
  [11941](https://www.faa.gov/media/11941), [11166](https://www.faa.gov/media/11166)

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

All routes are `requireAdmin`, matching the existing flight assignment routes.

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
panel says so in a footnote.

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
- Two-pilot crews and §135.265 (scheduled operations), and a per-tenant rule-set
  setting.
- Pilot self-service. Users aren't linked to pilots (`users` has no `pilot_id`).
- Monthly sign-off or locking, and audit history beyond `updated_at`.
- Exact Part 91 tail-end logic, deadhead/transport tracking, and §135.267(e) extended
  rest after weather overruns.

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
