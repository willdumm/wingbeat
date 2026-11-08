-- The app's X-Wingbeat-App header (its client API level and runtime) as the session last
-- sent it, so a field or route is removed only once no active session reads it
-- (docs/mobile-app-plan.md, "Versions and compatibility"). NULL for web sessions and for
-- app sessions that haven't sent it. sessions has no edit_history triggers.
ALTER TABLE sessions ADD COLUMN app_version TEXT;
