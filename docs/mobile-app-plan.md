# Plan: Wingbeat mobile app (Expo)

**Status: phase 1 started.** Done: the foundation (`packages/core`, the browser bundle as a
Text module, the nonce test, the theme tokens), step 1, `time` (core time with zone
abbreviations, operator days in the flight list, the device-time scan test with its list of
uses still to remove), step 2, `flight-edits` (with `record-limits`), step 3,
`flight-store` (with the API client and the flights and corrections response schemas), and
step 4, `duty` (with the duty reads' response schemas), step 5, `corrections`,
`edit-history` and `filters` (with the client's writes and the Worker's request
validation for the corrections and duty writes), step 6, `live`, `maintenance` and
`alerts` (with the bootstrap, trackers, aircraft and pilots reads' response schemas), and
step 7, `regions` (merged with `src/geo.ts`), `accounting` and `analytics`.
Next: step 8, `elevation`. All open questions are answered.

## Settled so far

- **Audience:** pilots and dispatchers/owners both. The app opens on the screen that fits the
  signed-in user's role (Decision "The app itself").
- **Order:** web work first (a general refactor of the web app into a typed core, and Web
  Push to replace Pushover), and a beacon probe in parallel. The app is built only if the probe shows passive matching works.
  Support for self-hosted instances waits until a self-hoster asks. See "Why this shape and
  this order" and "Phases".
- **Pricing:** the app is free with instances Dumm Software hosts. That service is billed
  separately, for setup and infrastructure management, not through the app. Using the app with
  a **self-hosted** instance will be a **one-time $10 in-app purchase per user**, with its
  push notifications going through a push relay run by Dumm Software (Decisions 4 and 6).
  Both are built when the first self-hoster asks. Until then the app pairs only with hosted
  instances, and self-hosted instances get Web Push in the dashboard, free.
- **Apple:** ship first from the existing **individual** account to get going quickly. Get a
  D-U-N-S number and convert the account to an organization (Dumm Software LLC) later. The
  existing cud app on the same account moving to the LLC with it is fine.
- **License:** the app is AGPL, in this repo under `apps/mobile`.
- **Beacons:** one per aircraft is acceptable, so passive matching starts with them.
- **Development:** on Linux. EAS Build for native builds, EAS Update for OTA updates, and the
  Mac only when there's no other way (see "Builds without a Mac").

## Goals

1. **Native look.** Use platform UI everywhere it exists (navigation, tabs, sheets, lists,
   menus, pickers, switches) so the app reads as an iOS app on iOS and an Android app on
   Android, not as a web page in a shell.
2. **Replace Pushover**: first with Web Push from the dashboard, which works on every
   instance before the app exists, and then with push from the app.
3. **Reuse the web dashboard's logic**, so a rule (duty limits, flight corrections, time
   zones, formatting) lives in one place and both clients agree.
4. **A platform for passive features**, mainly matching pilots and aircraft to tracker
   flights automatically (phone location, Bluetooth iBeacons in aircraft) in the background,
   without the pilot opening the app.

Non-goals for v1: admin configuration (trackers, users, regions, overlays, tile layers,
global settings). The web stays the admin console, and the app links to it.

## What exists today

Facts about the current code that shape the plan:

- **Client logic is JavaScript inside TypeScript template strings.** `flightStoreScript()`,
  `pilotDutyRenderScript()`, `flightEditsScript()`, `tzCalendarScript()` and the dashboard /
  analytics `scripts/*.ts` return source text that the pages inline. `tsc` can't see into it,
  and nothing outside a browser page can `import` it. `test/harness.mjs` runs the strings in
  `node:vm` for exactly this reason. **This is the main obstacle to sharing code with a React
  Native app, and the main thing this plan changes on the web side.**
- **Server-side shared code is already real TypeScript**: `src/shared/format.ts` and
  `src/shared/record-limits.ts`, plus `src/geo.ts`, `src/segmentation.ts` and
  `src/notifications.ts` (`eventTitle` / `eventMessage`). These can be shared as they are.
- **Dashboard-only logic depends on page globals.** `computeAlerts()` lives in
  `src/dashboard/scripts/alerts.ts` and reads `flightStore`, `aircraftList`, `pilotList` and
  `trackerList` from the page, plus the maintenance helpers from
  `sharedMaintenanceHelperScripts()` (`aircraft-info.ts`). Moving it to core means passing all
  of those in.
- **Auth is a cookie session.** The middleware in `src/index.ts` reads only the session
  cookie (and the `POLLER_SECRET` bearer for `/api/admin/*`), and **redirects** any request
  without a valid session to `/login`, API requests included. Session tokens are stored
  hashed (`0003_session_token_hash.sql`). A session expires after 90 days without use
  (`SESSION_IDLE_SECS`), and use refreshes `last_seen_at` at most hourly. There is
  already a device-link flow (`POST /api/me/device-link`, `/join/:token`, 15-minute TTL) and a
  per-session device list in Settings. Both carry over to the app well.
- **The client scripts call the API with bare `fetch`** (`flight-store.ts`, `pilot-duty.ts`)
  and parse the JSON without checking its shape.
- **Tenants are chosen by hostname** (`CUSTOMER_ROUTING`). An app that serves more than one
  operator must store which instance each account belongs to.
- **`GET /api/bootstrap`** already returns `me`, trackers, aircraft, pilots and overlays in
  one call, which is what an app home screen needs.
- **Notifications** go to admin-managed targets (`webhooks` table, `webhook` or `pushover`
  type), with per-target event subscriptions. Message text is built once, in
  `eventTitle`/`eventMessage`.
- **Maps:** Leaflet with raster XYZ basemaps (Carto via the `/api/tiles` key proxy,
  OpenTopoMap, USGS topo and imagery, Esri), admin-defined raster overlays, and the
  elevation tool already reading Mapterhorn's `planet.pmtiles` DEM with pmtiles.js.
- **Pilots aren't linked to users.** `pilots` and `users` are separate tables with no
  foreign key between them. Passive matching needs one.
- **Duty-log PDF export** compiles Typst in WASM in the browser. That won't run in the
  app's JS engine (Hermes) as is.

## Why this shape and this order

**Sharing code with the web is the right call, and cheap at first.** The server doesn't
send corrected flights or duty totals. Clients apply corrections (`applyFlightEdits()`) and
calculate duty themselves. So an app has three choices for that logic:

- reimplement it, and run two copies of the §135.267 rules that can drift apart;
- have the server compute it, which still means extracting it (the Worker can't import
  template-string code either) while the web keeps its own copy;
- share it.

Sharing is the only one that keeps a single copy.

**Phase 1 is a refactor of the web app in its own right, not app preparation.** Every piece
of non-UI logic in the client script strings moves to typed, tested core modules. That
covers time, flights and corrections, duty, live status, maintenance, alerts, regions,
accounting and analytics (see "What goes in `@wingbeat/core`"). Every API call the web makes
gets a schema checked at both ends, and every time is shown in the operator's timezone. The
dashboard gains resilience from this whether or not the app ships: type checking, normal
imports, tests for compliance logic that has none today (maintenance, alerts), one region
implementation instead of two, and no device-timezone bugs. The app then gets most of
what it needs from core for free. `duty` is the hardest single move. It returns
ready-made warning text that four consumers read (the HTML log, the Typst PDF, the dashboard
alert and the showcase). It reads the clock and the timezone from the page. And it's the
compliance logic, covered by about 100 tests. So it moves after `time` has settled the
timezone handling and after `flight-store`, with its output shape unchanged. It's done in phase 1 rather than
when the app needs it because its risk is the same whenever it's done, it gains the most
from the move, and in phase 1 it can sit on staging with no app release waiting on it.

**The expensive parts are elsewhere,** and the order is built around them:

- **Passive matching** is the only goal that needs a native app. Push and a mobile view can
  be done on the web, and the native look is nice to have. It's also the biggest piece: a
  Swift and Kotlin module, the Mac, "Always" location review, and matching rules that depend
  on how reliably two OSes report beacons. So it's **proven first, cheaply** (the phase 3
  probe), and the app is built only if it passes.
- **Pushover can be replaced without the app.** Web Push from the dashboard needs no store,
  relay or publisher credentials. Each instance signs with its own VAPID keys, so
  self-hosters get it free too. It lacks iOS Time Sensitive alerts and needs the dashboard
  on the Home Screen, but it gets operators off Pushover months sooner, and the per-user
  subscriptions it introduces are the ones the app uses later.
- **Self-hosted support** (the relay's instance registry, entitlements and the in-app
  purchase) has no user yet, so it waits for one. Building the relay up front was meant to
  avoid re-registering every phone later, but with OTA updates that re-registration takes no
  user action (Decision 4, step 3). Until then hosted instances call Expo directly.

## Decision 1: accounts (Apple, Expo, Google)

The cud-app setup today: Expo owner `wdumm` (a personal Expo account), EAS project
`cud-nutrition`, App Store Connect Apple ID `apps@dummthings.dev`, Apple team
`W4MAPA8GZ7`, bundle ID `com.cudnutrition.app`. Its `eas.json` has Android submit settings
but no Play account exists yet.

### Apple: ship from the individual account now, convert it later

Don't open a second Apple Developer account. Apple charges $99/yr per membership, moving
apps between teams later is a manual "app transfer" per app, and one team can publish any
number of apps.

**Now:** team `W4MAPA8GZ7` is an individual enrollment, so the App Store shows your personal
legal name as the seller. That's fine for TestFlight and a first release. Everything that
matters later survives the conversion: the bundle ID, the App Store record, ratings,
TestFlight testers, the APNs key and the EAS credentials.

**Later (start the D-U-N-S request now, since it can take weeks):** ask Apple Developer
Support to **convert the membership from individual to organization**. The team ID, apps,
certificates and App Store Connect records stay, and the seller becomes the LLC for every
app on the team, **cud included**. You need:

- the **D-U-N-S number** for the LLC (free; Apple's lookup tool is faster than going to D&B
  directly);
- the LLC's legal name exactly as D&B lists it;
- a public website on a domain associated with the LLC (dummthings.dev);
- an organization email on that domain (`apps@dummthings.dev` works).

**Agreements, Tax and Banking:** the in-app purchase (Decision 6) needs the Paid Apps
agreement, with tax forms and a bank account. On the individual account those are yours
personally, and after the conversion they have to be redone for the LLC (EIN, LLC bank
account). The self-hosted purchase is only needed once someone self-hosts, so **plan to
launch it after the conversion** and set up the Paid Apps agreement once, as the LLC. Until
then the app is free and only needs the free-apps agreement.

**The free app with your hosted service is allowed.** The app sells nothing for it: the
hosted service is a setup-and-infrastructure contract signed outside the app, and accounts are
invite-only. Keep the app from linking to or mentioning that pricing (App Review guideline
3.1.1 / 3.1.3). The app may show "Ask your operator for an invite".

