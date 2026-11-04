/**
 * The pilots route group's request schemas (api/pilots.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In their own module so
 * the browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

/** POST /api/pilots. The handler checks that name is there. */
export const PilotCreateRequest = z.object({ name: z.optional(z.string()) });

/**
 * PUT /api/pilots/:id: only the fields it sends change. default_duty_start/_end are kept so
 * the handler can point an old client at PUT /api/pilots/:id/default-duty, rather than being
 * stripped and the request appearing to have nothing to update.
 */
export const PilotUpdateRequest = z.object({
  name: z.optional(z.string()),
  active: z.optional(z.boolean()),
  default_duty_start: z.optional(z.unknown()),
  default_duty_end: z.optional(z.unknown()),
});

export type PilotCreateRequest = z.input<typeof PilotCreateRequest>;
export type PilotUpdateRequest = z.input<typeof PilotUpdateRequest>;
