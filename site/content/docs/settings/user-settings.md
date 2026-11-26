---
title: User Settings
description: "Settings any signed-in Wingbeat user can change: theme, map colors, storage, their account, and flight export."
weight: 1
---

# User Settings

The pages any signed-in user has, Viewer or Admin. **Documentation**, at the
foot of the sidebar, links to these docs.

## This browser

### Appearance

**Theme**: Light, Dark, or System. **Map colors**: per-basemap color correction
(saturation/contrast/brightness); click a basemap to show its sliders. Which
basemaps there are is set by an Admin. Both are stored on this device only and
not synced across a user's sessions. See [Map Tools](../../features/map-tools).

### Storage

**Clear local cache**: wipes the local flight-data cache and re-downloads
everything from the server. Wingbeat keeps a full local copy of flight data
for speed; this is the escape hatch if that local copy ever looks wrong or
stale.

## Your account

### Account

Manage sessions on your own account: rename a device, revoke another
device's session, sign out the current device, or get a link to add
another device to your account. Add or remove the email addresses you sign in
with, or delete your account. See
[Users & Devices](../../features/users-and-devices).

## The instance

### Aircraft, Pilots and Trackers

Visible to every user, so Viewers can see what's assigned to what. Click an
aircraft for its details, or a pilot for their duty log. Only Admins get the
add and edit controls; see [Admin Settings](../admin-settings).

### Export flights

Downloads flights as a CSV or JSON file, one row per flight, optionally limited
to a date range. Each row has the start and end times (in UTC and in the
operator's timezone), the duration, the pilot, aircraft and tracker, the start
and end places (names and coordinates, and the GPS elevation in feet and speed
in knots there), the Part 91 and unpaid flags, and the remark. Flights appear
as they do in the flight list, with corrections applied and removed flights
left out; a flight still in the air isn't included. Tracks aren't exported.
