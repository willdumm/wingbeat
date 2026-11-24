// @wingbeat/core/map-style and map-layers, imported directly: the MapLibre style both clients'
// maps start from, and the layers they draw over it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const { availableBasemaps, chosenBasemap, defaultOverlayIds, mapColorPaint, mapStyle, tileUrls, vectorAssetsBase } = await importCore('map-style');
const layers = await importCore('map-layers');

const ORIGIN = 'https://a.wingbeat.dummthings.dev';

const raster = (id, over = {}) => ({
  id, label: id, url: `https://tiles.example/${id}/{z}/{x}/{y}.png`, attribution: 'credit', maxZoom: 16, ...over,
});
const alaska = { id: 'alaska', label: 'Alaska', url: 'https://tiles.example/pm/alaska.pmtiles', attribution: 'OSM', maxZoom: 15 };

const overlay = (id, over = {}) => ({
  id, label: 'O' + id, url: `https://tiles.example/${id}/{Z}/{X}/{Y}.png`, attribution: null, max_zoom: null,
  default_enabled: 0, default_enabled_by_basemap: null, ...over,
});

test('{s} becomes one URL per subdomain and {r} @2x only on a high-density screen', () => {
  assert.deepEqual(tileUrls('https://{s}.example/{z}/{x}/{y}{r}.png', ORIGIN, 3), [
    'https://a.example/{z}/{x}/{y}@2x.png', 'https://b.example/{z}/{x}/{y}@2x.png', 'https://c.example/{z}/{x}/{y}@2x.png',
  ]);
  assert.deepEqual(tileUrls('https://x.example/{z}/{x}/{y}{r}.png', ORIGIN, 1), ['https://x.example/{z}/{x}/{y}.png']);
});

test('a path is made absolute on the instance, and placeholders lowercased', () => {
  assert.deepEqual(tileUrls('/tiles/{z}/{x}/{y}{r}.png', ORIGIN, 2), [ORIGIN + '/tiles/{z}/{x}/{y}@2x.png']);
  assert.deepEqual(tileUrls('https://t.example/{Z}/{X}/{Y}', ORIGIN, 1), ['https://t.example/{z}/{x}/{y}']);
});

test("the basemaps to offer are the server's raster ones, then its vector ones; the default is the first", () => {
  const offered = availableBasemaps({ basemaps: [raster('usgstopo'), raster('satellite')], vector_basemaps: [alaska] });
  assert.deepEqual(offered.map((b) => [b.id, b.kind]), [['usgstopo', 'raster'], ['satellite', 'raster'], ['alaska', 'vector']]);
  assert.equal(chosenBasemap(offered, null).id, 'usgstopo');
  assert.equal(chosenBasemap(offered, 'satellite').id, 'satellite');
  // One picked earlier and no longer offered.
  assert.equal(chosenBasemap(offered, 'gone').id, 'usgstopo');
  // A server older than `vector_basemaps` (or than `basemaps`) sends fewer.
  assert.deepEqual(availableBasemaps({ basemaps: [raster('usgstopo')] }).map((b) => b.id), ['usgstopo']);
  assert.deepEqual(availableBasemaps({}), []);
  assert.deepEqual(availableBasemaps(null), []);
  assert.equal(chosenBasemap([], 'gone'), null);
});

test("with each one's order, the basemaps follow the tenant's order across both kinds", () => {
  const offered = availableBasemaps({
    basemaps: [raster('usgstopo', { order: 1 }), raster('satellite', { order: 2 })],
    vector_basemaps: [{ ...alaska, order: 0 }],
  });
  assert.deepEqual(offered.map((b) => b.id), ['alaska', 'usgstopo', 'satellite']);
  assert.equal(chosenBasemap(offered, null).id, 'alaska');
});

test('overlays default on per basemap, else by default_enabled', () => {
  const overlays = [overlay(1, { default_enabled: 1 }), overlay(2, { default_enabled_by_basemap: { topo: true } })];
  assert.deepEqual(defaultOverlayIds(overlays, 'topo'), [1, 2]);
  assert.deepEqual(defaultOverlayIds(overlays, 'satellite'), [1]);
});

