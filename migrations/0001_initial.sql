-- Full schema. New migrations start at 0002_ (see README.md, "Database migrations").

-- ── Fleet ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aircraft (
  tail_number          TEXT PRIMARY KEY,
  name                 TEXT,
  active               INTEGER NOT NULL DEFAULT 1,
  hobbs_time           REAL,
  hobbs_recorded_at    INTEGER,
  hobbs_correction     REAL NOT NULL DEFAULT 1.0,
  tach_time            REAL,
  tach_recorded_at     INTEGER,
  tach_correction      REAL NOT NULL DEFAULT 1.0,
  maintenance_schedule TEXT
);

CREATE TABLE IF NOT EXISTS pilots (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

-- A tracker is the partition boundary for points and flights. assigned_aircraft /
-- assigned_pilot are independent and nullable; points and flights snapshot them at
-- ingest time. credentials is a JSON blob for tracker types that need one.
CREATE TABLE IF NOT EXISTS trackers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  source_url        TEXT NOT NULL,
  active            INTEGER NOT NULL DEFAULT 1,
  deleted           INTEGER NOT NULL DEFAULT 0,
  assigned_aircraft TEXT REFERENCES aircraft(tail_number),
  assigned_pilot    INTEGER REFERENCES pilots(id),
  credentials       TEXT,
  UNIQUE(name, type, source_url)
);

-- gap_alerted marks that the current in-flight silence has been alerted (cleared when
-- points resume, which sends gap_resolved); gap_last_alert_at throttles the repeats to
-- about one per minute across concurrent callers.
CREATE TABLE IF NOT EXISTS poll_state (
  tracker_id        INTEGER PRIMARY KEY REFERENCES trackers(id),
  last_polled       INTEGER NOT NULL DEFAULT 0,
  last_quick_poll   INTEGER NOT NULL DEFAULT 0,
  flight_status     TEXT NOT NULL DEFAULT 'grounded',
  last_point_time   INTEGER,
  gap_alerted       INTEGER NOT NULL DEFAULT 0,
  gap_last_alert_at INTEGER NOT NULL DEFAULT 0
);

-- ── Tracking data ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS points (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_time    INTEGER NOT NULL,
  lat            REAL    NOT NULL,
  lon            REAL    NOT NULL,
  elevation_m    REAL,
  velocity_kmh   REAL,
  course_deg     REAL,
  event          TEXT,
  raw_kml        TEXT,
  location_label TEXT,
  place_lat      REAL,
  place_lon      REAL,
  tracker_id     INTEGER REFERENCES trackers(id),
  aircraft_tail  TEXT REFERENCES aircraft(tail_number),
  pilot_id       INTEGER REFERENCES pilots(id),
  -- Set when Overpass answered for a flight boundary point but had no named place nearby, so
  -- geocodePendingPoints stops re-asking it. Named points are still checked for these points
  -- (adding one nearby labels them); only the Overpass lookup is skipped.
  geocode_empty_at INTEGER,
  UNIQUE(garmin_time, tracker_id)
);

CREATE INDEX IF NOT EXISTS idx_points_time ON points(garmin_time);
CREATE INDEX IF NOT EXISTS idx_points_tracker_time ON points(tracker_id, garmin_time);

-- AUTOINCREMENT keeps concurrent Workers from colliding on a reused id.
CREATE TABLE IF NOT EXISTS flights (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id        INTEGER REFERENCES trackers(id),
  start_time        INTEGER NOT NULL,
  end_time          INTEGER,
  point_count       INTEGER NOT NULL DEFAULT 0,
  max_speed_kmh     REAL,
  notes             TEXT,
  origin_label      TEXT,
  destination_label TEXT,
  aircraft_tail     TEXT REFERENCES aircraft(tail_number),
  pilot_id          INTEGER REFERENCES pilots(id),
  modified_at       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_flights_start ON flights(start_time);
CREATE INDEX IF NOT EXISTS idx_flights_modified ON flights(modified_at);
CREATE INDEX IF NOT EXISTS idx_flights_tracker_modified ON flights(tracker_id, modified_at);
CREATE INDEX IF NOT EXISTS idx_flights_tracker_start ON flights(tracker_id, start_time);

CREATE TABLE IF NOT EXISTS point_flights (
  point_id  INTEGER NOT NULL REFERENCES points(id),
  flight_id INTEGER NOT NULL REFERENCES flights(id),
  PRIMARY KEY (point_id)
);

CREATE INDEX IF NOT EXISTS idx_point_flights_flight ON point_flights(flight_id);

-- ── Users and auth ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  role         TEXT    NOT NULL DEFAULT 'viewer',
  is_env_admin INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS users_env_admin ON users(is_env_admin) WHERE is_env_admin = 1;

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT    NOT NULL UNIQUE,
  device_name  TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS sessions_token ON sessions(token);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT    NOT NULL UNIQUE,
  type         TEXT    NOT NULL,
  invited_name TEXT,
  invited_role TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (type = 'invite'      AND invited_name IS NOT NULL AND invited_role IS NOT NULL AND user_id IS NULL) OR
    (type = 'device_link' AND user_id IS NOT NULL AND invited_name IS NULL AND invited_role IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS invite_tokens_token ON invite_tokens(token);

-- ── Tenant configuration ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name',           'Wingbeat');
INSERT OR IGNORE INTO settings (key, value) VALUES ('timezone',           'UTC');
INSERT OR IGNORE INTO settings (key, value) VALUES ('map_default_lat',    '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('map_default_lng',    '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('map_default_zoom',   '2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('gap_alert_minutes',  '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('pushover_api_token', '');

CREATE TABLE IF NOT EXISTS named_points (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT    NOT NULL,
  lat    REAL    NOT NULL,
  lon    REAL    NOT NULL,
  max_km REAL
);

CREATE INDEX IF NOT EXISTS idx_named_points_lat_lon ON named_points (lat, lon);

-- A region whose name ends in "(Base)" is a home base (see src/analytics/scripts/region.ts).
CREATE TABLE IF NOT EXISTS regions (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL,
  geojson TEXT    NOT NULL
);

-- Shared, independently toggleable tile layers drawn over the basemap. default_enabled
-- is the tenant-wide starting state; default_enabled_by_basemap is an optional JSON
-- object of basemap-preset-id -> boolean that overrides it per basemap. A viewer's own
-- on/off choice is stored client-side and overrides both.
CREATE TABLE IF NOT EXISTS tile_overlays (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  label                      TEXT    NOT NULL,
  url                        TEXT    NOT NULL,
  attribution                TEXT,
  max_zoom                   INTEGER,
  default_enabled            INTEGER NOT NULL DEFAULT 0,
  default_enabled_by_basemap TEXT
);

-- ── Notifications ────────────────────────────────────────────────────────────

-- type selects delivery: 'webhook' posts to url; 'pushover' sends to pushover_user_key
-- using the shared pushover_api_token setting (url is '' for those rows).
CREATE TABLE IF NOT EXISTS webhooks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  url               TEXT NOT NULL,
  label             TEXT,
  events            TEXT NOT NULL DEFAULT '["takeoff","landing","gap"]',
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  last_triggered_at INTEGER,
  last_status       INTEGER,
  last_error        TEXT,
  type              TEXT NOT NULL DEFAULT 'webhook',
  pushover_user_key TEXT
);
