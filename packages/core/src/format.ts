/**
 * Units for speeds and altitudes, as every client shows them. Self-contained: the
 * dashboard embeds them in its page script with toString() (src/dashboard/scripts/helpers.ts).
 */

export function toKnots(kmh: number): string {
  return (kmh * 0.539957).toFixed(1) + ' kt';
}

export function toFeet(m: number): string {
  return Math.round(m * 3.28084).toLocaleString() + ' ft';
}
