/**
 * A flight's URL on a hosted instance, opened in the app (core's flight-link has the shape):
 * the screen it goes to, flights/link.tsx.
 */
import { parseFlightPath } from '@wingbeat/core/flight-link';
import { isHostedInstance } from './pairing-link';

export interface FlightLink { host: string; flight: string }

/** The instance and flight key in `https://<host>/flights/…`; null for any other link. */
export function parseFlightLink(link: string): FlightLink | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const flight = parseFlightPath(url.pathname);
  const host = url.host.toLowerCase();
  return url.protocol === 'https:' && flight && isHostedInstance(host) ? { host, flight } : null;
}

/** The app's route for a link the system opened: a flight's, else the link as it is. */
export function systemLinkRoute(link: string): string {
  const target = parseFlightLink(link);
  return target
    ? `/flights/link?host=${encodeURIComponent(target.host)}&flight=${encodeURIComponent(target.flight)}`
    : link;
}

/** The account a link to `host` opens in: the active one when it's there, else one that's signed in, else any. */
export function linkAccount<A extends { id: string; host: string; signedOut: boolean }>(accounts: A[], active: A | null, host: string): A | null {
  if (active?.host === host && !active.signedOut) return active;
  const there = accounts.filter((a) => a.host === host);
  return there.find((a) => !a.signedOut) ?? there[0] ?? null;
}
