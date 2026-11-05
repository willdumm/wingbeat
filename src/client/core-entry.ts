/**
 * The browser entry of @wingbeat/core (built by scripts/build-core.mjs). It assigns the
 * core functions to the global names the pages' inline scripts already call, so a script
 * string's logic can move to core without its callers changing. Glue only: anything that
 * reads the page (window.APP_SETTINGS, the clock) is bound here, and core itself takes it
 * as a parameter.
 *
 * Pages load it through coreBundleScript() (src/shared/core-bundle.ts), before their own
 * script.
 */
import * as flightEdits from '@wingbeat/core/flight-edits';
import type { FlightCorrection, FlightEditField } from '@wingbeat/core/flight-edits';
import * as time from '@wingbeat/core/time';
import * as duty from '@wingbeat/core/duty';
import type { ComputeDutyDataOptions, DutyDay, DutyInputFlight, DutyInterval } from '@wingbeat/core/duty';
import * as corrections from '@wingbeat/core/corrections';
import type { FlightFormFields, FlightFormTarget, FlightFormValues, FlightSaveOptions } from '@wingbeat/core/corrections';
import * as editHistory from '@wingbeat/core/edit-history';
import type { EditHistoryRow } from '@wingbeat/core/api/edit-history';
import * as filters from '@wingbeat/core/filters';
import type { FilterState } from '@wingbeat/core/filters';
import * as live from '@wingbeat/core/live';
import * as maintenance from '@wingbeat/core/maintenance';
import type { MaintenanceItem } from '@wingbeat/core/maintenance';
import * as alerts from '@wingbeat/core/alerts';
import type { AlertLists } from '@wingbeat/core/alerts';
import * as regions from '@wingbeat/core/regions';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import type { Regions } from '@wingbeat/core/regions';
import * as accounting from '@wingbeat/core/accounting';
import type { AccountingFlight } from '@wingbeat/core/accounting';
import * as analytics from '@wingbeat/core/analytics';
import type { StreamInterval } from '@wingbeat/core/analytics';
import * as elevation from '@wingbeat/core/elevation';
import * as settings from '@wingbeat/core/settings';
import { createApiClient } from '@wingbeat/core/api/client';
import * as dutyApi from '@wingbeat/core/api/duty';
import * as correctionsApi from '@wingbeat/core/api/corrections';
import { getEditHistory } from '@wingbeat/core/api/edit-history';
import { getBootstrap } from '@wingbeat/core/api/bootstrap';
import * as trackersApi from '@wingbeat/core/api/trackers';
import * as aircraftApi from '@wingbeat/core/api/aircraft';
import * as pilotsApi from '@wingbeat/core/api/pilots';
import * as meApi from '@wingbeat/core/api/me';
import * as usersApi from '@wingbeat/core/api/users';
import * as overlaysApi from '@wingbeat/core/api/overlays';
import * as settingsApi from '@wingbeat/core/api/settings';
import * as webhooksApi from '@wingbeat/core/api/webhooks';
import * as regionsApi from '@wingbeat/core/api/regions';
import * as namedPointsApi from '@wingbeat/core/api/named-points';
import { createFlightStore, FLIGHT_STORE_KEY } from '@wingbeat/core/flight-store';

declare const window: {
  APP_SETTINGS: { timezone: string };
  addEventListener(type: 'storage', listener: (e: { key: string | null }) => void): void;
};
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };

// Read on every call: the settings modal can change the timezone without a reload.
const tz = () => window.APP_SETTINGS.timezone;
// The clock, in Unix seconds (tests set the page's Date.now()).
const now = () => Math.floor(Date.now() / 1000);

