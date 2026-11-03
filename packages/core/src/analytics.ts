/**
 * The data half of the analytics page: the stream graph's buckets (operator days, weeks
 * and months) and each bucket's region totals, and the map layers' points (the route
 * density's interpolated track points, the endpoint heat's weighted endpoints). The SVG
 * and the Leaflet layers stay on the page.
 *
 * Takes the operator's timezone (`tz`) and the regions (see regions.ts) as parameters.
 */
import { computeRegionHours, computeRegionStops, computeWeightedEndpoints } from './accounting';
import type { AccountingFlight, RegionTotals } from './accounting';
import { haversineKm } from './regions';
import type { Regions } from './regions';
import { tzAddDays, tzAddMonths, tzAxisMonthLabel, tzDayStartUnix, tzShortDate, tzWeekday, unixToTzDateStr } from './time';

export type StreamInterval = 'day' | 'week' | 'month';

/** A stream graph bucket: [start, end) in Unix seconds, and its axis label. */
export interface StreamBucket {
  start: number;
  end: number;
  label: string;
}

/** 'auto' picks the interval from the range's length (no range: months). */
export function sgResolveInterval(iv: StreamInterval | 'auto', s: number | null, e: number | null): StreamInterval {
  if (iv !== 'auto') return iv;
  if (s === null || e === null) return 'month';
  const days = (e - s) / 86400;
  return days >= 60 ? 'month' : days >= 14 ? 'week' : 'day';
}

function dayStart(tz: string, dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return tzDayStartUnix(tz, y, m, d);
}

/**
 * The operator days, weeks (from Monday) or months from the one containing s up to e,
 * each starting at the operator's midnight, so an evening flight counts toward its own day.
 */
export function sgGenerateBuckets(tz: string, s: number, e: number, iv: StreamInterval): StreamBucket[] {
  const buckets: StreamBucket[] = [];
  const first = unixToTzDateStr(tz, s);
  if (iv === 'month') {
    let [y, m] = first.split('-').map(Number);
    let cur = tzDayStartUnix(tz, y, m, 1);
    while (cur < e) {
      const [ny, nm] = tzAddMonths(y, m, 1);
      const next = tzDayStartUnix(tz, ny, nm, 1);
      buckets.push({ start: cur, end: next, label: tzAxisMonthLabel(y, m) });
      [y, m, cur] = [ny, nm, next];
    }
    return buckets;
  }
  const step = iv === 'week' ? 7 : 1;
  const dow = tzWeekday(first);
  let key = iv === 'week' ? tzAddDays(first, -(dow === 0 ? 6 : dow - 1)) : first;
  let cur = dayStart(tz, key);
  while (cur < e) {
    const nextKey = tzAddDays(key, step);
    const next = dayStart(tz, nextKey);
    buckets.push({ start: cur, end: next, label: tzShortDate(key, Number(key.slice(0, 4))) });
    [key, cur] = [nextKey, next];
  }
  return buckets;
}

/** Each bucket's region hours ('time') or stops, of the flights that started in it within [s, e). */
export function sgComputeData(
  regions: Regions, buckets: StreamBucket[], s: number, e: number,
  flights: AccountingFlight[], mode: 'time' | 'stops',
): RegionTotals[] {
  return buckets.map(b => {
    const bs = Math.max(b.start, s);
    const be = Math.min(b.end, e);
    if (bs >= be) return {};
    const inBucket = flights.filter(f => f.start_time >= bs && f.start_time < be);
    return mode === 'time' ? computeRegionHours(regions, inBucket) : computeRegionStops(regions, inBucket);
  });
}

/**
 * The flights' track points, with points added every 0.3 km between consecutive points up
 * to 20 km apart (a longer gap is a dropout, not a straight line), for the route density.
 */
export function interpolateRoutePoints(flights: { points?: { lat: number; lon: number }[] | null }[]): [number, number][] {
  const STEP_KM = 0.3;
  const MAX_GAP_KM = 20;
  const result: [number, number][] = [];
  for (const f of flights) {
    const pts = f.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      result.push([pts[i].lat, pts[i].lon]);
      if (i < pts.length - 1) {
        const a = pts[i], b = pts[i + 1];
        const dist = haversineKm(a.lat, a.lon, b.lat, b.lon);
        if (dist > MAX_GAP_KM) continue;
        const n = Math.ceil(dist / STEP_KM);
        for (let j = 1; j < n; j++) {
          const t = j / n;
          result.push([a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t]);
        }
      }
    }
  }
  return result;
}

/**
 * The endpoint heat's points, [lat, lon, weight]: weighted by attributed flight hours
 * (mode 'time', see computeWeightedEndpoints) or one per endpoint (mode 'stops'). Manual
 * flights' endpoints without coordinates count in the totals, not on the map.
 */
export function endpointHeatPoints(
  regions: Regions, flights: AccountingFlight[], mode: 'time' | 'stops',
): [number, number, number][] {
  const pts: [number | null, number | null, number][] = [];
  if (mode === 'stops') {
    for (const f of flights) {
      pts.push([f.start_lat, f.start_lon, 1]);
      pts.push([f.end_lat,   f.end_lon,   1]);
    }
  } else {
    for (const f of flights) {
      for (const ep of computeWeightedEndpoints(regions, f)) pts.push([ep.lat, ep.lon, ep.weight]);
    }
  }
  return pts.filter((p): p is [number, number, number] => p[0] != null && p[1] != null);
}
