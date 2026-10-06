export interface Tracker {
  id: number;
  name: string;
  type: string;
  source_url: string;
  active: boolean;
  deleted: boolean;
  assigned_aircraft: string | null;
  assigned_pilot: number | null;
}

export interface MaintenanceItem {
  id: string;
  name: string;
  schedule_type: 'hobbs' | 'tach' | 'calendar';
  interval_hours?: number;
  last_done_value?: number;
  interval_months?: number;
  last_done_at?: number;
}

export interface Aircraft {
  tail_number: string;
  name: string | null;
  active: boolean;
  hobbs_time: number | null;
  hobbs_recorded_at: number | null;
  hobbs_correction: number;
  tach_time: number | null;
  tach_recorded_at: number | null;
  tach_correction: number;
  maintenance_schedule: MaintenanceItem[] | null;
}

export interface Pilot {
  id: number;
  name: string;
  active: boolean;
}

export interface Point {
  id: number;
  garmin_time: number;
  lat: number;
  lon: number;
  elevation_m: number | null;
  velocity_kmh: number | null;
  course_deg: number | null;
  event: string | null;
  raw_kml: string | null;
  location_label: string | null;
  tracker_id: number | null;
  aircraft_tail: string | null;
  pilot_id: number | null;
}

export interface Flight {
  id: number;
  tracker_id: number;
  start_time: number;
  /**
   * Unix timestamp (seconds) of the last GPS fix in this flight segment.
   * Always set in the DB — never null in practice. The schema allows null only
   * transiently during a write. In-progress state is determined at runtime:
   * the most recent flight is considered "in progress" when the current GPS
   * velocity is at or above the flight threshold, not by a null end_time.
   */
  end_time: number | null;
  point_count: number;
  max_speed_kmh: number | null;
  notes: string | null;
  origin_label: string | null;
  destination_label: string | null;
  aircraft_tail: string | null;
  pilot_id: number | null;
}

/** A single GPS point embedded in a FlightRecord, using compact field names. */
export interface FlightPoint {
  t: number;          // garmin_time
  lat: number;
  lon: number;
  v: number | null;   // velocity_kmh
  e: number | null;   // elevation_m
  c: number | null;   // course_deg
}

/**
 * Complete flight record returned by GET /api/flights/complete.
 * Includes embedded GPS points and start/end coordinates.
 */
export interface FlightRecord {
  id: number;
  tracker_id: number;
  start_time: number;
  end_time: number | null;
  modified_at: number;
  origin_label: string | null;
  destination_label: string | null;
  aircraft_tail: string | null;
  pilot_id: number | null;
  pilot_name: string | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
  points: FlightPoint[];
}

export interface ParsedPoint {
  garmin_time: number;
  lat: number;
  lon: number;
  elevation_m: number | null;
  velocity_kmh: number | null;
  course_deg: number | null;
  event: string | null;
  raw_kml: string;
}

export interface User {
  id: number;
  name: string;
  role: 'admin' | 'viewer';
  is_env_admin: number;
  created_at: number;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  device_name: string | null;
  created_at: number;
  last_seen_at: number;
}

export interface Webhook {
  id: number;
  type: 'webhook' | 'pushover';
  url: string; // '' for type 'pushover'
  pushover_user_key: string | null; // set only for type 'pushover'
  label: string | null;
  events: string; // JSON array of 'takeoff' | 'landing' | 'gap'
  active: boolean;
  created_at: number;
  last_triggered_at: number | null;
  last_status: number | null;
  last_error: string | null;
}

/**
 * Tenant-configured tile overlay (e.g. a sectional chart or custom imagery server),
 * shown in the map legend and independently toggleable — distinct from the
 * per-device basemap layers in shared/map-controls.ts, which are mutually
 * exclusive and never synced to D1. `default_enabled` is the tenant-wide fallback
 * starting state; `default_enabled_by_basemap` optionally overrides it per basemap
 * preset id (e.g. on by default over "topo", off over "satellite"). Either way,
 * each viewer's own toggle choice is stored client-side and overrides both.
 */
export interface TileOverlay {
  id: number;
  label: string;
  url: string;
  attribution: string | null;
  /** The tile source's max *native* zoom, applied client-side as Leaflet's
   * maxNativeZoom (not maxZoom) so the layer keeps showing upscaled tiles past this
   * point instead of vanishing to reveal the basemap — see _ftSyncOverlayLayer. */
  max_zoom: number | null;
  default_enabled: boolean;
  default_enabled_by_basemap: Record<string, boolean> | null;
}

export interface InviteToken {
  id: number;
  token: string;
  type: 'invite' | 'device_link';
  invited_name: string | null;
  invited_role: string | null;
  user_id: number | null;
  expires_at: number;
  used: number;
}

export interface Env {
  POLLER_SECRET: string;
  CUSTOMER_ROUTING: string; // JSON: { "hostname": "BINDING_NAME", ... }
  // Keyed tile provider secrets — one per hoster deployment, shared by every tenant,
  // never per-tenant D1 data. Optional: a preset naming an unset var here simply drops
  // out of the basemap picker rather than erroring.
  CARTO_API_KEY?: string;
}

/**
 * Per-request tenant context, resolved once by the routing middleware.
 * `key` is the D1 binding name — the stable tenant identity used to key
 * in-memory caches (multiple hostnames may route to the same binding).
 * `host` is the request hostname, used only for outbound User-Agent strings.
 */
export interface Tenant {
  db: D1Database;
  key: string;
  host: string;
}
