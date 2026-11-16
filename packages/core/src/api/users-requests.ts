/**
 * The users route group's request schemas (api/users.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In its own module so the
 * browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/** POST /api/invites (the handler checks the name's length, the role and the expiry's range). */
export const InviteRequest = z.object({
  name: z.optional(z.string()),
  role: z.optional(z.string()),
  expires_in_hours: z.optional(z.number()),
});

/** PATCH /api/users/:id: the pilot the user is, or null for none (absent leaves it). */
export const UserUpdateRequest = z.object({
  pilot_id: z.nullish(z.int()),
});

export type InviteRequest = z.input<typeof InviteRequest>;
export type UserUpdateRequest = z.input<typeof UserUpdateRequest>;