**Distribution:** a public listing, so self-hosters can find the app and buy the self-hosted
unlock. (Unlisted App Distribution, reachable only by link, would fit the hosted-only case,
but it doesn't fit selling to self-hosters.)

### Expo: create an organization and keep your personal account as its owner

Expo organizations are free. Create one (e.g. `dummsoftware`), make `wdumm` its owner, and
create the Wingbeat EAS project under the org. Optionally transfer `cud-nutrition` to the org
too (project settings → Transfer). A separate Expo login for the LLC isn't needed. Billing
(EAS Build/Update plan) attaches to the account that owns the projects, so if you pay for a
plan, it moves to the org.

The EAS credentials (distribution certificate, APNs key, provisioning profiles) belong to the
Apple team, so the Wingbeat project uses the same team as cud.

### Google Play: wait for the D-U-N-S number, then create an organization account

No account exists yet. Create it as an **organization** account for Dumm Software LLC
($25 one-time fee; uses the same D-U-N-S number), once the number arrives. Until then, put
Android testers on **EAS internal distribution** (an APK download link from EAS, no Play
account needed), so Android development isn't blocked. iOS ships to the store first. An
organization account has two concrete advantages over a personal one:

- **No mandatory closed test.** Personal accounts created since late 2023 must run a closed
  test with at least 12 testers for 14 days before they can publish to production.
  Organization accounts are exempt.
- **The listing shows the LLC as the developer**, and the account covers Android's developer
  verification requirement for the LLC.

Background location (Decision 5) needs a **Permissions declaration** in Play Console with a
video of the feature. Plan time for that review.

### Identifiers (permanent; pick once)

- iOS bundle ID / Android package: **`dev.dummthings.wingbeat`** (decided; dummthings.dev is
  the LLC's domain). It can't be changed after the first store upload.
- URL scheme: `wingbeat://` (for pairing links).
- App name on the stores: "Wingbeat" (check that it's available on both).

### Builds without a Mac

Development happens on Linux. The loop:

- **JS changes (most of the work):** build an iOS **development client** on EAS once,
  install it on an iPhone, and point it at Metro running on Linux (LAN, or `--tunnel`).
  Android: a local dev build on an emulator or a USB device. No rebuild until a native
  dependency, a config plugin or `app.json` native config changes.
- **Native changes:** a new EAS dev build. Expo's free plan has a monthly build quota with
  queueing. Batch native changes, and move to a paid plan if the queue gets in the way.
- **Releases:** EAS Build (production profile) → `eas submit` to TestFlight / Play.
- **Fixes after release:** **EAS Update** channels per build profile (development,
  preview, production), with `runtimeVersion` set to the **`fingerprint`** policy, so an
  update never reaches a binary with different native code. (cud uses `appVersion`, which
  relies on remembering to bump the version after every native change. `fingerprint` hashes
  the native project instead, so it can't be forgotten.) See "Versions and compatibility" for
  how updates are kept OTA-compatible.

**Where the Mac is still needed:** writing and debugging the Swift half of the presence
module (Decision 5). There's no iOS simulator or Xcode debugger on Linux, and the background
beacon/relaunch behavior can only be tested on a real device. Use the Mac for that module and
keep it small. Everything else in the app is JS, plus Expo-maintained modules.

## Decision 2: code sharing (keep the web stack, extract a typed core)

### Options

| | What | Verdict |
|---|---|---|
| A | Rewrite the web dashboard in Expo Web / React (like cud-app) so web and app are one codebase | **No.** The dashboard works well. react-native-web is weak for a dense desktop map dashboard, the map layer would have to be rewritten anyway, and it's a big rewrite for what is mostly UI sharing, and UI is the one thing the "native look" goal says not to share. |
| B | Keep the server-rendered vanilla-JS dashboard. Move its **logic** out of template strings into a typed `@wingbeat/core` package that the web bundles and the app imports | **Yes.** |
| C | Wrap the dashboard in a WebView | Only as an escape hatch for admin screens. It fails goal 1. |

### What goes in `@wingbeat/core`

Phase 1 is a **general refactor of the web app**, not limited to what the app needs: **every
piece of non-UI logic in the client script strings moves to core**, gets types and tests,
and is shared by whichever clients need it (dashboard, analytics, showcase, Worker, app).
What stays a script string is UI: rendering, DOM wiring, Leaflet, forms and the settings
modal.

Core is pure TypeScript with no DOM, no Leaflet, no `localStorage` and no `window` globals.
Its dependencies are passed in: the clock (`now`), the operator's timezone, storage, and
the API client.

**Foundation:**

- `api/`: the API contract as **schemas** (see "The API contract" below), and a small
  `fetch`-based client built from them that takes `{ baseUrl, auth }`. The web passes
  "same-origin cookie" and the app passes a bearer token. In phase 1 it replaces the web's
  bare `fetch` calls (about 70 across `src/shared`, `src/dashboard` and `src/analytics`) and
  `apiWrite()` (`form-modal.ts`), one route group at a time.
- `format`, `geo`, `record-limits`: move from `src/` and `src/shared/` as they are.
  `format` also takes the browser-side helpers in `dashboard/scripts/helpers.ts`
  (`bearingBetween`, `cardinalDir`, `relTime`).
- `time`: the tz-calendar logic now in `tzCalendarScript()`, plus **the one way to show a
  time or a date**, in the operator's timezone and with its abbreviation (see "Times and
  the operator's timezone"). It also absorbs `pilotDutyScript()`'s `fmtLocalTime`, which
  `format.ts`'s `formatLocalDateTime` comment notes is a duplicate.

**Flights and corrections:**

- `flight-edits`: `applyFlightEdits()`, `flightFormTimes()`, `flightTrackedTimes()`.
- `flight-store`: the sync and merge engine (cursors, corrections deltas, effective-flight
  cache), as a `createFlightStore({ storage, client })` factory instead of today's
  singleton, so the app can keep one store per account. The web passes `localStorage`, and
  the app passes `expo-sqlite/kv-store`'s async API (see "Data and sync").
  - The storage interface accepts **sync or async** `getItem`/`setItem`. With sync storage
    the store loads synchronously at creation, as `_fsLoad()` does today. The pages use
    `flightStore` right after the script runs, and an async-only load would change dashboard
    and analytics startup order.
  - The web keeps the **`ft_flights_v2` key and its blob shape exactly**. A changed format
    would make every browser silently download its full history again, or merge into an old
    blob wrongly. If the format ever has to change, bump the key on purpose.
- `corrections`: the request side of the flight editor (`flight-editor.ts`). It builds the
  request for an assignment change or flag change, and `_feFlightRef()`: a correction to a
  tracked flight names it by its *original* start time, not its corrected one. It also holds
  the form's validation rules (a manual flight's arrival must follow its departure; the
  maximum flight length) as a function from field values to an error or a request body.
- `edit-history`: `editConflictText()` and `_editAssignmentChanged()`.
- `filters`: `filterStore.matchesFlight()` and the filter-state normalization in
  `filterStore.load()`. Persisting the state stays on the web side.

**Duty:**

- `duty`: the computational half of `pilotDutyRenderScript()`: `_DUTY_LIMITS`, the dated
  lookups (`dutyDefaultOn`, `dutyEntryOn`, `dutyMethodOn`), the calendar and rest checks,
  `computeDutyData()`, `dutyTotals()`, `dutyDayText()`, `dutySaveConfirmText()`,
  `dutyRemarksText()`, `dutyExportPresets()` and `dutyRangeLabel()`. The HTML rendering, the
  Typst source builder and PDF export, and the page controller stay on the web side.
  - **Moved, not restructured.** The output shape and the warning strings stay exactly as
    they are, so `renderDutyLog()`, `_buildTypstSource()`, `alerts.ts` and the showcase don't
    change. Turning the warnings into structured codes, if it's ever wanted, is a separate
    change.
  - What it reads from the page today becomes parameters: the clock (`Date.now()` in
    `computeDutyData()`, passed in as `now`), the timezone (`_DUTY_TZ` from
    `APP_SETTINGS`, passed in the same way `time` takes it), and `flightRemarks()` (imported
    from core's `flight-edits`).

**Live status, maintenance and alerts:**

- `live`: the rules behind the Live view and status cards. That's the live position from a
  tracker's newest raw point (`buildLiveDataByTracker()`), "in progress" (the tracker's
  latest flight, at or above `FLIGHT_THRESHOLD_KMH`; `_isFlightInProgress()`), GPS freshness
  (today a bare `240` in `aircraft-cards.ts`, which becomes a named constant), and the
  adaptive poll schedule (`adaptiveLivePoll()`'s next expected fix). Also the
  same-tracked-flight test in `refresh.ts` (`_sameTrackedFlight()`).
- `maintenance`: `sharedMaintenanceHelperScripts()` (`aircraft-info.ts`): flight hours,
  estimated Hobbs and tach (`_estimatedMeter`), calendar due dates and
  `_maintenanceStatus()`. This is maintenance compliance logic with no tests today. It gets
  them as it moves.
- `alerts`: `computeAlerts()` and `_sortAlerts()`, with the effective flights, aircraft,
  pilot and tracker lists and `now` passed in instead of read from page globals. The alert
  rows stay HTML on the web side.

**Analytics and geometry:**

- `regions`: `haversineKm`, `pointInPolygon`, `computeCentroid`, `findRegion` and
  `findHomeBase` from `analytics/scripts/region.ts`, **merged with `src/geo.ts`**. The Worker
  (`geo.ts`, `geocoding.ts`, `segmentation.ts`) and the analytics page then use one
  implementation, so a flight's region can't differ between server and client.
- `accounting`: `computeWeightedEndpoints`, `computeRegionHours`, `computeRegionStops` and
  `computeMonthlyAccounting` (`accounting.ts`).
- `analytics`: the data half of the stream graph (`sgResolveInterval`, `sgGenerateBuckets`,
  `sgComputeData`) and of the map layers (`interpolateRoutePoints`, the endpoint weighting
  in `buildEndpointHeatLayer`). The SVG paths and Leaflet layers stay on the web side.
- `elevation` (lowest priority): the pure parts of `elevation.ts`, which are the tile and
  pixel math, Terrarium decoding and the color ramp.

**Shared with the app later, not used by the web:**

- `notifications`: `eventTitle` / `eventMessage`, so the in-app history and the push text
  match.
- `basemaps`: the basemap and overlay catalog (Decision 3).

**Not moved:** the regions editor's topology code (`regions-editor.ts`), which is admin-only
and tangled with its Leaflet editing; the settings modal; and the render chunks the
showcase calls (`aircraft-cards.ts`, `track-render.ts`, the flight list, …), which are UI.
Those render chunks call core for anything they compute.

### How the web consumes it (step by step)

1. Make the repo npm workspaces, with the Worker at the root and **only `packages/core`** as
   a workspace. `apps/mobile` is **not** a root workspace. It has its own `package.json` and
   lockfile and depends on core by path (`"@wingbeat/core": "file:../../packages/core"`, with
   Metro's `watchFolders` pointed at `packages/core`). A root `npm ci` installs every
   workspace, so if the app were one, Workers Builds, the hosting deploy and the nix shell
   would all download Expo and React Native, and a broken RN dependency could block a Worker
   deploy. Decide this before `apps/mobile` exists.
2. Add a build step: esbuild bundles a small browser entry (`src/client/core-entry.ts`) to
   an IIFE that assigns the core functions to the same global names the inline scripts use
   now (`applyFlightEdits`, `flightStore`, …). The Worker imports it as a **Wrangler Text
   module** and inlines it in a `<script nonce>`, like the script strings today.
   - Not a static asset loaded with `<script src>`. The CSP's `script-src` has no `'self'`
     (`buildCsp()` in `src/index.ts`), and its `'strict-dynamic'` makes CSP3 browsers ignore
     host allowlists anyway, so the tag would need the nonce too. More importantly, a missing
     Text module fails `wrangler deploy` at build time, while a missing static asset deploys
     fine and 404s in every browser.
   - Add a case to `test/worker-security-headers.test.mjs` that the dashboard and analytics
     pages contain the core bundle in a script carrying the response's nonce.
   - The bundle has to exist before Wrangler runs, so make the esbuild step Wrangler's
     `[build] command` in `wrangler.example.toml`, **and** in the hosting repo's generated
     `wrangler.toml` (`writeWranglerToml` in wingbeat-hosting), in the same change. Then
     `wrangler dev`, `wrangler deploy`, Workers Builds, `deploy.mjs` and the manual
     `git archive` deploy all build it the same way. `docs:showcase` and `test/harness.mjs`
     run the same esbuild step themselves.
3. Move **one script string at a time, one deploy each**: delete the string's logic, make the
   page call the global from the bundle, and keep its tests passing. The tests then import the
   TypeScript directly. Keep one `node:vm` smoke test of the shipped bundle so the test of
   what the browser actually runs isn't lost. Each move goes to staging first (see "Rollout
   and risk to the web dashboard") before prod.
4. Move in this order, one deploy per step:
   1. `time`, with the operator-timezone display and the device-time scan test (see "Times
      and the operator's timezone");
   2. `flight-edits`;
   3. `flight-store`, which switches from bare `fetch` to the core API client;
   4. `duty`;
   5. `corrections`, `edit-history` and `filters`;
   6. `live`, `maintenance` and `alerts`;
   7. `regions` (merged with `src/geo.ts`, the one step that also changes the Worker),
      `accounting` and `analytics`;
   8. `elevation`, if it's still worth it.

   Each step brings its device-timezone fixes from the table in "Times and the operator's
   timezone", and tests for code that had none (`maintenance`, `alerts`, `live`, `filters`,
   `regions`, `accounting`, `analytics`). The API schemas and client move route group by
   route group alongside (see "The API contract"). The render chunks the showcase calls stay
   where they are, and `docs:showcase --check` runs on every step.

### Phase 1 progress and conventions

Done on the `core-foundation` branch (deployed to staging 2026-11-02): the foundation,
step 1 (`time`) and step 2 (`flight-edits`); step 3 (`flight-store`), step 4 (`duty`)
step 5 (`corrections`, `edit-history`, `filters`), step 6 (`live`, `maintenance`,
`alerts`) and step 7 (`regions`, `accounting`, `analytics`) are on the branch and on
staging.
How it's built, for the steps that follow:

- **Core modules** live in `packages/core/src/<name>.ts`, each listed in `exports` in
  `packages/core/package.json`. They take what they used to read from the page as
  parameters (`time` takes `tz` first).
- **Browser glue** is `src/client/core-entry.ts`: it `Object.assign`s each function to
  `globalThis` under its old global name, binding page state (`window.APP_SETTINGS.timezone`)
  at call time. A moved script string is deleted, and its callers stay the same.
- **The bundle**: `scripts/build-core.mjs` writes `build/core-bundle.txt` (gitignored).
  `src/shared/core-bundle.ts` imports it (`coreBundleScript(nonce)` for the pages,
  `coreBundle` for the showcase). Tests, `docs:showcase` and the harness build it in
  memory with `coreBundlePlugin()`, not from disk.
- **Tests**: core modules are tested directly through `test/core.mjs` (`importCore('time')`);
  `test/harness.mjs` runs the shipped bundle before the script strings, so the existing
  engine tests double as the bundle's smoke test. Add new globals to its `EXPORTS`.
- **Device time**: `test/device-time.test.mjs` has an exact per-file `KNOWN` count of the
  remaining `new Date(` / `toLocaleDateString` / `toLocaleTimeString` uses. Each step lowers
  or removes its files' entries.
- **Display**: `fmtTzTime()` ("14:05 AKDT", 24-hour) for times in lists, cards, popups and
  alerts; `tzLongDateLabel()` for day headings. The flight list now groups by operator day.
- **What stays a script string** is the HTML built from core's results: `flight-edits`
  kept the chips, `flightEditedMark()` and `flightRemarksHtml()` in
  `src/shared/flight-edits.ts`, and core's `flightEntrySummary()`, `flightOriginalText()`
  and `flightFormTimes()` take `tz` like `time`. Constants the scripts read
  (`FLIGHT_EDIT_FIELD_NAMES`, `FLIGHT_MAX_SECS`, …) are globals from the bundle too.
- **Modules the Worker shares** move whole and are imported as `@wingbeat/core/<name>`
  from `src/` (`record-limits` moved with `flight-edits`, which needs `MAX_FLIGHT_SECS`).
- **API client and schemas** (from step 3): `packages/core/src/api/client.ts`
  (`createApiClient({ baseUrl, auth, mismatch })`, `auth` either the same-origin cookie or a
  bearer token; `mismatch` `'strict'` throws `ApiShapeError`, `'warn'` logs
  `[wingbeat api] unexpected response` and returns the data anyway; a non-2xx is
  `ApiHttpError`). Each route group's response schemas go in `packages/core/src/api/<group>.ts`
  (`zod/mini`, unknown keys allowed). The web's client in `core-entry.ts` is warn-only. Each
  schema gets a response-shape test in `test/worker-sql.test.mjs` in the same change.
- **Stores are factories**: `createFlightStore({ storage, client, flightThresholdKmh,
  watchExternalChanges })` takes sync or async storage; `core-entry.ts` creates the page's
  `flightStore` from `localStorage` and the `storage` event. `snapshot()` returns its state
  for tests.
- **Dependencies**: zod is in `dependencies` of both the root (the Worker's tests and, later,
  its validators) and `packages/core`. It made the browser bundle 58.8 KB unminified (9.8 KB
  before), so `build-core.mjs` now minifies it: 26.8 KB, inlined in each page (39.0 KB with
  `duty`).
- **Writes** (from step 5) go through the client's `write(method, path, body, schema)`,
  which replaced `apiWrite()`: a refusal is an `ApiHttpError` with the server's `error` as
  its message, and a 409's `conflict` on it, which `runFormAction()` and
  `showEditConflict()` already read. Each write is a small function in `api/<group>.ts`
  (`saveFlightCorrection`, `putDutyDays`, …), bound as a page global of the same name, with
  its response schema there too. The bodies are core's (`corrections.ts`'s
  `flightSaveRequest()`, `flightFlagsRequest()`, …) or the forms' own (the duty forms).
- **Request validation** (from step 5): the Worker's write routes take
  `valid('json' | 'query', schema)` (`src/index.ts`, "Request validation":
  `@hono/zod-validator` with `z.safeParseAsync`, since `zod/mini` schemas have no methods,
  and zod's English messages). A mismatch is a 400 `{ error: '<field>: <message>' }`; a body
  that isn't JSON is a 400 `{ error }` too (`app.onError`). Request schemas are
  `z.object` (unknown keys stripped) with each field's type only, and the handlers keep
  their own checks of what values mean, with their messages. They live in
  `api/<group>-requests.ts` (shared pieces in `api/requests.ts`), not in `api/<group>.ts`:
  zod's `.check()` calls keep them from being tree-shaken, and the browser only needs their
  types. Covered so far: the corrections and duty writes. The reads moved so far take only
  `tracker`, `since` and `pilot`, which their handlers already parse (a bad `since` reads
  as 0, a bad `pilot` is a 400), and `active` (aircraft and pilots: `1` or anything
  else), so a query schema would change nothing a client sees.
- **Worker tests of what the web sends**: `test/worker-sql.test.mjs` ("the requests the web
  sends") sends each write through core's own client (strict, over `adminFetch` from
  `test/worker.mjs`) with the bodies core or the forms build, so a request schema can't
  refuse what the pages send and every write's response is checked against its schema.
- **Step 5's browser check** drove the flight form (a manual flight's edit, a tracked
  flight's correction with its pilot change, a flight added across midnight, the form's own
  validation, an edit conflict, Revert to tracker), the bulk actions, the duty writes, the
  "Last changed by …" line and the filter store on a local Worker with the browser in
  Europe/Berlin; all as before. The bundle is 45.7 KB minified (39.0 KB at step 4).
- **Clock-reading logic takes `now`** (Unix seconds) after `tz`: `computeDutyData(tz, now,
  …)`, `currentDutyMonth(tz, now)`. `core-entry.ts` binds both, so the page globals keep
  their old signatures; `test/core-duty.test.mjs` checks core never reads `Date.now()`.
- **Moved logic keeps its spec tests where they were.** The duty suites (duty-limits,
  rest-days, totals, dated-defaults, dst, day-form, duty-export) still run through the
  shipped bundle's globals, unchanged; the core test (`core-duty.test.mjs`) covers what's new:
  the parameters, and the same results as the page's globals. Step 4 checked the staging
  duty log (rendered HTML, computed model, PDF Typst source for every month, a quarter and
  12 months) and the alerts against step 3's at a pinned clock: identical (staging had
  no alerts at the time, so those matched as empty).
- **Page reads** go through small core functions over the page's client (`getDutyLog`,
  `getDutyMethods` in `api/duty.ts`), bound as globals (`fetchDutyLog`,
  `fetchDutyMethods`); a non-2xx throws `ApiHttpError`, which the callers already catch.
- **Step 6** (`live`, `maintenance`, `alerts`): the flight threshold is bound in
  `core-entry.ts` (`SPEED_THRESHOLD_KMH`), like `tz` and `now`, so the page's
  `FLIGHT_THRESHOLD_KMH` is gone: `isInFlight(d)`, `isFlightInProgress()`,
  `nextLivePoll()` and `isGpsFresh()` (`GPS_FRESH_SECS`, the old bare `240`) are globals.
  Where a page function reads page state (`trackerList`, `aircraftList`, …) it stays as a
  one-line wrapper with its old name over a differently named global
  (`buildLiveDataByTracker()` → `trackerLiveData()`, `computeAlerts()` →
  `computeAlertsFor({ flights, aircraft, pilots, trackers })`), since a page function may
  not shadow the global it calls. Globals the showcase calls keep their old names
  (`_estimatedMeter`, `_maintenanceStatus`, `_flightHours`); `sharedMaintenanceHelperScripts()`
  is gone. The device-time uses in `aircraft-info.ts`, `alerts.ts`, `hover.ts` and
  `point-picker.ts` are gone: a calendar item's due date is the end of an operator month,
  the Hobbs/tach "Reading taken at" input and the schedule's date inputs are read and
  filled in the operator's timezone (`tzLocalToEpoch`, `unixToTzDateStr`), the unassigned
  flight alert says "23:30 AKST", and track points show `fmtTzPointTime()`
  ("Jul 15, 22:05:09 AKDT").
- **List reads** (step 6): `fetchBootstrap()`, `fetchTrackers()`, `fetchAircraft()` and
  `fetchPilots()` (`api/bootstrap.ts`, `api/trackers.ts`, `api/aircraft.ts`,
  `api/pilots.ts`; `active`/`deleted` are SQLite's 0/1). The pages read the three lists
  with `Promise.allSettled`, so one that fails keeps its old value, as before. Their
  writes (in the settings modal) move with the settings route group.
- **Step 6's browser check** compared alerts, every maintenance item's status, the
  aircraft info sections' HTML, each tracker's live data, the in-progress flights, the
  status cards and the next poll's delay before and after, on a local Worker seeded with
  maintenance schedules, unassigned flights, a pilot near a duty limit and a flight in
  progress, at a pinned clock: identical in an Anchorage browser but for the new time and
  date formats, and a Berlin browser now gets the same results (before, an annual done on
  the evening of Oct 31 AKDT was due a month later in Berlin, and an unassigned flight at
  23:30 AKST was listed on the next day). It also saved a Hobbs reading and schedule dates
  from a Berlin browser: stored as operator time. Staging had no alerts or maintenance
  items, so they matched as empty. The bundle is 55.6 KB minified (45.7 KB at step 5).
- **Step 7** (`regions`, `accounting`, `analytics`): `src/geo.ts` is gone; the Worker
  (`segmentation.ts`, `geocoding.ts`, `poller.ts`, `index.ts`), the showcase's sample data
  and `core-entry.ts` import `haversineKm`, `haversineMiles` and `SPEED_THRESHOLD_KMH`
  from `@wingbeat/core/regions`, which also has the page's region logic. The regions are a
  parameter (`Regions`, the `/api/regions` GeoJSON or null), so the analytics page keeps
  `REGIONS` and `loadRegions()` (the regions route group moves with settings) and wraps
  the core globals it needs under their old names: `homeBaseNames()` →
  `homeBaseNamesIn(REGIONS)`, `computeRegionHours()`/`computeRegionStops()`/
  `computeMonthlyAccounting()` → `…In(REGIONS, flights)`, `sgComputeData()` →
  `sgComputeDataIn(REGIONS, …)`, and `buildEndpointHeatLayer()` takes its points from
  `endpointHeatPointsIn(REGIONS, flights, mode)`. `findRegion()`, `findHomeBase()` and
  `computeWeightedEndpoints()` had no callers left on the page, so they're core-only.
  `sgResolveInterval`, `sgGenerateBuckets` (tz bound), `interpolateRoutePoints`,
  `haversineKm`, `pointInPolygon`, `computeCentroid`, `isHomeBaseRegion`,
  `regionDisplayName`, `UNKNOWN_LOCATION` and `OTHER_REGION` are globals under their own
  names. The stream graph's buckets are operator days, weeks (from Monday) and months, with
  fixed English labels ("Oct 26" for a month, "Nov 2" for a day or week), and the
  accounting table's months are `tzLongMonthLabel()` ("October 2026"); `streamgraph.ts`
  and `accounting.ts` have no device-time uses left. Tests: `core-regions`,
  `core-accounting` and `core-analytics` (shared regions in `test/regions-fixture.mjs`).
- **Step 7's browser check** snapshotted the analytics page's region lookups, region hours
  and stops, monthly accounting, accounting table and totals HTML, the stream graph's
  buckets, data and SVG for every interval and mode, the route points and the endpoint
  heat, on the page's flights and on 400 synthetic flights over the sample regions, before
  and after, locally (Anchorage and Berlin browsers) and on staging: identical but for the
  stream graph, whose buckets now start at the operator's midnight (before: UTC, so an
  evening flight counted toward the next day) with each region's total over all buckets
  unchanged. The bundle is 59.4 KB minified (55.6 KB at step 6).
- **Hosting**: the `[build]` command is also in `wingbeat-hosting`'s
  `wrangler.template.toml` (skipped for tags without `scripts/build-core.mjs`), as a local
  commit not yet pushed. It must be pushed before or with the first tag that has the bundle.

### Times and the operator's timezone

**The rule: every time and date is shown in the operator's timezone (the tenant's
`timezone` setting), whatever the viewer's device is set to, and says which zone it is.**

**Storage stays as it is.** It's already right:

- **Instants are Unix epoch seconds, so UTC**: `points.garmin_time`, `flights.start_time` /
  `end_time`, `flight_corrections`, `sessions`, `edit_history`, the maintenance
  `*_recorded_at`, and the rest. A timezone change, or daylight saving, changes nothing
  stored.
- **Duty records are local on purpose**: `duty_days.date` and its `duty_start` /
  `duty_end` (`HH:MM`), `pilot_default_duty` and `duty_method_history.effective_date` are
  dates and wall-clock times in the tenant timezone. A duty day is a local calendar day
  under §135.267, and a default duty of 08:00–17:00 has to stay 08:00 local across a DST
  change. A stored UTC instant would move it by an hour twice a year. DST itself is handled
  by the IANA zone (e.g. `America/Anchorage` gives AKDT in summer and AKST in winter), so it
  needs no change in stored data either.
- **The one risk is changing the `timezone` setting** once there are duty records. Their
  dates and times are then read in the new zone (an 08:00 duty start becomes 08:00 in the
  new zone), and flights near midnight move to a different local day. So Settings warns
  before saving a new timezone when any duty records exist, and says what will change. If
  an operator ever really moves, make the setting effective-dated like
  `duty_method_history`. Until then the warning is enough.

**Display:**

- **Times carry the zone abbreviation**, per instant: "14:05 AKDT" in July and "14:05 AKST"
  in January (`Intl.DateTimeFormat` with `timeZone` and `timeZoneName: 'short'`). Zones
  without a common abbreviation in the formatting locale show an offset ("GMT+2") instead.
- **Tables say it once**, in the header or caption, instead of in every cell. Examples are
  the duty log and its PDF ("Times in AKDT", or "AKST/AKDT" for a month that spans a DST
  change), the flight editor's list and the accounting table. Lists, cards, popups,
  tooltips and alerts put it after each time.
- **Days are operator days.** Flight-list grouping, date labels, the date filter, alerts,
  maintenance calendar due dates, analytics buckets and accounting months all use the
  operator's calendar. Date and time **inputs** are read in the operator's timezone too
  (`tzLocalToEpoch`), not the browser's.
- All of it goes through core's `time`. Nothing else formats or splits a date.

**What uses the device's timezone today** (fixed in phase 1, as each piece moves):

| Where | What | Effect |
|---|---|---|
| `dashboard/scripts/helpers.ts` (`dayKey`, `fmtDay`, `fmtTime`) | Flight-list day grouping and times | A flight near midnight is listed under one day and filtered out by the same day in the date filter, which uses operator days |
| `dashboard/scripts/alerts.ts` | Unassigned-flight date and time | Device time, no zone shown |
| `dashboard/scripts/hover.ts`, `point-picker.ts` | Track point time tooltips | Device time |
| `shared/aircraft-info.ts` (`_calendarDueDate`, `_acFormatDate`, `_acLocalDatetimeNow`, `_acDateToTs`, `_acTsToDateInput`) | Maintenance due dates and the Hobbs/tach "recorded at" inputs | **A recorded-at time typed in is stored as the device's local time**, and a calendar inspection's due date depends on who's looking |
| `analytics/scripts/streamgraph.ts` (`sgGenerateBuckets`) | Day, week and month buckets | UTC, so an evening flight counts toward the next day |
| `analytics/scripts/accounting.ts` (`monthLabel`) | Month label | Device locale only. The bucketing already uses operator months |
| `shared/settings.ts` | Device last seen, invite expiry, webhook last triggered, feed test's latest point | Device time, no zone shown |

**Keep it fixed:** a test (in `npm test`, `test/device-time.test.mjs`) scans the client
script sources outside core and fails if it finds `new Date(`, `toLocaleDateString` or
`toLocaleTimeString` beyond its list of known uses, which shrinks to nothing by the end of
phase 1. Client code
gets the time from `Date.now()` and formats it only through core's `time`, so a new
device-time display can't slip back in. Number formatting (`toLocaleString()` on a count)
is still allowed.

### The API contract: schemas in core

The contract is **schema-first**: each route **the web or the app calls** has request and
response schemas in `@wingbeat/core/api`, written with Zod (`zod/mini` in the browser
bundle, to keep it small). Phase 1 covers every route the web pages call. Phase 4 adds the
app-only ones (pairing, push devices, presence). Everything else is derived from them:

- **Types**: `z.infer` gives the TypeScript types to the Worker, the web and the app, so
  nothing is written twice.
- **The Worker** validates request bodies and queries with the same schemas
  (`@hono/zod-validator`), so a malformed request from an old or buggy client gets a `400`
  with a clear error instead of reaching SQL. Schemas strip unknown keys rather than reject
  them, and query schemas coerce strings, so a request the web sends today never gets a `400`
  because validation arrived. Before turning validation on for a route, the worker tests
  cover the requests the web page actually sends to it.
- **The client** (one implementation, used by both the web bundle and the app) parses each
  response with its schema. A shape it doesn't expect surfaces as one typed error at the
  boundary ("this instance's API doesn't match the app"), not as an `undefined` deep inside a
  render. Response schemas allow unknown keys, so an instance may add fields without breaking
  older clients.
  - **On the web, start in warn-only mode.** Today the pages accept any JSON. With strict
    parsing, one wrong `nullable` in a schema would stop the dashboard syncing. So for each
    route group the web client starts by logging a mismatch to the console and using the data
    anyway. It switches to strict after a release with no mismatches. The app is strict from
    the start.
- **Tests**: `test/worker-sql.test.mjs` checks that each route's real response, from the
  real Worker and a fresh D1, parses with its response schema. That catches a handler drifting
  from its declared type, which plain TypeScript annotations can't. **A route's response-shape
  test lands in the same change as its schema**: phase 1 for every route the web calls,
  phase 4 for the app-only routes.
- **Order in phase 1:** route groups move alongside the core modules that call them:
  flights and corrections with `flight-store`, duty days and defaults with `duty`, and
  bootstrap, trackers, aircraft and pilots with `live`. Then settings, users, devices,
  webhooks, regions, named points and overlays. The admin routes behind `POLLER_SECRET` are
  out of scope.

**Why not Hono RPC (`hc<typeof app>`):** it infers types from the Worker's route code, so
core would depend on the Worker instead of the other way round, and the vanilla-JS web pages
couldn't use those types at all. It checks only at compile time, while the risk here is at
run time: an app build and an instance on different versions (see "Versions and
compatibility"). It also needs `src/index.ts` restructured into chained sub-routers, and it
type-checks slowly on large apps. The schemas give the same end-to-end types plus run-time
checks, and Hono still does the routing and validation.

This pays off before the app exists. Every API call the dashboard makes is checked at both
ends, its logic gets type checking and normal imports, and the template-string harness
shrinks to the PDF builder's test. Nothing about the dashboard's
look, its no-framework approach or its deploy changes.

### What isn't shared

- **UI and styles.** The app uses native components. The design system is shared as
  **tokens**: export the values in `theme.ts` as a typed object in core (colors, radii,
  type scale, motion), keep `themeVars()` generating CSS from that object, and have the app
  read the same object. The two clients then get their accent and status colors from one
  source, while each platform keeps its own control shapes.
- **Leaflet code.** The app uses MapLibre Native (Decision 3).
- **Typst PDF export.** In v1 the app's "Export PDF" opens the web export in an in-app
  browser session (`expo-web-browser`) for that device's session. Later, if wanted, the
  Worker could render the PDF itself.

## Decision 3: maps (MapLibre in the app now; PMTiles for what you host)

There are two separate decisions here:

1. **Renderer.** There is no Leaflet for React Native, so the app uses
   **MapLibre Native** (`@maplibre/maplibre-react-native`, which has an Expo config plugin)
   from day one. That part is settled by the platform.
2. **Tile format and hosting.** PMTiles is a way to host tiles (one file in R2 or behind a
   Worker, read with range requests). It matters for basemaps **you** serve. Third-party XYZ
   basemaps keep working as they are.

### Recommendation

- **App:** MapLibre with a style built from the shared basemap catalog. Raster XYZ sources
  (USGS, OpenTopoMap, Esri, Carto through the existing `/api/tiles` proxy, and admin
  overlays) work in MapLibre unchanged, so the app has basemap parity with the web from the
  start. Recent MapLibre Native releases also read `pmtiles://` sources directly. Check the
  RN wrapper's version at implementation time.
- **Use Mapterhorn's DEM as a MapLibre `raster-dem` source** (Terrarium encoding) for
  hillshade and, optionally, 3D terrain. It's the same archive the elevation tool already
  reads.
- **Offline maps need basemaps you're allowed to download in bulk.** MapLibre's offline
  manager can download a region of any source, but OpenTopoMap's and Esri's terms don't
  allow bulk downloading, and OSM's tile servers don't either. So offline is where PMTiles
  becomes necessary. Host your own archives in R2:
  - a Protomaps vector basemap (OSM data, ODbL; a regional extract is small);
  - USGS topo and imagery, which are public domain, as raster PMTiles for the regions
    operators fly;
  - **FAA VFR sectionals**, also public domain and published every 56 days, as raster
    PMTiles. This is probably the most useful offline layer for pilots, and a feature the web
    doesn't have yet.

  The app then downloads a region or a whole extract file for offline use.
- **Web:** don't migrate yet. Leaflet can already show raster PMTiles (pmtiles.js has a
  Leaflet raster layer), so new self-hosted basemaps can reach the web without moving it to
  MapLibre. Move the web to MapLibre GL JS later, only if vector styles, 3D terrain or
  shared style JSON make it worth it. The shared basemap catalog in core keeps the two
  renderers configured from the same data in the meantime.

So yes, do it in the app first, but what the app gets first is MapLibre, and PMTiles comes
second, when you start hosting offline-capable basemaps. The web can follow either step
whenever it's worth it.

## Decision 4: push notifications (Web Push first, app push for hosted instances, relay later)

Push comes in three steps. Each one is useful alone, and none of them waits on the next:

1. **Web Push in the dashboard** (phase 2). It replaces Pushover now, months before the app
   exists, for every instance including self-hosted ones, with no store, relay or publisher
   credentials.
2. **App push for hosted instances** (phase 7). The instances you host call Expo's push
   service directly.
3. **The push relay** (phase 9, when the first self-hoster asks). Self-hosted instances can't
   hold the publisher's Expo credentials, so their app push goes through a relay you run.

### Subscriptions and devices (shared by all three)

Subscriptions are per user, and every device a user has registered gets each push:

- `push_subscriptions`: `user_id`, `tracker_id` (NULL = all), `event` (`takeoff`, `landing`,
  `gap`). Unlike `webhooks`, these are per user, so any user, viewers included, subscribes
  themselves in Settings. Admins don't manage them.
- `push_devices`: `id`, `session_id` (FK → sessions, `ON DELETE CASCADE`, so signing out a
  device in Settings also stops its pushes), `kind` (`web` or `expo`), `endpoint` (the Web
  Push endpoint URL, or the Expo push token), `p256dh` and `auth` (Web Push only),
  `created_at`, `last_ok_at`, `last_error`. Phase 9 adds `relay_device_id`.
- Phase 2's migration (`0004_…` or the next free number) adds both tables. Phase 4's adds
  `sessions.app_version` (see "Versions and compatibility"). Neither table has `edit_history`
  triggers.
- `dispatchNotifications()` gains a delivery path for `push_subscriptions` next to the
  `webhooks` targets. It reuses `eventTitle`/`eventMessage`, and `subscriptionKey()` already
  maps `gap_resolved`/`gap_timeout` onto `gap`. Today the function returns early when there
  are no active webhooks, so the push path has to come before that return, not after it.
- **Push sends are isolated from the others:** each send has a short timeout, they all run
  independently of the webhook and Pushover sends (`Promise.allSettled`, inside `waitUntil`),
  and failures are recorded on the device row. A slow or failing push service must never
  delay or drop a webhook or Pushover message, or fail the poll.
- A push service's "gone" answer deletes the device: `404`/`410` for Web Push,
  `DeviceNotRegistered` for Expo.

### Step 1: Web Push in the dashboard (phase 2)

- **VAPID keys per instance.** The first time anyone enables notifications, the Worker
  generates an ECDSA P-256 key pair and stores it in `settings` (the private key isn't shown
  in the UI). There's nothing to configure, and self-hosted instances get Web Push free.
- **Sending:** VAPID (RFC 8292) and `aes128gcm` payload encryption (RFC 8291) with WebCrypto
  in the Worker. That's either a few hundred lines in `src/`, or a library that runs on
  Workers without Node's `crypto`. Choose at implementation time, and test it against the
  RFC 8291 test vector.
- **Service worker** at `/sw.js`, served by the Worker so its scope covers every page
  (`worker-src 'self'` already allows it). It has two handlers: `push` shows the
  notification, and `notificationclick` focuses or opens the dashboard on the tracker or flight
  named in the payload's `data`. A payload `type` the worker doesn't know opens the dashboard
  home.
- **Web app manifest** (`/manifest.webmanifest`, `display: standalone`, icons from
  `brand.ts`). iOS only allows Web Push for a site added to the Home Screen (iOS 16.4+). When
  Settings is opened in iOS Safari outside a Home Screen app, it explains how to add the site
  instead of offering the switch.
- **Settings → Notifications** (every user): "Notify me on this device", plus per-tracker and
  per-event subscriptions. Ask for permission **from that click**: Safari only allows it in
  response to a user gesture, and every browser shows its prompt only once. Build the controls
  from the shared `toggle.ts` / `segmented-control.ts` primitives.
- **Limits compared with the app:** no iOS Time Sensitive level (gap alerts don't get
  through Focus), no action buttons on iOS, and pilots have to add the dashboard to their
  Home Screen. The app (step 2) removes these, but Web Push is enough to retire Pushover.

### Step 2: app push for hosted instances (phase 7)

Expo's push service delivers through APNs and FCM v1 using the credentials stored in the EAS
project. Turn on **enhanced push security** for the project, so sending requires an Expo
access token. Without it, anyone holding a device's push token can send to it.

- The Expo access token is a Worker secret (`EXPO_ACCESS_TOKEN`) in the hosting repo's
  config, set **only on instances you host**. It belongs to the app's publisher, so a
  self-hosted Worker never has it, and gets app push only once the relay exists.
- The app registers its Expo push token with its instance (`POST /api/me/push-devices`,
  `kind = 'expo'`). The instance stores it, which is acceptable here: with enhanced security
  the token is useless without the access token, and you run both sides.
- Receipts: the instance keeps the ticket IDs from each send and checks them with Expo on the
  next cron run, deleting devices that come back `DeviceNotRegistered`.
- The subscriptions UI is the same one as on the web, in native form.

### Native details

- **Android channels** per event type (Takeoff/Landing, Signal gap), so users control sound
  and importance in system settings.
- **iOS Time Sensitive** interruption level for signal-gap alerts (entitlement), so they get
  through Focus modes. Takeoff/landing stay at the normal level.
- **Notification categories with actions**, e.g. on a gap alert "Open MapShare" and "View on
  map".
- Tapping a notification deep-links to the tracker or flight (`wingbeat://flight/123`).
  Each push's `data` carries a `type`, the same types as Web Push. An app that doesn't know
  the type opens to its home screen instead of following a link it can't handle, and
  published deep-link paths stay valid in later versions.
- **Ask for notification permission at the point of use**, when the user turns on their
  first subscription, not at first launch. iOS shows its prompt only once, so explain it
  first, and send a user who declined to system settings.
- **Later: iOS Live Activity and Android ongoing notification** for a flight in progress
  (tail, time aloft, last position, gap state), updated by push at each poll. Live Activity
  pushes go to APNs directly (Expo's push service doesn't send ActivityKit updates), so the
  APNs key goes wherever the Expo access token is held: the hosted instances' secrets, or the
  relay once it exists. Worth it, but after v1.

### Step 3, later: the push relay for self-hosted instances (phase 9)

Built when the first self-hoster asks for the app, together with the in-app purchase
(Decision 6). Until then the app pairs only with hosted instances (see "Auth and pairing").

All instances, hosted ones included, then send through a **push relay**: a small Worker run by
Dumm Software (`push.wingbeat.…`, its own repo directory and deploy). Moving hosted instances
onto it too means one delivery path and one place holding the token. Moving them costs no
user action: the update that ships the relay client (an OTA update, no store release) makes
the app register its Expo token with the relay on its next launch and hand the resulting
`relay_device_id` to its instance, which replaces the stored token with it. Once every
active device has moved over, `EXPO_ACCESS_TOKEN` is removed from the hosted instances.

**What the relay does:**

- **Instance registry:** each instance has an `instance_id`, its hostname and a secret.
  Instances you host are marked `hosted` (free). Every instance registers the same way,
  **self-serve from web Settings** (admin only): "Enable app push" →
  1. the instance calls the relay's `POST /instances` with its hostname;
  2. the relay replies with a one-time challenge, the instance serves it at
     `https://<host>/.well-known/wingbeat-relay`, and the relay fetches it from there. This
     proves the instance controls that hostname, so nobody can register someone else's;
  3. the relay returns `instance_id` and the secret, which the instance stores in D1
     (`settings`, not shown in the UI), so there's no `wrangler secret put` step.

  Re-running it rotates the secret. Hosted instances are pre-marked `hosted` by hostname
  before they register. The app never registers instances.
- **Device registration:** the app registers its Expo push token **with the relay**, for a
  given instance, and gets back an opaque `relay_device_id`, which it gives to the instance.
  The instance never sees the Expo token, so a leaked self-hosted database can't be used to
  send pushes outside the relay.
- **Send:** `POST /send` with `{ instance_id, relay_device_ids, title, body, data,
  category, interruption }`, signed with the instance secret. The relay checks that each
  device belongs to that instance and **is entitled to it** (hosted instance, or a valid
  purchase for this self-hosted instance; Decision 6), rate-limits per instance, then calls
  Expo.
- **Receipts:** the relay checks Expo push receipts, drops devices that come back
  `DeviceNotRegistered`, and reports dead `relay_device_id`s back on the next send response
  so the instance can delete them.
- **State:** a D1 database of its own (instances, devices, entitlements). It has no flight
  data. The payload passes through and isn't stored.

The Wingbeat Worker knows the relay's URL (a constant, overridable by a `PUSH_RELAY_URL`
var for staging) and its own `instance_id` and secret from `settings`. An instance that
hasn't enabled app push simply has no app push (Web Push and webhooks still work).

