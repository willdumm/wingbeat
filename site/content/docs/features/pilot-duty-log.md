---
title: Pilot Duty Log
description: "The per-pilot monthly flight and duty log: duty and rest days, default duty, planning ahead, §135.267 totals, and PDF export."
weight: 4
---

# Pilot Duty Log

Per-pilot flight and duty log, opened with **Info** on a pilot's entry in
Settings. It shows one month at a time, through today in the current month;
use the arrows to move back through the pilot's history. It's built from the
pilot's flights, with any [corrections](../editing-flights) applied, and admins
can record duty times and plan rest days before it's exported as a record.

## Table

One row per flight that month: date, duty, aircraft, origin, departure time,
destination, arrival time and flight time. A flight with remarks gets a row
under it, e.g. "Remarks: Part 91 · Training": "Part 91" for a flight flown
under Part 91 (nothing is shown for Part 135), then the flight's remark. Most
flights have none. Each day with flights gets a day-total row; the month gets a
total at the bottom.

The Duty column shows the day's duty period (e.g. 08:00–17:00), "08:00–17:00
(default)" for a flying day that uses the pilot's [default duty](#default-duty),
or "Rest · designated Oct 3" for a rest day, with the date it was marked. A day
with no flights and nothing recorded shows "—".

## Editing

Admins can edit the log; other users see it read-only.

- **Flights:** the pencil on a flight row opens the flight form: times,
  origin and destination, aircraft, pilot, Part 135 or Part 91, and a remark.
  **Edit flights** in the toolbar opens the flight editor filtered to this
  pilot and month, to change several flights at once or add one the tracker
  missed. Corrections show everywhere the flight appears, not just here; a
  corrected value is marked † with the tracker's value on hover. See
  [Editing Flights](../editing-flights).
- **Duty and rest days:** see the next section.

## Duty times and rest days

Each day can hold a duty period or a rest designation, plus an optional note.
Open the day form in either of two ways:

- click a date in the table (each date has a calendar icon), or
- use **Plan duty or rest** in the toolbar. The form starts on tomorrow, since
  rest is usually planned ahead, and takes any date.

A day with nothing recorded starts with the pilot's default duty times filled
in.

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

### Planning duty and rest ahead

FAA interpretations of the rest rules require rest to be assigned in advance,
so mark rest days before they happen. Choose **Plan duty or rest**, pick the
date (and a **Through** date for several days), choose **Rest day** and save.

The current month's **Upcoming** panel, above the totals, lists everything
planned after today in date order: the date, "Rest · designated Oct 13" or the
duty times, and the note. The pencil on an entry opens it in the day form. The
totals panel counts planned rest days toward the quarter's 13 rest periods as
"planned" until the day has passed, e.g. "4 + 3 planned / 13", including ones
later in the quarter. A rest day saved on or after the day it falls on gets a
warning, because it wasn't designated in advance.

### Default duty

Most pilots keep the same hours, so each pilot can have a default duty period.
Admins set it from the "Default duty 08:00–17:00 · Change" line in the duty
log's header, or with **Edit** on the pilot in Settings.

The default applies to a day with flights and no duty times or rest recorded.
That day's Duty column shows the default marked "(default)", on screen and in
the PDF, and the 14-hour and 10-hour-rest checks use it. A day with a record
always uses the record. If a flight departs before or lands after the day's
duty period, recorded or default, the day gets a warning, e.g. "Flight
18:05–18:50 outside duty 08:00–17:00 (default)"; record the actual duty times
for that day.

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
- a flight that departs before or arrives after the day's duty period

The totals panel shows flight time this calendar quarter (limit 500 hours),
this and the previous quarter (800), and the calendar year (1,400), including
Part 91 flights, and the quarter's 24-hour rest periods (13 required), counted
as rest days with no flights. Rest days that haven't happened yet are shown
separately as planned, and the rest row turns red once the quarter can no
longer reach 13 even if every remaining day were rest. Totals are as of now for
the current month, and as of the month's end for a past one,
so a past month's PDF comes out the same whenever it's exported.

## Export

**Export PDF** renders the month (table, remarks rows, warnings and totals) as
a PDF, generated in the browser via Typst. Corrected values are marked † with
numbered footnotes giving the tracker's values, manual flights are marked ‡,
default duty times are marked "(default)", and the footer says when the PDF was
generated.
