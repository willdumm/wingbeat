/**
 * The compat snapshot for client API level 1 (CLIENT_API_LEVEL in ../version.ts): the
 * response schemas of every route the app calls at level 1, as the app at that level parses
 * them (docs/mobile-app-plan.md, "Versions and compatibility"). test/worker-sql.test.mjs
 * checks each route's real response against every snapshot in this directory, so a server
 * change that would break a phone still running level 1 fails CI.
 *
 * The schemas are copies, not imports of the live ones in ../*.ts, so that changing a live
 * schema can't change what this snapshot accepts. **Never edit a snapshot once its level has
 * shipped**; a new level gets its own file (2.ts, …), and a level's file is deleted only when
 * the server stops serving that level (MIN_CLIENT_LEVEL above it).
 *
 * Level 1 is phases 5 and 6 of the plan: pairing, the Live and Flights screens, the duty log
 * (its reads and the day, default-duty and flight-form writes) and account deletion:
 *
 *   POST   /api/app/pair
 *   GET    /api/bootstrap, GET /api/me, GET /api/me/sessions, POST /api/me/ping, DELETE /api/me
 *   GET    /api/flights/complete, GET /api/flight-corrections
 *   POST   /api/flight-corrections, PUT /api/flight-corrections/:id,
 *   DELETE /api/flight-corrections/:id, POST /api/flight-corrections/bulk,
 *   PUT    /api/flights/assignment
 *   GET    /api/duty-days, GET /api/duty-methods
 *   PUT    /api/duty-days/:pilot, POST /api/duty-days/:pilot/clear
 *   PUT    /api/pilots/:id/default-duty, DELETE /api/pilots/:id/default-duty/:date
 */
import * as z from 'zod/mini';

const num = z.number();
const nullableNum = z.nullable(z.number());
const nullableStr = z.nullable(z.string());
const optionalNum = z.nullish(z.number());

const OkResponse = z.looseObject({ ok: z.literal(true) });

// ── bootstrap and me ──

const Me = z.looseObject({
  id: num,
  name: z.string(),
  role: z.enum(['admin', 'viewer']),
  device_name: nullableStr,
  session_id: num,
});

const Tracker = z.looseObject({
  id: num,
  name: z.string(),
  type: z.string(),
  source_url: z.optional(z.string()),
  mapshare_url: nullableStr,
  active: num,
  deleted: num,
  assigned_aircraft: nullableStr,
  assigned_pilot: nullableNum,
});

const MaintenanceItem = z.looseObject({
  id: z.string(),
  name: z.string(),
  schedule_type: z.enum(['hobbs', 'tach', 'calendar']),
  interval_hours: optionalNum,
  last_done_value: optionalNum,
  interval_months: optionalNum,
  last_done_at: optionalNum,
});

const Aircraft = z.looseObject({
  tail_number: z.string(),
  name: nullableStr,
  active: num,
  hobbs_time: nullableNum,
  hobbs_recorded_at: nullableNum,
  hobbs_correction: num,
  tach_time: nullableNum,
  tach_recorded_at: nullableNum,
  tach_correction: num,
  maintenance_schedule: z.nullable(z.array(MaintenanceItem)),
});

const DefaultDutyEntry = z.looseObject({
  effective_date: z.string(),
  duty_start: nullableStr,
  duty_end: nullableStr,
});

const Pilot = z.looseObject({
  id: num,
  name: z.string(),
  active: num,
  default_duties: z.array(DefaultDutyEntry),
});

const TileOverlay = z.looseObject({
  id: num,
  label: z.string(),
  url: z.string(),
  attribution: nullableStr,
  max_zoom: nullableNum,
  default_enabled: num,
  default_enabled_by_basemap: z.nullable(z.record(z.string(), z.boolean())),
});

const BootstrapResponse = z.looseObject({
  me: Me,
  trackers: z.array(Tracker),
  aircraft: z.array(Aircraft),
  pilots: z.array(Pilot),
  overlays: z.array(TileOverlay),
  instance: z.optional(z.looseObject({
    app_name: z.string(),
    timezone: z.string(),
    map_default_lat: num,
    map_default_lng: num,
    map_default_zoom: num,
  })),
  api_version: z.optional(num),
  min_client_level: z.optional(num),
});

const PairResponse = z.looseObject({ token: z.string(), me: Me });

const SessionsResponse = z.looseObject({
  sessions: z.array(z.looseObject({
    id: num,
    device_name: nullableStr,
    created_at: num,
    last_seen_at: num,
  })),
});

