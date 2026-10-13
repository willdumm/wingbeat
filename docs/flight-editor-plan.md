# Design: One Flight Editor, Edits Shown Everywhere, Duty Planning

**Status: implemented.** See "As built" at the end for where the code differs from
the text below.

Follows [duty-log-editing-plan.md](duty-log-editing-plan.md), which is implemented. That
plan kept flight corrections inside the duty log ("Out of scope: showing duty-log edits in
the dashboard flight list, analytics or maintenance views … merging the bulk-edit modal
with the single-flight assignment modal into one flight editor"). This plan brings them in.

## Problems with what shipped

1. **Corrections only show in the duty log.** A corrected departure time, a renamed
   destination, a removed flight or a manual flight is invisible in the dashboard flight
   list, on the analytics (trends) page and in maintenance hour estimates. The same flight
   reads differently depending on where you look.
2. **Three flight editors.** The dashboard's Bulk Edit modal (`bulk-edit.ts`: filter,
   select, set aircraft/pilot), the assignment modal (`assignment-modal.ts`: one flight's
   aircraft/pilot, opened from the unassigned-flight alert), and the duty log's flight form
   (`pilot-duty.ts`: times, labels, aircraft, pilot, Part 91, remove, revert). Each knows
   only part of a flight.
3. **Planning ahead means paging through empty days.** To mark a rest day in two months
   you page forward and scroll past a month of "—" rows.
4. **No default duty time.** Every flying day needs its duty times typed in, though most
   pilots keep the same hours.
5. **A whole column for Part 91.** The "91" column is empty on almost every row.
6. **The dashboard duty alert uses the old limits.** `computeAlerts()` (`alerts.ts:130`)
   still checks rolling 24 h/7 d/30 d/90 d/12-month windows (8/36/100/250/1,000 h), not
   the §135.267 calendar quarter/two-quarter/year limits the duty log now uses.

## Approach

Make the corrections overlay part of the flight data every page reads, instead of
something only the duty log merges in:

- **Shared merge.** A new `src/shared/flight-edits.ts` owns `applyFlightEdits(flights,
  entries)`: the "effective flights" logic now in `computeDutyData` step 1. It applies a
  row's non-NULL fields, drops removed flights, and adds manual flights. It also returns
  the unmatched rows.
- **The flight store serves effective flights.** `flightStore` also syncs the
  `flight_log_entries` rows and returns merged flights from `getAll()`/`getCompleted()`.
  Every current consumer then gets corrections without changing its own code:
  - flight list and day view
  - analytics totals, accounting, map layers and stream graph
  - aircraft maintenance estimates
  - alerts
  - the duty log
- **One editor.** A shared flight editor replaces all three: a filterable, selectable
  flight list with bulk actions, plus one single-flight form. The dashboard, the duty log
  and the alerts all open it.
- **The duty log stops merging.** `computeDutyData` takes already-effective flights and
  only fetches duty days.

The storage model from the previous plan stays as it is: an overlay keyed on
`(tracker_id, flight_start_time)`, NULL meaning "use the tracker's value", and manual
flights as rows with no tracker. Its reasons still hold: segmentation re-inserts the newest
flight, and `start_time` is a join key. Only who reads it changes.

### 1. Schema — fold into `migrations/0002_duty_log.sql`

**Decision:** 0002 hasn't shipped to production (only to staging, which will be reset by
hand; see "Staging reset" below), so these changes go into 0002 itself. No 0003. Rewrite
0002's header comment too: it currently says only the duty log reads these tables, which
stops being true.

Additions to 0002:

