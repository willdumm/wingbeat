import { dashboardStyles } from './dashboard/styles';
import { dashboardMarkup } from './dashboard/markup';
import { dashboardScripts } from './dashboard/scripts/index';
import { themeVars, themeFontImport, themeInitScript } from './shared/theme';
import { viewportHeightInitScript } from './shared/viewport';
import { brandStyles, logoFaviconHref, logoFaviconScript } from './shared/brand';
import { iconStyles, iconRuntimeScript } from './shared/icons';
import { statusStyles } from './shared/status';
import { segmentedControlStyles } from './shared/segmented-control';
import { PMTILES_SCRIPT_SRI, PMTILES_SCRIPT_URL } from '@wingbeat/core/elevation';
import { formModalStyles } from './shared/form-modal';
import { flightEditsStyles } from './shared/flight-edits';
import { flightEditorStyles } from './shared/flight-editor';
import { AppSettings, settingsAsClientObject } from './settings';
import { escapeHtml, jsonForScript } from './shared/html';
import { coreBundleScript } from './shared/core-bundle';
import { Env } from './types';
import type { BasemapPreset } from '@wingbeat/core/basemaps';
import type { VectorBasemap } from '@wingbeat/core/api/bootstrap';
import { maplibreHeadTags, maplibreStyles } from './shared/maplibre';

/** The dashboard's stylesheet after the font import and theme tokens. The docs-site
 * showcase (src/showcase/) adopts it as-is for its dashboard demos. */
export function dashboardPageStyles(): string {
  return brandStyles() + iconStyles() + statusStyles() + segmentedControlStyles() + formModalStyles() + flightEditsStyles() + flightEditorStyles() + maplibreStyles() + dashboardStyles();
}

export function dashboardHTML(settings: AppSettings, env: Env, nonce: string,
  { basemaps, vector_basemaps }: { basemaps: BasemapPreset[]; vector_basemaps: VectorBasemap[] }): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${escapeHtml(settings.app_name)}</title>
  <link rel="icon" href="${logoFaviconHref()}" />
  <script nonce="${nonce}">${themeInitScript()}</script>
  <script nonce="${nonce}">${viewportHeightInitScript()}</script>
  <script nonce="${nonce}">${logoFaviconScript()}</script>
  ${maplibreHeadTags(nonce)}
  <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU" crossorigin="anonymous"></script>
  <script nonce="${nonce}" src="${PMTILES_SCRIPT_URL}" integrity="${PMTILES_SCRIPT_SRI}" crossorigin="anonymous"></script>
  <script nonce="${nonce}" src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js" integrity="sha384-xlHvwOp6tVxLcI04ruwDHJIpPVNUP8eGUUmGzM8wPdz1spvksYyV3MFdMEC6dejr" crossorigin="anonymous"></script>
  <style>${themeFontImport()}${themeVars()}${dashboardPageStyles()}</style>
</head>
<body>
<script nonce="${nonce}">window.APP_SETTINGS=${settingsAsClientObject(settings, env)};</script>
<script nonce="${nonce}">window.APP_BASEMAPS=${jsonForScript(basemaps)};window.APP_VECTOR_BASEMAPS=${jsonForScript(vector_basemaps)};</script>
${dashboardMarkup(settings.app_name)}
  ${coreBundleScript(nonce)}
  <script nonce="${nonce}">${iconRuntimeScript()}${dashboardScripts()}</script>
</body>
</html>`;
}
