---
title: Privacy Policy
description: "What Wingbeat, its hosted instances and its mobile app store about you, who else receives it, and how to delete it."
weight: 100
---

# Privacy Policy

*Last updated: November 16, 2026*

This policy covers the Wingbeat mobile app and the Wingbeat instances that Dumm Software LLC
("we") hosts for aviation operators, such as `<operator>.wingbeat.dummthings.dev`. A
self-hosted instance is run by its operator, who decides what happens to its data; the app
and this policy's sections on the app still apply to it.

Wingbeat is a tool your operator (the company you fly or work for) uses to follow its
aircraft. The operator decides who gets an account and what it records. We host the instance
for them and don't use its data for anything else.

## What an instance stores

Each operator has its own instance with its own database. It holds:

- **Tracker positions and flights.** The instance polls the operator's satellite trackers
  (Garmin inReach MapShare) and stores each position with its time, speed and altitude, plus
  the flights it builds from them and the aircraft and pilot each flight is assigned to.
  Positions come from the aircraft's tracker, not from your phone.
- **Operator records.** Aircraft, pilots, maintenance, duty days, flight corrections and the
  history of who edited them.
- **Your account.** Your name, your role, and the pilot you're linked to, if any. There's no
  password: you sign in with a link or code from your operator, which the instance exchanges
  for a session.
- **Your sessions.** For each signed-in browser or phone: a device name, when it was created
  and last used, and for the app, its version. Signing a device out deletes its session.
- **Notifications.** Your notification subscriptions and, for each signed-in phone that
  allows them, its push token.

## What the app stores on your phone

The app keeps each account's session in the phone's secure storage (the Keychain or Android
Keystore), and keeps a copy of recent flights and your settings so it opens quickly and works
offline. Signing out of an account removes its session from the phone; deleting the app
removes everything.

**Location.** The app doesn't read your phone's location today. A later version will add
automatic flight logging, which you turn on yourself in Settings and which asks for location
permission only then. It records your phone's position only near your operator's aircraft
(when the phone detects an aircraft's beacon), sends those events only to your operator's
instance, which uses them to assign the flights you fly to you, and the instance deletes them
after 30 days. The app works fully without it. We'll update this policy when it ships.

## Who else receives data

We don't sell data, show ads, or track you across other apps or websites. These services
receive what they need to do their part:

- **Cloudflare** hosts the instances and their databases, and so processes everything above.
- **Garmin** supplies the trackers' positions, under the operator's own Garmin account.
- **Expo** (Expo's push service, with Apple and Google behind it) receives your phone's push
  token and the text of each notification sent to it, such as "N123AB landed at Kodiak".
- **Sentry** receives crash and error reports from the app: the error, the app and phone
  versions, and your instance's address. Reports don't include flights, positions, names or
  other personal information.
- **Map tiles** come from CARTO (street map) and Esri (satellite imagery), plus any map
  overlay your operator adds. Like any website, a tile server sees your IP address and the
  map area you're viewing.
- **Your operator's own notifications**, if they set them up: Pushover, or webhooks to
  addresses they choose, receive flight events (takeoff, landing, a tracker going quiet).

## Deleting your account

You can delete your account yourself, in the app (Settings → Delete my account) or on the
web (Settings). Deleting it removes your user, every session and device link, your push
tokens and subscriptions, and, once automatic flight logging ships, its location events.

The operator's records stay with the operator, because they're operational records it is
often required to keep: flights, duty days and corrections, the pilot record you were linked
to, and the edit history, which keeps your name on the edits you made. To have those removed
or corrected, ask your operator. An operator's administrator can also delete your account.

When an operator stops using Wingbeat, we delete its instance's database after giving them an
export.

## Children

Wingbeat is for aviation operators and their staff, and isn't directed at children under 13.

## Contact

Questions about this policy, or requests about data we hold: Dumm Software LLC,
[apps@dummthings.dev](mailto:apps@dummthings.dev). For your operator's records, contact your
operator.
