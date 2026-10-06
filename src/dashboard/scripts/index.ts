import { SPEED_THRESHOLD_KMH } from '../../geo';
import { Env } from '../../types';
import { themeRuntimeScript } from '../../shared/theme';
import { mapLayerColorRuntimeScript, mapLayersRuntimeScript, overlayLegendRuntimeScript } from '../../shared/map-controls';
import { toggleScript } from '../../shared/toggle';
import { flightStoreScript } from '../../shared/flight-store';
import { filterScript } from '../../shared/filters';
import { dashboardScriptsState } from './state';
import { dashboardScriptsHelpers } from './helpers';
import { dashboardScriptsIcons } from './icons';
import { dashboardScriptsHover } from './hover';
import { dashboardScriptsDayView } from './day-view';
import { dashboardScriptsAircraftCards } from './aircraft-cards';
import { dashboardScriptsLive } from './live';
import { dashboardScriptsLocationPopup } from './location-popup';
import { dashboardScriptsPointPicker } from './point-picker';
import { elevationToolScript } from '../../shared/elevation';
import { dashboardScriptsFlightListRender, dashboardScriptsFlightList } from './flight-list';
import { dashboardScriptsTrackRender } from './track-render';
import { dashboardScriptsRefresh } from './refresh';
import { settingsModalScript } from '../../shared/settings';
import { pilotDutyScript } from '../../shared/pilot-duty';
import { aircraftInfoScript } from '../../shared/aircraft-info';
import { dashboardScriptsAircraft } from './aircraft';
import { dashboardScriptsAssignmentModal } from './assignment-modal';
import { dashboardScriptsBulkEdit } from './bulk-edit';
import { dashboardScriptsAlerts } from './alerts';
import { dashboardScriptsInit } from './init';

/**
 * Returns the complete client-side <script> block as a single IIFE string.
 *
 * Assembly order matters for const/let declarations: state must come first
 * so all subsequent chunks can reference the shared variables. Function
 * declarations are hoisted within the IIFE, so the ordering of function-only
 * chunks is flexible, but we keep a logical reading order regardless.
 */
export function dashboardScripts(env: Env): string {
  const body = [
    themeRuntimeScript(),
    mapLayerColorRuntimeScript(),
    mapLayersRuntimeScript(env),
    toggleScript(),
    dashboardScriptsState(SPEED_THRESHOLD_KMH),
    overlayLegendRuntimeScript(),
    flightStoreScript(),
    filterScript(),
    dashboardScriptsHelpers(),
    dashboardScriptsIcons(),
    dashboardScriptsHover(),
    dashboardScriptsTrackRender(),
    dashboardScriptsDayView(),
    dashboardScriptsAircraftCards(),
    dashboardScriptsLive(),
    dashboardScriptsLocationPopup(),
    dashboardScriptsPointPicker(),
    elevationToolScript(),
    dashboardScriptsFlightListRender(),
    dashboardScriptsFlightList(),
    dashboardScriptsRefresh(),
    settingsModalScript(),
    pilotDutyScript(),
    aircraftInfoScript(),
    dashboardScriptsAircraft(),
    dashboardScriptsAssignmentModal(),
    dashboardScriptsBulkEdit(),
    dashboardScriptsAlerts(),
    dashboardScriptsInit(),
  ].join('\n');

  return `(() => {\n${body}\n})();`;
}