Object.assign(globalThis, {
  // ── time: in the operator's timezone ──
  tzLocalToEpoch: (dateKey: string, hhmm?: string) => time.tzLocalToEpoch(tz(), dateKey, hhmm),
  tzDayStartUnix: (y: number, m: number, d: number) => time.tzDayStartUnix(tz(), y, m, d),
  unixToTzDateStr: (unix: number) => time.unixToTzDateStr(tz(), unix),
  unixToTzMonthKey: (unix: number) => time.unixToTzMonthKey(tz(), unix),
  unixToTzTime: (unix: number) => time.unixToTzTime(tz(), unix),
  fmtTzTime: (unix: number) => time.fmtTzTime(tz(), unix),
  fmtTzPointTime: (unix: number) => time.fmtTzPointTime(tz(), unix),
  fmtTzDate: (unix: number) => time.fmtTzDate(tz(), unix),
  fmtTzDateTime: (unix: number) => time.fmtTzDateTime(tz(), unix),
  // ── time: date keys and durations ──
  tzAddDays: time.tzAddDays,
  tzDateKey: time.tzDateKey,
  tzAddMonths: time.tzAddMonths,
  tzDateLabel: time.tzDateLabel,
  tzLongDateLabel: time.tzLongDateLabel,
  tzShortDate: time.tzShortDate,
  fmtDuration: time.fmtDuration,
  // ── flight-edits: corrections applied to tracked flights, the flight form ──
  FLIGHT_EDIT_FIELD_NAMES: flightEdits.FLIGHT_EDIT_FIELD_NAMES,
  applyFlightEdits: flightEdits.applyFlightEdits,
  flightRemarks: flightEdits.flightRemarks,
  flightFieldEdited: flightEdits.flightFieldEdited,
  flightEntrySummary: (e: FlightCorrection) => flightEdits.flightEntrySummary(tz(), e),
  flightOriginalText: (field: FlightEditField, value: unknown) => flightEdits.flightOriginalText(tz(), field, value),
  flightFormTimes: (dateKey: string, dep: string, arr: string) => flightEdits.flightFormTimes(tz(), dateKey, dep, arr),
  // ── duty: the §135.267 duty log's rows, warnings and totals ──
  DUTY_TOTALS_FOOTNOTE: duty.DUTY_TOTALS_FOOTNOTE,
  currentDutyMonth: () => duty.currentDutyMonth(tz(), now()),
  dutyPeriodLabel: duty.dutyPeriodLabel,
  dutyRangeLabel: duty.dutyRangeLabel,
  dutyEntryOn: duty.dutyEntryOn,
  dutyDefaultOn: duty.dutyDefaultOn,
  dutyMethodOn: duty.dutyMethodOn,
  computeDutyData: (allFlights: DutyInputFlight[], pilotId: number, pilotName: string, year: number, month: number,
                    opts?: ComputeDutyDataOptions) =>
    duty.computeDutyData(tz(), now(), allFlights, pilotId, pilotName, year, month, opts),
  dutyDayText: (day: { rest: boolean; restDesignatedAt: number | null; duty: DutyInterval | null; defaultDuty: boolean }, year: number) =>
    duty.dutyDayText(tz(), day, year),
  dutySaveConfirmText: (records: DutyDay[], keys: string[], values: Parameters<typeof duty.dutySaveConfirmText>[3]) =>
    duty.dutySaveConfirmText(tz(), records, keys, values),
  dutyRemarksText: duty.dutyRemarksText,
  dutyExportPresets: duty.dutyExportPresets,
  // ── corrections: the flight editor's requests and the flight form's validation ──
  flightRef: corrections.flightRef,
  flightAssignmentRequest: corrections.flightAssignmentRequest,
  flightFlagsRequest: corrections.flightFlagsRequest,
  flightFormTimesOf: (fields: Pick<FlightFormFields, 'date' | 'dep' | 'arr'>) => corrections.flightFormTimesOf(tz(), fields),
  flightTimesChanged: corrections.flightTimesChanged,
  readFlightForm: (fields: FlightFormFields, target: FlightFormTarget) => corrections.readFlightForm(tz(), fields, target),
  flightSaveRequest: (v: FlightFormValues, target: FlightFormTarget, opts: FlightSaveOptions) =>
    corrections.flightSaveRequest(v, target, opts),
  // ── edit-history: the forms' "Last changed by …" and conflict text ──
  editConflictText: (conflict: { at: number; user_name?: string | null }) => editHistory.editConflictText(tz(), conflict),
  lastEditText: (h: EditHistoryRow, prev?: EditHistoryRow | null) => editHistory.lastEditText(tz(), h, prev),
  // ── filters: the flight filter's state and test (persisted by filters.ts) ──
  emptyFilterState: filters.emptyFilterState,
  normalizeFilterState: filters.normalizeFilterState,
  flightMatchesFilters: (flight: Parameters<typeof filters.matchesFlight>[1], state: FilterState) =>
    filters.matchesFlight(tz(), flight, state),
  // ── live: the status cards' and Live view's rules (the threshold is the server's) ──
  trackerLiveData: live.trackerLiveData,
  isInFlight: (d: Parameters<typeof live.isInFlight>[1]) => live.isInFlight(SPEED_THRESHOLD_KMH, d),
  isGpsFresh: (gpsTime: number) => live.isGpsFresh(now(), gpsTime),
  isFlightInProgress: (flight: Parameters<typeof live.isFlightInProgress>[1], flights: Parameters<typeof live.isFlightInProgress>[2],
                       liveByTracker: Parameters<typeof live.isFlightInProgress>[3]) =>
    live.isFlightInProgress(SPEED_THRESHOLD_KMH, flight, flights, liveByTracker),
  nextLivePoll: (liveByTracker: Parameters<typeof live.nextLivePoll>[2], lastKnownGarminTime: number | null) =>
    live.nextLivePoll(SPEED_THRESHOLD_KMH, now(), liveByTracker, lastKnownGarminTime),
  sameTrackedFlight: live.sameTrackedFlight,
  // ── maintenance: estimated meters and each schedule item's status ──
  _flightHours: maintenance.flightHours,
  _estimatedMeter: maintenance.estimatedMeter,
  _maintenanceStatus: (item: MaintenanceItem, estHobbs: number | null, estTach: number | null) =>
    maintenance.maintenanceStatus(tz(), now(), item, estHobbs, estTach),
  // ── alerts: the dashboard's alerts feed (its rows are HTML in alerts.ts) ──
  computeAlertsFor: (lists: AlertLists) => alerts.computeAlerts(tz(), now(), lists),
  // ── regions: distances and which region a point is in (the analytics page holds REGIONS
  // and wraps the …In functions under their old names) ──
  haversineKm: regions.haversineKm,
  isHomeBaseRegion: regions.isHomeBaseRegion,
  regionDisplayName: regions.regionDisplayName,
  OTHER_REGION: regions.OTHER_REGION,
  homeBaseNamesIn: regions.homeBaseNames,
  // ── accounting: region hours and stops, per operator month ──
  computeRegionHoursIn: accounting.computeRegionHours,
  computeRegionStopsIn: accounting.computeRegionStops,
  computeMonthlyAccountingIn: (r: Regions, flights: AccountingFlight[]) => accounting.computeMonthlyAccounting(tz(), r, flights),
  tzLongMonthLabel: time.tzLongMonthLabel,
  // ── analytics: the stream graph's buckets and data, the map layers' points ──
  sgResolveInterval: analytics.sgResolveInterval,
  sgGenerateBuckets: (s: number, e: number, iv: StreamInterval) => analytics.sgGenerateBuckets(tz(), s, e, iv),
  sgComputeDataIn: analytics.sgComputeData,
  interpolateRoutePoints: analytics.interpolateRoutePoints,
  endpointHeatPointsIn: analytics.endpointHeatPoints,
  // ── elevation: DEM tile math, Terrarium decoding and the tint's color ramp ──
  demZoomFor: elevation.demZoomFor,
  latLngToTilePixel: elevation.latLngToTilePixel,
  decodeTerrarium: elevation.decodeTerrarium,
  demSubTile: elevation.demSubTile,
  paintElevationTint: elevation.paintElevationTint,
  // ── settings: the tracker history import's windows, the timezone-change warning ──
  trackerImportWindows: (from: string) => settings.importWindows(tz(), now(), from),
  trackerImportDefaultFrom: () => settings.importDefaultFrom(tz(), now()),
  timezoneChangeWarning: settings.timezoneChangeWarning,
});

