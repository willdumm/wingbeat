/**
 * A route's params, checked: a link (a notification, a stale route) can carry anything, so a
 * screen gets null rather than NaN or an invalid date.
 */
import { useLocalSearchParams } from 'expo-router';

type Param = string | string[] | undefined;

/** A string param; null when it's missing or repeated. */
export const stringParam = (v: Param): string | null => (typeof v === 'string' ? v : null);

/** An integer param; null when it's missing or isn't one. */
export const intParam = (v: Param): number | null => (typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : null);

/** A YYYY-MM-DD param; null when it's missing or isn't one. */
export const dayParam = (v: Param): string | null => (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? v : null);

/** The route's integer param name (intParam). */
export function useIntParam(name: string): number | null {
  return intParam(useLocalSearchParams<Record<string, string>>()[name]);
}
