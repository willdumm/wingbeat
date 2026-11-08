/**
 * What the request schemas of every route group share (api/<group>-requests.ts). Request
 * schemas strip unknown keys and check each field's type, and query schemas coerce the
 * query string, so a request the web sends today never gets a 400 because validation
 * arrived (docs/mobile-app-plan.md, "The API contract"). The Worker keeps its own checks of
 * what the values mean (an arrival after the departure, HH:MM times, a pilot that exists, …).
 */
import * as z from 'zod/mini';

/** A flag: the web sends booleans, and the server reads any truthy value as set. */
export const flag = z.nullish(z.union([z.boolean(), z.number()]));

/** A save's base_history_id (see "Edit conflicts" in src/index.ts). */
export const BaseHistoryId = z.nullish(z.int().check(z.nonnegative()));

/** ?base_history_id= of a delete, coerced from the query string. */
export const BaseHistoryQuery = z.object({
  base_history_id: z.optional(z.pipe(z.string().check(z.regex(/^\d+$/)), z.transform(Number))),
});