### Retiring Pushover

Web Push replaces it (phase 2). Keep the `pushover` target type working through a transition
period. Once the operators you host have moved to Web Push or the app, hide it from new
targets, then remove it in a later release. Generic webhooks stay for integrations.

## Decision 5: passive matching (the background platform)

Goal: a flight on tracker T gets its pilot and aircraft without anyone opening the app. The
phone reports what it observed. **The Worker decides**, using the assignment path that
already exists.

### Before building it: the beacon probe (phase 3)

Everything below assumes that iOS and Android report per-aircraft beacon enters and exits
reliably enough, in the background, with the phone in a pocket or bag and the app not opened.
That's the one assumption the plan can't check on paper, and the app is mostly worth building
for this feature. So it's tested first, with no server change:

- **Build:** the real presence module (`apps/mobile/modules/wingbeat-presence`, as under
  "Native module"), so the code carries over to phase 8, inside a minimal `apps/mobile` with
  one debug screen. The screen has the beacon UUID, major and a minor → tail table entered by
  hand, the auto-log switch with its permission prompts, the event log, and "Export"
  (JSON through the share sheet). Location fixes use `expo-location` as planned. Installed
  through EAS internal distribution (iOS ad hoc, Android APK), so there's no store review. The
  Swift half needs the Mac.
