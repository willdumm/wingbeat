// maplibreRuntimeScript() (src/shared/maplibre.ts) over a stand-in MapLibre map: what it adds to
// the style and what a restyle keeps. The drawing itself needs a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { coreBundle, maplibreRuntimeScript } from './harness.mjs';
import { plain } from './core.mjs';

const RASTER = { id: 'usgstopo', label: 'USGS Topo', url: 'https://t.example/{z}/{x}/{y}', attribution: '', maxZoom: 16 };

/** A page with one map; options.webgl false throws from the map's constructor. */
function page({ webgl = true } = {}) {
  class FakeMap {
    constructor({ style }) {
      if (!webgl) throw new Error('no WebGL');
      this.style = { _loaded: false };
      this.spec = structuredClone(plain(style));
      this.listeners = [];
      this.touchZoomRotate = this.keyboard = { disableRotation() {} };
    }
    once(_event, fn) { this.listeners.push(fn); }
    load() { this.style._loaded = true; this.listeners.splice(0).forEach((fn) => fn()); }
    getStyle() { return this.spec; }
    setStyle(next, { transformStyle }) { this.spec = plain(transformStyle(this.spec, next)); }
    addSource(id, source) { this.spec.sources[id] = plain(source); }
    getSource(id) { return this.spec.sources[id] && { setData: (data) => { this.spec.sources[id].data = plain(data); } }; }
    removeSource(id) { delete this.spec.sources[id]; }
    addLayer(layer, before) {
      const at = before ? this.spec.layers.findIndex((l) => l.id === before) : this.spec.layers.length;
      this.spec.layers.splice(at, 0, plain(layer));
    }
    getLayer(id) { return this.spec.layers.find((l) => l.id === id); }
    removeLayer(id) { this.spec.layers = this.spec.layers.filter((l) => l.id !== id); }
  }
  const container = { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(el) { this.children.push(el); } };
  const context = vm.createContext({
    window: { devicePixelRatio: 1, APP_SETTINGS: { timezone: 'UTC' }, addEventListener() {} },
    document: { documentElement: {}, createElement: () => ({}) },
    location: { origin: 'https://a.example' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    MutationObserver: class { constructor(fn) { context.themeChanged = fn; } observe() {} },
    maplibregl: { Map: FakeMap },
    console: { ...console, error() {} },
    container,
  });
  vm.runInContext(coreBundle, context);
  vm.runInContext(`
    var _ftMaplibreMaps = [], _ftVectorBasemaps = [], background = '#eee';
    function _ftRestyleAll() { _ftMaplibreMaps.forEach((m) => m._ftRestyle()); }
    function _ftActiveLayerDefs() { return [${JSON.stringify(RASTER)}]; }
    function _ftLayerColor() {}
    function getMapBackgroundColor() { return background; }
    ${maplibreRuntimeScript()}
    var map = createMap(container, {});
  `, context);
  return { context, container, map: context.map, shape: (z) => context.addMapShape(context.map, [], [{ id: 'dots', type: 'circle' }], { z }) };
}

const ids = (map) => map.spec.layers.map((l) => l.id);

test('shapes wait for the style, and stack by z, then by order added', () => {
  const { map, shape } = page();
  const [low, high] = [shape(0), shape(2)];
  assert.deepEqual(ids(map), ['background', 'basemap-usgstopo']);
  map.load();
  const mid = shape(1);
  const low2 = shape(0);
  assert.deepEqual(ids(map).slice(2), [low, low2, mid, high].map((s) => s.id + '-dots'));
});

test("a restyle keeps the page's sources and layers above the basemap", () => {
  const { map, shape } = page();
  map.load();
  const { id, setFeatures } = shape(0);
  map._ftOverlays = [{ id: 7, url: 'https://o.example/{z}/{x}/{y}', attribution: null, max_zoom: null }];
  map._ftRestyle();
  assert.deepEqual(ids(map), ['background', 'basemap-usgstopo', 'overlay-7', id + '-dots']);
  setFeatures([{ type: 'Feature' }]);
  assert.equal(map.spec.sources[id].data.features.length, 1);
  map._ftOverlays = [];
  map._ftRestyle();
  assert.deepEqual(ids(map), ['background', 'basemap-usgstopo', id + '-dots']);
});

test('a theme switch changes the background', () => {
  const { context, map } = page();
  map.load();
  context.background = '#222';
  context.themeChanged();
  assert.equal(map.spec.layers[0].paint['background-color'], '#222');
});

test('a shape removed before the style loads is never drawn; one removed after leaves nothing', () => {
  const { map, shape } = page();
  const early = shape(0);
  early.remove();
  map.load();
  shape(0).remove();
  assert.deepEqual(ids(map), ['background', 'basemap-usgstopo']);
  assert.deepEqual(Object.keys(map.spec.sources), ['basemap-usgstopo']);
});

test('without WebGL the page says so and its map calls do nothing', () => {
  const { map, container, shape } = page({ webgl: false });
  assert.match(container.children[0].textContent, /WebGL/);
  map.fitBounds([0, 0, 1, 1]).once('load');
  shape(0).remove();
});
