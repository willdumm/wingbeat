# Review: `core-foundation` (phase 1 of the mobile app plan)

Reviewed 2026-11-03 at b06cbdd0 (`fork_point(main@origin | core-foundation)..core-foundation`,
15 commits from 02ef929f), before the prod step. At review time `npm test` (552 tests),
`tsc --noEmit` and `docs:showcase --check` all passed. The moved logic is a faithful port;
most findings are guardrails, plus a few latent bugs (some older than the branch).

Passes: reuse; best practices (`CLAUDE.md`, the plan's "Phase 1 progress and
conventions"); design and resilience (the API client, the flight store, timezone and
clock parameters, the Worker's request validation); tests and guardrails.

Status: **1 won't fix** (the tests run locally all the time). 2–12 are to be fixed, one
commit each. See "Fix status" at the end.

## High

### 1. CI never runs `npm test` (won't fix)

`.github/workflows/ci.yml` runs `npm ci`, `type-check` and `docs:showcase --check` only.
The worker-sql response-shape and request-validation tests, the device-time scan and the
duty spec run only locally. CI also runs only on pushes to main and on PRs, so it hasn't
checked this branch yet. Decision: the tests run locally all the time, so no change.

### 2. Errors that aren't an `ApiHttpError` are silent, and strict mode would make it worse

18 page handlers do `if (err.status) alert(err.serverError ?? '…')` (e.g.
`src/shared/settings.ts:1520`, `1806`, `2171`; `src/shared/regions-editor.ts:345`), so
any other error shows nothing:

- **An expired or revoked session.** The middleware (`src/index.ts:350`) redirects every
  request without a session to `/login`, `/api/*` included. The fetch follows the
  redirect and gets the login page's 200 HTML, so `resp.json()` (`client.ts:104`, `114`)
  throws a `SyntaxError` and the save fails with nothing shown. This predates the branch,
  but the client is now the one place to catch it.
- **The planned strict flip.** An `ApiShapeError` has no `status`, so a write the server
  already committed whose response doesn't match its schema would fail silently on every
  form.

Fix: make an unauthenticated `/api/*` request a 401 JSON (the app's bearer auth needs this
too) and/or have the client turn a redirected or non-JSON response into a typed error
(e.g. `ApiAuthError`). Then make the page handlers show something for errors that aren't
HTTP errors (a session error says to sign in again), rather than duck-typing `err.status`.

## Medium

### 3. `tzDayStartUnix` / `tzDayEndUnix` are an hour off on DST days east of UTC

`packages/core/src/time.ts:44-52` take the offset at a fixed 09:00 / 20:00 UTC, not at the
local day's boundaries. Checked:

| Zone | Day | `tzDayStartUnix` gives |
|---|---|---|
| Europe/Berlin | 2026-03-29 | 23:00 on the 28th |
| Europe/Berlin | 2026-10-25 | 01:00 |
| Australia/Sydney | 2026-10-04 | 23:00 on the 3rd |
| Australia/Sydney | 2026-04-05 | 01:00 |
| America/Anchorage | 2026-03-08 | 00:00 (correct) |

Used by the filter's date range (`filters.ts:49-52`), the stream graph's buckets
(`analytics.ts:34-49`) and maintenance due dates (`maintenance.ts:81`). Older than the
branch. The tests use one zone only (`core-time.test.mjs:33`, `TZ` in `test/core.mjs`).
Fix: build both from `tzLocalToEpoch` (start = local midnight, end = next local midnight
− 1), and run the time tests over several zones (Anchorage, Berlin, Sydney, and one with a
half-hour offset).

### 4. `POST /api/trackers/:id/apply-assignment` miscounts its flights

`src/index.ts:1107` reports `meta.changes`, which in D1 also counts the
`flights_assignment_history_au` trigger's `edit_history` row: one flight is reported as 2.
And the `Math.max` of the two UPDATEs undercounts when the aircraft and the pilot are
applied to different flights. The test (`worker-sql.test.mjs:929`) checks only `.ok`.

No other route returns a count from a table with an edit_history trigger: the other
`meta.changes` uses on those tables (`index.ts:1828`, `1990`, `2032`) compare with 0
only, and the poller's counts (`poller.ts:54`, `189`, `454`) are on `points` and
`poll_state`, which have no triggers.

Fix: `UPDATE flights … RETURNING id` and count the union of the ids; test the count with
one flight, and with the aircraft and the pilot on different flights.

### 5. A hung request stalls flight sync for the rest of the page's life

`createApiClient` has no timeout or `AbortSignal`. If a fetch never settles, `pending` in
`flight-store.ts:250` never settles, and every later `refresh()` waits on it through
`queued`. Fix: a per-request timeout in the client (an option, with a default), raising a
typed error; test that a hung fetch rejects and the next refresh runs.

### 6. Core's clock guard is opt-in and the device-time scan skips core

The tests that stub `Date.now()` to throw are per module (duty, alerts, analytics,
elevation, maintenance, settings) and catch only the paths they run.
`test/device-time.test.mjs:18` doesn't scan `packages/core` and misses
`Intl.DateTimeFormat` without a `timeZone`. Core is clean today. Fix: a static scan of
`packages/core/src` for `Date.now(`, `new Date(` other than `new Date(Date.UTC(`, local
getters (`getHours(`, `getDate(`, …), `resolvedOptions().timeZone`, and
`Intl.DateTimeFormat` without `timeZone`; and add `Intl.DateTimeFormat(` to the client scan.

### 7. Nothing checks that the globals the page scripts call exist

`src/client/core-entry.ts` binds about 150 names by hand; the harness's `EXPORTS` and the
page-binding checks sample about 30. A dropped or renamed global is a `ReferenceError` only
in the browser. 16 globals have no caller in any page script: `tzDayEndUnix`, `tzAbbrev`,
`FLIGHT_EDIT_FIELDS`, `FLIGHT_CONFIRM_SECS`, `FLIGHT_MAX_SECS`, `flightTrackedTimes`,
`_DUTY_LIMITS`, `dutyTotals`, `GPS_FRESH_SECS`, `trackedStart`, `pointInPolygon`,
`computeCentroid`, `UNKNOWN_LOCATION`, `elevationColorFor`, `flightCorrectionKey`,
`mergeFlightCorrections` (check the showcase and the harness before removing any).
Fix: a test that evaluates the bundle and checks every name `core-entry.ts` assigns is
defined, plus a test that the page scripts' free identifiers that look like core globals
are all in the bundle; and drop the unused globals.

## Low

### 8. `CLAUDE.md` is out of date

- It says the tokens are defined in `src/shared/theme.ts` (`themeVars()`); the values are
  now in `packages/core/src/tokens.ts`, which `themeVars()` generates from.
- Its request-schema note names only the corrections and duty routes; every route group
  validates now.
- The core conventions (logic goes in `packages/core`, page globals in `core-entry.ts`,
  `tz` then `now` as parameters, a response schema and a worker-sql shape test per route)
  are only in `docs/mobile-app-plan.md`.

### 9. The Worker re-implements `flightCorrectionKey`

`src/index.ts:1738` and `:1824` build `'manual/<id>'` / `'<tracker>/<start>'` inline;
import `flightCorrectionKey` from `@wingbeat/core/flight-store`.

### 10. Flight store robustness

- `load()` (`flight-store.ts:138-148`) repairs only `entries` and
  `entries_last_history_id`. A stored `"null"`, or a blob without `flights` or
  `last_modified_at_by_tracker`, throws on every read. Repair (or reset) every field.
- With async storage (the app's), a `refresh()` that starts before `init()` resolves can be
  overwritten by the older stored copy when the load resolves. Make `refresh()` wait for a
  pending load.
- `mergeFlights` has no guard like the corrections' (`mem.entries_last_history_id ===
  entriesSince`) against another tab's newer copy loaded meanwhile, so an older flight
  record can replace a newer one. Older than the branch.

### 11. The core bundle is inlined in every page

70.6 KB minified (mostly zod, which the web uses only for warnings), in every HTML
response, never cached. Options: serve it as a content-hashed static asset with a long
cache (keeping the nonce on the `<script src>`), or keep zod out of the web bundle while
the client is warn-only.

### 12. Test details

- `assertShape` is copy-pasted into each describe in `test/worker-sql.test.mjs`; one
  helper.
- No test checks that a partial `PUT /api/flights/assignment` (only `pilot_id`) leaves
  `aircraft_tail` alone; the handler's `hasOwnProperty` checks (`index.ts:1388-1389`)
  depend on zod leaving absent keys absent.

## Fix status

Each fix gets tests, `tsc`, `docs:showcase --check`, a before/after browser check if the
UI could change, a plan update, one commit, a push, and a staging deploy if `src/`
changed.

| # | Finding | Status |
|---|---|---|
| 1 | CI doesn't run `npm test` | Won't fix |
| 2 | Silent non-HTTP errors | To do |
| 3 | Day bounds on DST days | Fixed |
| 4 | apply-assignment count | Fixed |
| 5 | Request timeout | To do |
| 6 | Core clock scan | To do |
| 7 | Page-global check | To do |
| 8 | CLAUDE.md drift | To do |
| 9 | `flightCorrectionKey` reuse | Fixed |
| 10 | Flight store robustness | To do |
| 11 | Inlined bundle | To do |
| 12 | Test details | Fixed |