// ── flights and corrections ──

const FlightPoint = z.looseObject({
  t: num, lat: num, lon: num, v: nullableNum, e: nullableNum, c: nullableNum,
});

const TrackedFlight = z.looseObject({
  id: num,
  tracker_id: num,
  start_time: num,
  end_time: nullableNum,
  modified_at: num,
  aircraft_tail: nullableStr,
  pilot_id: nullableNum,
  pilot_name: nullableStr,
  origin_label: nullableStr,
  destination_label: nullableStr,
  start_lat: nullableNum,
  start_lon: nullableNum,
  end_lat: nullableNum,
  end_lon: nullableNum,
  points: z.array(FlightPoint),
});

const FlightsCompleteResponse = z.looseObject({
  last_polled: nullableNum,
  live_label: nullableStr,
  geocode_pending: z.boolean(),
  last_point_time: z.optional(nullableNum),
  ground_trail: z.optional(z.array(FlightPoint)),
  flights: z.array(TrackedFlight),
  last_modified_at: z.optional(nullableNum),
  warning: z.optional(z.string()),
});

const FlightCorrectionRow = z.looseObject({
  id: num,
  tracker_id: nullableNum,
  flight_start_time: nullableNum,
  start_time: nullableNum,
  end_time: nullableNum,
  origin_label: nullableStr,
  destination_label: nullableStr,
  remark: nullableStr,
  start_lat: nullableNum,
  start_lon: nullableNum,
  end_lat: nullableNum,
  end_lon: nullableNum,
  part91: num,
  unpaid: num,
  excluded: num,
  pilot_id: nullableNum,
  aircraft_tail: nullableStr,
  updated_at: num,
});

const FlightCorrectionsResponse = z.looseObject({
  entries: z.array(FlightCorrectionRow),
  deleted: z.array(z.string()),
  last_history_id: num,
  full: z.optional(z.boolean()),
});

const CorrectionWriteResponse = z.looseObject({ entry: z.nullable(FlightCorrectionRow) });

const AssignmentResponse = z.looseObject({
  ok: z.literal(true),
  aircraft_tail: z.optional(nullableStr),
  pilot_id: z.optional(nullableNum),
  pilot_name: z.optional(nullableStr),
});

// ── the duty log ──

const DutyMethodEntry = z.looseObject({
  effective_date: z.string(),
  method: z.enum(['b', 'c']),
});

const DutyLogResponse = z.looseObject({
  days: z.array(z.looseObject({
    pilot_id: num,
    date: z.string(),
    duty_start: nullableStr,
    duty_end: nullableStr,
    rest: num,
    rest_designated_at: nullableNum,
    note: nullableStr,
  })),
  default_duties: z.array(DefaultDutyEntry),
  duty_methods: z.array(DutyMethodEntry),
  last_history_id: num,
});

const DutyMethodsResponse = z.looseObject({
  methods: z.array(DutyMethodEntry),
  last_history_id: num,
});

const DefaultDutiesResponse = z.looseObject({ default_duties: z.array(DefaultDutyEntry) });

/** Each route's response schema at level 1, keyed '<METHOD> <path as src/index.ts routes it>'. */
export const responses = {
  'POST /api/app/pair': PairResponse,
  'GET /api/bootstrap': BootstrapResponse,
  'GET /api/me': Me,
  'GET /api/me/sessions': SessionsResponse,
  'POST /api/me/ping': OkResponse,
  'DELETE /api/me': OkResponse,
  'GET /api/flights/complete': FlightsCompleteResponse,
  'GET /api/flight-corrections': FlightCorrectionsResponse,
  'POST /api/flight-corrections': CorrectionWriteResponse,
  'PUT /api/flight-corrections/:id': CorrectionWriteResponse,
  'DELETE /api/flight-corrections/:id': OkResponse,
  'POST /api/flight-corrections/bulk': OkResponse,
  'PUT /api/flights/assignment': AssignmentResponse,
  'GET /api/duty-days': DutyLogResponse,
  'GET /api/duty-methods': DutyMethodsResponse,
  'PUT /api/duty-days/:pilot': OkResponse,
  'POST /api/duty-days/:pilot/clear': OkResponse,
  'PUT /api/pilots/:id/default-duty': DefaultDutiesResponse,
  'DELETE /api/pilots/:id/default-duty/:date': DefaultDutiesResponse,
} as const;
