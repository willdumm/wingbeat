-- Effective-dated default duty and §135.267 method (docs/duty-log-editing-plan.md, "Dated
-- default duty and method"). A day with no duty times uses the pilot's default duty, and
-- the method picks the daily checks; both used to be one current value that every month
-- was re-checked with, so changing either rewrote past months' duty periods and warnings
-- (and their PDFs), unrecorded. Now each is a dated list, every day uses the entry in
-- force on it, and every change is in edit_history.
--
-- The entry in force on a day is the one with the latest effective_date on or before it.
-- The earliest entry also applies before its own date, since there's no earlier one to
-- apply: a pilot whose only default starts 2026-06-01 uses it for every day.

-- A pilot's default duty from effective_date until the next entry. Both times NULL: no
-- default from that date on.
CREATE TABLE IF NOT EXISTS pilot_default_duty (
  pilot_id       INTEGER NOT NULL REFERENCES pilots(id),
  effective_date TEXT NOT NULL,   -- YYYY-MM-DD in the tenant timezone
  duty_start     TEXT,            -- HH:MM local
  duty_end       TEXT,            -- HH:MM local; may be < duty_start (past midnight)
  PRIMARY KEY (pilot_id, effective_date),
  CHECK ((duty_start IS NULL) = (duty_end IS NULL))
);

-- The operator's §135.267 method ('b' or 'c') from effective_date until the next entry.
-- With no entries the method is (b).
CREATE TABLE IF NOT EXISTS duty_method_history (
  effective_date TEXT PRIMARY KEY,   -- YYYY-MM-DD in the tenant timezone
  method         TEXT NOT NULL CHECK (method IN ('b', 'c'))
);

-- Today's values become each list's first entry. Its date doesn't change which days it
-- covers (the earliest entry applies before its date too), so it's a fixed early date
-- rather than the migration's: an admin changing the value "from today" on the day this
-- is deployed then adds an entry instead of overwriting this one, which would rewrite
-- every past month again.
INSERT OR IGNORE INTO pilot_default_duty (pilot_id, effective_date, duty_start, duty_end)
  SELECT id, '2000-01-01', default_duty_start, default_duty_end FROM pilots
  WHERE default_duty_start IS NOT NULL AND default_duty_end IS NOT NULL;
-- The method always gets one, (b) when it was never set: otherwise the first change, say
-- to (c) from today, would be the earliest entry and so apply to every past month too.
INSERT OR IGNORE INTO duty_method_history (effective_date, method)
  SELECT '2000-01-01', COALESCE((SELECT value FROM settings WHERE key = 'duty_method' AND value IN ('b', 'c')), 'b');

-- One source of truth: the old single values go, rather than staying as a copy to keep in
-- sync.
ALTER TABLE pilots DROP COLUMN default_duty_start;
ALTER TABLE pilots DROP COLUMN default_duty_end;
DELETE FROM settings WHERE key = 'duty_method';

-- Their edit history, as migration 0003's for duty_days (same edit_actor attribution, same
-- append-only edit_history). Each list is one record to its form, which shows and saves
-- against all of it: a pilot's default duty is keyed '<pilot_id>', the method 'tenant'.
-- These triggers list their columns too: a migration adding a column to either table has
-- to drop and recreate them.
CREATE TRIGGER IF NOT EXISTS pilot_default_duty_history_ai AFTER INSERT ON pilot_default_duty BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'pilot_default_duty', CAST(NEW.pilot_id AS TEXT), 'insert',
    NULL,
    json_object(
      'pilot_id', NEW.pilot_id,
      'effective_date', NEW.effective_date,
      'duty_start', NEW.duty_start,
      'duty_end', NEW.duty_end);
END;
CREATE TRIGGER IF NOT EXISTS pilot_default_duty_history_au AFTER UPDATE ON pilot_default_duty
WHEN json_object(
    'pilot_id', OLD.pilot_id,
    'effective_date', OLD.effective_date,
    'duty_start', OLD.duty_start,
    'duty_end', OLD.duty_end) IS NOT json_object(
    'pilot_id', NEW.pilot_id,
    'effective_date', NEW.effective_date,
    'duty_start', NEW.duty_start,
    'duty_end', NEW.duty_end)
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'pilot_default_duty', CAST(NEW.pilot_id AS TEXT), 'update',
    json_object(
      'pilot_id', OLD.pilot_id,
      'effective_date', OLD.effective_date,
      'duty_start', OLD.duty_start,
      'duty_end', OLD.duty_end),
    json_object(
      'pilot_id', NEW.pilot_id,
      'effective_date', NEW.effective_date,
      'duty_start', NEW.duty_start,
      'duty_end', NEW.duty_end);
END;
CREATE TRIGGER IF NOT EXISTS pilot_default_duty_history_ad AFTER DELETE ON pilot_default_duty BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'pilot_default_duty', CAST(OLD.pilot_id AS TEXT), 'delete',
    json_object(
      'pilot_id', OLD.pilot_id,
      'effective_date', OLD.effective_date,
      'duty_start', OLD.duty_start,
      'duty_end', OLD.duty_end),
    NULL;
END;

CREATE TRIGGER IF NOT EXISTS duty_method_history_ai AFTER INSERT ON duty_method_history BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_method', 'tenant', 'insert',
    NULL,
    json_object('effective_date', NEW.effective_date, 'method', NEW.method);
END;
CREATE TRIGGER IF NOT EXISTS duty_method_history_au AFTER UPDATE ON duty_method_history
WHEN json_object('effective_date', OLD.effective_date, 'method', OLD.method)
  IS NOT json_object('effective_date', NEW.effective_date, 'method', NEW.method)
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_method', 'tenant', 'update',
    json_object('effective_date', OLD.effective_date, 'method', OLD.method),
    json_object('effective_date', NEW.effective_date, 'method', NEW.method);
END;
CREATE TRIGGER IF NOT EXISTS duty_method_history_ad AFTER DELETE ON duty_method_history BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_method', 'tenant', 'delete',
    json_object('effective_date', OLD.effective_date, 'method', OLD.method),
    NULL;
END;
