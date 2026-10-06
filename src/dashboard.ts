import { dashboardStyles } from './dashboard/styles';
import { dashboardMarkup } from './dashboard/markup';
import { dashboardScripts } from './dashboard/scripts/index';
import { themeVars, themeFontImport, themeInitScript } from './shared/theme';
import { mapLayerColorInitScript } from './shared/map-controls';
import { brandStyles, logoFaviconHref, logoFaviconScript } from './shared/brand';
import { iconStyles, iconRuntimeScript } from './shared/icons';
import { statusStyles } from './shared/status';
import { segmentedControlStyles } from './shared/segmented-control';
import { AppSettings, settingsAsClientObject } from './settings';
import { Env } from './types';

/** The dashboard's stylesheet after the font import and theme tokens. The docs-site
 * showcase (src/showcase/) adopts it as-is for its dashboard demos. */
export function dashboardPageStyles(): string {
  return brandStyles() + iconStyles() + statusStyles() + segmentedControlStyles() + dashboardStyles();
}

export function dashboardHTML(settings: AppSettings, env: Env): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${settings.app_name}</title>
  <link rel="icon" href="${logoFaviconHref()}" />
  <script>${themeInitScript()}</script>
  <script>${logoFaviconScript()}</script>
  <script>${mapLayerColorInitScript()}</script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://unpkg.com/pmtiles@3/dist/pmtiles.js"></script>
  <script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>
  <style>${themeFontImport()}${themeVars()}${dashboardPageStyles()}</style>
</head>
<body>
<script>window.APP_SETTINGS=${settingsAsClientObject(settings)};</script>
${dashboardMarkup(settings.app_name)}
  <script>${iconRuntimeScript()}${dashboardScripts(env)}</script>
</body>
</html>`;
}
