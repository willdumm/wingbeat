---
title: Maintenance Tracking
description: "Hobbs and tach timers, maintenance schedules, and due alerts for each aircraft."
weight: 3
---

# Maintenance Tracking

Each aircraft has an **Aircraft Info** card (open it from an aircraft's entry
in Settings) showing Hobbs/tach timers and a maintenance schedule.

## Hobbs and tach timers

Rather than requiring someone to update a timer reading constantly, Wingbeat
stores one recorded value + timestamp per timer and estimates the current
reading using flight time logged since, scaled by a per-aircraft correction
factor (defaults to 1.0 — set it if the timer runs faster or slower than
wall-clock flight time).

## Maintenance schedule

Each item is due on one of:

- **Hobbs hours** — an interval added to the last-done Hobbs value
- **Tach hours** — same, on the tach value
- **Calendar** — a fixed due date

Items show as upcoming, due soon (within ~10% of the interval), or overdue.

## Alerts feed

The dashboard's alerts feed surfaces, across the whole fleet:

- Flights in the last 30 days missing an aircraft and/or pilot assignment
- Maintenance items due soon or overdue, for active aircraft only

Alerts link directly to the flight or aircraft they concern.
