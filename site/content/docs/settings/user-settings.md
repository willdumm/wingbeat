---
title: User Settings
description: "Settings any signed-in Wingbeat user can change: theme, map layers, data, and their devices."
weight: 1
---

# User Settings

Available to any signed-in user, Viewer or Admin.

## Appearance

**Theme** — Light, Dark, or System. Stored in `localStorage`; per device, not
synced across a user's sessions.

## Map layers

Which basemaps are enabled, the active basemap choice, and per-layer color
correction (saturation/contrast/brightness). Also where a custom tile URL can
be added. Stored per device — see [Map Tools](../features/map-tools).

## Data

**Clear local cache** — wipes the local flight-data cache and re-downloads
everything from the server. Wingbeat keeps a full local copy of flight data
for speed; this is the escape hatch if that local copy ever looks wrong or
stale.

## My Devices

Manage sessions on your own account: rename a device, revoke another
device's session, sign out the current device, or generate a link to add
another device to your account. See
[Users & Devices](../features/users-and-devices).

## Viewing fleet lists

The Aircraft, Pilots, and Trackers lists are visible to every user (so
Viewers can see what's assigned to what), but only Admins get the add/edit
controls — see [Admin Settings](../admin-settings).
