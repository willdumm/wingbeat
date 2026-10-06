---
title: Admin Settings
description: "Admin-only Wingbeat settings: the setup checklist, fleet management, overlays, users, and global settings."
weight: 2
---

# Admin Settings

Only visible to users with the Admin role. Split across the main Settings
panel and a separate **Global Settings** screen.

## Setup checklist

On a new instance, Settings opens with a **Get started** checklist: basics,
aircraft and pilots, trackers, then the optional steps (regions and named
points, history import, invites, notifications), each linking to the section
that does it. It hides itself once the required steps are done, or with
**Hide checklist**, and Settings → Admin → **Setup checklist** brings it back.

## Fleet management

In the main Settings panel, Admins get add/edit controls (Viewers see the
lists read-only):

- **Aircraft** — add, edit, or deactivate. See
  [Fleet Management](../features/fleet-management) and
  [Maintenance Tracking](../features/maintenance-tracking) for what an
  aircraft entry carries.
- **Pilots** — add, edit, or deactivate. Never hard-deleted.
- **Trackers** — add, edit, pause, soft-delete, or import history. See
  [Fleet Management](../features/fleet-management#trackers) for how to get a
  MapShare URL.

## Overlays

In the main Settings panel, Admins get add/edit/delete controls for tenant
tile overlays (Viewers see the list read-only, same as Aircraft/Pilots
above). Each overlay needs a `{z}/{x}/{y}` tile URL, an on/off default, and
optionally a per-basemap override of that default. See
[Map Tools](../features/map-tools#overlays) for how overlays behave for
viewers.

## Users

Invite new users (name + role) and manage existing accounts. See
[Users & Devices](../features/users-and-devices).

## Global Settings

A dedicated screen (Settings → Admin → Global Settings) for tenant-wide
configuration:

### General

| Setting | Description |
|---|---|
| App name | Shown in the page title and header |
| Timezone | Used for all displayed times and the pilot duty log's day boundaries |
| Map default lat/lng/zoom | Where the map opens when there's no other context. **Set from map** lets you pan and zoom to it instead of typing coordinates |
| Gap alert (minutes) | Silence threshold before an in-flight signal-gap notification fires |

### Notifications

The shared Pushover application token, plus the list of webhook/Pushover
notification targets. See [Notifications](../features/notifications).

### Regions

Import/export or map-edit the regions GeoJSON used by
[Analytics](../features/analytics)'s per-region breakdown.

### Named Points

Import/export or map-edit the named-points GeoJSON used for live-position
labeling and local geocoding. See
[Map Tools](../features/map-tools#regions--named-points).
