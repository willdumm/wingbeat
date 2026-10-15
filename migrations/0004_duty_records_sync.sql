-- Duty records, continued from 0003: history for a tracked flight's aircraft and pilot,
-- and incremental sync of flight corrections from edit_history.

-- Edit history for a tracked flight's aircraft and pilot (docs/duty-log-editing-plan.md,
-- "Compliance review"). They live on flights (PUT /api/flights/assignment, the flight form's
-- assign, a tracker's apply-assignment), not in flight_corrections, so moving a flight
-- between pilots changed two duty logs without a trace. A manual flight's are already
-- recorded by the flight_corrections triggers (migration 0003).
--
-- Keyed '<tracker_id>/<start_time>' like the tracker's flight's corrections, which outlives
-- segmentation re-inserting the flight under a new id. Segmentation only deletes and
-- inserts flights, never updates these columns, so only real reassignments are recorded;
-- an update that sets them to what they already were isn't.
--
-- Like 0003's triggers, this one lists its columns: a later migration that adds an
-- assignment field to flights (or a column to flight_corrections or duty_days, for 0003's)
-- has to drop and recreate the trigger, or the new column isn't recorded.
CREATE TRIGGER IF NOT EXISTS flights_assignment_history_au AFTER UPDATE OF pilot_id, aircraft_tail ON flights
WHEN OLD.pilot_id IS NOT NEW.pilot_id OR OLD.aircraft_tail IS NOT NEW.aircraft_tail
BEGIN
  INSERT INTO edit_history (user_id, user_name, entity, entity_key, action, before, after)
  SELECT (SELECT user_id FROM edit_actor WHERE id = 1), (SELECT user_name FROM edit_actor WHERE id = 1),
    'flight_assignment', IFNULL(NEW.tracker_id, '') || '/' || NEW.start_time, 'update',
    json_object('pilot_id', OLD.pilot_id, 'aircraft_tail', OLD.aircraft_tail),
    json_object('pilot_id', NEW.pilot_id, 'aircraft_tail', NEW.aircraft_tail);
END;

-- The flight store syncs flight corrections incrementally (GET /api/flight-corrections
-- ?since=<edit_history id>): edit_history already records every insert, update and delete
-- of a row, keyed like the client merges them, so the keys changed after the client's
-- cursor are what it needs to fetch. This index serves that scan and the cursor (the
-- newest id per entity).
CREATE INDEX IF NOT EXISTS idx_edit_history_entity_id ON edit_history(entity, id);

-- That replaces flight_corrections_version (0002), the write counter the client compared
-- before refetching every row.
DROP TRIGGER IF EXISTS flight_corrections_ai;
DROP TRIGGER IF EXISTS flight_corrections_au;
DROP TRIGGER IF EXISTS flight_corrections_ad;
DROP TABLE IF EXISTS flight_corrections_version;