- **Hardware and people:** iBeacons in two or three aircraft that park near each other at
  one operator you host, and two or three pilots, at least one on iPhone and one on Android,
  for two to three weeks of normal flying. The phones record every signal under "Signals the
  phone sends" into the local queue, and upload nothing.
- **Analysis:** a script takes the exported logs and the instance's flights for the same
  period, and runs rules 1 and 2 (see "The matching rule") for every flight a probe pilot
  flew, against the real assignment. Write the rules as **pure functions in
  `packages/core`**, so the script and the phase 8 matcher share them, and keep the logs
  (with tails and times only) as the matcher's **test fixtures**. The script also reports
  exit delays per platform, how often iOS relaunched the app after it was terminated, how
  long Android's scans stalled, and how long each flight took to become decidable.
- **Go criteria (proposed):** of the flights where the phone was monitoring, rule 1 picks the
  right aircraft for at least 90%, and **never the wrong one**. Rule 2 never fires against a
  correct assignment. The pilots don't notice a battery cost. Rule 3 (location) is checked
  the same way if any probe tracker has no fixed side.
- **No-go:** stop after phases 1 and 2 (see "Phases"). If only one platform passes, decide
  whether passive matching on that platform alone is enough to build the app for.

### How assignment works today (and stays)

- A tracker can have a fixed `assigned_aircraft` and/or `assigned_pilot`, set by an admin in
  Settings (`PUT /api/trackers/:id`).
