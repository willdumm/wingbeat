/**
 * Pure formatting helpers used by both the Worker (server-side, e.g. notification
 * messages) and the browser dashboard. `toKnots`/`toFeet` have no free variables, so
 * dashboard/scripts/helpers.ts embeds them into its generated browser script verbatim via
 * `.toString()` — this file is the single source, not a copy kept in sync by hand.
 */

export function toKnots(kmh: number): string {
  return (kmh * 0.539957).toFixed(1) + ' kt';
}

export function toFeet(m: number): string {
  return Math.round(m * 3.28084).toLocaleString() + ' ft';
}

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