```sql
-- In CREATE TABLE flight_log_entries, after destination_label:
  remark            TEXT,     -- free-text remark (e.g. "Training"); shown under the flight
  start_lat         REAL,     -- manual flights only: endpoints picked from named points,
  start_lon         REAL,     -- so analytics can place them in a region. Tracked flights
  end_lat           REAL,     -- take coordinates from their points.
  end_lon           REAL,
-- and a CHECK that the four coordinates are NULL when tracker_id IS NOT NULL.

-- A pilot's usual duty period, used for flying days with no duty times recorded.
ALTER TABLE pilots ADD COLUMN default_duty_start TEXT;   -- HH:MM local
ALTER TABLE pilots ADD COLUMN default_duty_end   TEXT;   -- HH:MM local; may be < start

-- Bumped on every write to flight_log_entries, so clients can tell cheaply whether
-- their cached copy is current. Triggers keep it right whichever route writes.
CREATE TABLE IF NOT EXISTS flight_log_version (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO flight_log_version (id, version) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS flight_log_entries_ai AFTER INSERT ON flight_log_entries
  BEGIN UPDATE flight_log_version SET version = version + 1 WHERE id = 1; END;
-- … and the same AFTER UPDATE and AFTER DELETE.
```

Part 91 stays the `part91` flag. Showing it only when true is a display change (§5), and
the 24-hour calculation needs a flag to read.

This is a deliberate exception to the README rule against editing a migration: 0002 has
only reached staging.

#### Staging reset

Staging already has the old 0002 applied. Before deploying this to staging, run against
the staging D1 (this deletes the test duty-log data entered there):

```sql
DROP TABLE IF EXISTS flight_log_entries;
DROP TABLE IF EXISTS duty_days;
DELETE FROM d1_migrations WHERE name = '0002_duty_log.sql';
```

then `wrangler d1 migrations apply <db> --remote` from the staging setup in
`~/Documents/wingbeat-hosting`. The `pilots` columns are new, so the `ALTER`s apply
cleanly. Give the user these commands to run; don't run them yourself.

### 2. API — `src/index.ts`

Route names stay as they are (`/api/flight-log-entries`, `/api/duty-log`, `/api/duty-days`)
to avoid churn.

- `GET /api/flight-log-entries?version=<n>` returns `{ version, entries }` with every
  row, or `{ version, unchanged: true }` when `n` matches `flight_log_version`. The table
  holds a few rows per corrected or manual flight, so sending all of it is fine, and the
  version check keeps the per-refresh cost to one single-row read. It's readable by any
  signed-in user, like flights.
- `GET /api/duty-log?pilot=` returns only `{ days }`. Entries now come from the flight
  store.
- `POST /api/flight-log-entries/bulk`. Body: `{ flights: [{ tracker_id,
  flight_start_time } | { entry_id }], set: { part91?, excluded? } }`. It runs in one D1
  batch:
  - upserts tracked-flight rows, changing only the given flags and keeping existing
    corrections
  - updates manual rows
  - deletes any tracked row that's left with nothing in it (all fields NULL, flags 0, no
    remark).
  It's for the editor's bulk actions.
- `PUT /api/flights/assignment` also accepts `entry_ids` (manual flights; sets their
  `pilot_id`/`aircraft_tail` columns), with `flight_ids` allowed empty when `entry_ids`
  is given. A bulk "set pilot/aircraft" then covers both kinds of flight in one request.
- `PUT /api/pilots/:id` accepts `default_duty_start` / `default_duty_end`: both HH:MM or
  both null. `queryPilots` returns them, which covers `/api/pilots` and `/api/bootstrap`.
- `POST/PUT /api/flight-log-entries` accept `remark` (both kinds of flight) and the
  manual-flight coordinates (rejected on tracked rows). `PUT` gets the same empty-row
  cleanup as bulk.
- `src/types.ts`: `FlightLogEntry` and `Pilot` gain the new columns.

### 3. Shared data layer

**`src/shared/flight-edits.ts`**: `flightEditsScript()` exporting
`applyFlightEdits(flights, entries, { includeRemoved })`, which returns
`{ flights, unmatched }`. An effective flight is the store's flight record plus:

- `edit`: `{ entry, manual, part91, remark, excluded, original: { field: tracker value } }`
- manual flights get `id = -entry.id`, which can't collide with tracked flights. They have
  `tracker_id: null`, `points: []`, the named-point coordinates when set, and their own
  pilot/aircraft. `pilot_name` is looked up from the pilots list the page already has.

It takes data as arguments and touches no page state, so the showcase can call it on
sample data.

**`flightStore`** (`flight-store.ts`):

- Keeps raw flights as today and also holds `entries` + `version` in the same
  localStorage blob.
- `refresh()` fetches `/api/flight-log-entries?version=` alongside the per-tracker calls, and
  fires `onChange` when either changes.
- `getAll(trackerIds, { includeRemoved })` / `getCompleted(...)` return effective flights.
  Manual flights have no tracker, so they're always included; `trackerIds` only narrows
  tracked flights. Removed flights are left out unless `includeRemoved` (only the editor
  passes it).
- **Tracker filter** (`filters.ts`, decided): manual flights show unless a tracker filter
  is set. The tracker filter gets a "Manual entries" option (stored as `'__manual__'` in
  `trackerIds`, like `'__null__'` for pilots) that `matchesFlight` matches against
  `tracker_id === null`.
- `getRaw()` for the few callers that need the tracker's own values: the editor's
  "Tracker:" hints and segmentation-adjacent code.
- `getUnmatched()` returns rows whose tracked flight is gone, for the duty log and the
  editor.
- `patchFlight()` goes away for assignment; writes are followed by `refresh()`. The edits
  fetch is one small request, and that removes the hand-patching in `bulk-edit.ts`,
  `assignment-modal.ts` and the duty log.

**Consumers**, all reading the store and needing no merge code of their own:

- **Flight list** (`buildFlightItem`):
  - shows corrected times, duration and route
  - marks corrected values (†, with the tracker value in the title, as in the duty log)
  - adds a "Manual" chip, and a remarks line (Part 91, remark text) only when there is one
  - a manual flight has no track: selecting it shows its details and "No track recorded"
    instead of drawing.
- **Day view / track rendering:** draws the full recorded track, even when the departure
  or arrival time was corrected (the points are real). Clipping the drawn track to the
  corrected times can come later.
- **Analytics:**
  - hours use corrected times, and removed flights drop out
  - manual flights with coordinates count toward regions; without coordinates they count
    toward totals, under "Unknown location"
  - the map layers skip flights with no points.
- **Maintenance estimates** (`aircraft-info.ts`) use corrected hours and include manual
  flights flown in a fleet aircraft (decided).
- **Alerts:**
  - the pilot-duty alert uses the duty log's limits and totals instead of its own table
    (`_DUTY_LIMITS` and a `dutyTotals(flights, pilotId, asOf)` split out of
    `computeDutyData`)
  - the unassigned-flight alert opens the shared flight form.

### 4. The flight editor — `src/shared/flight-editor.ts`

One shared component (`flightEditorMarkup/Styles/Script`, wired into both pages'
`<style>`/script composition once), replacing `bulk-edit.ts`, `assignment-modal.ts` and the
duty log's `_dutyOpenFlightForm`.

**Editor view.** It opens full screen in the settings modal, like the duty log, so it
works the same on both pages and on phones.

- **Toolbar:**
  - From/To dates, Aircraft, Pilot (the same filter controls as Bulk Edit today, reusing
    `filters.ts` pieces)
  - a "Show removed" toggle
  - "Add flight".
- **List:** one row per effective flight: date, Dep–Arr, Origin → Dest, aircraft, pilot,
  time, "Manual"/"Removed" chips, and the same remarks line as the duty log (§5) when the
  flight has remarks. Corrected values are marked †. Removed flights appear only with
  "Show removed", greyed (decided: they're hidden everywhere else, including the dashboard
  map and day view). Each row has a checkbox and opens the flight form on click. Unmatched
  corrections appear as rows with "Not found" and a Delete action.
