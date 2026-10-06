<img src="logo.svg" alt="Wingbeat Flight Tracker" width="240">

# Wingbeat Flight Tracker

A self-hostable Cloudflare Worker that polls a Garmin InReach MapShare feed, stores tracking data in D1, automatically segments it into flights, and serves an authenticated web dashboard showing flight history on a map.

## Overview

The tracker continuously polls a Garmin InReach MapShare KML feed (via a per-minute Cron Trigger, throttled per-tracker to Garmin's ~2-minute transmission rate), ingests points into a D1 database, segments them into flights, reverse-geocodes origin/destination labels via Overpass, and serves a Leaflet.js dashboard. All branding, map defaults, and timezone are configurable from the admin settings UI — no code changes needed. Admins can register webhook or Pushover notification targets to get notified of takeoffs, landings, and in-flight signal gaps — see [Notifications](#notifications) below.

---

## Architecture

**Runtime:** Cloudflare Worker (TypeScript, Hono framework)  
**Database:** Cloudflare D1 (managed SQLite)  
**Frontend:** Inline HTML + vanilla JS + Leaflet.js (no build step, TypeScript bundled via esbuild)  
**Deployment:** `wrangler deploy`

---

## Setup

```bash
git clone https://github.com/willdumm/wingbeat.git
cd wingbeat
npm ci
```

### 1. Create a D1 database

```bash
wrangler d1 create flight-tracker-db
```

Copy `wrangler.example.toml` to `wrangler.toml` (it's gitignored) and fill in the `database_name` and `database_id` from that output.

### 2. Apply migrations

```bash
wrangler d1 migrations apply YOUR_DATABASE_NAME
```

`0001_initial.sql` creates the full schema and seeds generic settings (app name, UTC timezone, a world map view). There are no trackers, aircraft, named points or regions until you add them in the app. See [Database migrations](#database-migrations) before adding a new one.

### 3. Configure environment variables

Copy `.dev.vars.example` to `.dev.vars` for local dev. In production, set secrets via:

```bash
wrangler secret put POLLER_SECRET
wrangler secret put CARTO_API_KEY  # optional, see below
```

| Variable | Required | Description |
|---|---|---|
| `POLLER_SECRET` | yes | Bearer token required for `/api/admin/*` routes and poller endpoints |
| `CUSTOMER_ROUTING` | yes | JSON map of `hostname → D1 binding name`, e.g. `'{"your-domain.com": "DB"}'`; hostname only, no port — must be set even for single-customer deployments |
| `CARTO_API_KEY` | no | API key for the "Map" basemap (Carto Voyager tiles), proxied through `/api/tiles/map/...` so the key never reaches the browser. Shared by every tenant on this deployment — it's a hoster fact, not per-tenant data. If unset, "Map" simply doesn't appear in the basemap switcher; other basemaps (Topo, USGS, Satellite) are unaffected. If the key has a referrer allowlist, include your deployment's domains: the proxy sends the requesting site as `Referer`. |

### 4. Deploy

```bash
npm run deploy
```

The docs site and its showcase home page (`site/`) are a separate Worker with their own
deploy; see [`site/README.md`](site/README.md#deploying).

### 5. Create the first admin

A fresh deployment has an empty `users` table. Generate a one-time admin invite link with the bootstrap endpoint (authenticated by `POLLER_SECRET`):

```bash
curl -X POST https://your-domain.com/api/admin/bootstrap \
  -H "Authorization: Bearer $POLLER_SECRET"
```

This returns a `/join/<token>` URL (valid for 24 hours). Open it in a browser to create the first admin account and sign in. Further users are added from Settings → Users via invite links.

### 6. Configure app settings

After logging in as admin, open Settings → App Settings to configure:
- App name, timezone, and map default view
- Gap alert threshold (minutes), Pushover API token, and notification targets — see [Notifications](#notifications)

---

## Authentication

Dashboard and API routes (except `/location`, `/login`) require a session. Sessions are random opaque tokens stored server-side in D1 and delivered as HTTP-only cookies. Admin invite links allow adding viewers and admins. Admins can manage trackers, aircraft, pilots, users, and app settings.

The `/location` endpoint remains unauthenticated for backward compatibility with external integrations.

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/` | session | Dashboard HTML |
| `GET` | `/analytics` | session | Analytics HTML |
| `GET` | `/login` | — | "No access" page (accounts are invite-only) |
| `POST` | `/logout` | session | Clear session |
| `GET` | `/join/:token` | — | Accept invite / device link, set session cookie |
| `GET` | `/location` | — | Current coordinates as XML (backward compat) |
| `GET` | `/api/flights` | session | Paginated flight list |
| `GET` | `/api/flights/:id/points` | session | Flight track as GeoJSON |
| `GET` | `/api/trackers` | session | Tracker list |
| `GET` | `/api/aircraft` | session | Aircraft list |
| `GET` | `/api/pilots` | session | Pilot list |
| `GET` | `/api/named-points` | session | Named points as GeoJSON |
| `GET` | `/api/regions` | session | Regions as GeoJSON |
| `GET` | `/api/settings` | admin | App settings (includes `gap_alert_minutes`, `pushover_api_token`) |
| `PATCH` | `/api/settings` | admin | Update app settings |
| `GET` | `/api/webhooks` | admin | List notification targets (webhook + Pushover) |
| `POST` | `/api/webhooks` | admin | Create a target: `type` (`webhook`/`pushover`), `url` or `pushover_user_key`, optional `label`/`events` |
| `PUT` | `/api/webhooks/:id` | admin | Update a target's `type`/`url`/`pushover_user_key`/`label`/`events`/`active` |
| `DELETE` | `/api/webhooks/:id` | admin | Remove a target |
| `POST` | `/api/refresh` | session | Manual poll (30-second throttle) |
| `POST` | `/api/trackers/test-feed` | admin | Fetch a feed's last 30 days without storing it |
| `POST` | `/api/trackers/:id/import` | admin | Import history `?d1=…&d2=…` (no notifications) |
| `POST` | `/api/trackers/:id/geocode` | admin | Label up to 12 flight origins/destinations; returns how many are left |
| `GET` | `/api/trackers/:id/unassigned` | admin | Count the tracker's flights without aircraft/pilot |
| `POST` | `/api/trackers/:id/apply-assignment` | admin | Apply the tracker's aircraft/pilot to those flights |
| `POST` | `/api/admin/bootstrap` | admin | Generate a first-admin invite link (fresh deployments) |
| `POST` | `/api/admin/resegment` | admin | Wipe derived tables and re-run segmentation |
| `POST` | `/api/admin/poll` | admin | Force immediate poll; `?geocode=1` also geocodes |
| `POST` | `/api/admin/backfill` | admin | Pull Garmin data from `?d1=YYYY-MM-DD` forward (optional `&d2=` end date; import long histories in windows) |
| `POST` | `/api/admin/geocode-pending` | admin | Backfill geocoding for unlabeled boundary points |
| `POST` | `/api/admin/geocode-live` | admin | Geocode the current live point immediately |

Admin routes require `Authorization: Bearer <POLLER_SECRET>`.

---

## Tracker Support

Currently supports **Garmin inReach** trackers via the MapShare KML polling interface. The poller (`src/poller.ts`) is factored so additional tracker types can be added without restructuring the ingestion pipeline — each tracker type would implement the same fetch-and-ingest contract.

---

## Notifications

Admins can register notification targets (Settings → Global Settings → Notifications) to get
notified whenever a tracker:

- **takes off** — velocity crosses above the flight speed threshold (~20 kt)
- **lands** — velocity drops back below it
- **loses signal in flight** — more than `gap_alert_minutes` (default 5) pass between two
  location updates while airborne

Two target types, both configurable from the same list:

- **Webhook** — a generic JSON POST to any URL. Services that accept a simple JSON POST directly
  (e.g. [ntfy](https://ntfy.sh)) can be used as-is; others need a small relay in between. Body:
  ```json
  { "type": "takeoff", "tracker_id": 1, "tracker_name": "Cessna 206 InReach", "time": 1753600000, "lat": 57.79, "lon": -152.41, "title": "Cessna 206 InReach took off", "message": "Takeoff detected at 2025-07-27T12:00:00.000Z near 57.790, -152.410." }
  ```
  (`gap` events additionally include `"gap_minutes"`.)
- **Pushover** — delivered natively via [Pushover](https://pushover.net)'s own API. Register one
  free Application at `pushover.net/apps/build` and paste its token into the "Pushover API token"
  field once (shared across all Pushover targets for this instance); each individual target then
  just needs that person's Pushover user key.

Both types share the same detection pipeline and message formatting (`src/poller.ts`,
`src/notifications.ts`); the user-facing docs are in
[`site/content/docs/features/notifications.md`](site/content/docs/features/notifications.md).

This relies on the Worker's Cron Trigger running every minute (`* * * * *` in `wrangler.toml`)
so events are detected even when no one has the dashboard open — see the Architecture note above.

---

## Database migrations

`migrations/0001_initial.sql` creates the full schema. Schema changes go in new, sequentially
numbered files (`0002_…`, `0003_…`); never edit a migration that has shipped, since existing
databases have already recorded it as applied. Tenant-specific data (trackers, named points,
regions) doesn't belong in migrations; it's added through the app.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE)
(AGPL-3.0). A [commercial license](COMMERCIAL_LICENSE.md) is available for
organizations that don't want the AGPL's network-copyleft obligations —
most commonly, anyone running this as a **managed/paid hosting service** for
other customers.

The docs site's prose (`site/content/`) and its photos and app screenshots
(`site/static/showcase/*.jpg`, `site/static/img/generated/`) are licensed separately under
[Creative Commons Attribution 4.0 International](LICENSE-docs) (CC-BY-4.0). That excludes
the Wingbeat logos, which identify the project, and the MapShare setup screenshots
(`site/static/img/mapshare-*.png`), which show Garmin's website. The code around the docs,
including `site/layouts/` and `site/scripts/`, stays under the AGPL.

### Do I need a commercial license?

You do **not** need one to:

- Self-host this for personal, family, club, or internal-only use,
  non-commercially.
- Self-host this commercially *and* comply with the AGPL — i.e. you publish
  the source of your running version, including any modifications, to your
  users (AGPL-3.0 §13).
- Contribute to, fork, or experiment with the code.

You likely **do** need one to:

- Run this as a paid managed-hosting service for third-party customers
  without publishing your operator-layer source.
- Embed it in a closed-source commercial product.
- Self-host it commercially without complying with the AGPL's
  source-disclosure requirement.

If you're unsure which bucket you're in, see
[`COMMERCIAL_LICENSE.md`](COMMERCIAL_LICENSE.md) or contact
**wrhdumm@gmail.com**.

### Contributing

Contributions are welcome. This project uses a
[Contributor License Agreement](CLA.md) — CI will prompt you to sign it on
your first pull request. Signing grants the maintainer the right to
distribute your contribution under both the AGPL and the commercial license
above, while you keep ownership of your own work.

---

## Project Structure

```
wingbeat/
├── src/
│   ├── index.ts                        # Worker entry point, Hono app, route wiring
│   ├── settings.ts                     # D1-backed settings cache
│   ├── poller.ts                       # Garmin feed fetch, KML parse, D1 ingestion, event detection
│   ├── segmentation.ts                 # Flight segmentation algorithm
│   ├── notifications.ts                # Webhook dispatch for takeoff/landing/gap events
│   ├── geocoding.ts                    # Overpass reverse-geocoding, location labels
│   ├── geo.ts                          # Haversine distance helpers
│   ├── auth.ts                         # Session cookie signing, login/join HTML
│   ├── types.ts                        # Shared TypeScript types
│   ├── dashboard.ts                    # Dashboard HTML shell
│   ├── analytics.ts                    # Analytics HTML shell
│   ├── dashboard/
│   │   ├── markup.ts
│   │   ├── styles.ts
│   │   └── scripts/
│   ├── analytics/
│   │   ├── markup.ts
│   │   ├── styles.ts
│   │   └── scripts/
│   └── shared/                         # Shared components (settings modal, flight store, …)
├── migrations/
│   └── 0001_initial.sql                # full schema; new migrations start at 0002_
├── site/                               # docs site (Hugo) + showcase; own Worker, see site/README.md
├── wrangler.example.toml               # template — copy to wrangler.toml (gitignored) and fill in
├── .dev.vars.example                   # copy to .dev.vars for local dev
├── package.json
└── tsconfig.json
```
