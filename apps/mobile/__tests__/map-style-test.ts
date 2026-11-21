import { availableBasemaps, defaultBasemapId, defaultOverlayIds, liveMapStyle, tileUrls, vectorAssetsBase } from '@/lib/map-style';

const ORIGIN = 'https://a.wingbeat.dummthings.dev';

const raster = (id: string, over: object = {}) => ({
  id, label: id, url: `https://tiles.example/${id}/{z}/{x}/{y}.png`, attribution: 'credit', maxZoom: 16, ...over,
});
const alaska = { id: 'alaska', label: 'Alaska', url: 'https://tiles.example/pm/alaska.pmtiles', attribution: 'OSM', maxZoom: 15 };

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

test("the basemaps to offer are the server's raster ones, then its vector ones; the default is the first", () => {
  const offered = availableBasemaps({ basemaps: [raster('usgstopo'), raster('satellite')], vector_basemaps: [alaska] });
  expect(offered.map((b) => [b.id, b.kind])).toEqual([['usgstopo', 'raster'], ['satellite', 'raster'], ['alaska', 'vector']]);
  expect(defaultBasemapId(offered)).toBe('usgstopo');
  // A server older than `vector_basemaps` (or than `basemaps`) sends fewer.
  expect(availableBasemaps({ basemaps: [raster('usgstopo')] }).map((b) => b.id)).toEqual(['usgstopo']);
  expect(availableBasemaps({})).toEqual([]);
  expect(availableBasemaps(null)).toEqual([]);
  expect(defaultBasemapId([])).toBeNull();
});

test("with each one's order, the basemaps follow the tenant's order across both kinds", () => {
  const offered = availableBasemaps({
    basemaps: [raster('usgstopo', { order: 1 }), raster('satellite', { order: 2 })],
    vector_basemaps: [{ ...alaska, order: 0 }],
  });
  expect(offered.map((b) => b.id)).toEqual(['alaska', 'usgstopo', 'satellite']);
  expect(defaultBasemapId(offered)).toBe('alaska');
});

test("overlays default on per basemap, else by default_enabled", () => {
  const overlays = [overlay(1, { default_enabled: 1 }), overlay(2, { default_enabled_by_basemap: { topo: true } })];
  expect(defaultOverlayIds(overlays, 'topo')).toEqual([1, 2]);
  expect(defaultOverlayIds(overlays, 'satellite')).toEqual([1]);
});

test('the style: background, then the basemap, then the overlays that are on', () => {
  const satellite = availableBasemaps({ basemaps: [raster('satellite', { maxZoom: 18, detectRetina: true })] })[0];
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

test('a vector basemap: its PMTiles archive as the source, the Protomaps layers, glyphs and sprites beside the archive', () => {
  const vector = availableBasemaps({ vector_basemaps: [alaska] })[0];
  const style = liveMapStyle({
    basemap: vector, overlays: [overlay(4)], origin: ORIGIN, pixelRatio: 2, background: '#000',
  });
  expect(style.sources['basemap-alaska']).toEqual({
    type: 'vector', url: 'pmtiles://https://tiles.example/pm/alaska.pmtiles', maxzoom: 15, attribution: 'OSM',
  });
  expect(style.glyphs).toBe('https://tiles.example/pm/basemaps-assets/fonts/{fontstack}/{range}.pbf');
  expect(style.sprite).toBe('https://tiles.example/pm/basemaps-assets/sprites/v4/white');
  const ids = style.layers.map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[0]).toBe('background');
  expect(ids[ids.length - 1]).toBe('overlay-4');
  const fromArchive = style.layers.filter((l) => 'source' in l && l.source === 'basemap-alaska');
  expect(fromArchive.length).toBeGreaterThan(20);
  expect(vectorAssetsBase('https://x.example/alaska.pmtiles')).toBe('https://x.example/basemaps-assets');
});
