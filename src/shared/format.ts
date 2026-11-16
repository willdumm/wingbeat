/**
 * Pure formatting helpers used by both the Worker (server-side, e.g. notification
 * messages) and the browser dashboard. toKnots/toFeet are @wingbeat/core/format's.
 */

export { toKnots, toFeet } from '@wingbeat/core/format';

/**
 * Formats an epoch time in an explicit IANA timezone (e.g. the tenant's configured
 * operating timezone), with a trailing zone abbreviation. Used where there's no browser to
 * supply an implicit local zone (notification delivery) or where the zone must be pinned to
 * the operating base rather than the viewer's own — the latter case (pilotDutyScript's
 * `fmtLocalTime` in shared/pilot-duty.ts) currently duplicates this in a terser 24h form;
 * consider consolidating if a third caller needs the same behavior.
 */
export function formatLocalDateTime(epochSeconds: number, timezone: string): string {
  return new Date(epochSeconds * 1000).toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  });
}