- **Selection bar** (sticky at the bottom, appears when anything is selected):
  - Set aircraft…
  - Set pilot…
  - Part 91 / Part 135
  - Remove from log / Restore.
  Each action is one request: assignment, or `/api/flight-log-entries/bulk`.

**Flight form** (modal over whatever opened it): the duty log's flight form, generalized.

- Date, dep/arr time, origin/dest, aircraft, pilot, Part 135/91 (segmented), remark.
- Origin and destination offer named points (a datalist). Picking one on a manual flight
  stores its coordinates.
- Tracker values are shown under corrected fields.
- Footer actions: Remove from log / Restore, Revert to tracker, Delete (manual), Save.
- Copy saying corrections "apply to the duty log only" goes. They now apply everywhere
  except the recorded track.

**Entry points:**

| Where | Opens |
| --- | --- |
| Dashboard "Bulk Edit" button (renamed "Edit flights") | editor, no filters |
| Dashboard flight list: an edit (pencil) button on the selected flight's row, admins only | flight form |
| Unassigned-flight alert | flight form |
| Duty log pencil | flight form |
| Duty log toolbar "Edit flights" (replaces "Add flight") | editor filtered to this pilot and month |

### 5. Duty log changes — `src/shared/pilot-duty.ts`

**A remarks row instead of the 91 column (decided).** The table loses the "91" column:

Date | Duty | A/C | Origin | Dep | Dest | Arr | Time

A flight with remarks gets one extra full-width row directly under it, e.g. "Remarks: Part 91
· Training". It's rendered only when there's something to say, so most flights have no
remarks row. Remarks, in order:

- "Part 91", when the flight is Part 91 (nothing is shown for Part 135)
- the flight's free-text `remark`.

"Manual" stays a chip next to the origin, as now. The remarks row:

- is styled like the day-total row (muted, small), indented to start under A/C
- spans the full width in the narrow (`@container`) layout, like the warning rows
- appears in the PDF as a spanning row under the flight (`table.cell(colspan: …)`), in
  the same place.

The same remarks-line helper (`flightRemarks(f)`, returning the list of remark strings)
lives in `flight-edits.ts` so the flight list, the editor and the duty log word it
the same way.

**Days through today; planning via an Upcoming panel.**

- The month table lists past days, and in the current month only days up to today.
  Forward month navigation stops at the current month again, which reverts that part of
  the last change.
- An **Upcoming** panel above the totals in the current month lists every planned record
  dated after today, sorted. Each entry shows its date, "Rest · designated Oct 13" or
  duty times, its note, and an edit button.
- **"Plan duty or rest"** opens the day form with any date: the date picker isn't limited
  to the shown month, and the optional Through range stays.
- Planned rest still counts in the quarter totals as "planned". When the selected quarter
  is the current one, a planned day later in the quarter that isn't in the table still
  counts.

**Default duty time.**

- Set on the pilot (`default_duty_start/end`). Admins edit it from a "Default duty
  08:00–17:00 · Change" line in the duty log header; it's also editable on the pilot row
  in Settings.
- It applies to a day with flights and no duty record or rest designation. That day's
  Duty column shows the default times marked "(default)" on screen and in the PDF, and
  the 14-hour and 10-hour-rest checks use it.
- The day form pre-fills the default for a day with no record.
- A day with a record always uses the record.
- New warning on any day: a flight that departs before or arrives after that day's duty
  period (recorded or default), e.g. "Flight 18:05–18:50 outside duty 08:00–17:00". A
  default that doesn't fit the day's flying shows up there, and the fix is to record the
  actual duty times.

**`computeDutyData(flights, pilotId, pilotName, year, month, { days, defaultDuty, unmatched })`.**
It takes effective flights from the store (step 1 of the old function moves to
`applyFlightEdits`) and keeps its row model.

### 6. Docs and showcase

- `site/content/docs/features/pilot-duty-log.md`: remarks row, Upcoming panel and
  planning, default duty.
