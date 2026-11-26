---
title: Admin Settings
description: "Admin-only Wingbeat settings: the setup checklist, fleet management, users, and the instance-wide pages."
weight: 2
---

# Admin Settings

{{% compliance %}}
Which §135.267 method the duty log checks is for the operator to choose.
{{% /compliance %}}

Only visible to users with the Admin role. The admin-only pages sit among the
instance's other pages in the Settings sidebar (Viewers don't see them), and
Admins get the add and edit controls on the Aircraft, Pilots and Trackers
pages.

## Get started

On a new instance, Settings opens with a **Get started** checklist: basics,
aircraft and pilots, trackers, then the optional steps (regions and named
points, history import, invites, notifications), each linking to the page
that does it. It hides itself once the required steps are done, or with
**Hide checklist**, and General → **Setup checklist** brings it back.

## Fleet management

On the Aircraft, Pilots and Trackers pages, Admins get add and edit controls
(Viewers see the lists read-only); each entry's actions are in its **⋯** menu:

- **Aircraft** — add, edit, or deactivate. See
  [Fleet Management](../../features/fleet-management) and
  [Maintenance Tracking](../../features/maintenance-tracking) for what an
  aircraft entry carries.
- **Pilots** — add, edit, or deactivate. Never hard-deleted.
- **Trackers** — add, edit, pause, soft-delete, or import history (**Import
  history…**). See
  [Fleet Management](../../features/fleet-management#trackers) for how to get a
  MapShare URL.

## Users

Invite new users (name + role, and an email address to send the invite to), link a user
to the pilot they are (**Designate pilot**), add and remove a user's email addresses
(**Email addresses**), and manage
existing accounts. See
[Users & Devices](../../features/users-and-devices).

## Instance-wide pages

The pages that configure the whole instance:

### General

| Setting | Description |
|---|---|
| Instance name | Shown in the page title and header, and at the top of the app's Flights and Duty tabs |
| Timezone | Used for all displayed times and the pilot duty log's day boundaries |
| Map default lat/lng/zoom | Where the map opens when there's no other context. **Set from map** lets you pan and zoom to it instead of typing coordinates |
| Gap alert (minutes) | Silence threshold before an in-flight signal-gap notification fires |
| Stop gap alerts after (minutes) | Silence after which the flight is treated as ended and repeating gap alerts stop (default 60) |

### Duty limits (§135.267)

Which of §135.267's two methods the
[pilot duty log](../../features/pilot-duty-log#limits-b-or-c) checks: **(b)**
flight time in any 24 hours (the default) or **(c)** a regularly assigned duty
period. The method is kept by date: pick it and its **Effective from** date
(today, by default) and **Save method**. Each day of the duty log is checked
with the method in force on it, so past months keep the method that was in
force then. The list above the form shows each change, newest first; the
earliest also covers the days before it. To fix a mistake, **Edit** the entry
(or **Remove** it) rather than adding another. Every change is recorded, and
the last one is shown ("Last changed by …").

### Notifications

The shared Pushover application token, plus the list of webhook/Pushover
notification targets. See [Notifications](../../features/notifications).

### Map content

Basemaps, overlays, regions and named points, on one page.

#### Basemaps

Add, edit, show or hide, reorder or delete the map's basemaps, for everyone. A
raster basemap needs a `{z}/{x}/{y}` tile URL; a vector one (mobile app only) an
`https` URL of a `.pmtiles` archive. Hidden basemaps stay configured. The map
always keeps at least one shown raster basemap. Add only sources you're entitled
to use: each provider sets its own terms for tiles and for credit.

#### Overlays

Add, edit or delete tenant tile overlays. Each overlay needs a `{z}/{x}/{y}`
tile URL, an on/off default, and optionally a per-basemap override of that
default. Everyone sees them in the map's overlay legend; see
[Map Tools](../../features/map-tools#overlays) for how overlays behave for
viewers.

#### Regions

Import/export or map-edit the regions GeoJSON used by
[Analytics](../../features/analytics)'s per-region breakdown.

#### Named Points

Import/export or map-edit the named-points GeoJSON used for live-position
labeling and local geocoding. See
[Map Tools](../../features/map-tools#regions--named-points).
