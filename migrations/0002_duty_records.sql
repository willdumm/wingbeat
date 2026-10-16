-- Duty records: flight corrections, manual flights, pilot duty/rest days, the dated
-- default duty and §135.267 method, and an append-only history of every change to them
-- (docs/duty-log-editing-plan.md, docs/flight-editor-plan.md). flights, points and
-- segmentation are untouched: the corrections are an overlay the client applies to the
-- flights it loads, so every page (flight list, analytics, maintenance, alerts, duty log)
-- shows the same corrected flights.

-- Flight corrections. A row with tracker_id + flight_start_time corrects the tracked
-- flight with that start time: each NULL field means "use the tracker's value". A row
-- with both NULL is a manual flight, which sets its own pilot, aircraft and times.
CREATE TABLE IF NOT EXISTS flight_corrections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id        INTEGER REFERENCES trackers(id),
  flight_start_time INTEGER,
  start_time        INTEGER,
  end_time          INTEGER,
  origin_label      TEXT,
  destination_label TEXT,
  remark            TEXT,     -- free-text remark (e.g. "Training"); shown under the flight
  start_lat         REAL,     -- manual flights only: endpoints picked from named points,
  start_lon         REAL,     -- so analytics can place them in a region. Tracked flights
  end_lat           REAL,     -- take coordinates from their points.
  end_lon           REAL,
  part91            INTEGER NOT NULL DEFAULT 0,
  -- Unpaid flying isn't "other commercial flying" (FAA interpretations to Martindell, 2009,
  -- and Rodriguez, 2012), so the duty log leaves it out of the §135.267 limits. Only a
  -- Part 91 flight can be unpaid: Part 135 is air transportation for compensation.
  unpaid            INTEGER NOT NULL DEFAULT 0 CHECK (unpaid = 0 OR part91 = 1),
  excluded          INTEGER NOT NULL DEFAULT 0,   -- removed: hidden everywhere but the flight editor
  pilot_id          INTEGER REFERENCES pilots(id),            -- manual flights only
  aircraft_tail     TEXT REFERENCES aircraft(tail_number),    -- manual flights only
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (tracker_id, flight_start_time),
  CHECK ((tracker_id IS NULL) = (flight_start_time IS NULL)),
  CHECK (tracker_id IS NULL OR (pilot_id IS NULL AND aircraft_tail IS NULL)),
  CHECK (tracker_id IS NULL OR
         (start_lat IS NULL AND start_lon IS NULL AND end_lat IS NULL AND end_lon IS NULL)),
  CHECK (tracker_id IS NOT NULL OR
         (pilot_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_flight_corrections_pilot ON flight_corrections(pilot_id);

-- Per-pilot, per-local-date duty times or rest designation (not both).
CREATE TABLE IF NOT EXISTS duty_days (
  pilot_id           INTEGER NOT NULL REFERENCES pilots(id),
  date               TEXT NOT NULL,       -- YYYY-MM-DD in the tenant timezone
  duty_start         TEXT,                -- HH:MM local
  duty_end           TEXT,                -- HH:MM local; may be < duty_start (past midnight)
  rest               INTEGER NOT NULL DEFAULT 0,
  rest_designated_at INTEGER,             -- set when rest is first marked; kept on later edits
  note               TEXT,
  PRIMARY KEY (pilot_id, date),
  CHECK (rest = 0 OR (duty_start IS NULL AND duty_end IS NULL))
);

-- Effective-dated default duty and §135.267 method (docs/duty-log-editing-plan.md, "Dated
-- default duty and method"). A day with no duty times uses the pilot's default duty, and
-- the method picks the daily checks. Each is a dated list, so changing either from a date
-- on leaves the months before it as they were, and every change is in edit_history.
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

-- The method starts with one (b) entry: otherwise the first change, say to (c) from today,
-- would be the earliest entry and so apply to every past month too. Its date is a fixed
-- early one rather than the migration's, so a change "from today" on the day this is
-- deployed adds an entry instead of overwriting this one. It's written before the history
-- triggers below, so it isn't in edit_history.
INSERT OR IGNORE INTO duty_method_history (effective_date, method) VALUES ('2000-01-01', 'b');

-- Who changed the duty records, when, and from what (§135.63: the records must show
-- compliance, so edits to them are traceable). One row per insert, update or delete, written
-- by the triggers below whichever route makes the change. Append-only: the two triggers
-- after it refuse updates and deletes.
CREATE TABLE IF NOT EXISTS edit_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id    INTEGER,          -- users.id of who made it (no foreign key: users can be deleted)
  user_name  TEXT,             -- their name at the time; both NULL for a write outside the app's routes
  entity     TEXT NOT NULL,    -- 'flight_corrections', 'duty_days', 'flight_assignment', 'pilot_default_duty' or 'duty_method'
  entity_key TEXT NOT NULL,    -- '<tracker_id>/<flight_start_time>', 'manual/<id>', '<pilot_id>/<date>', '<pilot_id>' or 'tenant'
  action     TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before     TEXT,             -- the row as JSON (without updated_at); NULL for an insert
  after      TEXT              -- NULL for a delete
);
CREATE INDEX IF NOT EXISTS idx_edit_history_entity ON edit_history(entity, entity_key, id);
-- The flight store syncs flight corrections incrementally (GET /api/flight-corrections
-- ?since=<edit_history id>): edit_history already records every insert, update and delete
-- of a row, keyed like the client merges them, so the keys changed after the client's
-- cursor are what it needs to fetch. This index serves that scan and the cursor (the
-- newest id per entity).
CREATE INDEX IF NOT EXISTS idx_edit_history_entity_id ON edit_history(entity, id);

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

-- The history triggers list their columns: a later migration that adds a column to one of
-- these tables (or an assignment field to flights) has to drop and recreate its triggers,
-- or the new column isn't recorded.

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

-- A tracked flight's aircraft and pilot live on flights (PUT /api/flights/assignment, the
-- flight form's assign, a tracker's apply-assignment), not in flight_corrections; a manual
-- flight's are recorded by the flight_corrections triggers above. Keyed
-- '<tracker_id>/<start_time>' like the tracked flight's corrections, which outlives
-- segmentation re-inserting the flight under a new id. Segmentation only deletes and
-- inserts flights, never updates these columns, so only real reassignments are recorded;
-- an update that sets them to what they already were isn't.
CREATE TRIGGER IF NOT EXISTS flights_assignment_history_au AFTER UPDATE OF pilot_id, aircraft_tail ON flights
WHEN OLD.pilot_id IS NOT NEW.pilot_id OR OLD.aircraft_tail IS NOT NEW.aircraft_tail
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'flight_assignment', IFNULL(NEW.tracker_id, '') || '/' || NEW.start_time, 'update',
    json_object('pilot_id', OLD.pilot_id, 'aircraft_tail', OLD.aircraft_tail),
    json_object('pilot_id', NEW.pilot_id, 'aircraft_tail', NEW.aircraft_tail);
END;

-- The dated default duty and method: each list is one record to its form, which shows and
-- saves against all of it, so a pilot's default duty is keyed '<pilot_id>', the method
-- 'tenant'.
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
