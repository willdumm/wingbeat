/**
 * The me route group's request schema (api/me.ts has the responses and the client calls),
 * which the Worker validates its write with (src/index.ts). In its own module so the
 * browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/** PATCH /api/me/sessions/:id: the device's name (null or '' clears it). */
export const SessionRenameRequest = z.object({ device_name: z.nullable(z.string()) });

export type SessionRenameRequest = z.input<typeof SessionRenameRequest>;
