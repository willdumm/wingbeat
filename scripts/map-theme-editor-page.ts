/** The theme editor's page (map-theme-editor.mjs): its color pickers and the live map. */
import { namedFlavor } from '@protomaps/basemaps';
import { mapStyle } from '@wingbeat/core/map-style';
import { MAP_THEME, type MapTheme } from '@wingbeat/core/map-theme';

declare const ARCHIVE_URL: string;
declare const maplibregl: any;
declare const pmtiles: any;

/** Each picker and the flavor's keys it sets together. `landcover.x` is inside the flavor's landcover. */
const GROUPS: [string, [string, string[]][]][] = [
  ['Water', [
    ['Water', ['water']],
    ['Labels', ['ocean_label']],
  ]],
  ['Land', [
    ['Land', ['earth', 'background']],
    ['Parks and protected land', ['park_a', 'park_b']],
    ['Woods', ['wood_a', 'wood_b']],
    ['Scrub', ['scrub_a', 'scrub_b']],
    ['Glaciers', ['glacier']],
    ['Sand', ['sand']],
    ['Beaches', ['beach']],
    ['Military', ['military']],
  ]],
  ['Land cover, zoomed out', [
    ['Forest', ['landcover.forest']],
    ['Grassland', ['landcover.grassland']],
    ['Scrub', ['landcover.scrub']],
    ['Barren', ['landcover.barren']],
    ['Glacier', ['landcover.glacier']],
    ['Farmland', ['landcover.farmland']],
    ['Urban', ['landcover.urban_area']],
  ]],
  ['Airports', [
    ['Airport grounds', ['aerodrome']],
    ['Runways and taxiways', ['runway']],
  ]],
  ['Roads', [
    ['Highways', ['highway', 'bridges_highway', 'tunnel_highway']],
    ['Major roads', ['major', 'link', 'bridges_major', 'bridges_link', 'tunnel_major', 'tunnel_link']],
    ['Minor roads', ['minor_a', 'minor_b', 'minor_service', 'bridges_minor', 'tunnel_minor']],
    ['Paths and other', ['other', 'bridges_other', 'tunnel_other']],
    ['Road outlines', ['minor_service_casing', 'minor_casing', 'link_casing', 'major_casing_late', 'major_casing_early',
      'highway_casing_late', 'highway_casing_early', 'bridges_other_casing', 'bridges_minor_casing', 'bridges_link_casing',
      'bridges_major_casing', 'bridges_highway_casing', 'tunnel_other_casing', 'tunnel_minor_casing', 'tunnel_link_casing',
      'tunnel_major_casing', 'tunnel_highway_casing']],
    ['Railways', ['railway']],
    ['Road names', ['roads_label_minor', 'roads_label_major']],
  ]],
  ['Built up', [
    ['Buildings', ['buildings']],
    ['Piers', ['pier']],
    ['Industrial', ['industrial']],
    ['Schools and hospitals', ['school', 'hospital']],
    ['Pedestrian areas', ['pedestrian']],
  ]],
  ['Borders and place names', [
    ['Borders', ['boundaries']],
    ['Towns', ['city_label']],
    ['Neighborhoods', ['subplace_label']],
    ['States and countries', ['state_label', 'country_label']],
    ['Name outlines', ['city_label_halo', 'subplace_label_halo', 'state_label_halo', 'roads_label_minor_halo', 'roads_label_major_halo', 'address_label_halo']],
  ]],
];

type Colors = Record<string, string>;
const theme = structuredClone(MAP_THEME) as MapTheme & { colors: Colors & { landcover?: Colors } };
/** What a landcover picker shows before any is picked (the flavor then draws none): the light flavor's. */
const LIGHT_LANDCOVER = namedFlavor('light').landcover as unknown as Colors;
const base = () => namedFlavor(theme.base) as unknown as Colors & { landcover?: Colors };

/** A color as #rrggbb, which a color input needs (some flavor colors are rgba() or names). */
function hex(color: string): string {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return '#' + [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
}

const landcoverKey = (key: string) => key.startsWith('landcover.') ? key.slice('landcover.'.length) : null;
function colorOf(key: string): string {
  const cover = landcoverKey(key);
  if (cover) return hex(theme.colors.landcover?.[cover] ?? base().landcover?.[cover] ?? LIGHT_LANDCOVER[cover]);
  return hex(theme.colors[key] ?? base()[key]);
}
const isChanged = (key: string) => landcoverKey(key) ? theme.colors.landcover != null : key in theme.colors;

function set(key: string, color: string) {
  const cover = landcoverKey(key);
  if (!cover) { theme.colors[key] = color; return; }
  // The flavor needs every landcover color once it has one.
  theme.colors.landcover ??= Object.fromEntries(Object.keys(LIGHT_LANDCOVER).map((k) => [k, colorOf('landcover.' + k)]));
  theme.colors.landcover[cover] = color;
}

const $ = (id: string) => document.getElementById(id)!;
const style = () => mapStyle({
  basemap: { kind: 'vector', id: 'map', label: 'Map', url: ARCHIVE_URL, attribution: '', maxZoom: 13 },
  overlays: [], origin: location.origin, pixelRatio: devicePixelRatio, background: '#e8e4de', theme,
});

maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
const map = new maplibregl.Map({ container: 'map', style: style(), center: [-152.4, 57.79], zoom: 9, hash: true });
map.addControl(new maplibregl.NavigationControl());

function render() {
  ($('base') as HTMLSelectElement).value = theme.base;
  $('groups').replaceChildren(...GROUPS.flatMap(([title, rows]) => {
    const h = document.createElement('h2');
    h.textContent = title;
    return [h, ...rows.map(([name, keys]) => {
      const label = document.createElement('label');
      label.classList.toggle('changed', keys.some(isChanged));
      const text = document.createElement('span');
      text.textContent = name;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = colorOf(keys[0]);
      input.addEventListener('input', () => {
        keys.forEach((k) => set(k, input.value));
        label.classList.add('changed');
        apply();
      });
      label.append(text, input);
      return label;
    })];
  }));
}

function apply() {
  map.setStyle(style());
  ($('json') as HTMLTextAreaElement).value = JSON.stringify(theme, null, 2);
  $('status').textContent = '';
}

$('base').addEventListener('change', () => { theme.base = ($('base') as HTMLSelectElement).value as MapTheme['base']; render(); apply(); });
$('reset').addEventListener('click', () => { theme.colors = {}; render(); apply(); });
$('save').addEventListener('click', async () => {
  const res = await fetch('/save', { method: 'POST', body: JSON.stringify(theme) });
  $('status').textContent = await res.text();
});
render();
apply();
