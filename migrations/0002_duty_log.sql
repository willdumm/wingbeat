-- Pilot duty log corrections and duty/rest days (docs/duty-log-editing-plan.md). Only the
-- duty log reads these; flights, points and segmentation are untouched.

-- Duty-log corrections. A row with tracker_id + flight_start_time corrects the tracked
-- flight with that start time: each NULL field means "use the tracker's value". A row
-- with both NULL is a manual flight, which sets its own pilot, aircraft and times.
CREATE TABLE IF NOT EXISTS flight_log_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id        INTEGER REFERENCES trackers(id),
  flight_start_time INTEGER,
  start_time        INTEGER,
  end_time          INTEGER,
  origin_label      TEXT,
  destination_label TEXT,
  part91            INTEGER NOT NULL DEFAULT 0,
  excluded          INTEGER NOT NULL DEFAULT 0,   -- removed from the duty log
  pilot_id          INTEGER REFERENCES pilots(id),            -- manual flights only
  aircraft_tail     TEXT REFERENCES aircraft(tail_number),    -- manual flights only
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (tracker_id, flight_start_time),
  CHECK ((tracker_id IS NULL) = (flight_start_time IS NULL)),
  CHECK (tracker_id IS NULL OR (pilot_id IS NULL AND aircraft_tail IS NULL)),
  CHECK (tracker_id IS NOT NULL OR
         (pilot_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_flight_log_entries_pilot ON flight_log_entries(pilot_id);

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
