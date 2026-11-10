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

/** A device name's length as the limit counts it: in code points, not UTF-16 units. */
export const deviceNameLength = (name: string): number => Array.from(name).length;

/**
 * A device name trimmed and cut to MAX_DEVICE_NAME_LENGTH code points, so an emoji at the
 * cut isn't split. Only the first 2 × the limit UTF-16 units are split into code points
 * (enough for the limit), so a huge name costs no more than a short one.
 */
export function cutDeviceName(name: string): string {
  return Array.from(name.trim().slice(0, 2 * MAX_DEVICE_NAME_LENGTH)).slice(0, MAX_DEVICE_NAME_LENGTH).join('').trim();
}

/** PATCH /api/me/sessions/:id: the device's name (null or '' clears it). */
export const SessionRenameRequest = z.object({ device_name: z.nullable(z.string()) });

export type SessionRenameRequest = z.input<typeof SessionRenameRequest>;
