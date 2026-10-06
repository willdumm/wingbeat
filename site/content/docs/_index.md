---
title: Overview
description: "Wingbeat polls a Garmin inReach MapShare feed, segments the tracking data into flights, and shows flight history and live positions on a map."
weight: 1
---

# Wingbeat

Wingbeat polls a Garmin inReach MapShare feed, stores the tracking data, segments
it into flights, and shows flight history and live position on a map.

## Core concepts

- **Tracker** — a Garmin inReach device. Wingbeat polls it on a schedule.
- **Aircraft** — an airframe (tail number). Optional; a tracker can fly unassigned.
- **Pilot** — a person. Optional, same as aircraft.
- **Flight** — a contiguous period of airborne movement, segmented automatically
  from a tracker's raw GPS points. Every point that made up a flight remembers
  which aircraft and pilot were assigned to the tracker at the time, so
  historical flights stay correct even after trackers get reassigned.

A tracker, its assigned aircraft, and its assigned pilot can all change over
time — Wingbeat is built for a small fleet sharing a pool of trackers, not one
tracker permanently bolted to one plane.

## Sections

- **[Features](features/)** — what each part of the dashboard and analytics
  pages does.
- **[Settings](settings/)** — every setting, split into what any signed-in
  user can change and what's admin-only.
- **[Self-hosting](self-hosting/)** — deployment (stub).
