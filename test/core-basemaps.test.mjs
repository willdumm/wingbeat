// @wingbeat/core/basemaps, imported directly: an overlay's default on/off state per basemap.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const basemaps = await importCore('basemaps');

describe('overlayDefaultEnabled', () => {
  test("a basemap's own entry wins, else default_enabled", () => {
    const ov = { default_enabled: 1, default_enabled_by_basemap: { satellite: false } };
    assert.equal(basemaps.overlayDefaultEnabled(ov, 'satellite'), false);
    assert.equal(basemaps.overlayDefaultEnabled(ov, 'topo'), true);
    assert.equal(basemaps.overlayDefaultEnabled(ov, null), true);
    assert.equal(basemaps.overlayDefaultEnabled({ default_enabled: 0, default_enabled_by_basemap: null }, 'topo'), false);
  });
});

describe('basemap URLs and keys', () => {
  test('a raster url is a {z}/{x}/{y} template; a vector one an https .pmtiles', () => {
    assert.equal(basemaps.validTileTemplate('https://e.com/{z}/{y}/{x}'), true);
    assert.equal(basemaps.validTileTemplate('https://e.com/{Z}/{X}/{Y}.png'), true);
    assert.equal(basemaps.validTileTemplate('https://e.com/tiles'), false);
    assert.equal(basemaps.validTileTemplate('{z}/{x}/{y}'), false);
    assert.equal(basemaps.validPmtilesUrl('https://example.com/alaska.pmtiles'), true);
    assert.equal(basemaps.validPmtilesUrl('http://example.com/alaska.pmtiles'), false);
    assert.equal(basemaps.validPmtilesUrl('https://example.com/alaska.pmtiles.zip'), false);
    assert.equal(basemaps.validPmtilesUrl('https://example.com/{z}/{x}/{y}.png'), false);
  });

  test('a key is made from the label', () => {
    assert.equal(basemaps.basemapKeyFromLabel('USGS Imagery Topo'), 'usgsimagerytopo');
    assert.equal(basemaps.basemapKeyFromLabel('  Caf\u00e9 / Roads! '), 'cafroads');
    assert.equal(basemaps.basemapKeyFromLabel('!!!'), 'basemap');
    assert.equal(basemaps.basemapKeyFromLabel('x'.repeat(50)).length, 24);
  });

  test('a keyed provider’s upstream URL is substituted from the registry, with the key encoded', () => {
    const url = basemaps.substituteTileUrl(basemaps.KEYED_TILE_PROVIDERS.carto.url, { s: 'a', z: '3', x: '1', y: '2', r: '@2x', key: 'k/ey' });
    assert.equal(url, 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/1/2@2x.png?key=k%2Fey');
    assert.equal(basemaps.basemapProxyUrl('map'), '/api/tiles/map/{z}/{x}/{y}{r}.png');
  });
});
