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
