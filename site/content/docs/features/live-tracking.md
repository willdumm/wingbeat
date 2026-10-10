---
title: Live Tracking
description: "Live positions, aircraft status cards, the flight list, day view, and bulk flight editing on the Wingbeat dashboard."
weight: 1
---

# Live Tracking

The dashboard shows every active tracker's current position on a Leaflet map,
with a plane marker per tracker and a status card per aircraft along the top
of the page.

## Polling

Wingbeat polls each tracker's Garmin MapShare feed on a Cron Trigger that runs
every minute, throttled per-tracker to roughly Garmin's own ~2-minute
transmission rate. The dashboard also polls in the browser while it's open, so
position updates arrive without a manual refresh. A manual **Refresh** button
is available too (throttled to once per 30 seconds).

Because polling runs on a schedule independent of anyone having the dashboard
open, takeoff/landing/gap notifications (see [Notifications](../notifications))
still fire when no one is watching.

## Aircraft status bar

Each active, non-deleted tracker gets a card showing:

- Tail number (or tracker name, if unassigned)
- **In Flight** / **On Ground**
- GPS freshness ("3m ago")
- Current location label, when available

Cards lay themselves out to avoid truncating text — single-line, two-line, or
stacked, depending on how many cards fit the screen width. When even the
narrowest layout doesn't fit, cards become a horizontally scrolling ticker.
Tapping a card opens the location popup for that tracker (coordinates, a
Google Maps link, and — if you're near a landmark — a "X km NW of Y" label
resolved from the region's named points).

## Flight list and filters

The sidebar lists flights, most recent first, filterable by date range,
tracker, aircraft, and pilot. Filter state persists locally per device.

## Day view

Clicking a date shows every flight from that day simultaneously, with
numbered stop markers. When more than one tracker is present, each tracker
gets its own color and its own stop numbering (restarting at 1), plus a map
legend.

## Hover and point picker

Hovering (or tapping, on touch devices) a flight track shows a tooltip with
that point's speed, altitude, and time. The **map pin** tool lets you click
anywhere on the map to read off coordinates and a Google Maps link, snapping
to a nearby flight point when you click close to one.

## Bulk flight editing

Admins can bulk-reassign aircraft and/or pilot across many flights at once —
filter by date/aircraft/pilot, select flights, apply one assignment to all of
them. Useful for backfilling assignment history after adding aircraft/pilot
tracking to a tenant that already has flight data.
