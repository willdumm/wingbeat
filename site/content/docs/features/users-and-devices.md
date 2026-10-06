---
title: Users & Devices
description: "Invite-only accounts, Admin and Viewer roles, and per-device sessions in Wingbeat."
weight: 8
---

# Users & Devices

## Accounts are invite-only

There's no public sign-up. Admins generate an invite link (Settings → Admin →
Users → Invite someone) for a name and a role (**Admin** or **Viewer**);
opening the link in a browser sets up that device's session. Invite links
expire after 24 hours.

## Roles

- **Viewer** — full read access to the dashboard, analytics, and flight data.
  Can see (but not edit) Aircraft/Pilots/Trackers lists and their own
  devices.
- **Admin** — everything a Viewer can do, plus: edit
  Aircraft/Pilots/Trackers, bulk-edit flight assignments, manage users, and
  everything under Global Settings (app name, timezone, map defaults,
  notifications, regions, named points).

## My Devices

Each user can be signed into multiple devices at once. Settings → My Devices
lists every session on the account (device name, last-seen date), and lets
you:

- **Rename** a device
- **Revoke** a session from another device
- **Sign out** the current device
- **Get a device link** — a one-time link to add another device to *this*
  account, without needing a fresh admin invite

Sessions are opaque server-side tokens delivered as an HTTP-only cookie —
there's no password to manage.
