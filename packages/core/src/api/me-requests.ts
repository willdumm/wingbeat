/**
 * The me route group's request schema (api/me.ts has the responses and the client calls),
 * which the Worker validates its write with (src/index.ts). In its own module so the
 * browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/**
 * The longest session (device) name in code points, after trimming: renaming to a longer
 * one is refused, and pairing (api/app-requests.ts) cuts the phone's name to it.
 */
export const MAX_DEVICE_NAME_LENGTH = 60;

/** PATCH /api/me/sessions/:id: the device's name (null or '' clears it). */
export const SessionRenameRequest = z.object({ device_name: z.nullable(z.string()) });

export type SessionRenameRequest = z.input<typeof SessionRenameRequest>;
