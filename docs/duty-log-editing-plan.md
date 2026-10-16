# Design: Editable, Persistent Pilot Duty Log

## Problem

The pilot duty log (`src/shared/pilot-duty.ts`) was a read-only view of tracked flights,
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
  [Sonnenberg, 11166](https://www.faa.gov/media/11166).

## Constraints: flights are derived data

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
- `(tracker_id, start_time)` is a flight's stable identity across re-insertion
  (`src/dashboard/scripts/refresh.ts`). Resegmenting the same points produces the same
  start times.
- The flight store is synced from `/api/flights/complete` and holds every tracker's full
  history client-side.

## Approach

`flights`, `points` and segmentation are untouched. Two tables hold the duty records: an
overlay of corrections keyed on the stable `(tracker_id, start_time)` identity, which also
holds manual flights, and per-day duty/rest records. The client applies the overlay to the
flights it loads (`applyFlightEdits` in `flight-edits.ts`, served by the flight store), so
every page (flight list, analytics, maintenance, alerts, duty log) shows the same corrected
flights, and one shared flight editor edits them (see flight-editor-plan.md).

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
  available, on screen and in the PDF's footnotes.

What stays out of the overlay:

- **Pilot and aircraft of tracked flights.** These already have a persistent home on
  `flights` and their `points`. Storing a second copy would let them disagree: a flight
  reassigned to another pilot would then appear in both pilots' logs, or neither. The
  flight form sends a tracked flight's aircraft/pilot change with its correction (`assign`,
  one batch), and the edit history records it. The overlay has
  `pilot_id`/`aircraft_tail` for manual flights only.

Why labels are in the overlay rather than written to the boundary point: a label can be
wrong because tracking started partway through the flight, in which case the point's own
label is correct and only the flight's should change. (Correcting a raw point's label
everywhere is a separate feature; see "Out of scope".)

### 1. Schema — migration `0002`

`0002_duty_records.sql` adds the corrections and duty-day tables, the dated default duty
and §135.267 method (see "Dated default duty and method") and the edit history. (It was
four migrations while the branch was built; they were folded into one before it reached
production.) The tables:

```sql
-- Flight corrections. A row with tracker_id + flight_start_time corrects the tracked
-- flight with that start time: each NULL field means "use the tracker's value". A row
-- with both NULL is a manual flight, which sets its own pilot, aircraft and times.
CREATE TABLE flight_corrections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id        INTEGER REFERENCES trackers(id),
  flight_start_time INTEGER,
  start_time        INTEGER,
  end_time          INTEGER,
  origin_label      TEXT,
  destination_label TEXT,
  remark            TEXT,     -- free text (e.g. "Training"), shown under the flight
  start_lat         REAL,     -- manual flights only: endpoints picked from named points,
  start_lon         REAL,     -- so analytics can place them in a region
  end_lat           REAL,
  end_lon           REAL,
  part91            INTEGER NOT NULL DEFAULT 0,
  unpaid            INTEGER NOT NULL DEFAULT 0 CHECK (unpaid = 0 OR part91 = 1),
  excluded          INTEGER NOT NULL DEFAULT 0,   -- removed: hidden everywhere but the flight editor
  pilot_id          INTEGER REFERENCES pilots(id),            -- manual flights only
  aircraft_tail     TEXT REFERENCES aircraft(tail_number),    -- manual flights only
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (tracker_id, flight_start_time),
  CHECK ((tracker_id IS NULL) = (flight_start_time IS NULL)),
  CHECK (tracker_id IS NULL OR (pilot_id IS NULL AND aircraft_tail IS NULL)),
  CHECK (tracker_id IS NULL OR
         (start_lat IS NULL AND start_lon IS NULL AND end_lat IS NULL AND end_lon IS NULL)),
  CHECK (tracker_id IS NOT NULL OR
         (pilot_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
);

-- Per-pilot, per-local-date duty times or rest designation (not both).
CREATE TABLE duty_days (
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

-- A pilot's usual duty period from effective_date until the next entry: a flying day with no duty times recorded uses the
-- one in force that day, and under (c) it's the regularly assigned duty period. Both
-- times NULL: no default from that date.
CREATE TABLE pilot_default_duty (
  pilot_id       INTEGER NOT NULL REFERENCES pilots(id),
  effective_date TEXT NOT NULL,      -- YYYY-MM-DD in the tenant timezone
  duty_start     TEXT,               -- HH:MM local
  duty_end       TEXT,               -- HH:MM local; may be < start
  PRIMARY KEY (pilot_id, effective_date),
  CHECK ((duty_start IS NULL) = (duty_end IS NULL))
);

-- The operator's §135.267 method from effective_date until the next entry. It starts with
-- one (b) entry dated 2000-01-01.
CREATE TABLE duty_method_history (
  effective_date TEXT PRIMARY KEY,   -- YYYY-MM-DD in the tenant timezone
  method         TEXT NOT NULL CHECK (method IN ('b', 'c'))
);
```

`edit_history` and its triggers are described under "Edit history".

Notes:

- `UNIQUE (tracker_id, flight_start_time)` doesn't constrain manual rows, because SQLite
  treats NULLs as distinct.
