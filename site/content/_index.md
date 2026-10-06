---
# The docs-site home page. layouts/home.html lays it out; the shortcodes used below live
# in layouts/_shortcodes/ (see the README's "Home page" section). The styles, scripts,
# logo and the live demos come from `npm run docs:showcase` (src/showcase/), so editing
# this file needs no rebuild of the showcase.
title: Wingbeat Flight Tracker
pageTitle: Wingbeat · Aircraft tracking and flight records
description: >-
  Track your aircraft with the tracking hardware you already have. Wingbeat logs every
  flight, sends takeoff and landing notifications, and keeps maintenance, pilot duty time
  and flight reports up to date.

# Header links, and the header's call to action.
nav:
  - { label: Flights, href: "#flights" }
  - { label: Notifications, href: "#notifications" }
  - { label: Maintenance, href: "#maintenance" }
  - { label: Duty time, href: "#duty" }
  - { label: Analytics, href: "#analytics" }
headerActions:
  - { label: Docs, href: docs/, style: secondary }
  - { label: See pricing, href: "#pricing" }

# What every hosted plan includes (`{{< plan perks="hosted" >}}`).
hostedPerks:
  - We set up your trackers, aircraft, pilots and places
  - Custom features built on request
  - Data analysis on request
  - Direct support

footerLinks:
  - { label: Docs, href: docs/ }
  - { label: Self-hosting, href: docs/self-hosting/ }
  - { label: Map tools, href: docs/features/map-tools/ }
  - { label: GitHub, href: "https://github.com/willdumm/wingbeat" }
footerNote: |-
  Demos on this page use sample data. For custom software solutions like this one, contact Dumm Software LLC at [apps@dummthings.dev](mailto:apps@dummthings.dev).<br />© Dumm Software LLC · Code AGPL-3.0 · Docs CC BY 4.0
---

{{< hero title="Simple, customizable aircraft tracking." photo="A yellow and white floatplane taxiing on calm water along a forested shoreline" >}}
{{< demo name="status" label="Dashboard status bar showing three aircraft, two in flight" >}}

Wingbeat flight tracker works with the tracking hardware you already use, such as a Garmin inReach. Easily monitor flights on one map, automatically log flight time, and keep track of maintenance schedules and pilot duty time.

{{< action href="#pricing" >}}See pricing{{< /action >}}
{{< action href="docs/" style="secondary" >}}Read the docs{{< /action >}}
{{< /hero >}}

{{< feature id="flights" overline="Flights" title="Flights are logged automatically."
    link="docs/features/live-tracking/" linkLabel="How flights are detected" >}}
A flight starts when the aircraft goes faster than 20 knots and ends when it slows down
again. Each departure and arrival gets a place name, from map data or from your own list of
places, so the log says Kodiak to Larsen Bay instead of showing coordinates.

{{< demo name="flights" caption="Flight list and map. Select a flight, or use Map all to see the whole day" >}}

{{< facts >}}
- **Nothing for pilots to do** There is no start or stop button. Flights are recorded from
  the tracker's speed.
- **Your own place names** Add the names you use for lakes, strips, and landmarks. Current location and flight log descriptions will use those names.
- **A day at a glance** Show any leg flown by any aircraft, or all of them at once.
{{< /facts >}}
{{< /feature >}}

{{< feature id="notifications" layout="split" overline="Notifications"
    title="Get a notification when an aircraft takes off or lands."
    link="docs/features/notifications/" linkLabel="Set up notifications" >}}
Wingbeat sends notifications to your phone through the Pushover app.

{{< facts >}}
- **Takeoffs and landings** Get notified when and where flights begin or end.
- **Lost signal** If an aircraft in flight stops sending GPS locations,
  you get alerts until the next position is received.
- **Customizable by recipient** Everyone uses their own Pushover account and chooses which
  notifications they receive.
{{< /facts >}}

{{< demo name="notifications" caption="Notifications from today's flights" >}}
{{< /feature >}}

