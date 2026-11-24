/**
 * The basemaps route group's request schemas (api/basemaps.ts has the responses and the
 * client calls), which the Worker validates its writes with (src/index.ts). In its own module
 * so the browser bundle, which only needs the types, doesn't ship it. Unknown keys are
 * stripped, so `key` can't be set through the API.
 */
import * as z from 'zod/mini';

/**
 * POST /api/basemaps and PUT /api/basemaps/:id (a PUT changes only the fields it sends). The
 * handlers check that label isn't empty and that url suits kind (a {z}/{x}/{y} template for a
 * raster basemap, an https .pmtiles archive for a vector one).
 */
export const BasemapRequest = z.object({
  label: z.optional(z.string()),
  kind: z.optional(z.enum(['raster', 'vector'])),
  url: z.optional(z.string()),
  attribution: z.nullish(z.string()),
  max_zoom: z.nullish(z.number()),
  /** Whether the basemap is in the map's picker. */
  shown: z.optional(z.boolean()),
});

/** PUT /api/basemaps/order: every basemap's id, in the order to show them. */
export const BasemapOrderRequest = z.object({
  ids: z.array(z.number()),
});

export type BasemapRequest = z.input<typeof BasemapRequest>;
export type BasemapOrderRequest = z.input<typeof BasemapOrderRequest>;
