-- The pilot a user is (docs/mobile-app-plan.md, "Schema", phase 6): the app opens a linked
-- user's own duty log first. At most one user per pilot. Pilots are hidden rather than
-- deleted, but SET NULL keeps a delete from failing on a linked user. users has no
-- edit_history triggers.
ALTER TABLE users ADD COLUMN pilot_id INTEGER REFERENCES pilots(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_pilot ON users(pilot_id) WHERE pilot_id IS NOT NULL;