{{< feature id="maintenance" layout="split" overline="Maintenance"
    title="Maintenance due dates from logged flight time."
    link="docs/features/maintenance-tracking/" linkLabel="Set up maintenance tracking" >}}
Enter a Hobbs or tach reading. Wingbeat adds the flight time it logs, adjusted by a
learned correction factor, to help track and monitor maintenance deadlines.

{{< facts >}}
- **Hours and dates** Oil changes and 100-hour inspections by meter time; annual
  inspections and ELT batteries by date.
- **Due soon** Items within 10% of their interval, or within 30 days, are marked as due
  soon.
{{< /facts >}}

{{< demo name="maintenance" caption="Aircraft info for N100DM" >}}
{{< /feature >}}

{{< feature id="duty" layout="split" overline="Pilot duty"
    title="A duty and flight time log for each pilot."
    link="docs/features/pilot-duty-log/" linkLabel="Read about the duty log" >}}
Each pilot's month on one page: every leg with departure and arrival times, block time for
each day, and running totals from the last 24 hours up to the last 12 months.

{{< facts >}}
- **PDF export** Download the log as a PDF to print or send.
- **Rest days** Days without a flight are marked as rest days and counted over the last 90
  days.
{{< /facts >}}

{{< demo name="duty" caption="Duty log for one pilot. Try Export PDF" >}}
{{< /feature >}}

{{< feature id="analytics" overline="Analytics" title="Flight hours by area and by season."
    link="docs/features/analytics/" linkLabel="Explore the analytics page" >}}
Filter by aircraft, pilot or dates. See flight hours for each region, a heatmap of where
flights end, and a chart of how the mix of destinations changes throughout the year.

{{< demo name="analytics" caption="150 days of charter flying" >}}
{{< /feature >}}

{{< feature id="data" overline="Your data" title="Your flight records belong to you." >}}
All raw and processed data Wingbeat keeps is yours. You may export it and use
it for any purpose you like.

{{< facts >}}
- **Owned by you** Your flight data belongs to you.
- **Use it how you like** Land management and permit reports, contract billing, insurance,
  safety reviews, or your own analysis.
{{< /facts >}}
{{< /feature >}}

{{< feature id="pricing" overline="Pricing" title="Hosted plans" >}}
Dumm Software LLC sets up Wingbeat for your operation and runs it for you. You get a web address
for everyone on your team to use on any computer or phone.

{{< plan title="One tracker" price="$25" period="/ month" perks="hosted" >}}
For a single tracker.

{{< action href="mailto:wingbeat@dummthings.dev?subject=Wingbeat%20One%20tracker%20plan" style="secondary" icon="mail" >}}Contact us{{< /action >}}
{{< /plan >}}

{{< plan title="Fleet" price="$100" period="/ month" perks="hosted" featured="true" >}}
For up to five trackers.

{{< action href="mailto:wingbeat@dummthings.dev?subject=Wingbeat%20Fleet%20plan" icon="mail" >}}Contact us{{< /action >}}
{{< /plan >}}

{{< plan title="Larger fleets" price="Contact us" perks="hosted" extra="Pricing and setup for your fleet" >}}
More than five trackers, or something your operation needs that isn't listed here?
Email wingbeat@dummthings.dev for pricing and setup.

{{< action href="mailto:wingbeat@dummthings.dev?subject=Wingbeat%20larger%20fleet" style="secondary" icon="mail" >}}Contact us{{< /action >}}
{{< /plan >}}

{{< plan id="self-hosting" wide="true" title="Self-hosted" price="Free" >}}
Wingbeat is open source under the AGPL-3.0. It runs as a single Cloudflare Worker with a D1
database, so you can deploy it to your own Cloudflare account and run it yourself, with
every feature, as many trackers as you like, and all data stored in your account.
You are free to contribute features, and you benefit from the contributions of other users, including
Dumm Software LLC.

{{< action href="docs/self-hosting/" >}}Follow the setup guide{{< /action >}}
{{< action href="https://github.com/willdumm/wingbeat" style="secondary" icon="github" >}}Source on GitHub{{< /action >}}
{{< /plan >}}
{{< /feature >}}
