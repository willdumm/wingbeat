-- Duty-record integrity and compliance (docs/duty-log-editing-plan.md, "Compliance
-- review"): an Unpaid flag on flights, and an append-only history of every change to
-- flight corrections and duty days.

-- Unpaid flying isn't "other commercial flying" (FAA interpretations to Martindell, 2009,
-- and Rodriguez, 2012), so the duty log leaves it out of the §135.267 limits. Only a Part 91
-- flight can be unpaid: Part 135 is air transportation for compensation.
ALTER TABLE flight_corrections ADD COLUMN unpaid INTEGER NOT NULL DEFAULT 0 CHECK (unpaid = 0 OR part91 = 1);

-- Who changed the duty records, when, and from what (§135.63: the records must show
-- compliance, so edits to them are traceable). One row per insert, update or delete of a
-- flight_corrections or duty_days row, written by the triggers below whichever route makes
-- the change. Append-only: the triggers at the end refuse updates and deletes.
CREATE TABLE IF NOT EXISTS edit_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id    INTEGER,          -- users.id of who made it (no foreign key: users can be deleted)
  user_name  TEXT,             -- their name at the time; both NULL for a write outside the app's routes
  entity     TEXT NOT NULL,    -- 'flight_corrections' or 'duty_days'
  entity_key TEXT NOT NULL,    -- '<tracker_id>/<flight_start_time>', 'manual/<id>' or '<pilot_id>/<date>'
  action     TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before     TEXT,             -- the row as JSON (without updated_at); NULL for an insert
  after      TEXT              -- NULL for a delete
);
CREATE INDEX IF NOT EXISTS idx_edit_history_entity ON edit_history(entity, entity_key, id);

