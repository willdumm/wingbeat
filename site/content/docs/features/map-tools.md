---
title: Map Tools
description: "Basemaps, overlays, the elevation tool, and regions and named points on Wingbeat's maps."
weight: 7
---

# Map Tools

## Basemaps

The map's base layers, switchable from the map layer controls (bottom of the map).
Which basemaps there are, and which of them appear in that switcher, is tenant
configuration: an Admin adds, edits, hides, reorders and deletes them under
Settings → Admin → Global Settings → Basemaps, the same way as overlays. A new
Wingbeat instance starts with one, USGS Topo (public domain). An Admin can add
any raster tile source whose terms they're entitled to use, by its
`{z}/{x}/{y}` URL.

The mobile app can also draw a **vector** basemap (a PMTiles archive, for
instance an OpenStreetMap extract from Protomaps). The web's maps are raster
only, so they leave those out.

The basemap you've picked, and per-basemap color correction
(saturation/contrast/brightness), are stored **locally per device**, not synced
to the server — picking a style is a personal preference, not a tenant setting.

## Overlays

Tenant-configured extra tile layers shown on top of the basemap — a sectional
chart, custom imagery, or any other `{z}/{x}/{y}` tile source — added by an
Admin from Settings → Admin → Global Settings → Overlays. Unlike basemaps,
which are mutually exclusive, overlays are independently
toggleable: any number can be on at once, and everyone sees the same list.

An overlay's starting on/off state is set by an Admin, and can optionally
differ by basemap (e.g. on by default over Topo, off over Satellite) via a
per-basemap override, falling back to a general default for any basemap not
explicitly set. Toggling an overlay yourself overrides that default on your
device, via the overlay legend — the layered-squares button in the map
controls bar, present on every map (dashboard, analytics, and the Regions and
Named Points editors) once at least one overlay is configured. Your override
applies only to the basemap you made it on; switching basemaps resets
overlays back to that basemap's default.

## Elevation tool

A toggleable overlay that tints the map relative to a reference elevation you
set by clicking the map, plus a cursor elevation readout. Backed by a public
terrain tile archive (Mapterhorn, credited under the map's (i) button while the tool is on), decoded
client-side — no separate elevation API calls.
Mutually exclusive with the point picker (activating one deactivates the
other).

## Regions & Named Points

Both are admin-managed, tenant-wide GeoJSON data sets edited from Settings →
Admin → Global Settings, either by importing/exporting a `.geojson` file or
using the built-in map editor.

**Regions** — polygons used to group flights geographically for
[Analytics](../analytics). Each feature needs a `Name` property. Importing
replaces all existing regions. End a name with `(Base)` (e.g. `Kodiak (Base)`)
to make that region a home base: analytics leaves out time spent flying to and
from it (see [Accounting table](../analytics#accounting-table)). The marker isn't
shown outside the regions editor.

**Named points** — point landmarks used to label the live position ("12 km NW
of Kodiak") and to skip a slower external geocoding lookup when a point falls
within a named point's radius (`maxKm`, defaulting to 10 km). Each feature
needs a `name` property and an optional `maxKm`. Importing replaces all
existing named points.