- New `site/content/docs/features/editing-flights.md`: the editor, the flight form,
  manual flights, where corrections show up, removed flights. Fleet-management, analytics
  and live-tracking pages link to it.
- Showcase:
  - sample data goes through `applyFlightEdits` so the flight list and analytics demos
    also show the edited, manual and Part 91 flights
  - the duty demo shows a default-duty day and an Upcoming entry
  - re-run `docs:showcase`.
- `data-doc-shot` tags on the editor and flight form, with manifest entries, so the docs
  get real screenshots.

## Out of scope / later

- Clipping drawn tracks to corrected times.
- Correcting a raw point's location label everywhere (still separate).
- Re-linking an unmatched correction to the flight that replaced it.
- Recurring duty schedules (e.g. "rest every Sunday"). Default duty plus ranged rest
  covers the stated need.
- Audit history beyond `updated_at`.

## Decisions (from review)

1. **Migration:** fold into `0002`; staging is reset by hand (§1, "Staging reset").
2. **Maintenance hours:** corrected times, removals and manual flights in a fleet
   aircraft all count toward Hobbs/tach estimates.
3. **Removed flights:** hidden everywhere (flight list, day view, map, analytics,
   maintenance, duty log); visible greyed only in the editor with "Show removed".
4. **Manual flights and the tracker filter:** shown unless a tracker filter is set; the
   filter gets a "Manual entries" option.
5. **Part 91:** a remarks row under the flight, shown only when the flight has remarks
   (Part 91 and/or free text). No 91 column.

## Implementation order

1. Migration 0002 additions; API (entries with version, bulk, manual assignment, pilot
   default duty). Give the user the staging reset commands.
2. `flight-edits.ts` and the flight store changes; switch the duty log to store flights.
   No visible change yet apart from consistency.
3. Consumers: flight list chips/markers and manual-flight selection, analytics,
   maintenance, alerts on shared duty limits.
4. Shared flight editor and form; remove `bulk-edit.ts` and `assignment-modal.ts`; wire
   the entry points.
5. Duty log: remarks row, days through today, Upcoming panel and any-date planning,
   default duty and the outside-duty warning; PDF.
6. Docs, showcase sample data, doc shots.

## Notes for the implementer

- **Where things are now:**
  - Duty log (row model, screen render, PDF, day form, flight form): `src/shared/pilot-duty.ts`.
    `computeDutyData` step 1 is the merge to move into `flight-edits.ts`. `_dutyOpenFlightForm`
    is the starting point for the shared flight form. `_dutyOpenDayForm` (date picker + Through
    range) stays.
  - The last duty-log change (commit "Duty log: plan duty and rest ahead…") made the month
    navigation go 12 months ahead, and gave future months "as of now" totals
    (`isFutureMonth`). §5 replaces the forward navigation with the Upcoming panel. Take
    `isFutureMonth` out with it, and update the docs page's "Planning rest days ahead"
    section to match.
  - Server routes: `src/index.ts`, "Pilot duty log routes" and `/api/flights/assignment`.
  - Pages that need the new shared pieces wired in once: `src/dashboard.ts` and
    `src/analytics.ts` (styles and scripts). Settings, including the duty log, is on both
    pages.
- **Project rules (CLAUDE.md):**
  - Use theme tokens and shared components (`buttons.ts`, `segmented-control.ts`,
    `form-modal.ts`, `status.ts`, `icons.ts`), and `docs/frontend-patterns.md` for the
    new scrollable editor view.
  - Showcase render chunks take data as arguments. Re-run
    `nix develop path:./nix --command npm run docs:showcase` and commit its output;
    `--check` must pass.
  - Keep `site/scripts/doc-shots.manifest.mjs` in step with any `data-doc-shot` tags.
