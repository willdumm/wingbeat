---
title: Pilot Duty Log
description: "The per-pilot monthly flight and duty log: corrections, duty and rest days, §135.267 totals, and PDF export."
weight: 4
---

# Pilot Duty Log

Per-pilot flight and duty log, opened with **Info** on a pilot's entry in
Settings. It shows one month at a time; use the arrows to move between months,
back through the pilot's history and up to a year ahead for planning. It's
built from the pilot's tracked flights, and admins can correct it, record duty
times and plan rest days before it's exported as a record.

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
- **Duty and rest days:** see the next section.

## Duty times and rest days

Each day can hold a duty period or a rest designation, plus an optional note.
Open the day form in either of two ways:

- click a date in the table (each date has a calendar icon), or
- use **Duty / rest** in the toolbar. In the current month the form starts on
  tomorrow, since rest is usually planned ahead; in other months it starts on
  the 1st.

In the form:

- **Duty**: enter the start and end times, e.g. 08:00–17:00. An end at or
  before the start is taken as past midnight, so 20:00–02:00 is a six-hour duty
  period.
- **Rest day**: marks the whole local calendar day as rest. The date and time
  you save it is recorded as when the rest was designated and shown in the
  table and on the PDF, e.g. "Rest · designated Oct 3". Changing a rest day's
  note later keeps the original designation date; switching the day back to
  duty and then to rest again records a new one.
- **Through (optional)**: applies the same duty times or rest to every day from
  the date through this one, up to 62 days at a time, e.g. a block of days off
  next month.
- **Clear** removes the duty times, rest designation and note from the day, or
  from every day in the range.

Times are in the timezone set in [Admin Settings](../../settings/admin-settings).

### Planning rest days ahead

FAA interpretations of the rest rules require rest to be assigned in advance,
so mark rest days before they happen. Go to the month with the next-month
arrow, or stay in the current month, choose **Duty / rest**, pick the date (and
a **Through** date for several days), choose **Rest day** and save.

Planned rest days appear in the table straight away. The totals panel counts
them toward the quarter's 13 rest periods as "planned" until the day has
passed, e.g. "4 + 3 planned / 13". A rest day saved on or after the day it
falls on gets a warning, because it wasn't designated in advance.

## Corrections that no longer match

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
as rest days with no flights. Rest days that haven't happened yet are shown
separately as planned, and the rest row turns red once the quarter can no
longer reach 13 even if every remaining day were rest. Totals are as of now for
the current month and future months, and as of the month's end for a past one,
so a past month's PDF comes out the same whenever it's exported.

## Export

**Export PDF** renders the month (table, warnings and totals) as a PDF,
generated in the browser via Typst. Corrected values are marked † with
numbered footnotes giving the tracker's values, manual flights are marked ‡,
and the footer says when the PDF was generated.
