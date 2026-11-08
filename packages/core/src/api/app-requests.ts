/**
 * The app route group's request schema (api/app.ts has the responses and the client calls),
 * which the Worker validates its write with (src/index.ts). In its own module so a bundle
 * that only needs its type doesn't ship it.
 */
import * as z from 'zod/mini';

/**
 * POST /api/app/pair: a device-link or invite token (from the web's QR code or a
 * wingbeat:// link) and the name the new session gets in the Devices list (the phone's
 * name; the User-Agent's platform when it's missing or blank, cut to 60 characters).
 */
export const PairRequest = z.object({ token: z.string(), device_name: z.nullish(z.string()) });

export type PairRequest = z.input<typeof PairRequest>;
