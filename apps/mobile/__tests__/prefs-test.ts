import { emptyFilterState } from '@wingbeat/core/filters';
import { accountPrefKey, parseElevationPref, parseFlightFilter, parseMapChoice, parseTheme, parseTimeSensitive, staleAccountPrefKeys, THEME_KEY } from '@/lib/prefs';

const A = 'a.wingbeat.dummthings.dev';
const B = 'b.wingbeat.dummthings.dev';

describe('staleAccountPrefKeys', () => {
  test('drops removed accounts’ keys and keeps the rest', () => {
    const keys = [
      THEME_KEY,
      accountPrefKey(A, 1, 'map'), accountPrefKey(A, 1, 'flight-filter'),
      accountPrefKey(A, 2, 'map'), accountPrefKey(B, 1, 'map'),
      'flights.v1.a.wingbeat.dummthings.dev.2',
    ];
    expect(staleAccountPrefKeys(keys, [{ host: A, user: { id: 1 } }]))
      .toEqual([accountPrefKey(A, 2, 'map'), accountPrefKey(B, 1, 'map')]);
  });

  test('doesn’t take user 1’s keys for user 12’s', () => {
    expect(staleAccountPrefKeys([accountPrefKey(A, 1, 'map')], [{ host: A, user: { id: 12 } }]))
      .toEqual([accountPrefKey(A, 1, 'map')]);
  });
});

describe('parse functions', () => {
  test('theme: light or dark, otherwise the system’s', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme(undefined)).toBe('system');
    expect(parseTheme('sepia')).toBe('system');
  });

  test('map choice: the default for anything unusable', () => {
    expect(parseMapChoice(undefined)).toEqual({ basemap: null, overlays: null });
    expect(parseMapChoice({ basemap: 'esri', overlays: [3, 'x', 5] })).toEqual({ basemap: 'esri', overlays: [3, 5] });
    expect(parseMapChoice({ basemap: 7, overlays: 'all' })).toEqual({ basemap: null, overlays: null });
  });

  test('flight filter: a known preset and every field of the filter', () => {
    expect(parseFlightFilter(undefined)).toEqual({ filter: emptyFilterState(), preset: 'all' });
    expect(parseFlightFilter({ preset: '7d', filter: { pilotIds: [2] } }))
      .toEqual({ filter: { ...emptyFilterState(), pilotIds: [2] }, preset: '7d' });
    expect(parseFlightFilter({ preset: '365d' }).preset).toBe('all');
  });

  test('time sensitive: gap until chosen; known events once, in order', () => {
    expect(parseTimeSensitive(undefined)).toEqual(['gap']);
    expect(parseTimeSensitive([])).toEqual([]);
    expect(parseTimeSensitive(['gap', 'alerts', 'takeoff', 'takeoff'])).toEqual(['takeoff', 'gap']);
  });
});

describe('parseElevationPref', () => {
  test('defaults to the web’s ±300 m at 55%, and keeps values in range', () => {
    expect(parseElevationPref(undefined)).toEqual({ rangeM: 300, opacity: 55 });
    expect(parseElevationPref({ rangeM: 1000, opacity: 0 })).toEqual({ rangeM: 1000, opacity: 0 });
    expect(parseElevationPref({ rangeM: 9000, opacity: '70' })).toEqual({ rangeM: 300, opacity: 55 });
  });
});
