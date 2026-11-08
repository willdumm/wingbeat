// Global Settings' Save (settingsModalScript(), src/shared/settings.ts), run on a stub DOM
// with the shipped core bundle: the timezone-change warning can't be skipped, and a saved
// timezone reaches core's page globals without a reload (src/client/core-entry.ts reads
// APP_SETTINGS.timezone on every call).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { coreBundle, editHistoryScript, settingsModalScript } from './harness.mjs';
import { TZ } from './core.mjs';

/** An element that accepts anything the script does to it and keeps its listeners. */
function stubElement() {
  const el = {
    value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
  };
  return new Proxy(el, {
    get: (t, k) => k in t ? t[k] : typeof k === 'string' ? () => stubElement() : undefined,
  });
}

/**
 * The settings script on a stub page, with the tenant's settings API replaced. Returns the
 * context, the form's elements by id, and what was saved and confirmed.
 */
function loadSettings({ loaded, counts = { duty_days: 3, default_duties: 0 }, confirmAnswer = true }) {
  const els = new Map();
  const byId = (id) => { if (!els.has(id)) els.set(id, stubElement()); return els.get(id); };
  const saved = [];
  const asked = [];
  const context = vm.createContext({
    window: { APP_SETTINGS: { timezone: TZ, appName: 'Test' }, addEventListener: () => {} },
    document: new Proxy({ getElementById: byId }, {
      get: (t, k) => k in t ? t[k] : () => stubElement(),
    }),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: () => Promise.reject(new Error('no fetch here')),
    confirm: (text) => { asked.push(text); return confirmAnswer; },
    setTimeout: () => 0,
    // The map controls' (map-controls.ts), which every page that has the modal also loads.
    _ftActiveLayerDefs: () => [],
    Intl,
    console,
  });
  vm.runInContext(coreBundle, context);
  Object.assign(context, {
    fetchSettings: async () => loaded === null ? Promise.reject(new Error('offline')) : loaded,
    patchSettings: async (body) => { saved.push(body); return { ok: true }; },
    fetchDutyRecordCounts: async () => counts,
  });
  vm.runInContext(editHistoryScript() + settingsModalScript(), context);
  return { context, byId, saved, asked };
}

const settings = { app_name: 'Test', timezone: TZ, map_default_lat: 61.2, map_default_lng: -149.9, map_default_zoom: 8 };

async function openAndSave(page, timezone) {
  for (const fn of page.byId('settings-tenant-open-btn').listeners.click) await fn();
  page.byId('settings-tenant-name').value ||= 'Test';
  page.byId('settings-tenant-timezone').value = timezone;
  for (const fn of page.byId('settings-tenant-save').listeners.click) await fn();
}

describe('Global Settings save', () => {
  test('a new timezone asks first, then reaches core without a reload', async () => {
    const page = loadSettings({ loaded: settings });
    await openAndSave(page, 'UTC');
    assert.equal(page.asked.length, 1);
    assert.match(page.asked[0], /UTC/);
    assert.equal(page.saved.length, 1);
    assert.equal(page.context.window.APP_SETTINGS.timezone, 'UTC');
    // 2026-11-03 12:00 UTC, formatted by the bundle's global in the zone just saved.
    assert.equal(vm.runInContext('fmtTzDateTime(1793707200)', page.context), 'Nov 3, 2026, 12:00 UTC');
    assert.equal(page.byId('settings-tenant-status').textContent, 'Saved.');
  });

  test('declining the warning saves nothing', async () => {
    const page = loadSettings({ loaded: settings, confirmAnswer: false });
    await openAndSave(page, 'UTC');
    assert.equal(page.asked.length, 1);
    assert.deepEqual(page.saved, []);
    assert.equal(page.context.window.APP_SETTINGS.timezone, TZ);
  });

  test("without the settings as loaded it refuses to save, rather than skip the warning", async () => {
    const page = loadSettings({ loaded: null });
    await openAndSave(page, 'UTC');
    assert.deepEqual(page.asked, []);
    assert.deepEqual(page.saved, []);
    assert.match(page.byId('settings-tenant-status').textContent, /^Couldn't load the current settings/);
  });
});
