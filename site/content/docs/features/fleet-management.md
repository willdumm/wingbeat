---
title: Fleet Management
description: "How Wingbeat separates trackers, aircraft, and pilots, and how assignments change over time."
weight: 2
---

# Fleet Management

Wingbeat separates three things that are easy to conflate: the **tracker**
(the physical Garmin inReach device), the **aircraft** it's riding in, and the
**pilot** flying it. All three are managed from Settings, and any tracker's
aircraft/pilot assignment can change over time — a tracker isn't permanently
bolted to one plane.

Everyone can see the Aircraft, Pilots, and Trackers lists in Settings; only
admins can add, edit, pause, or remove entries. See
[Settings](../settings/) for the full admin/user split.

## Aircraft

Identified by tail number, with an optional display name. Each aircraft
carries:

- **Hobbs/tach timers** — a recorded value plus the timestamp it was recorded
  at. Wingbeat estimates the *current* reading between recordings using
  recent flight time and a correction factor, so the alerts feed and info
  card don't just show a stale number.
- **Maintenance schedule** — a list of items, each due either on a Hobbs/tach
  interval (hours since last done) or a calendar date. See
  [Maintenance Tracking](../maintenance-tracking).

## Pilots

Just a name and an active flag — pilots are never hard-deleted, so historical
flights keep a valid reference even after someone stops flying. See
[Pilot Duty Log](../pilot-duty-log) for what's tracked per pilot.

## Trackers

A tracker is a Garmin inReach device polling a MapShare feed. Currently
inReach/MapShare is the only supported tracker type; the poller is factored
so other tracker types could be added later without restructuring ingestion.

You supply the inReach and its Garmin subscription. Pick a plan that allows
2-minute tracking: on cheaper plans the device only reports every 10 minutes
or more. See [Trackers and AFF](../automated-flight-following/) for details, and for
why Wingbeat isn't an Automated Flight Following provider.

Add a tracker with:

- **Display name**
- **MapShare URL** — the feed's "Raw KML Data" link
- **Access code**, if the MapShare feed has one set
- Optional aircraft/pilot assignment at creation time (the form asks before
  adding a tracker without one, since its flights would be saved unassigned)

**Test feed** fetches the last 30 days of the feed without saving anything,
to check the URL and access code before adding the tracker.

![Add tracker dialog](/img/generated/settings/add-tracker-dialog.png)

A tracker can be **paused** (polling stops, history is kept) or
**soft-deleted** (hidden, never hard-deleted — historical flights keep their
tracker reference).

### Importing history

A new tracker starts with the last two days of its feed. To bring in older
flights, use **Import** on the tracker, pick a start date, and leave the form
open: it imports a month at a time, then labels the new flights' origins and
destinations (slowly, since the public place-lookup service is rate-limited).
Positions already stored are skipped, and an import never sends
notifications. Assign the tracker's aircraft and pilot first, since imported
flights take the tracker's current assignment.

### Getting the MapShare URL

1. On explore.garmin.com, open **MapShare** and confirm it's turned on.
   ![MapShare enabled](/img/mapshare-1.png)
2. Open **MapShare Settings** and note (or set) the **Access Code**. It can be
   left blank.
   ![MapShare settings](/img/mapshare-2.png)
3. Save, then open **Feeds** and copy the **Raw KML Data** link — it looks
   like `https://share.garmin.com/Feed/Share/<name>`.
   ![Raw KML feed link](/img/mapshare-3.png)
4. Paste that URL (and the access code, if any) into the "Add tracker" form.

Professional Garmin accounts or LiveTrack-only setups use a different feed —
see Garmin's own documentation for those.

## Flight assignment

Every point ingested from a tracker is stamped with that tracker's
*current* aircraft/pilot assignment at poll time. A flight's aircraft/pilot is
derived from the points that make it up, so:

- Reassigning a tracker only affects *future* points/flights — past flights
  keep the assignment that was active when they happened. The one exception:
  when you give a tracker an aircraft or pilot, Settings offers to fill it in
  on that tracker's existing flights that have none.
- An individual flight can also be manually reassigned after the fact (edit
  button on a flight), which patches both the flight record and its points —
  a resegmentation reproduces the same assignment.
