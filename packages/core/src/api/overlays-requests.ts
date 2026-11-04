/**
 * The overlays route group's request schema (api/overlays.ts has the responses and the
 * client calls), which the Worker validates its writes with (src/index.ts). In its own module
 * so the browser bundle, which only needs its type, doesn't ship it.
 */
import * as z from 'zod/mini';

/**
 * POST /api/overlays and PUT /api/overlays/:id (a PUT changes only the fields it sends). The
 * handlers check that label isn't empty and that url is a {z}/{x}/{y} template.
 */
export const OverlayRequest = z.object({
  label: z.optional(z.string()),
  url: z.optional(z.string()),
  attribution: z.nullish(z.string()),
  max_zoom: z.nullish(z.number()),
  default_enabled: z.optional(z.boolean()),
  /** Per basemap preset id, whether the overlay starts on (else default_enabled). */
  default_enabled_by_basemap: z.nullish(z.record(z.string(), z.boolean())),
});

export type OverlayRequest = z.input<typeof OverlayRequest>;
