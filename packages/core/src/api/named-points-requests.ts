/**
 * The named-points route group's request schemas (api/named-points.ts has the responses and
 * the client calls), which the Worker validates its writes with (src/index.ts). In its own
 * module so the browser bundle, which only needs their types, doesn't ship them. The import's
 * schema is shared with regions (FeatureCollectionImportRequest in regions-requests.ts).
 */
import * as z from 'zod/mini';

/** POST /api/named-points. The handler checks that name isn't empty and lat and lon are there. */
export const NamedPointCreateRequest = z.object({
  name: z.optional(z.string()),
  lat: z.optional(z.number()),
  lon: z.optional(z.number()),
  /** The radius (km) within which a flight's end takes the point's name; null: the default. */
  max_km: z.nullish(z.number()),
});

/** PUT /api/named-points/:id: changes the fields it sends (an empty name is ignored). */
export const NamedPointUpdateRequest = z.object({
  name: z.optional(z.string()),
  max_km: z.nullish(z.number()),
});

export type NamedPointCreateRequest = z.input<typeof NamedPointCreateRequest>;
export type NamedPointUpdateRequest = z.input<typeof NamedPointUpdateRequest>;
