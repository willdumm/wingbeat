---
title: Pilot Duty Log
description: "The per-pilot monthly flight and duty log: corrections, duty and rest days, §135.267 totals, and PDF export."
weight: 4
---

# Pilot Duty Log

Per-pilot flight and duty log, opened from a pilot's entry in Settings. Shows
one month at a time, navigable with prev/next. It's built from the pilot's
tracked flights, and admins can correct it before it's exported as a record.

## Table

One row per flight that month: date, duty, aircraft, origin, departure time,
destination, arrival time, flight time, and a "91" mark for flights flown
under Part 91. Each day with flights gets a day-total row; the month gets a
total at the bottom.

The Duty column shows the day's duty period (e.g. 08:00–17:00), or "Rest ·
designated Oct 3" for a rest day, with the date it was marked. A day with no
flights and nothing recorded shows "—".

## Editing

Admins can edit the log; other users see it read-only.

- **Flights:** the pencil on a flight row edits its departure and arrival
  times, origin and destination, and whether it was flown under Part 135 or
  Part 91. These corrections apply only to the duty log. The tracked flight is
  unchanged, and a corrected value is marked † with the tracker's value on
  hover. Changing the aircraft or pilot changes the tracked flight itself,
  everywhere it's shown. **Remove from log** hides a flight from the duty log,
  and **Revert to tracker** drops a flight's corrections.
- **Add flight** in the toolbar enters a flight the tracker missed, or
  commercial flying done elsewhere. It's shown with a "Manual" tag.
- **Days:** click a date to enter that day's duty start and end, or mark it a
  rest day, plus a note. A rest day records when it was designated, since rest
  has to be assigned in advance.

If a history import changes when a tracked flight starts, its corrections no
longer match the flight. The log then shows them as "Not found" on that day,
leaves them out of the totals, and shows the flight as tracked, so it can be
corrected again and the old corrections deleted.

## Warnings and totals

The log checks each day against the one-pilot limits of
[14 CFR §135.267](https://www.law.cornell.edu/cfr/text/14/135.267) and shows a
warning under the day, without blocking anything:

- more than 8 hours of flight time in the 24 hours before any of the day's
  flights (Part 91 flights left out)
- a duty period over 14 hours, or less than 10 hours' rest since the previous
  day's duty
- flights on a rest day, a rest day designated on or after the day itself, or
  a rest day after a duty that ran past midnight (so it's under 24 hours)

The totals panel shows flight time this calendar quarter (limit 500 hours),
this and the previous quarter (800), and the calendar year (1,400), including
Part 91 flights, and the quarter's 24-hour rest periods (13 required), counted
as rest days with no flights. Totals are as of now for the current month and
as of the month's end for a past one.

## Export

**Export PDF** renders the month (table, warnings and totals) as a PDF,
generated in the browser via Typst. Corrected values are marked † with
numbered footnotes giving the tracker's values, manual flights are marked ‡,
and the footer says when the PDF was generated.
