---
title: Analytics
description: "The Wingbeat analytics page: fleet-wide map views, stream graphs, and an accounting table, with the dashboard's filters."
weight: 5
---

# Analytics

A separate page (`/analytics`) for fleet-wide trends, sharing the same
filters (date range, tracker, aircraft, pilot) as the dashboard.

## Map view

All filtered flight tracks plotted together, with the same basemap/layer
controls as the dashboard (see [Map Tools](map-tools)).

## Stream graph

Flight time broken down by region over time, as a stacked stream graph.
Toggle between:

- **Time** or **stops** mode
- **Absolute** hours or **normalized** (percentage) view
- Interval: auto, day, week, or month buckets
- Show/hide home bases (in stops mode)

Region colors are assigned per region name and stay stable regardless of sort
order or the active date filter.

## Accounting table

Flight hours totaled per region. A flight's time is attributed to whichever
region(s) it touches: if both endpoints are at a home base the flight is
excluded; if one endpoint is at a home base, all its hours go to the other
region; otherwise its hours are split evenly between both endpoints' regions.
Regions are matched by point-in-polygon lookup against the regions data (see
[Regions & Named Points](map-tools#regions--named-points)). A home base is any
region whose name ends in `(Base)`; home bases win over any region they overlap,
and their stops are listed separately. With no home base, every flight's hours
are split between its start and end regions.

An overall-totals row sums across all regions for the current filter.
