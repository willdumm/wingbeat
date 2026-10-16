# Review follow-up: `duty-log-edit` branch

This file is a prompt for an agent. It holds the findings of a code review of the
`duty-log-edit` bookmark (reviewed at commit `f1aa6d8f`, "Duty log and flight editor plans,
docs: as built after the review fixes"). The branch implements
`docs/duty-log-editing-plan.md` and `docs/flight-editor-plan.md`.

## Your job

1. **Verify each finding before acting on it.** The review was done by reading the code,
   not by running it, and the branch may have moved since. For each point, open the cited
   code, confirm the problem still exists and the reasoning holds, and drop or adjust any
   point that's wrong or already fixed. Line numbers are as of `f1aa6d8f`. If they've
   drifted, find the quoted code.
2. **Hand the verified points to subagents, one section at a time.** Each section below is
   written so you can pass it to a subagent with the shared context block. Give the
   subagent only the points you verified, plus anything you learned while verifying.
3. **Run the sections one after another, not in parallel.** They share files
   (`pilot-duty.ts`, `flight-editor.ts`, `form-modal.ts`), and this is a non-colocated `jj`
   repo with a single working copy. Suggested order: A → B → C → D → F → G. Section D
   moves helpers between files, so run it after B and C. Otherwise their line references
   go stale.
4. **Don't implement section E yourself.** Those are design decisions. Present the options
   to the user and wait for their choice.
5. After each section, review the subagent's diff yourself: did it fix what was asked,
   stay in scope, and follow the shared rules below? Then report to the user, section by
   section, with each point marked fixed, skipped (and why) or not reproduced.

Don't push, open PRs or post anything on GitHub unless the user asks.

## Shared context for every subagent

Paste this block into each subagent prompt:

> You're working in `/home/will/Documents/wingbeat`, a Cloudflare Workers app (Hono + D1)
> whose client code is JavaScript inside TypeScript template strings (`*Script()`
> functions in `src/shared/`, concatenated into each page). Read `CLAUDE.md` first and
> follow it. In particular:
> - Use design-system tokens and existing `src/shared/` components. Don't hand-write
>   colors, radii or fonts.
> - Never edit a shipped migration. New ones are numbered from the next free number. A
>   migration that adds a column to `flight_corrections`, `duty_days`, or an assignment
>   field to `flights` must drop and recreate the `edit_history` triggers.
> - If you move, rename or remove a `data-doc-shot` element, update
>   `site/scripts/doc-shots.manifest.mjs`.
> - After changing `pilot-duty.ts`, `flight-edits.ts`, `time.ts` or `flight-store.ts`, run
>   `nix develop path:./nix --command npm test`.
> - After changing any showcase render chunk or its styles (see CLAUDE.md), run
>   `nix develop path:./nix --command npm run docs:showcase` and keep the regenerated
>   output.
> - Run `nix develop path:./nix --command npx tsc --noEmit` (or the project's typecheck)
>   before you finish.
> - Always run `nix develop` as `path:./nix`, never from the repo root. This is a jj repo:
>   don't use `git`. Don't push.
>
> Match the surrounding code's style: comment density, naming, the `*Styles()` /
> `*Markup()` / `*Script()` split. If a fix changes behavior that
> `docs/duty-log-editing-plan.md`, `docs/flight-editor-plan.md` or the user docs under
> `site/content/docs/` describe, update them in the same change. Add or extend tests in
> `test/` for any behavior the `node:vm` harness can reach. When done, report each point
> as fixed, skipped (with the reason) or not reproduced, and list the files you changed.

---

## Section A: Server API (`src/index.ts`)

**A1. A tracked correction can make the departure later than the arrival.**
`src/index.ts:1205`
```ts
if (start != null && end != null && end - start > MAX_FLIGHT_SECS) {
```
When only one of `start_time` / `end_time` is corrected, `parseEntryFields` fills in the
other from the tracker's flight, but checks only the 24 h maximum. A `start_time` after the
tracker's `end_time` is stored, and the flight ends up with a negative duration. The flight
form never sends this, but the API accepts it. **Fix:** also refuse `end <= start` after
the tracker's value has been filled in. Allow equal times for a tracked flight only if the
form's under-a-minute case (`readForm` in `flight-editor.ts`) actually needs it. Check that
case first.

**A2. The assignment in `POST /api/flight-corrections` isn't tied to the corrected flight.**
`src/index.ts:1255`, `1346`
```ts
if (!await db.prepare('SELECT 1 FROM flights WHERE id = ? AND tracker_id = ?').bind(a.flight_id, trackerId).first()) {
```
`assign.flight_id` can name any flight of the same tracker, not necessarily the one at
`body.flight_start_time`. It also causes the "it may have just been re-recorded; reload and
try again" race, because segmentation re-inserts the newest flight with a new id. **Fix:**
resolve the flight on the server with `WHERE tracker_id = ? AND start_time = ?` from
`body.flight_start_time` and drop `flight_id` from the payload. Update the client caller
(`openFlightForm` in `flight-editor.ts`, which sends `assign: { flight_id: f.id, ... }`)
and the API description in `docs/duty-log-editing-plan.md` §2.

**A3. Duplicated existence checks.**
`src/index.ts:1225`, `1229`, `1258`, `1259` inline `SELECT 1 FROM pilots …` /
`SELECT 1 FROM aircraft …`, even though `pilotExists()` already exists at `1533`. Use
`pilotExists()`, add an `aircraftExists()` next to it, and move both above their first use.

**A4. "Empty tracked row" is defined twice.**
`EMPTY_TRACKED_ENTRY_SQL` (`src/index.ts:1135`) and `isEmptyTrackedEntry()` (`1235`) must
always agree. Put them next to each other with a comment saying so, or derive both from one
list of the columns that count.

**A5. The bulk route's cleanup runs over the whole table.**
`src/index.ts:1461`
```ts
stmts.push(c.var.db.prepare(`DELETE FROM flight_corrections WHERE ${EMPTY_TRACKED_ENTRY_SQL}`));
```
It deletes empty tracked rows anywhere in the table, and the `edit_history` triggers
attribute those deletes to the current user. **Fix:** limit it to the request's tracked
keys, using the same `json_each(?1)` the upsert/update uses.

**A6. Write routes with no caller.**
`PUT /api/duty-days/:pilot/:date` (`src/index.ts:1536`) and
`DELETE /api/duty-days/:pilot/:date` (`1564`) aren't used by the UI (the plan says so).
Each is one more write route to keep validated. Grep `src/`, `site/` and `test/` for
callers. If there are none, remove them, plus `parseDutyDayKey` if nothing else uses it,
and update the plan's §2.

**A7. Equal duty start and end means a 24-hour duty.**
`hhmm()` and `parseDutyDayFields()` accept `duty_start === duty_end`, and `_dutyInterval`
(`pilot-duty.ts`) reads that as a 24-hour duty period. In practice that's almost certainly
a typo. Refuse it for duty days and for the pilot's default duty (`PUT /api/pilots/:id`).
The matching form check is C3.

---

## Section B: Form modal, segmented control, flight editor

**B1. Replacing an open form modal leaks its keydown listener.**
`src/shared/form-modal.ts:188`
```js
if (existing) existing.remove();
```
The removed modal's capture-phase `onKey` listener stays on `document`. On Tab, its
`focusable` list (built from the detached panel, where `offsetParent` is null) is empty, so
it calls `preventDefault()`, and Tab stops working in the new dialog. How it happens:
`openFlightForm` awaits `_feLoadNamedPoints()` before opening (`flight-editor.ts:457`), so
a double-click during the first fetch opens `flight-form-modal` twice. **Fix:** keep each
modal's `close` (for example on the element, or in a map keyed by id) and call it instead
of `remove()`. Consider also guarding `openFlightForm` against re-entry while it's loading.

**B2. Segmented toggles don't mark a form as changed.**
`src/shared/segmented-control.ts:81`; `form-modal.ts:215` sets `dirty` only on `input` and
`change`. `wireSegmented` changes the selection on click and fires neither event. So a form
changed only through Part 135/91, Paid/Unpaid or Duty/Rest closes on Escape or a backdrop
click without the "Discard your changes?" prompt the plan specifies (§4, "Forms").
**Fix:** dispatch a bubbling `change` event from `wireSegmented` when the selection changes
on a user click. Careful: the day form's `setKind()` (in `_dutyOpenDayForm`'s `load()`,
`pilot-duty.ts`) selects programmatically with `.click()`, and `load()` runs on open and
whenever the date changes. Give `wireSegmented`'s return value a programmatic setter that
doesn't dispatch, and use it there, so opening the form doesn't mark it dirty.

**B3. The flight editor opens an editable form for read-only users.**
`src/shared/flight-editor.ts:305`
```js
if (f) openFlightForm(f);
```
A row click opens the form whatever `_feCanEdit` is, and the form always offers Save,
Remove and Revert. For a non-admin, Save returns 403, and so does `showLastEdit`. Today
non-admins can't reach the editor (both entry points are hidden), but the editor has
partial read-only handling (`_feCanEdit`, the "Flight …" aria-label). Pick one:
- gate the row click (and the date button) on `_feCanEdit`, or
- remove the read-only handling and document that the editor is admin-only.
Gating is the smaller change.

**B4. `deleteUnappliedCorrections` returns `true` after a failed DELETE.**
In `flight-editor.ts`, after a failed DELETE it shows an `alert`, then still refreshes and
returns `true`, while its comment says "Returns whether it went ahead". Return `false` on
failure, and check both callers (the flight editor list and the duty log's
`onDeleteEntry`).

---

## Section C: Duty log day form (`src/shared/pilot-duty.ts`, `_dutyOpenDayForm`)

**C1. Range save overwrites existing days without warning.**
`pilot-duty.ts:1658`
```js
const body = { dates: keys, duty_start: dutyStart, duty_end: dutyEnd, rest, note: $('#duty-d-note').value };
```
A Through range writes the same values to every day. Recorded duty times, notes and rest
days get replaced; turning rest into duty also clears `rest_designated_at` (server
`dutyDayStatement`). Clear asks for confirmation, Save never does. **Fix:** before saving
a range, compare each day's existing record (`recordOf`) with the form's values. If any
differ, confirm with a count, e.g. "3 of these 6 days already have records that will be
replaced. Save?" Say so specifically when a rest day would lose its designation.

**C2. The day form copies the default duty into a day that has no record.**
`pilot-duty.ts:1628`
```js
const def = rec ? null : _dutyDefaultDuty();
```
Saving the form on a day with no record (to add only a note, or to plan tomorrow) stores
the default as real duty times. That turns a non-flying day into a duty day: it then feeds
the (d) look-back and the (c) rest and 24-hour checks, and the "(default)" marker
disappears. It's also inconsistent: a day whose record has only a note gets empty times.
**Fix:** leave the time inputs empty and show the default as a hint ("Default duty
08:00–17:00 applies on flying days"). Add a small "Use default" button if filling it in is
convenient. Make sure saving a note alone still creates a note-only record, which `dutyOf`
treats as "use the default".

**C3. Refuse equal duty start and end in the form.**
This matches A7. Refuse equal start and end in the day form and the default-duty form
(`_dutyOpenDefaultForm`), with a message in `errorEl`.

---

## Section D: Shared-script structure and duplication

Run this after B and C. It moves code those sections touch.

**D1. Hidden dependencies between the shared scripts.**
- `flight-edits.ts` is described as a self-contained data module for the flight store, the
  duty log and the showcase. But `flightFormTimes` calls `dutyAddDays` and `fmtBlock`
  (`flight-edits.ts:171`, `177`), which are defined inside `pilotDutyRenderScript()`.
- `flight-editor.ts` uses `dutyDateLabel` from `pilot-duty.ts`.
- `pilot-duty.ts` uses `flightApi` (`flight-editor.ts:322`) and `showLastEdit`
  (`flight-editor.ts:340`).

It works only because every page, and `test/harness.mjs`, concatenates all of them.
**Fix:**
- Move the generic date and duration helpers (`dutyAddDays`, `dutyDateLabel`, `fmtBlock`,
  and `_dutyKey` / `_dutyAddMonths` / `_dutyShortDate` if they fit) into
  `tzCalendarScript()` in `src/shared/time.ts`. Give them neutral names, or keep the old
  names as aliases if renaming touches too much.
- Move `flightApi` (a generic JSON-write-and-throw helper) next to `runFormAction` in
  `form-modal.ts`, and give it a neutral name.
- Give `showLastEdit` / `_feAssignmentChanged` a home that both forms can depend on, for
  example a small edit-history script.

Update the header comments that list each script's dependencies, the harness `EXPORTS` and
source order, the showcase's script composition (`src/showcase/scripts.ts`), and rerun
`npm test` and `npm run docs:showcase`.

**D2. `escHtml` is a general helper living in `flight-edits.ts`.**
`src/shared/flight-edits.ts:42`. Its comment calls it "the one escape helper", yet
`settingsEscAttr` (`src/shared/settings.ts:2387`) and the inline escape in
`src/shared/aircraft-info.ts:425` remain, and `alerts.ts` depends on `flight-edits.ts` only
for it. Move it to a neutral shared client script that both pages already include (the
same home as D1's helpers works) and replace the other client-side copies. Leave the
server-side `escapeHtml` functions (`auth.ts`, `status.ts`, `brand.ts`,
`showcase/page.ts`) alone: they run in the Worker, not the page.

**D3. Dead constant.** `_DUTY_TZ` (`pilot-duty.ts:250`) is no longer used. Remove it.

---

## Section E: Design decisions. Ask the user, don't implement

Present each one with the options and your recommendation, and wait for the user's
decision. Once they've decided, the chosen option can go to a subagent like the other
sections.

**E1. Past months change when the pilot's default duty or the duty method changes.**
The plan (§3) says totals are "as of month end" so that "a past month's PDF is
reproducible". But days with no record take `pilots.default_duty_start/end` at render time
(`_dutyCalendar`'s `dutyOf`, `pilot-duty.ts:389`), and `duty_method` re-checks every month.
Changing either one rewrites past days' duty periods, warnings and the (c) "differs from
regularly assigned" check. Neither change is recorded: `PUT /api/pilots/:id`
(`index.ts:1678`) and `PATCH /api/settings` don't go through `recordedBatch`, and neither
table has history triggers. Options:
- **(a)** Record both in `edit_history`: triggers on `pilots`' default-duty columns and on
  the `duty_method` row of `settings`, with the routes going through `recordedBatch`. This
  gives traceability but past months still change.
- **(b)** Make defaults effective-dated (a dated history of default duty and method, with
  each day using the value in force that day).
- **(c)** Save the default into a past day's record when the month is closed or exported.
- (a) alone is the plan's existing follow-up. (a) + (b) actually makes past months
  reproducible.

**E2. Unmatched corrections can be missing from every duty log.**
`pilot-duty.ts:484`
```js
if (!near || near.pilot_id !== pilotId) continue;
```
An unmatched row shows only in the log of the pilot of the nearest flight within 12 h. With
no flight that close (the tracker's points were wiped), a row that removed a flight or
marked it Part 91 shows in no log and no PDF; only the flight editor lists it. The plan
(§1 notes) says the log shows it on its date and that "nothing silently disappears".
Options:
- update the plan to describe the 12-hour rule;
- show rows with no nearby flight in every pilot's log on that date;
- show a count of "corrections not shown in any log" in the duty log toolbar, linking to
  the flight editor.

**E3. No concurrency check on full-state saves.**
`POST` / `PUT /api/flight-corrections` and `PUT /api/duty-days/:pilot` replace the record
with the form's full state, so two admins editing the same flight or day silently
overwrite each other. The edit history records it. Option: the client sends the newest
`edit_history` id for the record (it already fetches it for "Last changed by"). The server
returns 409 if a newer history row exists for that key, and the form says "Changed by X
since you opened this. Reload?". Ask whether this is worth it for a single-pilot operator
with few admins.

---

## Section F: Tests

**F1. The SQL is untested.** The riskiest new code runs only in production:
- the `json_each` upsert and update in `POST /api/flight-corrections/bulk`, including
  "Part 135 clears unpaid" and "restore doesn't insert rows";
- `dutyDayStatement`'s `rest_designated_at` CASE (set on 0→1, kept on later edits, cleared
  when rest is unset);
- the `edit_history` triggers (insert, update and delete recorded; an update that changes
  nothing or only `updated_at` not recorded; the append-only guards; `edit_actor`
  attribution);
- the `flights_assignment_history_au` trigger;
- `ENTRIES_SINCE_SQL`'s key-to-row lookup (tracked and manual keys, deleted keys coming
  back with NULL columns).

Add a suite that applies `migrations/0001`–`0004` to an in-memory SQLite and runs these
statements. Check what's available in the nix shell and `package.json` first. Prefer
`node:sqlite` if the Node version has it, then `better-sqlite3`, then Miniflare's D1. Note
that SQLite in D1 may differ slightly from the local build. Ideally the suite runs the
route handlers through Hono's `app.request()` with a D1 stand-in. If that's too heavy,
extract the SQL strings and statement builders so the tests can import them. Wire it into
`npm test`.

**F2. No flight-store test for the sync race.** Add harness tests for `_fsFetchMerge`:
- a corrections delta is dropped when `entries_last_history_id` moved during the fetch
  (another tab's save);
- a `full: true` response replaces the cached rows;
- `refresh()` called while one is in flight runs exactly one follow-up refresh, and
  callers share it.

This needs a `fetch` stub in the vm context. Extend `loadEngine` to take one.

---

## Section G: Minor

**G1. Alerts do extra work on every refresh.** `src/dashboard/scripts/alerts.ts:124` calls
`dutyTotals(flights, pilot.id, now)` for each active pilot on each refresh. Each call
builds `_dutyCalendar` and rest counts that the alert never uses (no `days` are passed).
Add an option (e.g. `{ hoursOnly: true }`) that skips the rest part, or filter `flights`
by pilot once before the loop. Do this only if it stays simple.

**Noted, no action needed:** migration 0003 repeats the 17-column `json_object` six times
across its triggers. SQLite offers no clean way to share it, and CLAUDE.md now documents
the drop-and-recreate rule.

---

## What the review found sound (don't "fix" these)

- The overlay design: corrections keyed on `(tracker_id, flight_start_time)`, and only the
  corrected fields stored (NULL means the tracker's value).
- Incremental sync from the `edit_history` cursor, with a full resync when the cursor is
  missing or past the newest id.
- Recording through triggers plus `recordedBatch`; the append-only guards.
- HTML escaping in the duty log and flight editor, and Typst escaping via `_typStr`.
- `requireAdmin` on every write route. Reads open to signed-in users is intentional (plan
  §2).
- The existing `test/` suites have real assertions; none are placeholders.
