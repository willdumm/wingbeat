---
title: Users & Devices
description: "Invite-only accounts, signing in by email, Admin and Viewer roles, and per-device sessions in Wingbeat."
weight: 8
---

# Users & Devices

## Accounts are invite-only

There's no public sign-up. Admins generate an invite link (Settings → Admin →
Users → Invite someone) for a name and a role (**Admin** or **Viewer**);
opening the link in a browser sets up that device's session. Invite links
expire after 7 days and can be used once. A sign-in link for adding another device
(Settings → Devices) is single-use and expires after 15 minutes.

On an instance that sends email, the invite form also takes an email address: the
invite is emailed there, and the address becomes the new account's first email address.

## Signing in with email

An account can have any number of email addresses, and any of them signs in.
Each address belongs to one account only. An address is added by emailing it a link, by
the user (Settings → Email addresses) or by an admin (Settings → Admin → Users →
**Email**); it's added once the link is opened, so every address on an account has been
confirmed. Until then it shows as *not verified*. Opening the link also signs in the device
that opened it.

To sign in, enter an address on the sign-in page. If it belongs to an account, Wingbeat
emails it a link and a 6-digit code, both good once for 15 minutes:

- **Open the link** to sign in on the device that opens it, or
- **Enter the code** on the sign-in page, to sign in the device you started on (handy when
  the email arrives on your phone and you're signing in on a computer).

The sign-in page answers the same way whether or not the address has an account. Five
wrong codes use the code up; ask for a new one.

The Wingbeat app signs in the same way through **Sign in with Browser**: the browser page
it opens offers the email sign-in, then connects the app.

Email features appear only on instances that send email (see the README's setup, for
self-hosted instances).

## Roles

- **Viewer** — full read access to the dashboard, analytics, and flight data.
  Can see (but not edit) Aircraft/Pilots/Trackers lists and their own
  devices.
- **Admin** — everything a Viewer can do, plus: edit
  Aircraft/Pilots/Trackers, edit flights (corrections, manual flights,
  assignments), manage users, and
  everything under Global Settings (instance name, timezone, map defaults,
  notifications, regions, named points).

## Users who are pilots

An admin can link a user to the pilot they are (Settings → Admin → Users →
**Designate pilot**). Each pilot links to one user at most. The Wingbeat app shows a
linked user their own duty log first.

## My Devices

Each user can be signed into multiple devices at once. Settings → My Devices
lists every session on the account (device name, last-seen date), and lets
you:

- **Rename** a device
- **Revoke** a session from another device
- **Sign out** the current device
- **Get a device link** — a one-time link to add another device to *this*
  account, without needing a fresh admin invite

Below it, **Email addresses** lists the addresses that sign in to the account, and adds
and removes them (on instances that send email).

Sessions are opaque server-side tokens delivered as an HTTP-only cookie —
there's no password to manage.
