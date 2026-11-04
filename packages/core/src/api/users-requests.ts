/**
 * The users route group's request schema (api/users.ts has the responses and the client
 * calls), which the Worker validates its write with (src/index.ts). In its own module so the
 * browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/** POST /api/invites (the handler checks the name's length, the role and the expiry's range). */
export const InviteRequest = z.object({
  name: z.optional(z.string()),
  role: z.optional(z.string()),
  expires_in_hours: z.optional(z.number()),
});

export type InviteRequest = z.input<typeof InviteRequest>;