CREATE TRIGGER IF NOT EXISTS edit_history_no_update BEFORE UPDATE ON edit_history
  BEGIN SELECT RAISE(ABORT, 'edit_history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS edit_history_no_delete BEFORE DELETE ON edit_history
  BEGIN SELECT RAISE(ABORT, 'edit_history is append-only'); END;

-- The signed-in user making the current write, for the triggers. recordedBatch() in
-- src/index.ts sets it as the first statement of a write's batch and clears it as the
-- last; a D1 batch is one transaction, so it never outlives the write.
CREATE TABLE IF NOT EXISTS edit_actor (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  user_id   INTEGER NOT NULL,
  user_name TEXT NOT NULL
);

-- An update that changes nothing but updated_at (a bulk action on a flight already set
-- that way) isn't recorded.
CREATE TRIGGER IF NOT EXISTS flight_corrections_history_ai AFTER INSERT ON flight_corrections BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'flight_corrections', CASE WHEN NEW.tracker_id IS NULL THEN 'manual/' || NEW.id ELSE NEW.tracker_id || '/' || NEW.flight_start_time END, 'insert',
    NULL,
    json_object(
      'id', NEW.id,
      'tracker_id', NEW.tracker_id,
      'flight_start_time', NEW.flight_start_time,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'origin_label', NEW.origin_label,
      'destination_label', NEW.destination_label,
      'remark', NEW.remark,
      'start_lat', NEW.start_lat,
      'start_lon', NEW.start_lon,
      'end_lat', NEW.end_lat,
      'end_lon', NEW.end_lon,
      'part91', NEW.part91,
      'unpaid', NEW.unpaid,
      'excluded', NEW.excluded,
      'pilot_id', NEW.pilot_id,
      'aircraft_tail', NEW.aircraft_tail);
END;
CREATE TRIGGER IF NOT EXISTS flight_corrections_history_au AFTER UPDATE ON flight_corrections
WHEN json_object(
    'id', OLD.id,
    'tracker_id', OLD.tracker_id,
    'flight_start_time', OLD.flight_start_time,
    'start_time', OLD.start_time,
    'end_time', OLD.end_time,
    'origin_label', OLD.origin_label,
    'destination_label', OLD.destination_label,
    'remark', OLD.remark,
    'start_lat', OLD.start_lat,
    'start_lon', OLD.start_lon,
    'end_lat', OLD.end_lat,
    'end_lon', OLD.end_lon,
    'part91', OLD.part91,
    'unpaid', OLD.unpaid,
    'excluded', OLD.excluded,
    'pilot_id', OLD.pilot_id,
    'aircraft_tail', OLD.aircraft_tail) IS NOT json_object(
    'id', NEW.id,
    'tracker_id', NEW.tracker_id,
    'flight_start_time', NEW.flight_start_time,
    'start_time', NEW.start_time,
    'end_time', NEW.end_time,
    'origin_label', NEW.origin_label,
    'destination_label', NEW.destination_label,
    'remark', NEW.remark,
    'start_lat', NEW.start_lat,
    'start_lon', NEW.start_lon,
    'end_lat', NEW.end_lat,
    'end_lon', NEW.end_lon,
    'part91', NEW.part91,
    'unpaid', NEW.unpaid,
    'excluded', NEW.excluded,
    'pilot_id', NEW.pilot_id,
    'aircraft_tail', NEW.aircraft_tail)
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'flight_corrections', CASE WHEN NEW.tracker_id IS NULL THEN 'manual/' || NEW.id ELSE NEW.tracker_id || '/' || NEW.flight_start_time END, 'update',
    json_object(
      'id', OLD.id,
      'tracker_id', OLD.tracker_id,
      'flight_start_time', OLD.flight_start_time,
      'start_time', OLD.start_time,
      'end_time', OLD.end_time,
      'origin_label', OLD.origin_label,
      'destination_label', OLD.destination_label,
      'remark', OLD.remark,
      'start_lat', OLD.start_lat,
      'start_lon', OLD.start_lon,
      'end_lat', OLD.end_lat,
      'end_lon', OLD.end_lon,
      'part91', OLD.part91,
      'unpaid', OLD.unpaid,
      'excluded', OLD.excluded,
      'pilot_id', OLD.pilot_id,
      'aircraft_tail', OLD.aircraft_tail),
    json_object(
      'id', NEW.id,
      'tracker_id', NEW.tracker_id,
      'flight_start_time', NEW.flight_start_time,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'origin_label', NEW.origin_label,
      'destination_label', NEW.destination_label,
      'remark', NEW.remark,
      'start_lat', NEW.start_lat,
      'start_lon', NEW.start_lon,
      'end_lat', NEW.end_lat,
      'end_lon', NEW.end_lon,
      'part91', NEW.part91,
      'unpaid', NEW.unpaid,
      'excluded', NEW.excluded,
      'pilot_id', NEW.pilot_id,
      'aircraft_tail', NEW.aircraft_tail);
END;
CREATE TRIGGER IF NOT EXISTS flight_corrections_history_ad AFTER DELETE ON flight_corrections BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'flight_corrections', CASE WHEN OLD.tracker_id IS NULL THEN 'manual/' || OLD.id ELSE OLD.tracker_id || '/' || OLD.flight_start_time END, 'delete',
    json_object(
      'id', OLD.id,
      'tracker_id', OLD.tracker_id,
      'flight_start_time', OLD.flight_start_time,
      'start_time', OLD.start_time,
      'end_time', OLD.end_time,
      'origin_label', OLD.origin_label,
      'destination_label', OLD.destination_label,
      'remark', OLD.remark,
      'start_lat', OLD.start_lat,
      'start_lon', OLD.start_lon,
      'end_lat', OLD.end_lat,
      'end_lon', OLD.end_lon,
      'part91', OLD.part91,
      'unpaid', OLD.unpaid,
      'excluded', OLD.excluded,
      'pilot_id', OLD.pilot_id,
      'aircraft_tail', OLD.aircraft_tail),
    NULL;
END;

CREATE TRIGGER IF NOT EXISTS duty_days_history_ai AFTER INSERT ON duty_days BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_days', NEW.pilot_id || '/' || NEW.date, 'insert',
    NULL,
    json_object(
      'pilot_id', NEW.pilot_id,
      'date', NEW.date,
      'duty_start', NEW.duty_start,
      'duty_end', NEW.duty_end,
      'rest', NEW.rest,
      'rest_designated_at', NEW.rest_designated_at,
      'note', NEW.note);
END;
CREATE TRIGGER IF NOT EXISTS duty_days_history_au AFTER UPDATE ON duty_days
WHEN json_object(
    'pilot_id', OLD.pilot_id,
    'date', OLD.date,
    'duty_start', OLD.duty_start,
    'duty_end', OLD.duty_end,
    'rest', OLD.rest,
    'rest_designated_at', OLD.rest_designated_at,
    'note', OLD.note) IS NOT json_object(
    'pilot_id', NEW.pilot_id,
    'date', NEW.date,
    'duty_start', NEW.duty_start,
    'duty_end', NEW.duty_end,
    'rest', NEW.rest,
    'rest_designated_at', NEW.rest_designated_at,
    'note', NEW.note)
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_days', NEW.pilot_id || '/' || NEW.date, 'update',
    json_object(
      'pilot_id', OLD.pilot_id,
      'date', OLD.date,
      'duty_start', OLD.duty_start,
      'duty_end', OLD.duty_end,
      'rest', OLD.rest,
      'rest_designated_at', OLD.rest_designated_at,
      'note', OLD.note),
    json_object(
      'pilot_id', NEW.pilot_id,
      'date', NEW.date,
      'duty_start', NEW.duty_start,
      'duty_end', NEW.duty_end,
      'rest', NEW.rest,
      'rest_designated_at', NEW.rest_designated_at,
      'note', NEW.note);
END;
CREATE TRIGGER IF NOT EXISTS duty_days_history_ad AFTER DELETE ON duty_days BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'duty_days', OLD.pilot_id || '/' || OLD.date, 'delete',
    json_object(
      'pilot_id', OLD.pilot_id,
      'date', OLD.date,
      'duty_start', OLD.duty_start,
      'duty_end', OLD.duty_end,
      'rest', OLD.rest,
      'rest_designated_at', OLD.rest_designated_at,
      'note', OLD.note),
    NULL;
END;