- **Editing a tracked flight** upserts its row on `(tracker_id, flight_start_time)`,
  setting only the fields that differ from the tracker's values. `flight_start_time` is
  always the tracker's original start time; a corrected departure goes in `start_time`,
  so editing it never breaks the match.
- **Part 91** is a classification, not a correction of tracker data, so it's a plain
  flag (default Part 135) on both kinds of row and isn't marked as an edit; so is
  `unpaid` (see "Unpaid flights").
- **Reverting to the tracker** deletes the row, and so does a save that leaves a tracked
  row with nothing in it.
- **A tracked flight with no row** appears as the tracker recorded it.
- **Removed flights** (`excluded`) are hidden in the duty log, its PDF and every other
  view; the flight editor lists them under "Show removed", where they can be restored.
- **Matching a row to its flight** is by exact `(tracker_id, flight_start_time)`. If no
  flight has that start time (a history import moved the flight's first point earlier),
  the row is **unmatched**. It records no pilot, so the duty log shows it (on its
  `flight_start_time` date, as "Tracked flight from HH:MM no longer found" with its
  corrections listed and a delete action) only for the pilot of the same tracker's
  flight nearest its start time within 12 h, usually the flight that replaced it. With
  no flight that close it's in no pilot's log. Either way the flight editor lists it, as
  a "Not found" row among the corrections that apply to no flight (when its date is in
  the editor's range), with the same delete action. It doesn't count toward any totals.
  The new flight shows as an ordinary tracked flight, so nothing is counted twice, and
  nothing silently disappears: an unmatched row is always in the editor.
- **A rest day** is a whole local calendar day. That gives the 24-hour rest periods
  §135.267(f) counts, provided the previous day's duty and flights end by midnight
  (checked; see §3).

### 2. API — `src/index.ts`

Reads are open to any signed-in user;
every write is `requireAdmin` and runs as one recorded D1 batch (`recordedBatch`; see "Edit
history"), so a request's writes land together or not at all.

**Flight corrections:**

- `GET /api/flight-corrections?since=<edit_history id>` is the flight store's sync (see
  "Syncing corrections"): `{ entries, deleted, last_history_id }`, the rows whose key
  changed after `since`, the keys deleted, and the new cursor (the newest history id of
  any entity). With no `since` (or 0), or one past the newest history id (a reset
  database), it returns every row and `full: true`.
  There's no date range or pilot filter: the table is a few rows per corrected or manual
  flight.
- `POST /api/flight-corrections` either upserts a tracked-flight row (body has
  `tracker_id` and `flight_start_time`; `INSERT … ON CONFLICT (tracker_id,
  flight_start_time) DO UPDATE`) or inserts a manual flight. The body is the form's full
  state, with NULL for any field equal to the tracker's value; a tracked body with nothing
  left in it deletes the row and returns `{ entry: null }`. An optional `assign: {
  aircraft_tail?, pilot_id? }` changes the tracked flight's aircraft/pilot in the same
  batch. The server finds that flight by the row's key (the tracker's flight starting at
  `flight_start_time`), so the assignment can only go to the flight being corrected, and
  is refused if the tracker has no such flight. A tracked-flight save takes an optional
  `base_history_id` (see "Edit conflicts").
- `PUT /api/flight-corrections/:id` updates a manual flight (the form's full state, with
  an optional `base_history_id`). A tracked-flight row is refused: it's saved with
  `POST`, which also takes the assignment and drops a row left empty.
- `DELETE /api/flight-corrections/:id[?base_history_id=<id>]` reverts a tracked flight
  to the tracker's values, or deletes a manual flight or an unmatched row.
- `POST /api/flight-corrections/bulk`: `{ flights: [{ tracker_id, flight_start_time } |
  { entry_id }], set: { part91?, excluded? } }`, at most 5,000 flights, one statement per
  kind of flight (`json_each`). Setting Part 91 or removed upserts tracked rows; Part 135
  or restore only updates existing ones, so a flight with no row doesn't get one inserted
  and then deleted as empty. Part 135 clears `unpaid`. Tracked rows of the request left
  empty are deleted (only those: the history would otherwise record other rows' deletions
  as this user's).

**Aircraft and pilot:**

- `PUT /api/flights/assignment`: `{ flight_ids, entry_ids, aircraft_tail?, pilot_id? }`
  (a key left out is unchanged). Tracked flights' go to `flights` and their `points`,
  manual flights' to their rows; a manual flight can't be left without a pilot.
- `POST /api/trackers/:id/apply-assignment` gives the tracker's flights with no aircraft
  or pilot the tracker's assignment, also as a recorded batch.

**Duty days:**

- `GET /api/duty-days?pilot=<id>` returns `{ days, default_duties, duty_methods,
  last_history_id }`, read in one batch: all the days (a few rows per flown day), the
  pilot's dated default duties and the operator's dated methods (oldest first; see "Dated
  default duty and method"), and the newest history id when they were read (the day form's
  and the default-duty form's `base_history_id`; see "Edit conflicts").
- `PUT /api/duty-days/:pilot`: `{ dates: [YYYY-MM-DD, …], duty_start, duty_end, rest,
  note, base_history_id? }` sets every date in one statement (`json_each`), all or none. The day form uses it
  for one day as well as for a Through range. At most `MAX_DUTY_DAYS_PER_REQUEST` (366)
  dates, a limit the form shares (`src/shared/record-limits.ts`). A day left with nothing
  (no times, not rest, no note) is deleted. `rest_designated_at` is set the first time
  `rest` goes 0→1, kept on later edits, and cleared when rest is unset.
- `POST /api/duty-days/:pilot/clear`: `{ dates, base_history_id? }`, the same cap,
  deleted in one statement.
- `PUT /api/pilots/:id/default-duty`: `{ effective_date, duty_start, duty_end, replaces?,
  base_history_id? }` sets the pilot's default duty from a date (both HH:MM and not equal,
  or both null for no default from that date). An entry already on that date is updated;
  `replaces`, the date of the entry being edited, moves it (deleted in the same batch).
  `DELETE /api/pilots/:id/default-duty/:date[?base_history_id=]` removes one. Both return
  `{ default_duties }`. `PUT /api/pilots/:id` no longer takes `default_duty_start/end`
  (400), and `GET /api/pilots` lists each pilot's `default_duties`.

**Duty method:** `GET /api/duty-methods` returns `{ methods, last_history_id }`;
`PUT /api/duty-methods` (`{ effective_date, method, replaces?, base_history_id? }`) and
`DELETE /api/duty-methods/:date[?base_history_id=]` work like the default duty's, and
return `{ methods }`. `PATCH /api/settings` refuses `duty_method`.

**Edit history:** `GET /api/edit-history?entity=<entity>&key=<entity_key>[&limit=<n>]`
(admins only; `limit` defaults to and is capped at 100) returns one record's history,
newest first. `entity` is `flight_corrections`, `duty_days`, `flight_assignment`,
`pilot_default_duty` (key `<pilot_id>`) or `duty_method` (key `tenant`), or
several comma-separated for entities that share a key (a tracked flight's corrections and
its aircraft/pilot), interleaved newest first.

**Validation** (the shared numbers live in `record-limits.ts`):

- Dates are real `YYYY-MM-DD` dates (`isDateKey`: 2026-02-31 is refused, not rolled over).
  Duty times are `HH:MM`, both or neither, and a rest day has none. A duty end equal to its
  start is refused (an end before the start is past midnight, so an equal one would read as
  24 hours), for a day and for the pilot's default.
- A manual flight needs `end_time > start_time`. A tracked flight needs its effective
  arrival no earlier than its departure (equal is a flight under a minute, which the form
  saves with Dep = Arr). A flight over `MAX_FLIGHT_SECS` (24 h) is refused. A tracked flight
  with one time corrected is checked against the tracker's other time; one with neither corrected isn't checked, so a tracker's own overlong
  flight can still take a remark or Part 91.
- Labels and remarks are at most `MAX_FLIGHT_TEXT_LENGTH` (200) characters after trimming,
  a duty note `MAX_DUTY_NOTE_LENGTH` (1,000). The form inputs carry the same `maxlength`.
- `unpaid` needs `part91`. Tracked rows can't set pilot, aircraft or coordinates; manual
  rows need a pilot and both times. The pilot and aircraft exist.

### 3. Duty computation — `pilotDutyRenderScript()`

`computeDutyData(allFlights, pilotId, pilotName, year, month, { days, defaultDuty,
unmatched, method })` takes data as arguments and reads no page state, as the showcase
requires. `allFlights` are the flight store's effective flights (corrections already
applied); `days` are the pilot's `duty_days` rows, `defaultDuty` the pilot's default duty
period, `unmatched` the store's unmatched rows and `method` the §135.267 method.
`defaultDuty` and `method` are each a dated list (`default_duties`, `duty_methods`), every
day using the entry in force on it, or one value for every day. It returns
a **single row model** that the screen (`renderDutyLog`) and the PDF (`_buildTypstSource`)
only format, so neither re-derives days, flights or warnings: `{ pilotName, year, month,
isCurrentMonth, method, limitsLabel, days, prevDay, upcoming, monthSecs, totals }`, each
day `{ dateKey, label, method, record, duty, defaultDuty, rest, restDesignatedAt, note,
flights, unmatched, daySecs, warnings }`.

1. **Flights:** the pilot's completed flights, less removed ones. Each carries `manual`,
   `part91`, `commercial` (Part 135, or Part 91 not marked unpaid), its `remarks` ("Part
   91", "Part 91 (unpaid)", the remark), and `edited`, the corrected fields with the
   tracker's values.
2. **Days:** every day of the month, through today in the current month (later days are
   planned through the Upcoming list), plus `prevDay`, the previous month's last day, built
   the same way.
   - A day's duty period comes from its record, or on a flying day with no duty times from
     the pilot's default duty in force that day ("08:00–17:00 (default)").
   - A day with no flights and no record shows a blank "—", not "Rest".
   - A day marked rest shows "Rest · designated <date>". If designated on or after that
     day, it's flagged as not prospective.
   - Flights on a rest day are a warning.
   - A rest day after a day whose duty or flying ran past midnight is a warning (not a
     full 24 h): the previous day's duty period stretched to cover its flights (`spanOf`),
     so a flight outside duty that lands after midnight, including one that departs the
     evening before and lands on the rest day, counts too ("Previous duty or flight ended
     00:40, so this rest is under 24 h").
   - A flying day with no duty times and no default gets "No duty times recorded", and a
     flight outside the day's duty period gets its own warning.
   - The daily flight-time, duty and rest limits depend on the method: see "Compliance
     review", "The §135.267 method", and G3 for (e) extended rest.
3. **Totals** (`dutyTotals`, which the dashboard's duty alert also uses): commercial
   flight time in the current calendar quarter (500 h), this plus the previous quarter
   (800 h) and the calendar year (1,400 h); commercial flight time in the last 24 h (8 h);
   and 24-hour rest periods this calendar quarter (13 required): days marked rest with no
   rest warning, taken so far plus "planned" later in the quarter, flagged short once 13
   can no longer be reached. Totals are "as of now" for the current month and "as of month
   end" for past months, so a past month's PDF is reproducible. So are its days: each is
   checked with the default duty and method in force on it (see "Dated default duty and
   method"), so changing either from a date on leaves the months before it as they were.
   What still changes a past month: a correction or day edit dated in it (recorded in the
   edit history), editing or removing a dated entry that covered it (recorded too), and
   the timezone setting (not dated: see "Follow-ups").

Formatting and severity:

- An amount over a limit is rounded up to the minute (`fmtDuration(secs, true)`), so it
  never reads as equal to the limit: 8:00:40 of flight time shows "8:01 … (limit 8:00)".
  An amount under a minimum (rest) is rounded down, so 9:59:30 reads 9:59.
- Over a limit means a warning colour (`var(--danger)`); nothing is blocked.

### 4. Duty log UI — `src/shared/pilot-duty.ts`

A full-screen Settings view, opened from a pilot's "Duty log" button. It uses
`buttons.ts`, `segmented-control.ts`, `status.ts`, `icon()`, the shared form modal
(`form-modal.ts`) and theme tokens, and follows `docs/frontend-patterns.md` for the
scrollable overlay. Admins get the edit controls; other signed-in users see the log
read-only.

- **Month table:** Date | Duty | A/C | Origin | Dep | Dest | Arr | Time, plus a pencil
  column for admins. Corrected values are marked † (the tracker's value on hover), a
  manual flight gets a "Manual" chip, and a flight's remarks ("Part 91", "Part 91
  (unpaid)", its remark) span a row under it. Unmatched rows and each day's warnings get
  full-width rows. The narrow (`@container`) layout folds a flight into one compact cell.
- **Flight edits:** the pencil opens the shared flight form (`flight-editor.ts`; see
  flight-editor-plan.md): Date, Dep, Arr, Origin, Dest, Aircraft, Pilot, Operated under
  (Part 135 / Part 91), Pay (for Part 91), Remark; Remove, Revert to tracker or Delete;
  the tracker's value under each corrected field and the newest change ("Last changed by
  …"). A tracked flight's aircraft/pilot change goes in the same `POST` as its
  correction.
  - An arrival before the departure is the next day, and "Arrives the next day, H:MM
    after departure." shows under the times whenever it is. Saving a flight over 12 h asks
    first ("This flight is 14:30 long, arriving the next day. Save it?"), and one over
    24 h is refused, as on the server. Both apply only when the times differ from the
    tracker's, so a tracked flight left as recorded can still be saved.
- **Day edits:** the date cell (with a calendar icon), an Upcoming entry, or "Plan duty or
  rest" opens the day form: duty start/end, or Rest day, plus a note, and an optional
  Through date that applies the same to every day up to it (up to 366 days, refused in the
  form before sending). A day with no duty times starts with them empty, the default duty
  shown as a hint with a "Use default" button that fills them in (so a note saved alone
  stays a note-only row, which still uses the default). Equal start and end are refused,
  as on the server, here and in the default-duty form. Saving always goes through the
  range route (`PUT /api/duty-days/:pilot`), one request and one statement, so the range
  saves whole or not at all; before it, `dutySaveConfirmText` asks when a range would
  replace records that differ from what's saved ("3 of these 6 days already have records
  that will be replaced", naming rest days that lose their designation) or one day would
  unmark a designated rest day. Clear removes the days' records (`…/clear`).
- **Toolbar:** the month navigation, the pilot's default duty in force on the shown
  month's last day ("Default duty 08:00–17:00 · Change", "Default duty 07:00–16:00 from
  Jun 15 · Change" when it started that month, or "No default duty · Set"), "Plan
  duty or rest" (the day form on tomorrow, any date allowed), "Edit flights" (the flight
  editor filtered to this pilot and month; its "Add flight" enters a manual flight) and
  "Export PDF" (the export form; see "Exporting a range of months").
- **Default-duty form:** the pilot's entries, newest first ("From Jun 15, 2026 ·
  07:00–16:00", the earliest as "Before Jun 15, 2026", or "Every day" when it's the only
  one), each with Edit and Remove, then Effective from (today by default), Duty start and
  Duty end. Saving adds an entry from that date (asking first if one is already on it);
  Edit fills the form with an entry and saves it in place (`replaces`, if its date
  changed), for a typo; empty times save "no default from that date". A hint says past
  months keep the default in force then. It shows "Last changed by …" and uses the duty
  log's `last_history_id` as `base_history_id` for every save and remove. Settings →
  Pilots → Edit no longer has default duty fields; the pilot's row shows the default in
  force today.
- **Planning ahead:** the table lists days through today, and the month navigation stops
  at the current month. The current month's **Upcoming** list, shown before the totals,
  lists every record dated after today in date order (rest with its designation date, or
  duty times, and the note), each opening the day form ("Nothing planned after today."
  when empty). Planned rest later in the quarter counts in the totals as "planned".
- **Totals panel:** the totals from §3, with the method's label ("Limits: §135.267(b),
  one-pilot crew") and a footnote on how rest periods and the daily flight time are
  counted. In the current month it shows first, with Upcoming; in a past month, after the
  table.
- **Forms** (`openFormModal`): Escape or a backdrop click on a form with a changed field
  (a segmented toggle such as Duty / Rest counts; `wireSegmented` fires `change` on a
  click that changes it, not when the form sets it) asks "Discard your changes?"; the
  close button closes without asking. Saves go through
  the shared `runFormAction` (buttons disabled, error shown in the form).
- **Refresh:** an open log re-renders when the flight store changes; a closed one isn't
  recomputed (`_dutyIsOpen`), and opening it fetches and renders afresh.

The showcase (`src/showcase/`, `npm run docs:showcase`) renders the log from sample data
that includes an edited flight, a manual flight, a Part 91 flight and a designated rest
day; re-run it after changing the render chunks.

### 5. PDF — `_buildTypstSource`

Built from the same row model as the screen:

- **Title and layout:** "<Pilot> Duty Log" and the period; one section per exported
  month, each starting on a new page (see "Exporting a range of months").
- **Rows:** the screen's columns, remarks rows and warnings (tinted rows), opening with the
  previous day so the month's first rolling checks can be followed. The only rules between
  rows are the one under the header and one above each day, and a day's warnings are
  indented to start after the DATE column, so the date column holds the day's whole block
  and a warning can't be read as the next day's.
- **Corrected values:** marked †n, with numbered footnotes listing what the tracker
  recorded ("Oct 3, flight at 09:00: the tracker recorded Dep 09:12."); a manual flight is
  marked ‡.
- **Rest days:** "Rest · designated <date>".
- **Unmatched rows:** listed with their flag, as on screen.
- **Totals:** as on screen, as of the month's end (or now, for the current month).
- **Footer:** the pilot and period, "Generated <timestamp>" and the page number.
- **Not on the PDF:** the method's label ("Limits: …"), the totals footnote and a
  compliance disclaimer, which the screen shows (its compliance notice at the top). The
  warnings still cite their limits ("§135.267(b) limit 8:00").

## Out of scope / later

- Correcting a raw boundary point's label everywhere (adding a named point only labels
  points that have no label yet).
- A toggle in the duty log itself to show removed flights greyed out. They're hidden in
  the log and the PDF; the flight editor's "Show removed" lists and restores them.
- Re-linking an unmatched row to the flight that replaced it; for now it's deleted and
  re-entered.
- Two-pilot crews and §135.265 (scheduled operations); see "Not yet implemented:
  multi-pilot crews".
- Pilot self-service. Users aren't linked to pilots (`users` has no `pilot_id`).
- Monthly sign-off or locking. (The edit history records every change; see "Edit
  history".)
- Deadhead/transport tracking as its own record.

## Open questions for the operator

- Does their manual (GOM) define duty start/end, e.g. report time before the first
  flight and release after the last? If so, the pilot's default duty should be set to it.
- Does their inspector expect original tracker times on the form, or only the
  corrected ones? (The log shows the corrected ones, with the tracker's in footnotes.)
- Do their pilots fly commercially for anyone else? Manual flights cover that, but it
  affects how prominent "Add flight" should be.

## Compliance review (October 2026)

A review of the duty log against the regulation text and the interpretations listed under
"Regulatory background" found gaps in the checks and in record integrity. This section
describes the checks that came out of it and why. The checks stay warnings: nothing is blocked.

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

A tenant-wide choice (`b` or `c`, default `b`), dated
(`duty_method_history`; see "Dated default duty and method"): edited under Settings →
Global Settings, read by the duty log with its days (`GET /api/duty-days`'s
`duty_methods`) and passed into `computeDutyData` as an option (the render chunks don't
read page state). Each day is checked with the method in force on it. The row model
carries a label ("Limits: §135.267(b), one-pilot crew"), which the screen prints (the PDF
doesn't); a month that changed method names each with its dates ("Limits: §135.267(b) to
Jun 14, §135.267(c) from Jun 15 · one-pilot crew").

Both methods keep the rest-day checks, the outside-duty and no-duty-times warnings, (e)
and the totals: (a) and (f) apply either way.

**Under (b)** (the default):

- Flight time in the 24 h ending at each Part 135 flight's end, over 8 h (G1).
- **(d) look-back**: for each day's duty
  period, the 24 h before its end must contain at least 10 consecutive hours outside every
  duty period and flight. Busy time is the union of the duty periods of the surrounding
  days and all the pilot's flights (a flight outside the recorded duty is still duty).
  The duty period's end stands in for the assignment's planned completion. Checking only the
  gap since the previous duty end would flag a short gap even when a full 10 h rest came
  earlier in the window, and miss rest broken up by a flight outside duty.
- **No separate 14-hour duty warning.** In this model it's a consequence of (d): a duty
  period over 14 h leaves less than 10 h of the 24 h before its end, so (d) always fires
  for it. The (d) warning names the duty length in that case ("Duty period 15:00 leaves at
  most 9:00 of rest…") so the cause is still obvious. §135.267(b) itself has no duty limit
  (Jimenez, Kleiner).

**Under (c):**

- Duty period over 14 h: a hard limit (SevenBar).
- Less than 10 h of rest between consecutive duty periods. Each gap is checked once and
  reported on the later day, which covers both "preceded by" and "followed by" (the rest
  after the last duty so far isn't known yet). Like the flight time check below, it uses
  each day's duty period stretched to cover its flights (`spanOf`): the rest runs from the
  latest end of the previous two days' spans that start before this one to the start of
  this day's span. Busy time that runs into this duty period (an overnight flight, a
  previous duty past this one's start) leaves no rest: "Rest before duty 0:00
  (§135.267(c) minimum 10:00)".
- Commercial flight time in the duty period over 8 h: the whole commercial flights that
  start in the duty period stretched to cover the day's flights, before the end of its
  last Part 135 flight (the Converse ordering again). Nothing is clipped, so a flight
  outside the recorded duty counts in full as well as getting its own "outside duty"
  warning: the conservative reading, since a flight outside duty is still duty.
- Duty times that differ from the regularly assigned times, which are the pilot's default
  duty in force that day. With no default then, flying days get a "No regularly assigned
  duty period" warning.
- Duty plus rest equals 24 h: a duty period starting earlier on the clock than the
  previous day's started (so the previous duty plus the rest after it is under 24 h).
  Comparing clock times rather than epochs keeps DST days from warning.

`_DUTY_LIMITS` stays the one place the numbers live (including the (e) thresholds), so
crew size can change them later (see "Not yet implemented").

### Unpaid flights

A flight can be marked **Unpaid** (`flight_corrections.unpaid`, default
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

`duty_days` and `flight_corrections` are overwritten and deleted in place, so on their own
they don't record who changed them. Migration `0002` adds one append-only table, `edit_history`:
when, which user (id and name at the time; no foreign key, since users can be deleted),
which table and row (`entity`, `entity_key`), the action (insert, update or delete), and
the row before and after as JSON. Triggers on both tables write it, and BEFORE UPDATE /
DELETE triggers on `edit_history` refuse changes.

Triggers rather than per-route inserts: every write is recorded whichever route makes it,
including the bulk `json_each` upsert, the cleanup of emptied rows and manual flights'
assignment, with exact before/after values.
They learn the user from a one-row `edit_actor` table: `recordedBatch()` in `src/index.ts`
(the one shared helper) runs a route's writes as one `db.batch` that sets `edit_actor` to
`c.var.user` first and clears it last. A D1 batch is a transaction, so the history rows
land with the change or not at all. Every route that writes either table goes through it.
A write made any other way is still recorded, with no user. An update that changes
nothing (or only `updated_at`) isn't recorded.

A tracked flight's aircraft and pilot live on `flights`, not `flight_corrections`, so
the migration adds an AFTER UPDATE trigger on `flights` that records a change to either
(entity `flight_assignment`, key `<tracker_id>/<start_time>`, before/after
`{ pilot_id, aircraft_tail }`), from the assignment route, the flight form's `assign` and a
tracker's apply-assignment. Segmentation only deletes and re-inserts flights, so it adds
no history.

The day form and the flight form show the newest change from `GET /api/edit-history`:
"Last changed by <user>, <date time>". A tracked flight's form asks for its corrections
and its assignment together (`entity=flight_corrections,flight_assignment`), so an
aircraft or pilot change counts too and says which: "Pilot last changed by …", "Aircraft
last changed by …" or "Aircraft and pilot last changed by …". A save that changed both the
corrections and the assignment (one batch, so the same time and user) reads "Last changed
by …". A full history view is a follow-up.

The same triggers record the dated default duty and method
(`pilot_default_duty`, keyed `<pilot_id>`, and `duty_method`, keyed `tenant`; see "Dated
default duty and method"), whose forms show "Last changed by …" for the whole list.

### Dated default duty and method

A day with no duty times takes the pilot's default duty, and the §135.267 method picks the
daily checks. Kept as one current value, each would re-check every month with today's
value, so changing either would rewrite past months' duty periods, warnings and the (c)
"differs from regularly assigned" check, unrecorded. (An earlier version of the branch
did that, with `pilots.default_duty_start/end` and a `duty_method` setting.) Instead each
is a dated list, and every change is recorded:

- **Tables:** `pilot_default_duty (pilot_id, effective_date, duty_start, duty_end)` and
  `duty_method_history (effective_date, method)` (see §1). A default entry with no times is
  "no default from this date".
- **The entry in force** on a day is the one with the latest `effective_date` on or
  before it. The earliest entry also applies before its own date, since there's no earlier
  one to apply: a pilot whose only default starts 2026-06-01 uses it for every day. With no
  entries there's no default, and the method is (b). One lookup does this
  (`dutyEntryOn`, with `dutyDefaultOn` and `dutyMethodOn` in `pilotDutyRenderScript()`),
  used by the day rows, the (c) checks, the totals' rest check and the PDF (the same row
  model), the toolbar, the day form's default hint and the pilot list. A month spanning a
  change uses each day's own value. The dashboard's duty alert counts hours only, which
  neither affects.
- **Changing** is adding an entry from a date (today by default), so the days before it
  keep their value; **correcting** a typo is editing the entry (which does change the
  days it covered, as it should, and is recorded). Removing an entry hands its days to
  the remaining ones.
- **The method's first entry:** the migration gives the method one entry, (b), so the
  first change to (c) doesn't become the earliest entry and reach back to every past month.
  Its date is a fixed `2000-01-01`: the earliest entry covers everything before it anyway,
  and a fixed date means a change "from today" on deploy day adds an entry instead of
  overwriting it. It isn't in the edit history (the triggers come after it). Pilots start
  with no default duty.
- **History:** AFTER INSERT/UPDATE/DELETE triggers on both tables, like the others, attributed
  through `edit_actor`; the routes go through `recordedBatch`. Each list is one record to
  the edit history and to its form (`pilot_default_duty` / `<pilot_id>`, `duty_method` /
  `tenant`), since the form shows and saves against all of it.
- **Conflicts:** the default-duty form sends the duty log's `last_history_id`, and the
  method's section in Global Settings the one from `GET /api/duty-methods`, as
  `base_history_id`, checked against the whole list ("Edit conflicts"): a change to any
  entry since is refused with a Reload.

### Edit conflicts

The flight form and the day form save a record's full state, so two admins with the same
flight or day open would silently overwrite each other (the history would show it, but
nobody would notice). Instead, a save from either form says which version of the record
its values came from, and the server refuses it when the record has changed since:

- **The version** is an `edit_history` id: the `last_history_id` of the read the form's
  values came from, which is the newest history id of any entity when that read ran
  (`LAST_HISTORY_ID_SQL`, in the same batch as the rows). Every change up to it is in
  those values, so a history row for the record after it is a change the form didn't
  show. The flight form takes the flight store's corrections cursor
  (`flightStore.historyId()`, from `GET /api/flight-corrections`); the day form takes the
  duty log's (`GET /api/duty-days`). That's the version the form's values were loaded
  from, not the record's newest version when the form opened: a stale cache (a store
  that hasn't synced lately, a duty log open for an hour) is caught too. It's also known
  the moment the form opens, so there's no request to wait for and no window in which a
  save could go out without it.
- **The request** sends it as `base_history_id` (body; a query parameter for `DELETE`):
  the flight form's save, Revert to tracker and Delete, the day form's Save and Clear, and
  the default-duty and duty-method forms' Save and Remove.
  Without it the server doesn't check, so other callers work as before. Remove/Restore
  and the editor's bulk actions set one flag on a selection rather than a whole record,
  and aren't checked.
- **The check** (`recordedBatch(c, stmts, base)` and `staleSince()` in `src/index.ts`)
  looks for history rows after the base for the record's keys: for a tracked flight, its
  corrections and its assignment (`flight_corrections` and `flight_assignment` under
  `<tracker_id>/<flight_start_time>`), so a bulk action or an aircraft/pilot change since
  counts; for a manual flight, `manual/<id>`; for a day form save or clear, every date of
  the range (`duty_days` under `<pilot_id>/<date>`), since the form and its confirm
  (`dutySaveConfirmText`) showed them all. It's a statement in the save's own batch (an
  `INSERT` of a second `edit_actor` row when a newer row exists, which fails on the
  primary key and so aborts the transaction), so nothing can be written between the check
  and the save. When the batch fails, `staleSince()` looks up the newest change and the
  route answers 409 `{ error, conflict: { id, at, user_id, user_name } }`.
- **The form** (`showEditConflict()` in `edit-history.ts`, through `runFormAction()`'s
  `onConflict`) shows "Changed by Sam since this was loaded (Tue Oct 13 09:12)." in its
  error line with a Reload button, which reopens the form from refreshed data (the flight
  store refreshed, or the duty log fetched again, on the same dates), after asking
  "Discard your changes and load the latest?" when a field has been changed. There's no
  "save anyway": the user looks at the other change first, then makes theirs again. The
  "Last changed" fetch (`showLastEdit()`) returns the newest row too, so a form whose
  data is already older than the record shows the conflict as soon as it opens.

Any record with history can use it: a route passes `recordedBatch()` the client's
`base_history_id` and the record's `[entity, key]` refs, and the GET its form reads from
returns `last_history_id`.

Known limitation: a tracked flight's aircraft and pilot reach the store with its flights
(`GET /api/flights/complete?since=<modified_at>`), fetched alongside the corrections but
not in the same read, so the cursor only approximately covers them: an assignment change
landing between the two reads can be missed (or reported when it was already shown).
The flights' `modified_at` cursor is in whole seconds and compared with `>`, so a change
in the same second as the previous sync's newest one isn't fetched at all until the
flight changes again; the check then can't tell the store missed it.

The triggers list their columns explicitly (`json_object('pilot_id', OLD.pilot_id, …)`,
and the AFTER UPDATE triggers compare those lists to decide whether anything changed), so
a migration that adds a column to `flight_corrections` or `duty_days`, or another
assignment field to `flights`, has to drop and recreate the affected triggers. Otherwise
the new column is missing from the before/after JSON, and a change to it alone isn't
recorded at all.

### Syncing corrections

The flight store syncs `flight_corrections` incrementally from `edit_history`, the same
way it syncs each tracker's flights from a `modified_at` cursor. The history already
records every insert, update and delete of a row under the key the client merges on
(`<tracker_id>/<flight_start_time>` or `manual/<id>`), so the keys changed after the
client's cursor are the rows to send:

- `GET /api/flight-corrections?since=<id>` returns those keys' rows now as `entries`, the
  keys with no row now as `deleted`, and the newest history id as `last_history_id`,
  read in one batch so the cursor matches the rows. It's the newest id of any entity, not
  just of corrections, so it also serves as the flight form's `base_history_id` (see
  "Edit conflicts"): every correction change up to it is in the store. A change to
  another entity moves it without changing a row; the store saves the cursor but doesn't
  re-render. The migration's `(entity, id)` index on `edit_history` serves the scan.
- With no cursor (or 0), or one past the newest id (a reset or recreated database), it
  returns every row and `full: true`, and the client replaces its copy.
- The client (`flight-store.ts`) keeps the cursor in `_mem` as `entries_last_history_id`,
  saved to localStorage next to the flights' per-tracker cursors, and fetches corrections
  alongside the trackers' flights on the same fetch/merge/save/notify path
  (`_fsFetchSince`, `_fsAdvance`). `mergeFlightCorrections` merges on the key, not the id,
  so a tracked flight's row that was deleted and re-inserted under a new id replaces the
  old one. A delta is dropped if another tab moved the cursor meanwhile; the next refresh
  continues from the newer one.

This replaced an earlier `flight_corrections_version` counter, which the client compared
before refetching every row.

On a freshly migrated database, until the first recorded change of any kind, the newest
id is 0, the cursor stays 0, and every refresh does a full fetch. An unchanged full fetch
doesn't notify, so it costs only the request.

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
shown, the default), This qtr (its calendar quarter, through this month), Last qtr (the
calendar quarter before that, in full, for a quarterly sign-off; left out if it is before
the earliest month offered), 12 mo, or
any From/To months up to 24, offered from the pilot's first flight (at least the last 12
months) through this month. `_buildTypstSource` takes one month's row model or several:

- each month is its own section, as before, starting on a new page;
- each month's table opens with the previous day (`prevDay` in the row model): its duty,
  flight time and flights, so the first day's 24-hour and rest checks can be followed;
- each calendar quarter in a multi-month export ends with a summary page: flight time,
  rest periods and days with warnings by month, the totals as of the quarter's last
  exported month, and every warning in it.

### Tests

`npm test` (`node --test`, in the nix shell) runs `test/`: `test/harness.mjs` evaluates the
real script strings of `pilot-duty.ts`, `flight-edits.ts`, `time.ts`, `html.ts` and
`flight-store.ts` in a `node:vm` context with a settable clock. The suites cover the rules in this doc: the
(b), (c), (d) and (e) checks, rest days, the quarter and year totals, DST days, the dated
default duty and method (`dated-defaults.test.mjs`), `applyFlightEdits`, the corrections
delta merge, and the flight form's times. `test/worker.mjs` runs the real Worker in
Miniflare with every migration applied, for the routes' SQL, the history triggers and
edit conflicts (`worker-sql.test.mjs`, `worker-dated-defaults.test.mjs`).

### Follow-ups (not built)

- The duty log only sees flights from active, non-deleted trackers (the flight store's
  source), so a retired tracker's history can be missing from the log and its totals.
- Rest-day edge case: on the DST spring-forward day a 23-hour calendar day counts as a
  24-hour rest period.
- Flights with no pilot never appear in any pilot's log.
- PDF: a timezone label, the pilot's full legal name (§135.63(a)(4)(i)), and a list of
  flights removed that month.
- A full edit-history view (per flight, per day, per pilot and month).
- The timezone setting isn't dated or recorded: changing it moves every past day's
  boundaries. Unlike the default duty and method, it's not a duty-log rule, so it's left
  as a setting.
- A pilot's or the method's full dated history is in their forms; their edit history
  (who changed an entry, from what) only shows as "Last changed by …", like the rest.
- §135.263(d) / SevenBar: an overrun caused by unexpected en-route delays isn't a
  violation, but the log can't know the cause, so it keeps warning. The day's note and
  the flight's remark record the cause.
- The flights sync's `modified_at` cursor is in whole seconds and compared with `>`, so a
  reassignment in the same second as the previous sync's newest change is never fetched
  until the flight changes again (see "Edit conflicts", known limitation). Reading the
  assignment from the same snapshot as the corrections cursor would also close the
  conflict check's gap for aircraft/pilot changes.
- The day form's early conflict notice (a change newer than the log, shown on open) stays
  up after the user changes the form's date to one that has no conflict.
- Removing the last duty-method entry silently falls back to §135.267(b) everywhere,
  including past months; the route could refuse removing the only entry.
- Edit conflicts elsewhere. Only the flight form, the day form, the default-duty form and
  the duty-method form are checked. The other full-state saves have no history and no
  `updated_at` to check against, so each needs a migration first:
  - the aircraft `maintenance_schedule` (the real risk: every add, edit or delete of an
    item rewrites the whole JSON array, so two admins editing at once drop each other's
    changes; per-item routes or a version column plus a 409 would fix it), and the
    Hobbs/tach meter values;
  - a pilot's name, and the Global Settings tenant form (`PATCH /api/settings` sends every
    field);
  - trackers, overlays, named points, regions and webhooks (rarely edited at once).
