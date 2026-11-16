-- push_devices.time_sensitive: the tracker events (takeoff, landing, gap) this device gets as
-- iOS Time Sensitive pushes, as a JSON array; the app sends it when it registers
-- (docs/mobile-app-plan.md, "Step 2: app push for hosted instances"). NULL is a device that
-- hasn't said, which gets gap only, as before.
ALTER TABLE push_devices ADD COLUMN time_sensitive TEXT;
