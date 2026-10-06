---
title: Pilot Duty Log
description: "The per-pilot monthly flight log: the flight table, rolling totals, and PDF export."
weight: 4
---

# Pilot Duty Log

Per-pilot flight log, opened from a pilot's entry in Settings. Shows one
month at a time, navigable with prev/next.

## Table

One row per flight that month: date, aircraft, origin, departure time,
destination, arrival time, and block time (derived from the flight's
recorded start/end). Days with no flights show as a "Rest" row. Each day with
flights gets a day-total row; the month gets a total at the bottom.

## Rolling totals

Alongside the month table, a totals panel shows block time over trailing
windows: last 24 hours, 7 days, 30 days, 90 days, and 12 months, plus a count
of rest days in the last 90 days.

## Export

**Export PDF** renders the currently viewed month (table + totals) as a PDF,
generated server-side via Typst.
