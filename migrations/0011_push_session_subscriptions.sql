-- What each signed-in device (session) is notified of (docs/mobile-app-plan.md,
-- "Subscriptions and devices"), replacing push_subscriptions (0006), which is per user. Its
-- columns mean what they do there; signing a device out deletes its rows. push_subscriptions
-- stays, unread, for the previous release's Worker; a later release drops it. No edit_history
-- triggers.
CREATE TABLE IF NOT EXISTS push_session_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE,
  event      TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS push_session_subscriptions_unique ON push_session_subscriptions(session_id, COALESCE(tracker_id, 0), event);

-- Each app session starts with its user's: one with a push_devices row, or with an app_version,
-- as its row may be gone (DeviceNotRegistered) until its next launch registers it again.
INSERT INTO push_session_subscriptions (session_id, tracker_id, event)
SELECT s.id, ps.tracker_id, ps.event
FROM push_subscriptions ps
JOIN sessions s ON s.user_id = ps.user_id
WHERE s.app_version IS NOT NULL OR EXISTS (SELECT 1 FROM push_devices d WHERE d.session_id = s.id);
