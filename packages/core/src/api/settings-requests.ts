/**
 * The settings route group's request schema (api/settings.ts has the responses and the
 * client calls), which the Worker validates its write with (src/index.ts). In its own module
 * so the browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/**
 * PATCH /api/settings: settings by key, each a string or a number. Every key is kept (not
 * stripped), since the handler refuses one it doesn't know, and checks each value.
 */
export const SettingsRequest = z.record(z.string(), z.union([z.string(), z.number()]));

export type SettingsRequest = z.input<typeof SettingsRequest>;