- The poller stamps every point with the tracker's current values when it stores the point
  (`poller.ts`).
- Segmentation gives each flight the first non-null aircraft and pilot of its points
  (`segmentation.ts`).
- Admins correct a flight with `PUT /api/flights/assignment`. Its `assignmentStatements()`
  updates the flight row **and restamps the flight's points** (through `point_flights`), in a
  `recordedBatch`, so `edit_history` records it.

Restamping the points is what makes an assignment last. Segmentation rebuilds flights from
points (it rewrites the in-progress flight on every poll, and `resegment()` rebuilds them
all), so a change made only to the `flights` row would be lost. The matcher uses the same
`assignmentStatements()`, so its assignments restamp points the same way, are recorded in
the history, and can be undone like any edit.

### What the matcher fills in, derived from the tracker

There's no mode setting. The admin's fixed fields say which side is known:

| `assigned_pilot` | `assigned_aircraft` | The matcher finds | Evidence it needs |
|---|---|---|---|
| set | NULL | the aircraft (a pilot's personal tracker) | beacons only |
| NULL | set | the pilot (a tracker fixed in an aircraft) | beacons only |
| NULL | NULL | both (a tracker that moves around) | beacons plus the phone's location, or beacons alone when elimination leaves one answer |
| set | set | nothing (fully fixed, as today) | none |

Beacons say which aircraft a pilot's phone was in. When the tracker fixes one side, that's
the whole answer: the fixed side identifies the flight's pilot or aircraft, and the beacon
evidence for that pilot or aircraft gives the other. When the tracker fixes neither side,
beacons still say "P was in A", but not that A is the aircraft tracker T was in. Linking the
pair to T takes the phone's location near T's points, or elimination (see "The matching
rule").

An operator who uses `assigned_pilot` today as a pilot that changes day to day has to clear
it to get auto-assignment for that tracker. Say so in the Settings help text next to the
fields.

### Assignments stick: the tracker's current pilot and aircraft

Once the matcher assigns a flight, the assignment **carries over to that tracker's later
flights until evidence says otherwise**. It's stored separately from the admin's fixed
fields, in two new columns, `trackers.current_pilot` and `trackers.current_aircraft`. If the
matcher wrote into `assigned_*`, the tracker would look fixed, and the matcher would stop
checking it.

- The poller stamps points with `COALESCE(assigned_pilot, current_pilot)` (and the same for
  the aircraft). The next flight is therefore assigned from its first point, with no
  evidence needed, through the existing stamp-and-segment path. While `current_*` is NULL
  (always, until the matcher writes), stamping is unchanged. A poller test checks exactly
  that, so this part can ship before the matcher does.
- The matcher sets `current_*` whenever it assigns a flight, and clears it when evidence
  contradicts it (below).
- Settings shows the current values next to the fixed ones ("Currently: Pat, auto, since
  May 3"), with a button to clear them. An admin's correction to a single flight doesn't
  change `current_*`, the same way it doesn't change the tracker's fixed fields today.
- `trackers` has no `edit_history` triggers, so these are plain `ADD COLUMN`s.

Known risk: a pilot without the app (or with the switch off) who flies a tracker after
someone else inherits that person's name until an admin corrects it. That's the same as a
fixed `assigned_pilot` today.

### Signals the phone sends

Only individual, timestamped events. The phone doesn't interpret them:

1. **Beacon enter / exit, per aircraft.** One iBeacon per aircraft: the operator's UUID and
   major value are in `settings`, and each aircraft has its own minor. The phone sends
   `{ kind: 'beacon_enter' | 'beacon_exit', t, minor }`, one event per aircraft, so walking
   past three parked aircraft and taxiing out in one of them gives three enters and then two
   exits.
   - iOS: **one monitored `CLBeaconRegion` per aircraft** (UUID + major + minor, with the
     minor as the region's identifier). iOS reports state changes of a *region*, not which
     beacon matched it, so a single fleet-wide region (UUID + major) would give one enter
     when the first aircraft comes into range and one exit when the last one is gone, and
     telling aircraft apart would need ranging. With a region per aircraft, the OS names the
     aircraft in each enter and exit, and no ranging is needed. Monitoring wakes or relaunches
     the app **even after it was terminated** (it needs "Always" location permission), and
     the wake (about 10 s, about 30 s with a background task) is enough to queue the event and
     try the upload. Exits are reported about 30 seconds after the signal is lost.
   - **iOS allows 20 monitored regions per app**, shared with geofences (the app has none)
     and across every account in the app. No operator's fleet is expected to pass 19
     aircraft. A pilot signed in to two operators whose fleets together pass 20 gets the
     regions of the account used most recently, and the app says so in the auto-log setting.
   - On launch, and whenever the aircraft list changes, the app re-registers the regions and
     calls `requestState(for:)` on each one. A region that reports *inside* is recorded as a
     `beacon_enter` at that time, so a phone already sitting in an aircraft when its regions
     were registered isn't missed.
   - Android: the **AltBeacon Android Beacon Library** (see "Native module") with its
     `IntentScanStrategy`: one hardware scan filter on the UUID and major, and a library
     region per aircraft. A scan result always carries the full beacon identity, so there's
     no region limit. Android only infers an exit from the beacon going unheard, so exits can
     arrive late when the OS is scanning rarely (screen off, some OEMs), and Doze can hold
     the upload until its next maintenance window (the queue covers that). It needs the
     Bluetooth scan and background location permissions (beacon scans can't use
     `neverForLocation`).
2. **Sightings (Android only)**, `{ kind: 'beacon_seen', t, minor }`, at most one a minute
   per aircraft while the phone is inside its region. Android infers exits from silence, and
   its scanning can stall with the screen off, so on Android "no exit yet" isn't enough to
   say the phone is still inside. The Worker counts an Android phone as inside an aircraft
   only up to 2 minutes after its last sighting (see "The matching rule"). The scan results
   arrive through `IntentScanStrategy` anyway, so sightings cost no extra scanning. iOS
   doesn't send them: its monitoring reports exits itself.
3. **Monitoring on / off**, `{ kind: 'monitoring_on' | 'monitoring_off', t }`, whenever the
   auto-log switch changes, location or Bluetooth permission is granted or revoked, or the
   regions are re-registered. The Worker needs to tell a phone that was monitoring and saw
   nothing (evidence that the pilot wasn't in the aircraft) from one that wasn't monitoring
   (no evidence at all). Bluetooth being turned off is recorded when the platform reports it
   (Android broadcasts it; iOS only finds out at the next wake), so a phone with Bluetooth
   off can briefly look like it was monitoring and saw nothing. The matcher's response to
   that is to clear an assignment, not make a wrong one (see "Contrary evidence").
4. **Location fixes**, `{ kind: 'location', t, lat, lon, accuracy_m }`, at low accuracy and
   only around aircraft: one at each beacon enter and exit, and periodic updates while the
   phone is inside an aircraft's beacon region. iOS starts location updates from the beacon
   wake. Android uses `PendingIntent` location updates, with no foreground service, which the
   OS throttles to a few an hour in the background (on Android the beacon events matter
   more). The updates also give the app the background time it needs to upload.

No geofences, no continuous GPS outside an aircraft, no Android foreground service.

### Upload: in service at takeoff, queued after

The phone has service on the ramp and through the first minutes of the climb-out, which is
enough to decide the flight. After that it's usually out of range until it's back near base:

- Each event gets a client-generated ID and goes into a **local SQLite queue** first. The
  queue is capped at 14 days or 10,000 events, oldest dropped first.
- The app uploads the queue to `POST /api/presence/events` **as soon as there's a
  connection after each event**, so the taxi and climb-out evidence reaches the Worker
  minutes after takeoff. Whatever was recorded out of range goes up on the next wake with a
  connection, when the app is opened, or from `expo-background-task`. A batch is removed from
  the queue only after the Worker confirms it.
- Each batch carries the phone's `as_of` time: the phone's record is complete up to then.
  The Worker needs it to know a beacon was *still* in range (no exit up to `as_of` means
  the phone was still inside, subject to the Android sighting rule), and to know how far the
  phone's evidence reaches (see "Covered span").
- The Worker inserts with `INSERT OR IGNORE` on `(user_id, client_event_id)`, so a batch
  that's retried after a dropped connection is stored only once. It turns `minor` into an
  aircraft tail when it stores the event, so moving a beacon to another aircraft later doesn't
  change past evidence.

### The matching rule (Worker)

Pilot P is the user's `users.pilot_id`. T is the tracker, A an aircraft, and F a flight on
T. There's no fixed decision time. **The matcher re-evaluates F whenever new evidence or a
new flight state arrives, and the answer firms up as the evidence grows.** Right at takeoff,
the pilot's phone is still inside the regions of the aircraft parked around it, so there are
several candidates and nothing is decided. As the neighbours' exits arrive (about 30 seconds
on iOS, minutes on Android) the candidates narrow, and the matcher assigns as soon as one is
left. Once F has landed and the queued in-flight events are in, the same rule gives the
final answer. Each run writes only when its answer differs from what F has, so re-running it
with the same evidence changes nothing.

**Covered span.** For P and F, the covered span is the part of F's airborne time (takeoff to
landing, or to now while F is in progress) during which P's phone was monitoring (between a
`monitoring_on` and the next `monitoring_off`) and that P's evidence reaches (up to P's
`as_of`). It's the part of the flight about which P's phone has something to say, including
"nothing seen". It's empty for a phone that's switched off, has auto-log off, or hasn't
uploaded since takeoff.

**Inside A.** P's phone is inside A from a `beacon_enter` for A to the next `beacon_exit`
for A, or to `as_of` if there's none. On Android, a stretch more than 2 minutes after the
last `beacon_seen` for A (a stalled scan) is unknown: it isn't counted as inside A, and it's
removed from the covered span so it doesn't count against A either.

**Rule 1: P was in A on F** if:

1. P's covered span is at least **2 minutes** long. Otherwise an upload seconds after
   takeoff could cover a span too short for any exit to have arrived. Two minutes is four
   times iOS's exit delay.
2. P's phone was inside A for at least **80%** of the covered span. The slack is for a
   phone in a bag losing the signal.
3. A is the only aircraft that passes 2.

Before the neighbours' exits arrive, more than one aircraft passes 2, so rule 1 says nothing
yet. Two aircraft can only both pass if the phone stayed in range of both for the whole span
(they're parked side by side and P never left), which rightly stays undecided.

**Rule 2: P was not in A on F** if P's covered span is at least 2 minutes long and P's phone
was inside A for less than **20%** of it. Between 20% and 80% is inconclusive and counts as
neither. Rule 2 is what makes silence count: a phone that was monitoring through the flight
and never saw A's beacon says P wasn't in A. A phone that wasn't monitoring says nothing.

**Rule 3: P's phone was with T on F** (needed only when T has no fixed side): **at least
two** of P's location fixes from 30 minutes before takeoff to the end of P's covered span
each lie within 2 km of T's own point nearest in time (and at most 10 minutes from it), and
none lies further away. T's points include ground points, so the boarding fix at the ramp
counts.

**Deciding, by the tracker's known side:**

- **Pilot fixed** (P is known): assign the A for which rule 1 holds.
- **Aircraft fixed** (A is known): assign the P for which rule 1 holds. If rule 1 holds for
  more than one P (two app users aboard), assign nobody; two pilots aboard is out of scope.
- **Neither fixed:** assign the one (P, A) pair for which rules 1 and 3 hold. Without
  location fixes, fall back to **elimination**: assign the pair when it's the only one that
  fits, meaning exactly one pilot's phone passes rule 1 for some aircraft over F's airborne
  time, and that aircraft isn't already accounted for (no other tracker's flight airborne at
  the same time has it as its aircraft). Elimination is weaker than location: a pilot
  without the app, or a pilot sitting in a parked aircraft for the length of someone else's
  flight, can make it pick wrongly. So it's recorded as its own actor (below), and it sets
  T's `current_*` only after F has landed and the pair is still the only fit over the whole
  flight.

If there's no answer yet, F keeps what it has: whatever the sticky `current_*` stamped, or
nothing.

**Contrary evidence: clear.** If rule 2 holds for F's assigned pilot and aircraft (the
assigned pilot's phone was monitoring but not in the assigned aircraft), the matcher
unassigns the side it fills in for T: the aircraft on a pilot-fixed tracker, the pilot on an
aircraft-fixed one, both on a tracker with neither. On a tracker with neither, a fix from the
assigned pilot more than 2 km from T's nearest point does the same. If another answer exists,
it assigns that instead. This covers a pilot without the app flying after someone else: if
the previous pilot's phone was monitoring elsewhere, the previous pilot is cleared rather
than inherited. If that phone wasn't monitoring, there's no evidence either way, and the
known risk under "Assignments stick" remains.

**`current_*` follows T's latest flight only.** The matcher sets or clears T's `current_*`
from its answer for T's most recent flight. Correcting an older flight after a late upload
doesn't touch `current_*` once T has flown again since.

**Assign** with `assignmentStatements()` for that flight, which restamps its points too. The
actor is recorded as "auto-assign (beacon)", "auto-assign (beacon + location)" or
"auto-assign (beacon, by elimination)", with a NULL `user_id`. (`recordedBatch` takes a request context today. The matcher needs a variant that
takes the database and an actor name, since it runs in the poller and in the upload route.)
Restamping the in-progress flight's points is enough to make it stick through segmentation's
rewrites, because segmentation takes the first stamped point, and points stored afterwards
are stamped from the new `current_*`.

**When it runs:** on each upload, for flights overlapping the uploaded events' time range,
and after each poll's segmentation, for flights that have just landed (landing ends the
airborne span, which can change the percentages). Flights that landed more than 14 days ago
(the phone queue's cap) aren't re-evaluated.

**What it never overwrites:** a flight whose pilot or aircraft a person set (an
`edit_history` row for it with a non-null `user_id`).

**Rollout: off by default, shadow mode first.** The matcher writes assignments that the
dashboard, duty log and accounting all show, so a wrong one ends up in compliance records.
It's gated by a per-instance setting, `auto_assign` in `settings`, with three values:

- `off` (the default): presence events are stored, and the matcher doesn't run. An operator
  without beacons never has it running.
- `shadow`: the matcher runs and records what it would assign, in a `matcher_log` table
  (flight, the answer, the rule and evidence that produced it, and the flight's actual
  assignment at that time), without writing flights or `current_*`. Settings shows the
  recent rows ("would have assigned Pat to N123 · actual: Pat"), so an admin can see how
  often it agrees with them.
- `on`: it assigns as described above, and keeps writing `matcher_log`.

Run each hosted operator in `shadow` for a few weeks, and switch to `on` only once its log
agrees with the real assignments. This is a server-side setting, not one of the bootstrap
feature flags ruled out for the app.

**Not in v1:** two pilots aboard, and "Did you fly N123?" prompts for ambiguous flights. Add
them later if unassigned flights with evidence turn out to be common.

### Schema

- Phase 6: `users.pilot_id` (`REFERENCES pilots(id) ON DELETE SET NULL`, a partial unique
  index so only one user links to each pilot).
- Phase 8:
  - `trackers.current_pilot` (`REFERENCES pilots(id) ON DELETE SET NULL`) and
    `trackers.current_aircraft` (`REFERENCES aircraft(tail_number)`);
  - `matcher_log` (see "Rollout: off by default, shadow mode first"), pruned with
    `presence_events`;
  - `aircraft.beacon_minor` (UNIQUE where not null; `aircraft` has no `edit_history`
    triggers, so it's a plain `ADD COLUMN`), plus the `beacon_uuid` and `beacon_major`
    settings;
  - `presence_events` (`id`, `user_id` → users `ON DELETE CASCADE`, `client_event_id`,
    `kind` (`beacon_enter`, `beacon_exit`, `beacon_seen`, `monitoring_on`,
    `monitoring_off`, `location`), `t`, `aircraft_tail`, `lat`, `lon`, `accuracy_m`,
    `received_at`,
    `UNIQUE (user_id, client_event_id)`), pruned after 30 days by the cron. The batch's
    `as_of` goes in a `presence_as_of` row per user, or as a `kind = 'as_of'` event.

### Native module

No maintained Expo module covers background iBeacon monitoring on both platforms. Write one
local **Expo module** (`apps/mobile/modules/wingbeat-presence`, Swift + Kotlin, in the Expo
Modules API) that exposes only what this plan needs: start/stop monitoring one beacon region
per aircraft (UUID, major, minor), and a queue of per-aircraft enter/exit events (plus
sightings on Android, and monitoring on/off) that the JS background task drains into the
upload queue.

- **iOS:** CoreLocation `CLBeaconRegion` monitoring, one region per aircraft, written
  directly. It's a small API. No ranging.
- **Android:** wrap the **AltBeacon Android Beacon Library** (Apache 2.0, maintained, the
  usual choice for this) instead of hand-writing `PendingIntent` scans. It already handles
  the work that's hard to get right: scan throttling, background limits on different OEMs,
  the Android 12+ Bluetooth permission split, and region monitoring that survives the app
  being killed (its `IntentScanStrategy`).

Use `expo-location` for the location fixes instead of reimplementing them.

### Policy and privacy (plan time for these)

- iOS "Always" location and Android background location both get extra store review. The
  purpose strings and the Play declaration video must describe exactly this feature.
- Ask for permission at the point of use (the "auto-log my flights" switch), never at first
  launch. The app must work fully with "While using" permission or none. Without location,
  only trackers with a fixed pilot or aircraft can be auto-assigned.
- Location is recorded only around aircraft beacons, so it's near flights by construction.
  It's kept for 30 days, pilots can see and delete their own events, and the docs site
  documents all of this.

## Decision 6: the self-hosted in-app purchase

**Deferred to phase 9, built when the first self-hoster asks for the app.** The design below
stands. Until then the app pairs only with hosted instances (see "Auth and pairing").

**What it unlocks:** using the app with an instance that isn't hosted by Dumm Software,
including push through the relay. With hosted instances everything is free and there's
never a paywall.

**How the app knows:** when pairing, the app asks the relay about the instance's host. The
relay says `hosted` (free) or `self-hosted` (purchase needed). A host the relay doesn't know
counts as self-hosted: the app needs the purchase, and push stays off until that instance's
admin enables app push (Decision 4). The paywall appears only on the pairing screen for a
self-hosted instance, which keeps it out of the hosted operators' way.

**What to sell: a one-time $10 unlock per user** (a non-consumable in-app purchase on each
store). A store purchase belongs to one store account (one person), not to an instance, so
each person who uses the app with a self-hosted instance buys it once. It then covers every
instance they pair with, and every device signed in to the same Apple ID or Google account.
A purchase on iOS doesn't carry over to Android, or the other way round, since each store
only knows its own purchases. Notes:

- **Store commission:** enroll in Apple's **Small Business Program** and use Google's 15% tier
  (both for developers under $1M a year), so the commission is 15%, not 30%, and you get about
  $8.50 per sale. Enroll after the organization conversion, under the LLC.
- **Restore Purchases** must be offered (App Review requires it for non-consumables).
  StoreKit and Play Billing both return a non-consumable's purchase on a new device.
- **Family Sharing:** optional. Leave it off at first.
- **Running cost:** with a one-time price, new sales pay for the relay, not renewals. The
  relay's cost is small (one Worker plus D1), so this works. A subscription can be added
  later for something that costs more per user, such as Live Activities or offline map
  storage.
- **Per-instance licenses** (an instance owner paying once for all of their users) aren't in
  scope. If operators ask for them, they'd be sold outside the stores, like the hosted
  service.

**Verification: checking that a purchase is real.** When someone buys the unlock, the store
gives the app a proof of purchase. The relay can't take the app's word for it that it paid,
so it checks that proof with the store before sending pushes to that device. It also has to
notice refunds. There are two ways to do this:

- **Do it ourselves (decided).** The app uses an in-app purchase library (`expo-iap`)
  to show the store's purchase sheet and get the proof. The relay checks it:
  - **iOS:** StoreKit 2 transactions are signed by Apple (JWS). The relay verifies the
    signature against Apple's root certificate, with no call to Apple.
  - **Android:** the relay calls the Google Play Developer API with the purchase token
    (using a Play service account).
  - **Refunds:** Apple's App Store Server Notifications (a webhook to the relay) and
    Google's voided-purchases API (polled daily, or Real-time Developer Notifications)
    revoke the entitlement.

  For a one-time purchase this is a few hundred lines in the relay. The hard part of doing it
  yourself is subscription renewals, grace periods and billing retries, and a one-time
  purchase has none of those.
- **RevenueCat (not used):** a third-party service that does all of the above for both stores. Its SDK
  goes in the app, it keeps a dashboard of purchases and revenue, and it sends the relay a
  webhook when an entitlement starts or ends. It's free up to a monthly revenue threshold,
  then takes a small percentage. It mostly pays off for subscriptions or price experiments,
  and it adds a third party that sees every purchase.

The relay stores each entitlement under the store's original transaction ID (iOS) or order
ID (Android), and links each `relay_device_id` that presents it. A refund then revokes every
device at once, and Restore Purchases on a new phone just links one more device.

**Licensing:** the app is **AGPL**, like the Worker, and lives in this repo under
`apps/mobile`. Anyone could build their own copy, but it couldn't use your EAS push
credentials or your relay, so the purchase still means something: it pays for push through
the relay and for the convenience of the store build. `CLA.md` grants the rights to
distribute contributions to "the Project" under either license, which covers `apps/mobile`
as long as it stays in this repo under the same license. That's what lets you publish
contributed code in the store build.

**Timing:** after the Apple organization conversion, so tax and banking are set up once, for
the LLC (Decision 1).

## The app itself

### Stack

- Expo (current SDK at start; cud-app is on 57), **dev builds** (not Expo Go, because of
  the native modules), New Architecture.
- **Expo Router** with **native tabs** (`NativeTabs`: a system tab bar on iOS, including the
  current glass style, and Material on Android) and **native stack** headers (large titles,
  native back gestures).
- **`@expo/ui`** (SwiftUI on iOS, Jetpack Compose on Android) for forms, pickers, menus,
  switches, date pickers and bottom sheets. Wrap a component with its own JS only where
  `@expo/ui` has no equivalent, and keep each such fallback in one place.
- `expo-notifications`, `expo-secure-store` (session token), `expo-sqlite` (flight store
  and presence queue), `expo-location`, `expo-task-manager`, `expo-background-task`,
  `expo-web-browser`, `expo-updates`.
- `@maplibre/maplibre-react-native`.
- **Sentry** (`@sentry/react-native` and its Expo config plugin) for crashes and JS errors.
  EAS Build and EAS Update upload source maps, so stack traces from OTA updates point at real
  code. Errors are tagged with the instance host and API version but carry no flight or
  location data. Sentry is a third party, so it goes in the privacy labels.
- **Tests:** Jest for app-side logic that isn't in core (core keeps its own tests in
  `npm test`), and a few **Maestro** flows (pairing, Live, flight detail, sign-out) run
  against a dev build before each store release.

### Data and sync

The app uses the web's sync protocol unchanged, through `@wingbeat/core/flight-store`:

- **How it works today.** For each tracker, `/api/flights/complete?since=<modified_at>`
  returns the flights changed since the cursor, with their points. `/api/flight-corrections
  ?since=<edit_history id>` returns corrections changed since its cursor, plus deleted keys
  (or a full reset). Flights are merged by tracker and time overlap, and corrections are
  applied when read (`applyFlightEdits()`).
- **First sync is the full history.** Cursors start at 0, and `/api/flights/complete` has no
  date window, so a new account downloads every flight with its points once. After that, each
  poll returns only the flights that changed, usually the last one or two. The web has run
  this within `localStorage`'s ~5 MB cap, so real histories are a few MB at most, which is
  fine for a one-time download. Add a date window only if a real operator's history turns out
  large. (Note: `_fsSave` ignores quota errors, so a web store that outgrows the cap silently
  stops being saved and fetches everything on every load.)
- **Storage:** the same JSON blob as the web, one per account (`createFlightStore` per
  account, keyed by host and user), in `expo-sqlite/kv-store` through its async API, so a
  large parse or write doesn't block the JS thread. It's written only when something changed,
  as on the web.
- **Cache version:** the blob carries a format version. If an update changes the format, the
  app drops the cache and syncs again.
- **When it refreshes:** on a timer only while the app is in the foreground, when it returns
  to the foreground, and when a notification is opened. Background fetch and silent pushes
  aren't relied on, since iOS throttles both.
- **Edits are online-only in v1.** The flight form already saves with `base_history_id` and
  detects conflicts, so the app gets the same conflict check. Queueing edits made offline is
  out of scope.
- **Known gap (web too):** a flight the server deletes stays in the cache, because merging
  only replaces flights that overlap a new one. That rarely matters. Fix it in the protocol
  for both clients if it ever does.

### Screens (v1)

Pilots and dispatchers/owners are both first-class. Everyone gets the same tabs. Which one
opens first, and what Live emphasizes, depends on the user. A user linked to a pilot
(`users.pilot_id`, Decision 5) opens on **Duty log** with their own month and "my flights"
first. Everyone else opens on **Live**. Either one can change it in Settings.

Times follow the same rule as the web: the operator's timezone with its abbreviation, from
core's `time`, whatever the phone's zone (see "Times and the operator's timezone"). For an
account whose operator is in another zone, that's the only correct reading of a duty log.

- **Live:** map with tracker positions and in-flight tracks, and the status cards as a native
  list (from the same data the dashboard's `aircraft-cards` uses).
- **Flights:** list with day grouping and filters, and a flight detail with its track on the
  map, times, labels and assignment. Admins can edit assignment.
- **Duty log:** month view and totals from `@wingbeat/core/duty`, with day planning for the
  signed-in pilot. PDF opens the web export.
- **Settings:** accounts (instances), notification subscriptions, auto-logging and
  permissions, theme, a link to the web admin settings, and **Delete my account** (see
  "Account deletion").

### Auth and pairing

- Add `Authorization: Bearer <session token>` to the session middleware for non-admin
  paths. Admin paths stay `POLLER_SECRET`-only, and a session bearer must never satisfy
  them. Add tests in `test/worker-auth.test.mjs` for both.
- **A failed bearer auth returns `401` JSON, not the `/login` redirect.** The app treats a
  `401` as "this session was revoked or expired". It marks that account signed out and offers
  to pair again, without retrying. Cookie requests keep the redirect. Test both in
  `test/worker-auth.test.mjs`.
- **Whether to answer `401` or redirect depends only on whether an `Authorization` header is
  present**, not on the path or `Accept`, so a cookie request's behavior can't change. A
  request with an `Authorization` header is judged by the bearer alone, and any cookie it also
  carries is ignored. Test a request with a valid cookie and an invalid bearer (`401`), and a
  cookie-only request to an API path (the redirect, as today).
- The middleware change ships as **its own deploy**, ahead of `/api/app/pair` and
  `DELETE /api/me`, so if web sign-in breaks, the cause is obvious and the revert is small.
- **Session lifetime:** app sessions use the existing sliding expiry unchanged (90 days idle,
  `last_seen_at` refreshed on use). Background uploads and push-driven refreshes count as use,
  so a phone with the app installed rarely goes idle that long. One that does gets the `401`
  path.
- **Pairing, primary path: the in-app QR scanner.** Web Settings → Devices → "Add phone"
  shows a QR code of `wingbeat://pair?host=<instance>&token=<device-link token>`. The user
  scans it from the app's own "Add account" screen (`expo-camera`). The token goes from the
  camera straight into the app, never through the OS's URL routing. The app exchanges it with
  a new `POST /api/app/pair`, which uses the same consumption logic as `/join/:token` but
  returns the session token as JSON instead of setting a cookie, and names the session from
  the app's device info. Invite links work the same way for new users.
- **Fallback: the `wingbeat://` link itself** (scanned with the system camera, or tapped on
  the phone that shows it). Custom schemes aren't exclusive: on Android another app can
  register `wingbeat://` and receive the token. That's acceptable only because the token is
  single-use and expires in 15 minutes, and a stolen pairing shows up in the Devices list.
  Universal Links / App Links would be exclusive, but they can't cover self-hosted domains,
  since the app's associated domains are fixed at build time. So the scanner stays primary.
- **Hosted instances only, until phase 9.** Before pairing, the app checks the host against a
  list of hosted instances published on dummthings.dev (generated by the hosting repo). A
  host that isn't listed gets "Self-hosted instances aren't supported yet", not a paywall.
  In phase 9 the relay's `hosted` / `self-hosted` answer (Decision 6) replaces the list.
- The app keeps a list of `{ host, token, user }` accounts in `expo-secure-store`, since
  tenants are per hostname. The session list in web Settings already lets a user sign out a
  lost phone.

### Account deletion

Redeeming an invite in the app creates an account, so App Review (guideline 5.1.1(v)) needs
deletion **started in the app**. Settings → "Delete my account" asks for confirmation and
calls a new `DELETE /api/me`:

- deletes the `users` row, which cascades to `sessions` and that user's device-link
  tokens (`invite_tokens`) through the existing `ON DELETE CASCADE` foreign keys, and from
  sessions to `push_devices`. It also deletes `push_subscriptions` and the user's
  `presence_events`, and clears `users.pilot_id`;
- leaves the operator's records alone: the linked pilot, flights, duty days and corrections
  belong to the operator (they're operational records, often required to be kept).
  `edit_history` keeps its `user_id`/`user_name` text columns, so past edits stay attributed;
- refuses to delete the env-configured admin (`is_env_admin`) or the last admin of an
  instance, with a message to transfer admin first.

The web gets the same button in Settings. The privacy policy states what's deleted and what
the operator keeps.

### Versions and compatibility: OTA first

App binaries and instances update independently. Phones run old builds, and self-hosted
instances run whatever Worker version they deployed. **The goal: fix every incompatibility
with an EAS Update (OTA), so users almost never need a store update to keep working.** A
store update should be needed only for a planned native change.

**Two version numbers.**

- The **runtime** is the binary's native code, identified by the `fingerprint`
  `runtimeVersion`. It changes only with a store release. An OTA update is only ever
  delivered to the runtime it was built for, so new JS can't reach a binary that lacks a
  native module it calls.
- The **client API level** (`CLIENT_API_LEVEL`) is one integer in core, compiled into every
  JS bundle. It goes up when the app's use of the API changes in a way the server needs to
  know about.

The app sends both in an `X-Wingbeat-App` header on every request. The Worker records them
in `sessions.app_version`.

**The handshake.** `GET /api/bootstrap` returns `api_version` (the server's level) and
`min_client_level`.

- **Client too old** (below `min_client_level`): the app checks EAS Update right away. If
  an update for its runtime meets the level, it downloads it and reloads behind a short
  "Updating…" screen. That makes the fix an OTA update, with no store visit. Only when no
  such update exists, because the runtime is too old for the needed JS, does the app show
  "Update the app" with a store link.
- **Server too old** (an `api_version` below what the app supports, usually a self-hosted
  instance that hasn't been redeployed): "This server needs an update to work with this app
  version", with cached data still shown.
- **Otherwise**, updates are checked on launch and on return to the foreground, download in
  the background, and apply on the next cold start. All users get each update at once (no
  staged rollouts).

**Keeping the runtime stable, so OTA updates can fix almost everything:**

- **Native code up front.** The first store binary includes every Expo native module the
  plan uses (notifications, location, task manager, background task, camera, secure store,
  SQLite, MapLibre, Sentry, web browser, updates), even ones the JS doesn't use yet. The
  presence module (phase 8) and `expo-iap` (phase 9) are the planned native releases. Batch
  any other native change into one of those.
- **JS checks before calling native code.** Code that needs a module added in a later
  runtime checks whether it's there and hides the feature if it isn't. Then one JS codebase
  runs on every supported runtime, and `main` can always publish.
- **One update per supported runtime.** A JS fix is published to each runtime still in use.
  Normally that's one `eas update` from `main`. For an older runtime, it's published from that
  release's tag with the fix cherry-picked, which is rare as long as native releases are rare.

**Server rules that keep old clients working:**

- **Responses only grow.** New fields are optional, and response schemas allow unknown keys
  (see "The API contract").
- **Requests are forgiving.** A new request field is optional, with a server-side default.
  The server ignores fields it doesn't know (Zod's default stripping), so an old app's write
  never gets a `400` because the API grew.
- **Removal follows usage.** The server stays compatible with the newest OTA update of every
  runtime still in use. A field or route is removed only when `sessions.app_version` shows no
  active session on a client level that reads it. The usual way to break the API is: ship the
  JS that stops using the old shape, raise `min_client_level` so stragglers update over the
  air, wait until no sessions show the old level, then remove it.
- **Contract tests per supported level.** `packages/core/api/compat/` keeps a snapshot of
  the response schemas for each supported `CLIENT_API_LEVEL`. `test/worker-sql.test.mjs`
  checks every app route's real response against **every** snapshot, so a change that would
  break a phone in the field fails CI.

**Release practice:**

- **Ship the server and the JS together.** Duty limits and flight edits are calculated on
  the device from core, so the web and the app disagree if one ships without the other.
  Deploy the Worker, then publish the EAS Update the same day.
- **Local data is versioned:** the flight-store cache (see "Data and sync") and the presence
  queue each carry a format version, and an update that changes a format migrates or drops
  them.
- **Notifications:** unknown `type`s fall back to the home screen, and published deep-link
  paths stay valid (Decision 4).
- **A bad update:** `expo-updates` falls back to the previous update by itself if a new one
  crashes before its first screen renders. Otherwise, republish the previous update
  (`eas update:republish`), and everyone gets it on their next launch. Sentry tags every event
  with the update ID, so a bad update shows up quickly.

### Store review and privacy requirements

- **Review access:** App Review needs a working account. Run a `demo` tenant, seeded from
  the showcase sample data and kept moving by a scripted tracker. Put a pairing code in the
  review notes that doesn't expire and is limited to that tenant, plus a short screen
  recording of pairing. Use the same tenant for the Play review and the background-location
  declaration video.
- **Privacy policy** on dummthings.dev (required by both stores before the first
  submission). It covers what the instance stores, what the relay stores, what Sentry
  receives, the presence data rules (Decision 5), and account deletion.
- **App Store privacy labels** and the **Play Data Safety form**: precise location (presence
  features only, opt-in), identifiers (push token), crash data (Sentry), and nothing used for
  tracking. Update both when presence ships in phase 8.
- **Encryption export:** only standard HTTPS, so set `ITSAppUsesNonExemptEncryption` to
  `false` in `app.json`.

## Rollout and risk to the web dashboard

Phases 1, 2, 4, 6 and 8 change code the web dashboard runs, and the dashboard is what operators
use every day. The app can slip. The dashboard can't break. So:

- **Staging first, for each web-touching deploy.** It goes to staging
  (`wrangler deploy --env staging`, serving `seahawkair.staging.wingbeat.dummthings.dev`) and
  is used there for a few days, dashboard, analytics, duty log and PDF export, before prod.
  That's part of the done criteria for phases 1, 2, 4, 6 and 8.
- **Small deploys.** Phase 1 is a sequence of small deploys (see "How the web consumes it",
  step 4), each with the API route group that goes with it, never one big switch-over.
  Phase 4's auth middleware ships alone. A regression then points at one change, and
  reverting it is one deploy.
- **Failures surface at build time, not in the browser.** The core bundle is a Text module
  (a missing bundle fails the deploy). The security-headers test checks it's in the page
  with the nonce. The shipped bundle has a `node:vm` smoke test.
- **Changes that don't change behavior come first.** The web's schema parsing starts
  warn-only, request validation strips rather than rejects, the flight-store cache keeps its
  key and format, and the matcher starts `off`, then `shadow`.
- **Duty logic is compliance logic.** When `duty` moves to core (phase 1, last), the full
  `npm test` duty spec runs against the TypeScript and against the shipped bundle. The web
  duty-log render and PDF export on staging (Seahawk Air's real data) are compared before and after, because a
  drift there is a §135.267 bug, not a visual one.

## Phases

The order follows "Why this shape and this order": first the web work, which pays off without
the app; then a probe to prove passive matching, the one goal that needs native code; and the
app itself only once the probe passes.

**Before the gate (start now; phases 1–3 can run in parallel):**

0. **Accounts.** Create the Expo org and EAS project, and register the bundle ID on the
   individual Apple account (the probe's internal builds need both). Request the D-U-N-S
   number now, since it's free and slow. The App Store record, the Apple organization
   conversion and the Play organization account follow when they're needed (phase 7 and
   phase 9). None of it is urgent any more.
1. **Web refactor and core extraction (web only):**
   - **Foundation:** workspaces (`packages/core` only; `apps/mobile` keeps its own
     lockfile), the browser bundle as a Text module built by Wrangler's `[build] command`
     (here and in the hosting repo's generated config), the nonce test, the theme tokens.
   - **All non-UI client logic to core**, in the step order under "How the web consumes it":
     `time`, `flight-edits`, `flight-store`, `duty` (with the before/after duty-log, alert
     and PDF comparison on staging), `corrections` / `edit-history` / `filters`, `live` /
     `maintenance` / `alerts`, then `regions` (merged with `src/geo.ts`) / `accounting` /
     `analytics`. Tests for everything that had none.
   - **Every route the web calls** gets schemas, request validation, response-shape tests
     and the core client, route group by route group with the module that uses it. The web
     parses warn-only at first.
   - **The operator's timezone everywhere** (see "Times and the operator's timezone"): zone
     abbreviations on times, operator days for grouping, filters, alerts, maintenance and
     analytics, date and time inputs read in the operator's zone, the device-time scan test,
     and the Settings warning before changing the timezone once duty records exist.
   - Done when every step has been used on staging with no regressions, `npm test` passes
     (including the scan test), `docs:showcase --check` is clean, and the only harness test
     left is the PDF builder's. Worth doing even if the app never ships. Phases 2 and 3 don't
     wait for it.
2. **Web Push in the dashboard; retire Pushover** (Decision 4, step 1). `push_subscriptions`
   and `push_devices` (one migration), per-instance VAPID keys in `settings`, Web Push sending
   with WebCrypto (tested against the RFC 8291 vector), `/sw.js` and the web app manifest,
   Settings → Notifications for every user, delivery in `dispatchNotifications()` ahead of
   its no-webhooks early return and isolated from the webhook and Pushover sends. Move the
   operators you host off Pushover, then hide the Pushover target type. Staging first, on a
   desktop browser, Android Chrome, and an iPhone with the dashboard on its Home Screen.
3. **Beacon probe** (Decision 5, "Before building it: the beacon probe"). The presence module
   in a minimal internal build, iBeacons in two or three aircraft, two or three weeks of real
   flying, and the analysis script. **Ends in the go/no-go decision.** No server change.

**The gate.** Phases 4–8 start only if the probe passes. If it doesn't, stop there: phases 1
and 2 have already delivered the code-quality and Pushover wins. Then decide whether an app
without passive matching is still worth it, or whether a better mobile web dashboard (it
already has a manifest and Web Push from phase 2) covers the rest.

**After a go:**

4. **API for the app:** bearer sessions with `401` responses (the middleware in its own
   deploy first), `/api/app/pair`, schemas for the app-only routes and their response-shape
   tests, the first compat snapshot (of every route the app calls), `api_version` / `min_client_level` in
   bootstrap, the `X-Wingbeat-App` header and `sessions.app_version` (one migration),
   `DELETE /api/me` (with the web button). The web client's schema parsing goes strict once
   phase 1's warn-only releases have logged no mismatches, if it hasn't already.
5. **App shell:** Expo project in `apps/mobile` (around the probe's presence module) with
   every planned Expo native module installed up front (see "Versions and compatibility"),
   Sentry, the in-app QR scanner and pairing (hosted instances only), Live and Flights
   screens with MapLibre and the shared basemap catalog and a flight store per account, the
   version handshake with forced OTA updates, account deletion, Maestro flows, TestFlight and
   EAS internal distribution for Android. Set up the `demo` tenant and write the privacy
   policy here, since TestFlight external testing already goes through review.
6. **Duty log in the app:** the app's duty log on `@wingbeat/core/duty` (extracted in phase
   1), and the role-based first tab (`users.pilot_id`).
7. **App push and the first App Store release** (Decision 4, step 2): `EXPO_ACCESS_TOKEN` on
   hosted instances, `POST /api/me/push-devices`, Expo delivery and receipt checks next to Web
   Push, channels, categories, Time Sensitive gap alerts and deep links. First App Store
   release (iOS, individual account). Android goes to Play once the Play organization account
   exists; until then it stays on EAS internal distribution.
8. **Passive matching** (a planned native release): the presence module from the probe
   (CoreLocation on iOS, AltBeacon on Android), location fixes around beacons, the offline
   event queue and `POST /api/presence/events`, `trackers.current_*` and stamping from them
   (with the NULL-is-unchanged poller test), the matcher (the probe's rule functions,
   re-evaluated as evidence arrives, clearing on contrary evidence) behind the `auto_assign`
   setting (`off` by default, then weeks of `shadow` with `matcher_log` per hosted operator
   before `on`), beacon minors in aircraft settings, updated privacy labels and the Play
   background-location declaration. Fixed-pilot and fixed-aircraft trackers (beacons only)
   work before matching for trackers with neither (location, or beacons by elimination).

**When the first self-hoster asks:**

9. **Self-hosted support** (needs the Apple organization conversion and the Play account):
   the push relay (Decision 4, step 3) with the instance registry and hostname check, the OTA
   update that moves hosted devices onto it, the $10 non-consumable on both stores, `expo-iap`
   in the app (a native release), purchase verification and refund handling in the relay, the
   paywall when pairing with a self-hosted instance, Restore Purchases, Small Business Program
   enrollment.

**Later:**

10. Two pilots aboard and "Did you fly?" prompts, Live Activities (APNs from wherever the Expo
    token is held), self-hosted PMTiles basemaps, FAA sectionals and offline regions, an alerts
    screen in the app (`alerts` is in core from phase 1), and the web moving to MapLibre if it's worth it
    by then.

## Open questions

None. Answered (2026-11-02): self-hosted unlock is one-time, $10, per user. cud moving to
the LLC on conversion is fine. The app is AGPL. One beacon per aircraft is acceptable, so
passive matching starts with beacons. Bundle ID / package is `dev.dummthings.wingbeat`
(dummthings.dev is the LLC's domain). Purchases are verified in the relay, not RevenueCat.
Instances get their relay key self-serve from web Settings, with a hostname check. Account
deletion happens in the app (`DELETE /api/me`). Sentry handles crash reporting. The API
contract is Zod schemas in core rather than Hono RPC, chosen for run-time checks across
versions and for sharing with the web. Answered later the same day: the app keeps the web's
sync protocol. Matching is decided in the Worker from individual phone events, derives what
to fill in from the tracker's fixed assignment (no mode setting), decides at takeoff, and
sticks for later flights until evidence contradicts it. Updates are OTA-first, with no staged
rollouts and no feature flags in bootstrap. Two pilots aboard is out of scope for now.
Beacons are monitored as one region per aircraft (no fleet passes 19 aircraft), so the OS
reports per-aircraft enters and exits with no ranging. Beacons alone settle trackers with a
fixed pilot or aircraft. Trackers with neither need location, or elimination when only one
pilot-aircraft pair fits. There's no fixed decision time (this replaces "decides at takeoff"
above): the matcher re-evaluates a flight as evidence arrives, over the airborne time each
phone's evidence covers, and a phone that was monitoring and didn't see the assigned aircraft
counts as evidence against the assignment. Answered in the web-risk review (2026-11-02):
the core bundle is inlined as a Text module with the nonce (the CSP has no `'self'` for
scripts), `apps/mobile` isn't a root npm workspace, the web parses responses warn-only at
first, and the matcher ships behind a server-side `auto_assign` setting (`off` / `shadow` /
`on`), which is separate from the ruled-out bootstrap feature flags. Answered in the
restructuring (2026-11-02): Web Push in the dashboard replaces Pushover before the app
exists. A beacon probe proves passive matching before the app is built, and the app's phases
start only if it passes. Hosted instances call Expo directly. The push relay and the
self-hosted purchase wait for the first self-hoster, and until then the app pairs only with
hosted instances. Phase 1 is a general web refactor: all non-UI client logic moves to core,
not only what the app needs, and every route the web calls gets schemas. Times are always
shown in the operator's timezone with its abbreviation, whatever the device's zone. Instants
stay stored as UTC epochs, and duty records stay local dates and wall-clock times on
purpose.
