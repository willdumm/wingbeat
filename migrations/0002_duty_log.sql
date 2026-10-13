-- Flight corrections, manual flights and pilot duty/rest days
-- (docs/duty-log-editing-plan.md, docs/flight-editor-plan.md). flights, points and
-- segmentation are untouched: the corrections are an overlay the client applies to the
-- flights it loads, so every page (flight list, analytics, maintenance, alerts, duty log)
-- shows the same corrected flights.

-- Flight corrections. A row with tracker_id + flight_start_time corrects the tracked
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
  remark            TEXT,     -- free-text remark (e.g. "Training"); shown under the flight
  start_lat         REAL,     -- manual flights only: endpoints picked from named points,
  start_lon         REAL,     -- so analytics can place them in a region. Tracked flights
  end_lat           REAL,     -- take coordinates from their points.
  end_lon           REAL,
  part91            INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_flight_log_entries_pilot ON flight_log_entries(pilot_id);

-- Bumped on every write to flight_log_entries, so clients can tell cheaply whether
-- their cached copy is current. Triggers keep it right whichever route writes.
CREATE TABLE IF NOT EXISTS flight_log_version (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO flight_log_version (id, version) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS flight_log_entries_ai AFTER INSERT ON flight_log_entries
  BEGIN UPDATE flight_log_version SET version = version + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS flight_log_entries_au AFTER UPDATE ON flight_log_entries
  BEGIN UPDATE flight_log_version SET version = version + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS flight_log_entries_ad AFTER DELETE ON flight_log_entries
  BEGIN UPDATE flight_log_version SET version = version + 1 WHERE id = 1; END;

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

-- A pilot's usual duty period, used for flying days with no duty times recorded.
ALTER TABLE pilots ADD COLUMN default_duty_start TEXT;   -- HH:MM local
ALTER TABLE pilots ADD COLUMN default_duty_end   TEXT;   -- HH:MM local; may be < start
