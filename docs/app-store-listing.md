# App Store listing

The App Store Connect text for the iOS app, version 1.0.0 (build 8). Paste each field as is.
Update this file whenever the listing changes, so it stays the source.

## Rules for the copy

- **A companion app, not a standalone one.** Say up front that the app needs an account on a
  Wingbeat Flight Tracker instance your operator has already set up, and point to "Try the
  Demo".
- **No pricing and no hosted plans** in the listing or the app (guidelines 3.1.1 and 3.1.3; see
  `mobile-app-plan.md`, "The free app with your hosted service is allowed").
- **No "open source" line yet.** Readers would take it to mean the app pairs with their own
  server, which it won't until self-hosted pairing ships. Add the line back then.
- **Only features the shipped build has.** Maintenance and analytics wait for phase 11.
- **Keywords:** no words already in the app name, and no other companies' trademarks (Garmin,
  inReach). Those are fine as a compatibility mention in the description.

## Version fields

**Promotional Text** (162 / 170)

```
The companion app for Wingbeat Flight Tracker. Follow your fleet live, review automatically logged flights and duty time, and get takeoff, landing and gap alerts.
```

**Description**

```
Wingbeat is the companion app for Wingbeat Flight Tracker, a flight-following and flight-records system for small air taxi, charter and bush operations.

REQUIRES A WINGBEAT ACCOUNT
This app is not standalone. It connects to your operation's Wingbeat Flight Tracker, which must already be set up with your trackers, aircraft and pilots. Ask your operator for an invite to sign in. To explore the app first, tap "Try the Demo" when adding an account to explore a sample fleet.

LIVE MAP
See every aircraft on one map: where it is, whether it's flying or on the ground, its altitude and speed, and how long ago its tracker last reported. Positions are described with your operation's own place names ("9.5 miles SW of Womens Bay"), and in-flight tracks draw as they're flown. Switch between USGS topographic and imagery maps, an OpenStreetMap vector map, and your operation's own map layers, and tint the terrain by elevation (Mapterhorn).

FLIGHTS ARE LOGGED AUTOMATICALLY
Wingbeat works with the satellite trackers your aircraft already carry, such as a Garmin inReach. There is no start or stop button for pilots: takeoffs and landings are detected from the tracker's movement, and each leg is recorded with its departure and arrival times, origin, destination, aircraft and pilot. Open any flight to see its track, or map a whole day at once. Recorded flights can be edited in the app to correct start and end times and other metadata.

PILOT DUTY TIME
Each pilot's duty log shows flight time against the Part 135 limits (§135.267) for the quarter, two quarters and calendar year, plus rest periods and upcoming duty. Export a month as a PDF.

NOTIFICATIONS
Get a push notification when an aircraft takes off or lands, and an alert when a tracker in flight stops reporting. Choose which trackers and events you hear about, and which alerts are Time Sensitive.

MORE THAN ONE OPERATION
Sign in to several Wingbeat accounts and switch between them in Settings.
```

**Keywords** (97 / 100)

```
aircraft,pilot,duty time,part 135,air taxi,charter,floatplane,dispatch,fleet,GPS,logbook,aviation
```

| Field | Value |
|---|---|
| Support URL | `https://wingbeat.dummthings.dev/` (its footer has the contact address, `apps@dummthings.dev`) |
| Marketing URL | blank (optional) |
| Version | `1.0.0` (must match the build) |
| Copyright | `2026 Dumm Software LLC` (the year and owner, in Apple's example format "2008 Acme Inc."; no URL) |
| Routing App Coverage File | blank (only for turn-by-turn navigation apps) |
| Privacy Policy URL | `https://dummthings.dev/privacy` (on the App Privacy page, not the version page) |

The support page also links to the hosted-plan pricing. That's a store-listing URL, not a link
from the app, so it should pass review. A contact-only page would remove the risk entirely if
review objects.

## Screenshots

The "iPhone with Dynamic Island" slot takes 6.3" screenshots at their native size (1206 × 2622 or
2556 × 1179 from an iPhone 16 Pro), so no scaling is needed. Use demo-tenant data only, and black
out anything in the Dynamic Island (a Live Activity like a playing podcast shows there):

```sh
magick in.PNG -alpha off -colorspace sRGB -fill black -draw "rectangle 334,56 859,132" out.png
```

The rectangle fits inside an expanded Live Activity pill at 1206 × 2622. Zoom in on the result to
check that no corner pokes out past the pill's rounded ends.

Build 8's set, in order: the Live map with all aircraft cards expanded, the Flights list, a flight's
detail on satellite imagery, and a pilot's Duty view.

## App Review Information

The **Notes** field takes the text of `app-review-notes.txt` beside this file, as is. Apple's
limit is 4,000 characters (`wc -m`; it's 3,944), so recount after any edit. The screen recording
goes in the section's Attachment field. Sign-in isn't required: the notes point the reviewer to
"Try the Demo".

## App-level pages

These live outside the version page, under the app's General section, and are not part of the
submission form. TestFlight's Beta App Review needs none of them. An App Store submission needs
all of them except the EU trader status; when one is missing, App Store Connect refuses "Add for
Review" and lists what's missing.

### App Privacy

Privacy Policy URL: `https://dummthings.dev/privacy`. Data collected (none of it used for
tracking or advertising, none of it shared with data brokers):

| Data type | Why | Linked to the user | Source |
|---|---|---|---|
| Contact Info → Name | App Functionality | Yes | the account on the instance |
| Contact Info → Email Address | App Functionality | Yes | the account on the instance (email sign-in and invites) |
| Identifiers → User ID | App Functionality | Yes | the instance's user ID |
| Identifiers → Device ID | App Functionality | Yes | the push token, for notifications |
| User Content → Other User Content | App Functionality | Yes | flight edits and duty days a user enters |
| Diagnostics → Crash Data | App Functionality | No | Sentry (`sendDefaultPii: false`, no tracing; `sentry-scrub.ts` strips flights and locations) |

Not collected: Location. The app shows aircraft positions from their trackers, never the phone's
own location, and has no location modules. Phase 8's presence features add Precise Location
(opt-in), and this table and the privacy policy change with them.

### App Information

- **Category:** Business (primary), Productivity (secondary).
- **Age rating:** answer None or No to every question (no web browsing, no user-to-user
  messaging or public content, no in-app purchases). The result is 4+.
- **Content rights:** a single checkbox confirming you have the rights to any third-party
  content. The app shows USGS topographic and imagery tiles, OpenStreetMap data via Protomaps
  and Mapterhorn elevation, each under its license and credited on the map.
- **EU Digital Services Act trader status:** Wingbeat is offered commercially, so declaring it
  makes you a trader, and Apple then shows your address, phone and email on EU storefronts. On
  the individual account those are your own. Until the account moves to Dumm Software LLC, leave
  the status unset and exclude the EU countries from availability.

### Pricing and Availability

Free. All countries except the EU (see the trader status). Turn off "Make this app available"
for Apple Silicon Macs and for Apple Vision Pro: the app is built and tested for iPhone only.

## Still to fill in

The release option ("Manually release this version"), and the encryption export answer if it's
asked (`ITSAppUsesNonExemptEncryption` is `false`: standard HTTPS only).
