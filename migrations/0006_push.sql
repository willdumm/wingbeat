-- App push (docs/mobile-app-plan.md, "Subscriptions and devices", phase 7). Neither table
-- has edit_history triggers.
--
-- push_subscriptions: what a user is notified of, per user (any user subscribes
-- themselves). tracker_id NULL is every tracker; event is takeoff, landing, gap (a tracker's
-- events, as the webhooks' subscription keys) or alerts (the alerts feed, tracker_id NULL).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE,
  event      TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_unique ON push_subscriptions(user_id, COALESCE(tracker_id, 0), event);

-- push_devices: where a user's pushes go, one row per signed-in device (session), so signing
-- a device out stops its pushes. kind is 'expo' (endpoint the Expo push token) until Web Push
-- adds 'web' (endpoint the push URL, with p256dh and auth). last_ok_at and last_error are the
-- last send's outcome; Expo's DeviceNotRegistered deletes the row.
CREATE TABLE IF NOT EXISTS push_devices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,
  endpoint   TEXT    NOT NULL,
  p256dh     TEXT,
  auth       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_ok_at INTEGER,
  last_error TEXT,
  UNIQUE(session_id, endpoint)
);

-- push_tickets: Expo's ticket for each push sent, checked for its receipt on a later cron run
-- (receipts are ready after a few minutes) and then deleted.
CREATE TABLE IF NOT EXISTS push_tickets (
  ticket_id  TEXT    PRIMARY KEY,
  device_id  INTEGER NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