test('the style: background, then the basemap, then the overlays that are on', () => {
  const satellite = availableBasemaps({ basemaps: [raster('satellite', { maxZoom: 18, detectRetina: true })] })[0];
  const style = mapStyle({
    basemap: satellite, overlays: [overlay(4, { max_zoom: 12, attribution: 'FAA' })],
    origin: ORIGIN, pixelRatio: 2, background: '#000',
  });
  assert.deepEqual(style.layers.map((l) => l.id), ['background', 'basemap-satellite', 'overlay-4']);
  assert.equal(style.sources['basemap-satellite'].type, 'raster');
  assert.equal(style.sources['basemap-satellite'].tileSize, 128);
  assert.equal(style.sources['basemap-satellite'].maxzoom, 18);
  assert.deepEqual(style.sources['overlay-4'], {
    type: 'raster', tiles: ['https://tiles.example/4/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 12, attribution: 'FAA',
  });
  assert.equal(mapStyle({ basemap: satellite, overlays: [], origin: ORIGIN, pixelRatio: 1, background: '#000' })
    .sources['basemap-satellite'].tileSize, 256);
});

test('a vector basemap: its PMTiles archive as the source, the Protomaps layers, glyphs and sprites beside the archive', () => {
  const vector = availableBasemaps({ vector_basemaps: [alaska] })[0];
  const style = mapStyle({ basemap: vector, overlays: [overlay(4)], origin: ORIGIN, pixelRatio: 2, background: '#000' });
  assert.deepEqual(style.sources['basemap-alaska'], {
    type: 'vector', url: 'pmtiles://https://tiles.example/pm/alaska.pmtiles', maxzoom: 15, attribution: 'OSM',
  });
  assert.equal(style.glyphs, 'https://tiles.example/pm/basemaps-assets/fonts/{fontstack}/{range}.pbf');
  assert.equal(style.sprite, 'https://tiles.example/pm/basemaps-assets/sprites/v4/white');
  const ids = style.layers.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'background');
  assert.equal(ids[ids.length - 1], 'overlay-4');
  assert.ok(style.layers.filter((l) => l.source === 'basemap-alaska').length > 20);
  assert.equal(vectorAssetsBase('https://x.example/alaska.pmtiles'), 'https://x.example/basemaps-assets');
});

test("a raster basemap's color correction becomes its layer's raster paint; 100% changes nothing", () => {
  assert.deepEqual(mapColorPaint({ sat: 100, con: 100, bri: 100 }), {});
  assert.deepEqual(mapColorPaint({ sat: 50, con: 150, bri: 80 }), {
    'raster-saturation': -0.5, 'raster-contrast': 0.5, 'raster-brightness-max': 0.8,
  });
  assert.deepEqual(mapColorPaint({ sat: 0, con: 200, bri: 130 }), {
    'raster-saturation': -1, 'raster-contrast': 1, 'raster-brightness-min': 0.3,
  });
  const style = mapStyle({
    basemap: availableBasemaps({ basemaps: [raster('topo')] })[0], overlays: [], origin: ORIGIN, pixelRatio: 1,
    background: '#000', color: { sat: 60, con: 100, bri: 100 },
  });
  assert.deepEqual(style.layers[1].paint, { 'raster-saturation': -0.4 });
});

test('the layers over the basemap have unique ids and take the surface color', () => {
  const all = [layers.trackLayer(), layers.trailLayer(), layers.positionLayer('#fff'), layers.planeLayer('#fff'),
    layers.arrowLayer('#fff'), layers.elevationReliefLayer(300, 500, 60), layers.elevationReferenceLayer('#000', '#fff')];
  assert.equal(new Set(all.map((l) => l.id)).size, all.length);
  assert.ok(all.every((l) => !('source' in l)));
  assert.equal(layers.planeLayer('#abc').paint['icon-halo-color'], '#abc');
});

test("the elevation tint's color is core's ramp around the reference, transparent over water", () => {
  const color = layers.elevationReliefColor(300, 500);
  assert.deepEqual(color.slice(0, 3), ['interpolate', ['linear'], ['elevation']]);
  assert.equal(color[4], 'rgba(0,0,0,0)');
  // Stops ascend, a color after each.
  const stops = color.slice(3).filter((_, i) => i % 2 === 0);
  assert.deepEqual([...stops].sort((a, b) => a - b), stops);
  assert.equal(layers.elevationReliefLayer(300, 500, 60).paint['color-relief-opacity'], 0.6);
});

test('a theme sets the sprite, and its colors reach the vector basemap\'s layers', () => {
  const style = mapStyle({
    basemap: { kind: 'vector', ...alaska }, overlays: [], origin: ORIGIN, pixelRatio: 1, background: '#fff',
    theme: { base: 'dark', colors: { water: '#123456' } },
  });
  assert.ok(style.sprite.endsWith('/sprites/v4/dark'));
  assert.equal(style.layers.find((l) => l.id === 'water').paint['fill-color'], '#123456');
});

test('the heatmaps: density stops ascend, from clear to short of opaque, and weights cap at 1', () => {
  for (const { paint } of [layers.endpointHeatLayer(), layers.routeHeatLayer()]) {
    const stops = paint['heatmap-color'].slice(3);
    const densities = stops.filter((_, i) => i % 2 === 0);
    const alphas = stops.filter((_, i) => i % 2 === 1).map((c) => Number(/,([\d.]+)\)$/.exec(c)[1]));
    assert.deepEqual(densities, [...densities].sort((a, b) => a - b));
    assert.equal(alphas[0], 0);
    assert.ok(alphas.at(-1) > 0.9 && alphas.at(-1) < 1);
    assert.ok(paint['heatmap-intensity'] > 0 && Number.isFinite(paint['heatmap-intensity']));
    const weights = paint['heatmap-weight'].slice(3).filter((_, i) => i % 2 === 1);
    assert.ok(weights.length && weights.every((e) => e[0] === 'min' && e[2] === 1));
  }
  assert.equal(layers.endpointHeatLayer().paint['heatmap-weight'][4][1][0], 'sqrt');
});
