---
title: Pilot Duty Log
description: "The per-pilot monthly flight and duty log: duty and rest days, default duty, planning ahead, §135.267 totals, and PDF export."
weight: 4
---

# Pilot Duty Log

Per-pilot flight and duty log, opened with **Duty log** on a pilot's entry in
Settings. It shows one month at a time, through today in the current month;
use the arrows to move back through the pilot's history. It's built from the
pilot's flights, with any [corrections](../editing-flights) applied, and admins
can record duty times and plan rest days before it's exported as a record.

{{% compliance %}}
The duty log is only a tool to make checking compliance easier: its checks are
an aid, they can be incomplete or wrong, and they depend entirely on the
flights, duty times and rest days entered. The log says this too.
{{% /compliance %}}

## Table

One row per flight that month: date, duty, aircraft, origin, departure time,
destination, arrival time and flight time. A flight with remarks gets a row
under it, e.g. "Remarks: Part 91 · Training": "Part 91" for a flight flown
under Part 91, or "Part 91 (unpaid)" for one [marked unpaid](#unpaid-flights)
(nothing is shown for Part 135), then the flight's remark. Most
flights have none. Each day with flights gets a day-total row; the month gets a
total at the bottom.

The Duty column shows the day's duty period (e.g. 08:00–17:00), "08:00–17:00
(default)" for a flying day that uses the pilot's [default duty](#default-duty),
or "Rest · designated Oct 3" for a rest day, with the date it was marked. A day
with no flights and nothing recorded shows "—".

### How flight time is measured

Flight time (14 CFR §1.1) runs from when the aircraft first moves under its own
power for the purpose of flight until it comes to rest after landing. A tracked
flight's times come from the tracker's position reports: it starts at the last
report below 20 knots before the speed rises above 20 knots, and ends at the
first report below 20 knots after it, as long as those reports are close
enough in time. That's close to the real flight time, but not exact:

- taxiing slowly for longer than one tracking interval before takeoff or after
  landing isn't counted
- with a long tracking interval (see
  [Trackers and AFF](../automated-flight-following)), the start and end can be
  off by up to that interval

Where it matters, correct the flight's Dep and Arr times in the
[flight form](../editing-flights#the-flight-form) to the times the aircraft
started moving and came to rest.

## Editing

Admins can edit the log; other users see it read-only.

- **Flights:** the pencil on a flight row opens the flight form: times,
  origin and destination, aircraft, pilot, Part 135 or Part 91 (paid or
  unpaid), and a remark.
  **Edit flights** in the toolbar opens the flight editor filtered to this
  pilot and month, to change several flights at once or add one the tracker
  missed. Corrections show everywhere the flight appears, not just here; a
  corrected value is marked † with the tracker's value on hover. See
  [Editing Flights](../editing-flights).
- **Duty and rest days:** see the next section.

Every change to a flight's corrections, to a tracked flight's aircraft or
pilot, to a day's duty, rest or note, to a pilot's [default duty](#default-duty)
or to the [limits method](#limits-b-or-c) is kept in an edit history: who made
it, when, and the values before and after. Moving a flight to another pilot
changes two pilots' logs, so that's recorded too. The history can't be edited
or deleted. The day form, the flight form, the default duty form and the
method's settings show the last change, e.g. "Last
changed by Sam, Mon Oct 13 09:12.", or "Pilot last changed by Sam, …" when the
latest change to a flight was its pilot.

If someone else changes a day or a flight while you have its form open, your
save doesn't overwrite their change. The form says "Changed by Sam since this
was loaded (Mon Oct 13 09:12)." with a **Reload** button, which reopens the
form with the current values (asking first if you've changed a field). Make
your change again from there. For a range of days, a change to any of them
counts. The form says the same as soon as it opens if the page's copy is
already older than the latest change.

Pressing Escape or clicking outside a form closes it, after asking if you've
changed a field.

## Duty times and rest days

Each day can hold a duty period or a rest designation, plus an optional note.
Open the day form in either of two ways:

- click a date in the table (each date has a calendar icon), or
- use **Plan duty or rest** in the toolbar. The form starts on tomorrow, since
  rest is usually planned ahead, and takes any date.

A day with no duty times recorded starts with them empty, and the form shows
the pilot's [default duty](#default-duty), e.g. "Default duty 08:00–17:00
applies on a flying day with no times recorded." Leave the times empty to keep
using the default (saving just a note keeps it too), or click **Use default** to
fill them in and record them as the day's actual duty.

In the form:

- **Duty**: enter the start and end times, e.g. 08:00–17:00. An end before the
  start is taken as past midnight, so 20:00–02:00 is a six-hour duty period. The
  end can't be the same as the start.
- **Rest day**: marks the whole local calendar day as rest. The date and time
  you save it is recorded as when the rest was designated and shown in the
  table and on the PDF, e.g. "Rest · designated Oct 3". Changing a rest day's
  note later keeps the original designation date; switching the day back to
  duty and then to rest again records a new one, so saving a rest day as duty
  asks first.
- **Through (optional)**: applies the same duty times or rest to every day from
  the date through this one, up to 366 days at a time, e.g. a block of days off
  next month. The whole range is saved at once, or not at all. If some of the
  days already have different duty times, rest or notes, Save first asks, e.g.
  "3 of these 6 days already have records that will be replaced. Save?", and
  says so when rest days would lose their designation.
- **Note**: up to 1,000 characters, e.g. on-call hours or what a positioning
  trip was.
- **Clear** removes the duty times, rest designation and note from the day, or
  from every day in the range.

Times are in the timezone set in [Admin Settings](../../settings/admin-settings).

### What to record as duty

The duty and rest checks only know what's recorded, so record the pilot's
whole duty period, not just the time around the flights.

- **On-call and standby time is duty.** Rest has to be continuous, known in
  advance, and free from all restraint by the operator. Time when the pilot has
  to answer the phone or be ready to report if called is duty, not rest, even if
  no call comes (FAA interpretations to
  [Berry, 2009](https://www.faa.gov/media/14441),
  [Jimenez, 2011](https://www.faa.gov/media/13701),
  [Orellana, 2015](https://www.faa.gov/media/11941) and
  [Kleiner, 2016](https://www.faa.gov/media/11541)). So the duty times must
  include every hour the pilot could be called.
- **Positioning.** Transportation that isn't local, that the operator requires
  and provides, to the airport where the pilot will fly or home from the
  airport where they were relieved, isn't rest (§135.263(c)). Record it inside
  the day's duty times: start the duty period when that travel starts, or end
  it when the travel home ends. Then:
  - If the pilot **flew** the positioning flight (a ferry), it's flight time
    and duty. Log it as a flight under **Part 91**, paid (a ferry flight the
    operator assigns is duty and paid flying; FAA interpretation to
    [Converse, 2011](https://www.faa.gov/media/13546)). The log counts it toward
    the quarterly and yearly totals, and toward the daily limit when it comes
    before the day's Part 135 flights.
  - If the pilot **rode as a passenger** (an airline, or another pilot flying),
    it isn't flight time for them. Don't add it as a flight in their log, since
    every flight in the log counts as their flight time. Cover it with the duty
    times and say what it was in the day's note, e.g. "Positioned PANC–PAKN on
    Alaska 123".
- **Delays beyond anyone's control.** A flight planned to end within the
  limits that runs over because of weather or similar isn't an over-assignment
  (§135.263(d)), but the pilot then needs the longer rest of §135.267(e), and
  under (c) the 14-hour duty limit only bends for unexpected delays en route
  (FAA interpretation to [SevenBar, 2016](https://www.faa.gov/media/11331)).
  The log can't tell why a limit was exceeded, so the warning stays. Record the
  cause in the day's note and in the flight's remark (e.g. "Weather hold at
  PAKN, 40 min"), and give the extended rest.

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
warning, because it wasn't designated in advance, and doesn't count.

### How rest is counted

The log counts rest in two different ways:

- **The 10-hour rest checks** (§135.267(c), (d) and (e), under
  [Warnings and totals](#warnings-and-totals)) count any time outside a
  recorded duty period or a flight as rest. There's no need to mark it. This is
  why on-call and standby time must be [recorded as duty](#what-to-record-as-duty):
  time left out of the duty times counts as rest.
- **The 24-hour rest periods** (§135.267(f), 13 each calendar quarter) count
  only days marked **Rest day**. Time off that isn't marked doesn't count, even
  24 hours or more between two duty periods. Rest has to be assigned in
  advance, and the log can't show that for time that was simply left blank. A
  rest day's designation date is the record that it was.

A rest day only counts toward the 13 when:

- it was designated before the day,
- no flights fall on it, and
- the previous day's duty, and any flight on it, ended by midnight, so the rest
  is a full 24 hours. A flight that departs the evening before and lands after
  midnight counts, even outside the duty times.

Each rest day is a whole local calendar day. A 24-hour rest that spans two days,
such as 17:00 one day to 17:00 the next, isn't counted. To count it, designate
a whole calendar day as rest.

### Default duty

Most pilots keep the same hours, so each pilot can have a default duty period.
Admins set it from the "Default duty 08:00–17:00 · Change" line in the duty
log's header.

A pilot's hours can change, so the default is kept by date: each entry applies
from its **Effective from** date until the next one. To change the default,
add an entry from the date the new hours start (today, by default). Past
months keep the default that was in force then, so their warnings and PDFs
don't change. The earliest entry also covers the days before it, so a pilot
whose only default starts June 1 uses it for every day. Leaving both times
empty saves "no default" from that date.

The form lists the pilot's entries, newest first, each with **Edit** and
**Remove**. To fix a mistake in an entry (a typo, or the wrong date), edit it
rather than adding another: that changes every day it covered, as it should,
and the change is recorded. The header shows the default for the month on
screen, e.g. "Default duty 07:00–16:00 from Jun 15" in a month where it
changed.

The default in force on a day applies to it when it has flights and no duty
times or rest recorded (a day with only a note uses it too).
That day's Duty column shows the default marked "(default)", on screen and in
the PDF, and the duty and rest checks use it. A day with a record
always uses the record. If a flight departs before or lands after the day's
duty period, recorded or default, the day gets a warning, e.g. "Flight
18:05–18:50 outside duty 08:00–17:00 (default)"; record the actual duty times
for that day.

Under [method (c)](#limits-b-or-c) the default duty is the pilot's regularly
assigned duty period, and a day whose recorded times differ from the default
in force that day gets a warning.

## Corrections that no longer match

If a history import changes when a tracked flight starts, or the tracker's
points are wiped, its corrections no longer match a flight. They don't record
a pilot, so the log shows them as "Not found", on the day they were for, only
for the pilot of the same tracker's nearest flight within 12 hours (usually
the flight that replaced it, shown as tracked). With no flight that close they
show only in the [flight editor](../editing-flights#corrections-that-no-longer-match).
They're left out of the totals. Correct the flight again and delete the old
corrections.

## Warnings and totals

The log checks each day against the one-pilot limits of
[14 CFR §135.267](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-G/part-135/subpart-F)
and shows a warning under the day, without blocking anything. Which daily
checks run depends on the [method](#limits-b-or-c) set for your operation.

With either method:

- too short a rest after a day over the flight time limit: at least 11 hours
  if it was over by up to 30 minutes, 12 hours up to an hour, 16 hours beyond
  that (§135.267(e))
- flights on a rest day, a rest day designated on or after the day itself, or
  a rest day after a duty or flight that ran past midnight (so it's under 24
  hours)
- a day with flights but no duty times (none recorded and no default duty),
  since the duty and rest checks need them
- a flight that departs before or arrives after the day's duty period

An amount over a limit is rounded up to the minute, so it never reads as equal
to the limit: 8 hours and 40 seconds of flight time shows as 8:01 against the
8:00 limit. Rest under a minimum is rounded down, so 9 hours 59 minutes and 30
seconds of rest shows as 9:59.

The log assumes **one-pilot crews**. A two-pilot crew is allowed 10 hours of
flight time instead of 8 under (b) and (c), and §135.269 covers three- and
four-pilot crews; the log doesn't record crew size yet, so it always applies
the one-pilot limits.

### Limits: (b) or (c)

§135.267 lets an operator apply its daily limits in one of two ways, and the
operator picks one. Set yours under **Duty limits (§135.267)** in
[Global Settings](../../settings/admin-settings#duty-limits-135267); the default is (b).
The method is shown above the totals, e.g. "Limits:
§135.267(b), flight time in any 24 hours · one-pilot crew".

Like the default duty, the method is kept by date: a change applies from its
**Effective from** date, and each day is checked with the method in force on
it, so past months keep theirs. A month that changed method says so, e.g.
"Limits: §135.267(b) to Jun 14, §135.267(c) from Jun 15 · one-pilot crew".

**(b) Flight time in any 24 hours.** For pilots who can be called at varying
times. The log warns about:

- more than 8 hours of flight time in the 24 hours before the end of any of
  the day's Part 135 flights. Paid Part 91 flying counts when it comes before a
  Part 135 flight and is left out when it comes after the last one (FAA
  interpretation to [Converse, 2011](https://www.faa.gov/media/13546))
- less than 10 consecutive hours of rest in the 24 hours before the end of each
  duty period (§135.267(d)). Any time inside a recorded duty period or a flight
  counts as not rest. This also catches a duty period over 14 hours, which can't
  leave 10 hours of rest in the 24.

**(c) Regularly assigned duty period.** For pilots who come to work and go home
at the same times every day. The pilot's [default duty](#default-duty) is their
regularly assigned duty period. The log warns about:

- a duty period over 14 hours. Under (c) this is a hard limit (FAA
  interpretation to [SevenBar, 2016](https://www.faa.gov/media/11331))
- less than 10 hours of rest between two duty periods, shown on the later day.
  A flight outside the duty times counts as duty here too. When an earlier
  flight or duty period runs into the day's duty period, such as an overnight
  flight, there's no rest at all: "Rest before duty 0:00 (§135.267(c) minimum
  10:00)"
- more than 8 hours of flight time in the duty period, counting the whole of any
  of the day's flights outside the duty times too (Part 91 counted as under (b))
- duty times that differ from the regularly assigned ones, or no default duty
  in force that day
- a duty period starting earlier on the clock than the previous day's, so the
  duty and the rest after it add up to less than 24 hours

The totals panel shows flight time this calendar quarter (limit 500 hours),
this and the previous quarter (800), and the calendar year (1,400), counting
all commercial flying (Part 135, and Part 91 unless [marked unpaid](#unpaid-flights)), and the quarter's 24-hour rest periods (13 required), counted
as the rest days with no warning ([how rest is counted](#how-rest-is-counted)): no flights on the day, designated before it,
and the previous day's duty and flights over by midnight. Rest days that haven't happened yet are shown
separately as planned, and the rest row turns red once the quarter can no
longer reach 13 even if every remaining day were rest. Totals are as of now for
the current month, and as of the month's end for a past one,
so a past month's PDF comes out the same whenever it's exported.

### Unpaid flights

§135.267 limits flight time in all *commercial* flying, and the FAA reads
"other commercial flying" as flying the pilot is paid for (interpretations to
[Martindell, 2009](https://www.faa.gov/media/14636) and
[Rodriguez, 2012](https://www.faa.gov/media/13326)). So a Part 91 flight can be
marked **Unpaid** in the [flight form](../editing-flights#the-flight-form), and
the log then leaves it out of the totals and the daily flight time limit. It
stays in the log and the day and month totals, marked "Part 91 (unpaid)", and
it still counts as time the pilot wasn't resting.

Mark a flight unpaid only when the pilot genuinely received no compensation
for it, such as a personal flight in their own time. Flying the pilot does as
part of their job is paid even without a separate fee: a salaried pilot's ferry
or positioning flight is paid, and so is paid flight instruction.

## Export

**Export PDF** asks which months to export, then renders them as one PDF,
generated in the browser via Typst. Pick a period, or choose **From** and
**To** months yourself (up to 24 months):

- **Month** (the default): the month on screen.
- **This qtr**: the calendar quarter of the month on screen, through this month
  (only October, if October is on screen).
- **Last qtr**: the calendar quarter before that one, in full: the usual
  quarterly sign-off. It isn't offered if the log has no months that early.
- **12 mo**: the last 12 months through this month, the period
  §135.63 requires these records to be kept for.

Each month gets its own section, laid out as on screen: the table, remarks
rows, warnings, the month total and the §135.267 totals as of the month's end
(or now, for the current month). The table starts with the day before the
month, its duty and flight time, so the month's first 24-hour and rest checks
can be followed from the page. An export of more than one month starts each
month on a new page and follows each calendar quarter with a summary page:
flight time, rest periods and days with warnings for each month, the totals as
of the quarter's last exported month, and a list of every warning in it.

Corrected values are marked † with numbered footnotes giving the tracker's
values, manual flights are marked ‡,
default duty times are marked "(default)", and the footer gives the pilot, the
period and when the PDF was generated.
