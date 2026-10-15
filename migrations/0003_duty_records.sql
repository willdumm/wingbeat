-- Duty-record integrity and compliance (docs/duty-log-editing-plan.md, "Compliance
-- review"): an Unpaid flag on flights.

-- Unpaid flying isn't "other commercial flying" (FAA interpretations to Martindell, 2009,
-- and Rodriguez, 2012), so the duty log leaves it out of the §135.267 limits. Only a Part 91
-- flight can be unpaid: Part 135 is air transportation for compensation.
ALTER TABLE flight_corrections ADD COLUMN unpaid INTEGER NOT NULL DEFAULT 0 CHECK (unpaid = 0 OR part91 = 1);
