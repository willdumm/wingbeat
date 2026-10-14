-- Fixture data for docs/doc-screenshots-plan.md's screenshot generator.
--
-- Applied ONLY to an ephemeral `wrangler dev --local` D1 instance (see
-- gen-doc-shots.mjs) — never run against a real/deployed database. Replaces any
-- tracker/aircraft rows the migrations left behind with clearly-fake demo data so no
-- real user data can appear in a generated screenshot.

DELETE FROM poll_state;
DELETE FROM trackers;
DELETE FROM aircraft;

UPDATE settings SET value = 'Wingbeat Demo' WHERE key = 'app_name';

INSERT INTO aircraft (tail_number, name, active) VALUES
  ('N100DM', 'Demo Cub', 1),
  ('N200DM', 'Demo Beaver', 1);

INSERT INTO pilots (name, active) VALUES
  ('Alex Rivera', 1),
  ('Jordan Lee', 1);

INSERT INTO trackers (id, name, type, source_url, active, assigned_aircraft, assigned_pilot) VALUES
  (1, 'Demo Cub Tracker', 'inreach', 'https://share.garmin.com/Feed/Share/demoCub', 1, 'N100DM', 1),
  (2, 'Demo Beaver Tracker', 'inreach', 'https://share.garmin.com/Feed/Share/demoBeaver', 1, 'N200DM', 2);

-- Manual flights (flight_corrections rows with no tracker), so the flight editor has
-- rows to show: one Part 91 with a remark, one removed.
INSERT INTO flight_corrections (start_time, end_time, origin_label, destination_label, remark, part91, excluded, pilot_id, aircraft_tail) VALUES
  (1767254400, 1767258000, 'Lake Union', 'Friday Harbor', 'Training', 0, 0, 1, 'N100DM'),
  (1767265200, 1767268200, 'Friday Harbor', 'Lake Union', 'Ferry home', 1, 0, 1, 'N100DM'),
  (1767340800, 1767346200, 'Kenmore', 'Roche Harbor', NULL, 0, 0, 2, 'N200DM'),
  (1767351600, 1767355200, 'Roche Harbor', 'Kenmore', NULL, 0, 1, 2, 'N200DM');

-- Known invite token the generator "joins" through via the real POST /join/:token
-- handler (src/index.ts) to mint a real admin session — no auth-bypass code needed.
INSERT INTO invite_tokens (token, type, invited_name, invited_role, expires_at, used) VALUES
  ('doc-shots-seed-token', 'invite', 'Doc Shots', 'admin', 4102444800, 0);