// ── flight-store: the page's one store, cached in localStorage ──
// The page's API client. Warn-only: a response that doesn't match its schema is logged and
// used anyway, until a release shows no mismatches (docs/mobile-app-plan.md, "The API
// contract"). Same-origin, so the session cookie goes with it.
const api = createApiClient({ mismatch: 'warn' });

Object.assign(globalThis, {
  // The pages' lists: the dashboard's first load, and each list again after a settings change.
  fetchBootstrap: () => getBootstrap(api),
  fetchTrackers: () => trackersApi.getTrackers(api),
  fetchAircraft: () => aircraftApi.getAircraft(api),
  fetchPilots: () => pilotsApi.getPilots(api),
  fetchOverlays: () => overlaysApi.getOverlays(api),
  // The signed-in user and their devices (Settings; the dashboard's heartbeat).
  fetchMe: () => meApi.getMe(api),
  fetchSessions: () => meApi.getSessions(api),
  renameSession: (id: number, body: meApi.SessionRenameRequest) => meApi.renameSession(api, id, body),
  deleteSession: (id: number) => meApi.deleteSession(api, id),
  createDeviceLink: () => meApi.createDeviceLink(api),
  pingSession: () => meApi.pingSession(api),
  // Settings' writes and admin reads (the trackers, aircraft, pilots, users, overlays,
  // settings and webhooks route groups).
  createTracker: (body: trackersApi.TrackerCreateRequest) => trackersApi.createTracker(api, body),
  updateTracker: (id: number, body: trackersApi.TrackerUpdateRequest) => trackersApi.updateTracker(api, id, body),
  deleteTracker: (id: number) => trackersApi.deleteTracker(api, id),
  testTrackerFeed: (body: trackersApi.TestFeedRequest) => trackersApi.testTrackerFeed(api, body),
  importTrackerHistory: (id: number, d1: string, d2: string | null) => trackersApi.importTrackerHistory(api, id, d1, d2),
  geocodeTracker: (id: number) => trackersApi.geocodeTracker(api, id),
  fetchTrackerUnassigned: (id: number) => trackersApi.getTrackerUnassigned(api, id),
  applyTrackerAssignment: (id: number, body: trackersApi.ApplyAssignmentRequest) => trackersApi.applyTrackerAssignment(api, id, body),
  createAircraft: (body: aircraftApi.AircraftCreateRequest) => aircraftApi.createAircraft(api, body),
  updateAircraft: (tail: string, body: aircraftApi.AircraftUpdateRequest) => aircraftApi.updateAircraft(api, tail, body),
  createPilot: (body: pilotsApi.PilotCreateRequest) => pilotsApi.createPilot(api, body),
  updatePilot: (id: number, body: pilotsApi.PilotUpdateRequest) => pilotsApi.updatePilot(api, id, body),
  fetchUsers: () => usersApi.getUsers(api),
  deleteUser: (id: number) => usersApi.deleteUser(api, id),
  fetchInvites: () => usersApi.getInvites(api),
  createInvite: (body: usersApi.InviteRequest) => usersApi.createInvite(api, body),
  deleteInvite: (id: number) => usersApi.deleteInvite(api, id),
  createOverlay: (body: overlaysApi.OverlayRequest) => overlaysApi.createOverlay(api, body),
  updateOverlay: (id: number, body: overlaysApi.OverlayRequest) => overlaysApi.updateOverlay(api, id, body),
  deleteOverlay: (id: number) => overlaysApi.deleteOverlay(api, id),
  fetchTileMetadata: (url: string) => overlaysApi.getTileMetadata(api, url),
  fetchSettings: () => settingsApi.getSettings(api),
  patchSettings: (body: settingsApi.SettingsRequest) => settingsApi.patchSettings(api, body),
  fetchDutyRecordCounts: () => settingsApi.getDutyRecordCounts(api),
  fetchWebhooks: () => webhooksApi.getWebhooks(api),
  createWebhook: (body: webhooksApi.WebhookCreateRequest) => webhooksApi.createWebhook(api, body),
  updateWebhook: (id: number, body: webhooksApi.WebhookUpdateRequest) => webhooksApi.updateWebhook(api, id, body),
  deleteWebhook: (id: number) => webhooksApi.deleteWebhook(api, id),
  // The map's regions and named points: every page reads them, Settings' editors write them.
  fetchRegions: () => regionsApi.getRegions(api),
  createRegion: (body: regionsApi.RegionRequest) => regionsApi.createRegion(api, body),
  updateRegion: (id: number, body: regionsApi.RegionRequest) => regionsApi.updateRegion(api, id, body),
  deleteRegion: (id: number) => regionsApi.deleteRegion(api, id),
  importRegions: (body: regionsApi.FeatureCollectionImportRequest) => regionsApi.importRegions(api, body),
  fetchNamedPoints: () => namedPointsApi.getNamedPoints(api),
  createNamedPoint: (body: namedPointsApi.NamedPointCreateRequest) => namedPointsApi.createNamedPoint(api, body),
  updateNamedPoint: (id: number, body: namedPointsApi.NamedPointUpdateRequest) => namedPointsApi.updateNamedPoint(api, id, body),
  deleteNamedPoint: (id: number) => namedPointsApi.deleteNamedPoint(api, id),
  importNamedPoints: (body: regionsApi.FeatureCollectionImportRequest) => namedPointsApi.importNamedPoints(api, body),
  // The duty log's reads and writes (the duty route group).
  fetchDutyLog: (pilotId: number | string) => dutyApi.getDutyLog(api, pilotId),
  fetchDutyMethods: () => dutyApi.getDutyMethods(api),
  putDutyDays: (pilotId: number | string, body: dutyApi.DutyDaysRequest) => dutyApi.putDutyDays(api, pilotId, body),
  clearDutyDays: (pilotId: number | string, body: dutyApi.DutyDaysClearRequest) => dutyApi.clearDutyDays(api, pilotId, body),
  putDefaultDuty: (pilotId: number | string, body: dutyApi.DefaultDutyRequest) => dutyApi.putDefaultDuty(api, pilotId, body),
  deleteDefaultDuty: (pilotId: number | string, date: string, baseHistoryId?: number | null) =>
    dutyApi.deleteDefaultDuty(api, pilotId, date, baseHistoryId),
  putDutyMethod: (body: dutyApi.DutyMethodRequest) => dutyApi.putDutyMethod(api, body),
  deleteDutyMethod: (date: string, baseHistoryId?: number | null) => dutyApi.deleteDutyMethod(api, date, baseHistoryId),
  // The flight editor's writes (the corrections route group).
  saveFlightCorrection: (body: correctionsApi.CorrectionRequest) => correctionsApi.saveFlightCorrection(api, body),
  updateManualFlight: (id: number, body: correctionsApi.CorrectionRequest) => correctionsApi.updateManualFlight(api, id, body),
  deleteFlightCorrection: (id: number, baseHistoryId?: number | null) => correctionsApi.deleteFlightCorrection(api, id, baseHistoryId),
  setFlightFlags: (body: correctionsApi.BulkFlagsRequest) => correctionsApi.setFlightFlags(api, body),
  setFlightAssignment: (body: correctionsApi.AssignmentRequest) => correctionsApi.setFlightAssignment(api, body),
  // A record's edit history (the forms' "Last changed by …").
  fetchEditHistory: (entities: string | string[], key: string, limit?: number) => getEditHistory(api, entities, key, limit),
  flightStore: createFlightStore({
    // Read when used, not now: tests swap the page's localStorage.
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    client: api,
    flightThresholdKmh: SPEED_THRESHOLD_KMH,
    // Another tab saved its copy.
    watchExternalChanges: (onChange) => window.addEventListener('storage', (e) => {
      if (e.key === FLIGHT_STORE_KEY) onChange();
    }),
  }),
});
