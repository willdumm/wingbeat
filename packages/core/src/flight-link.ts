/**
 * A flight's URL: `/flights/<tracker id>/<tracked start>`, or `/flights/manual/<id>` for a
 * manual flight. Not the flight's id, which re-segmentation replaces: the same key as its
 * corrections (flightCorrectionKey). The dashboard opens it with the flight selected; in a
 * hosted instance's URL the app opens it instead, when it's installed (APPLE_APP_SITE_ASSOCIATION).
 */
import { flightCorrectionKey } from './flight-store';
import { trackedStart, type MaybeEdited } from './live';

type LinkedFlight = MaybeEdited & { id: number };

const FLIGHT_PATH = /^\/flights\/((?:manual|[1-9]\d{0,9})\/[1-9]\d{0,11})\/?$/;

/** The flight's key in its URL. A manual flight's id is its correction row's, negated (applyFlightEdits). */
export function flightKey(f: LinkedFlight): string {
  return flightCorrectionKey({ tracker_id: f.tracker_id, id: -f.id, flight_start_time: trackedStart(f) });
}

export const flightKeyPath = (key: string) => '/flights/' + key;

export const flightPath = (f: LinkedFlight) => flightKeyPath(flightKey(f));

/** The flight key in a URL's path; null when it isn't a flight's. */
export function parseFlightPath(path: string): string | null {
  return FLIGHT_PATH.exec(path)?.[1] ?? null;
}

export const isFlightKey = (key: string) => parseFlightPath(flightKeyPath(key)) === key;

export function findFlightByKey<F extends LinkedFlight>(flights: F[], key: string): F | null {
  return flights.find((f) => flightKey(f) === key) ?? null;
}

/**
 * The apple-app-site-association file: the app opens flights' URLs and no others (sign-in and
 * invite links stay in the browser). Each instance serves it, and so does the docs site, at
 * the hosted domain itself (site/static/.well-known/, the same JSON).
 */
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: { details: [{ appIDs: ['W4MAPA8GZ7.dev.dummthings.wingbeat'], components: [{ '/': '/flights/*' }] }] },
};
