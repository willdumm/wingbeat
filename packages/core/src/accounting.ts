/**
 * Flight-hour accounting by region: each flight's hours split between the regions it flew
 * to (home bases take none), stops per region, and both per operator month.
 *
 * Takes the operator's timezone (`tz`) and the regions (see regions.ts) as parameters.
 */
import { findHomeBase, findRegion } from './regions';
import type { Regions } from './regions';
import { unixToTzMonthKey } from './time';

/** What accounting reads of a flight. A manual flight's endpoint may have no coordinates. */
export interface AccountingFlight {
  start_time: number;
  end_time: number;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
}

/** A point with the flight hours attributed to it. */
export interface WeightedEndpoint {
  lat: number | null;
  lon: number | null;
  weight: number;
}

/** Hours or stops per region display name. */
export type RegionTotals = Record<string, number>;

/**
 * The flight's hours, split between its endpoints. Endpoints at a home base (a "… (Base)"
 * region, see findHomeBase) don't take hours: a flight's time goes to the region(s) it
 * flew to, not the base it left from.
 */
export function computeWeightedEndpoints(regions: Regions, flight: AccountingFlight): WeightedEndpoint[] {
  const hours = (flight.end_time - flight.start_time) / 3600;
  const startNear = findHomeBase(regions, flight.start_lat, flight.start_lon) !== null;
  const endNear   = findHomeBase(regions, flight.end_lat,   flight.end_lon) !== null;
  if (startNear && endNear) return [];
  if (startNear)  return [{ lat: flight.end_lat,   lon: flight.end_lon,   weight: hours }];
  if (endNear)    return [{ lat: flight.start_lat, lon: flight.start_lon, weight: hours }];
  return [
    { lat: flight.start_lat, lon: flight.start_lon, weight: hours / 2 },
    { lat: flight.end_lat,   lon: flight.end_lon,   weight: hours / 2 },
  ];
}

export function computeRegionHours(regions: Regions, flights: AccountingFlight[]): RegionTotals {
  const totals: RegionTotals = {};
  for (const flight of flights) {
    for (const ep of computeWeightedEndpoints(regions, flight)) {
      const region = findRegion(regions, ep.lat, ep.lon);
      totals[region] = (totals[region] || 0) + ep.weight;
    }
  }
  return totals;
}

/** Each region's stops: the flights that ended in it. */
export function computeRegionStops(regions: Regions, flights: AccountingFlight[]): RegionTotals {
  const counts: RegionTotals = {};
  for (const f of flights) {
    const er = findRegion(regions, f.end_lat, f.end_lon);
    counts[er] = (counts[er] || 0) + 1;
  }
  return counts;
}

/** Region hours and stops per operator month ("YYYY-MM", by start time), in first-seen order. */
export function computeMonthlyAccounting(
  tz: string, regions: Regions, flights: AccountingFlight[],
): Map<string, { hours: RegionTotals; stops: RegionTotals }> {
  const byMonth = new Map<string, AccountingFlight[]>();
  for (const flight of flights) {
    const key = unixToTzMonthKey(tz, flight.start_time);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(flight);
  }
  const result = new Map<string, { hours: RegionTotals; stops: RegionTotals }>();
  for (const [key, mFlights] of byMonth) {
    result.set(key, {
      hours: computeRegionHours(regions, mFlights),
      stops: computeRegionStops(regions, mFlights),
    });
  }
  return result;
}
