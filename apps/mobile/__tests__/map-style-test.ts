import { clientBasemapPresets } from '@wingbeat/core/basemaps';
import { availableBasemaps, defaultBasemapId, defaultOverlayIds, liveMapStyle, tileUrls } from '@/lib/map-style';

const ORIGIN = 'https://a.wingbeat.dummthings.dev';

const overlay = (id: number, over: object = {}) => ({
  id, label: 'O' + id, url: `https://tiles.example/${id}/{Z}/{X}/{Y}.png`, attribution: null, max_zoom: null,
  default_enabled: 0, default_enabled_by_basemap: null, ...over,
});

test('{s} becomes one URL per subdomain and {r} @2x only on a high-density screen', () => {
  expect(tileUrls('https://{s}.example/{z}/{x}/{y}{r}.png', ORIGIN, 3)).toEqual([
    'https://a.example/{z}/{x}/{y}@2x.png', 'https://b.example/{z}/{x}/{y}@2x.png', 'https://c.example/{z}/{x}/{y}@2x.png',
  ]);
  expect(tileUrls('https://x.example/{z}/{x}/{y}{r}.png', ORIGIN, 1)).toEqual(['https://x.example/{z}/{x}/{y}.png']);
});

test('a proxy path is made absolute on the instance, and placeholders lowercased', () => {
  expect(tileUrls('/api/tiles/map/{z}/{x}/{y}{r}.png', ORIGIN, 2)).toEqual([ORIGIN + '/api/tiles/map/{z}/{x}/{y}@2x.png']);
  expect(tileUrls('https://t.example/{Z}/{X}/{Y}', ORIGIN, 1)).toEqual(['https://t.example/{z}/{x}/{y}']);
});

test("a server without basemaps gets core's keyless presets; the default is the web's first", () => {
  const fallback = availableBasemaps({});
  expect(fallback).toEqual(clientBasemapPresets(() => false));
  expect(fallback.some((b) => b.url.startsWith('/api/tiles'))).toBe(false);
  expect(defaultBasemapId(fallback)).toBe('topo');
  expect(defaultBasemapId(clientBasemapPresets(() => true))).toBe('map');
  expect(defaultBasemapId([])).toBeNull();
});

test("overlays default on per basemap, else by default_enabled", () => {
  const overlays = [overlay(1, { default_enabled: 1 }), overlay(2, { default_enabled_by_basemap: { topo: true } })];
  expect(defaultOverlayIds(overlays, 'topo')).toEqual([1, 2]);
  expect(defaultOverlayIds(overlays, 'satellite')).toEqual([1]);
});

test('the style: background, then the basemap, then the overlays that are on', () => {
  const satellite = clientBasemapPresets(() => false).find((b) => b.id === 'satellite')!;
  const style = liveMapStyle({
    basemap: satellite, overlays: [overlay(4, { max_zoom: 12, attribution: 'FAA' })],
    origin: ORIGIN, pixelRatio: 2, background: '#000',
  });
  expect(style.layers.map((l) => l.id)).toEqual(['background', 'basemap-satellite', 'overlay-4']);
  expect(style.sources['basemap-satellite']).toMatchObject({ type: 'raster', tileSize: 128, maxzoom: 18 });
  expect(style.sources['overlay-4']).toMatchObject({ tiles: ['https://tiles.example/4/{z}/{x}/{y}.png'], maxzoom: 12, attribution: 'FAA' });
  expect(liveMapStyle({ basemap: satellite, overlays: [], origin: ORIGIN, pixelRatio: 1, background: '#000' })
    .sources['basemap-satellite']).toMatchObject({ tileSize: 256 });
});