- **Testing:**
  - `npm run type-check` (in the nix shell) is the only automated check.
  - For UI, drive a real browser against an ephemeral local server.
    `site/scripts/gen-doc-shots.mjs` shows how: migrations plus
    `site/scripts/doc-shots-seed.sql` into a throwaway `--persist-to` D1, `wrangler dev`
    with `CUSTOMER_ROUTING`, an admin session via `POST /join/doc-shots-seed-token`, and
    the nix-provided Chromium for Playwright.
  - The seed has pilots and aircraft but no flights. Insert `points`/`flights` rows (or a
    manual flight via the API) to exercise the merge.
  - Settings opens via `[data-doc-shot="settings.settings-button"]`, and a pilot's duty log
    via its row's "Info" button.
  - Kill the dev server and its `workerd` children when done.
- **Deployment:** don't deploy. The user tests on staging (`~/Documents/wingbeat-hosting`)
  after running the staging reset in §1.

## As built

Where the implementation departs from, or adds to, the plan above:

- **API.** `POST /api/flight-log-entries` gets the same empty-row cleanup as `PUT`
  (a tracked-flight body with nothing in it deletes the row and returns `{ entry:
  null }`), so the flight form always upserts a tracked flight with `POST`. In
  `/bulk`, an `{ entry_id }` ref updates that row whatever its kind. Assignment with
  `entry_ids` and `pilot_id: null` is rejected ("Manual flights need a pilot").
- **Flight store.** `refresh()` with no argument reuses the last call's tracker ids, so
  the editor, form and duty log can refresh after a write without knowing the page's
  trackers. Effective flights are cached per store generation, so repeated reads
  return the same objects. A corrected flight's `modified_at` is the later of the
  flight's and the row's `updated_at`, so redraw-on-change logic notices edits. Live
  positions (`buildLiveDataByTracker`) read `getRaw()`. The dashboard subscribes to
  `onChange` to re-render the list and alerts after a write.
- **`computeDutyData`** takes `unmatched` (from `flightStore.getUnmatched()`) in its
  options. Its day flights carry `remarks` (from `flightRemarks`). It returns
  `upcoming` (current month only).
- **`dutyTotals(flights, pilotId, asOf, { days, asOfLabel })`** derives the quarter
  from `asOf` and also returns `flight24` (flight time in the 24 h before `asOf`, Part
  91 left out). The dashboard alert flags the worst of the quarter/two-quarter/year
  totals and `flight24` at 90% of its limit.
- **Shared marks.** `flight-edits.ts` also exports `flightEditsStyles()` and the
  helpers `flightEditedMark`, `flightRemarksHtml`, `flightEntrySummary`,
  `flightOriginalText` and the Manual/Removed/Not found chips, used by the flight list
  and the editor. The duty log keeps its own table markup.
- **Editor.** It lists completed flights (`getCompleted`), so an in-progress flight is
  editable once it lands. "Set aircraft…" and "Set pilot…" are selects in the selection
  bar; Remove/Restore show according to what's selected. The editor's write helpers
  (`flightApi`, `flightAssign`, `flightSetFlags`) replace the duty log's `_dutyApi`.
  Manual flights can be removed (and restored) as well as deleted.
- **Analytics.** The null-coordinate handling ("Unknown location", skipping points-less
  flights in the map layers) landed with the store change (step 2), because manual
  flights reach analytics as soon as the store serves them.
- **Settings.** The pilot row's "Rename" became "Edit", with the default duty times
  next to the name, and the row shows "Default duty 08:00–17:00" when set.
- **Duty log.** The toolbar's "Duty / rest" is now "Plan duty or rest" and always
  starts at tomorrow. The Upcoming panel isn't in the PDF (it isn't part of the
  month's record). The toolbar shows "No default duty · Set" to admins when there is
  none.
- **Doc shots.** `site/scripts/doc-shots-seed.sql` gets four manual flights so the
  editor screenshot has rows; the editor's Add flight button carries
  `data-doc-shot="flight-editor.add-flight"` to reach the flight form.
- **Step 1** carried a temporary client change (the duty log fetching entries from
  `/api/flight-log-entries`), removed in step 2.
