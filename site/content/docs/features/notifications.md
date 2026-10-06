---
title: Notifications
description: "Get notified by webhook or Pushover when a tracker takes off, lands, or loses signal in flight."
weight: 6
---

# Notifications

Admins can register notification targets (Settings → Admin → Global Settings
→ Notifications) to get notified when a tracker:

- **takes off** — velocity crosses above the flight-speed threshold (~20 kt)
- **lands** — velocity drops back below it
- **loses signal in flight** — more than the configured gap-alert threshold
  (default 5 minutes) passes between two updates while airborne. Gap alerts
  repeat roughly once a minute while the silence continues, followed by a
  final "signal restored" notification once updates resume.

Both target types below share the same detection pipeline and message
formatting, and can be freely mixed.

## Webhook

A generic JSON POST to any URL. Services that accept a plain JSON POST (e.g.
[ntfy](https://ntfy.sh)) work directly; others need a small relay. Example
body:

```json
{
  "type": "takeoff",
  "tracker_id": 1,
  "tracker_name": "Cessna 206 InReach",
  "time": 1753600000,
  "lat": 57.79,
  "lon": -152.41,
  "title": "Cessna 206 InReach took off",
  "message": "Takeoff detected at 2025-07-27T12:00:00.000Z near 57.790, -152.410."
}
```

`gap` events additionally include `gap_minutes`.

## Pushover

Delivered natively via [Pushover](https://pushover.net)'s API. Setup is two
steps:

1. Register one free application at `pushover.net/apps/build` and paste its
   token into the tenant's shared "Pushover application token" field — this
   one token is shared by every Pushover target on the instance.
2. Add a target for each recipient, using *their own* Pushover user key (from
   their pushover.net dashboard) — not the token.

## Per-target event selection

Each target (webhook or Pushover) can be limited to a subset of events —
takeoff, landing, signal gap — and toggled active/inactive without deleting
it.
