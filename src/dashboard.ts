import { dashboardStyles } from './dashboard/styles';
import { dashboardMarkup } from './dashboard/markup';
import { dashboardScripts } from './dashboard/scripts/index';
import { themeVars, themeFontImport, themeInitScript } from './shared/theme';
import { mapLayerColorInitScript } from './shared/map-controls';
import { viewportHeightInitScript } from './shared/viewport';
import { brandStyles, logoFaviconHref, logoFaviconScript } from './shared/brand';
import { iconStyles, iconRuntimeScript } from './shared/icons';
import { statusStyles } from './shared/status';
import { segmentedControlStyles } from './shared/segmented-control';
import { formModalStyles } from './shared/form-modal';
import { flightEditsStyles } from './shared/flight-edits';
import { flightEditorStyles } from './shared/flight-editor';
import { AppSettings, settingsAsClientObject } from './settings';
import { escapeHtml } from './shared/html';
import { Env } from './types';

/** The dashboard's stylesheet after the font import and theme tokens. The docs-site
 * showcase (src/showcase/) adopts it as-is for its dashboard demos. */
export function dashboardPageStyles(): string {
  return brandStyles() + iconStyles() + statusStyles() + segmentedControlStyles() + formModalStyles() + flightEditsStyles() + flightEditorStyles() + dashboardStyles();
}

export function dashboardHTML(settings: AppSettings, env: Env, nonce: string): string {
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
  <script nonce="${nonce}">${mapLayerColorInitScript()}</script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H" crossorigin="anonymous" />
  <script nonce="${nonce}" src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH" crossorigin="anonymous"></script>
  <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU" crossorigin="anonymous"></script>
  <script nonce="${nonce}" src="https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js" integrity="sha384-QfbOCebHNw8pQiPAOd2IFee2v2A5VYZxBk0+JGZ5H+3mfzVIp6zsQNkTsfGJot93" crossorigin="anonymous"></script>
  <script nonce="${nonce}" src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js" integrity="sha384-xlHvwOp6tVxLcI04ruwDHJIpPVNUP8eGUUmGzM8wPdz1spvksYyV3MFdMEC6dejr" crossorigin="anonymous"></script>
  <style>${themeFontImport()}${themeVars()}${dashboardPageStyles()}</style>
</head>
<body>
<script nonce="${nonce}">window.APP_SETTINGS=${settingsAsClientObject(settings)};</script>
${dashboardMarkup(settings.app_name)}
  <script nonce="${nonce}">${iconRuntimeScript()}${dashboardScripts(env)}</script>
</body>
</html>`;
}
