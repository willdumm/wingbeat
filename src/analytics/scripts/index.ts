import { Env } from '../../types';
import { themeRuntimeScript } from '../../shared/theme';
import { mapLayerColorRuntimeScript, mapLayersRuntimeScript, overlayLegendRuntimeScript } from '../../shared/map-controls';
import { toggleScript } from '../../shared/toggle';
import { flightStoreScript } from '../../shared/flight-store';
import { filterScript } from '../../shared/filters';
import { settingsModalScript } from '../../shared/settings';
import { pilotDutyScript } from '../../shared/pilot-duty';
import { aircraftInfoScript } from '../../shared/aircraft-info';
import { analyticsScriptsRegion } from './region';
import { analyticsScriptsAccounting } from './accounting';
import { analyticsScriptsTime } from './time';
import { analyticsScriptsStreamgraphRender, analyticsScriptsStreamgraph } from './streamgraph';
import { analyticsScriptsLayers } from './layers';
import { analyticsScriptsMap } from './map';
import { analyticsScriptsInfoPopup } from './info-popup';

export function analyticsScripts(env: Env): string {
  const body = [
    themeRuntimeScript(),
    mapLayerColorRuntimeScript(),
    mapLayersRuntimeScript(env),
    overlayLegendRuntimeScript(),
    toggleScript(),
    flightStoreScript(),
    filterScript(),
    settingsModalScript(),
    pilotDutyScript(),
    aircraftInfoScript(),
    analyticsScriptsRegion(),
    analyticsScriptsTime(),
    analyticsScriptsAccounting(),
    analyticsScriptsStreamgraphRender(),
    analyticsScriptsStreamgraph(),
    analyticsScriptsLayers(),
    analyticsScriptsMap(),
    analyticsScriptsInfoPopup(),
  ].join('\n');
  return `(() => {\n${body}\n})();`;
}
