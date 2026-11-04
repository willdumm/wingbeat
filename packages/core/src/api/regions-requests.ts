/**
 * The regions route group's request schemas (api/regions.ts has the responses and the client
 * calls), which the Worker validates its writes with (src/index.ts). In its own module so the
 * browser bundle, which only needs their types, doesn't ship them.
 */
import * as z from 'zod/mini';

/**
 * POST /api/regions and PUT /api/regions/:id (a PUT changes only the fields it sends). geojson
 * is the region's GeoJSON geometry, stored as it is. The handlers check that name isn't empty
 * and, on a POST, that geojson is there.
 */
export const RegionRequest = z.object({
  name: z.optional(z.string()),
  geojson: z.optional(z.unknown()),
});

/**
 * POST /api/regions/import and /api/named-points/import: a GeoJSON FeatureCollection that
 * replaces every region (or named point). Other top-level keys (name, crs) are dropped. The
 * handlers check type, and skip a feature without a name (or, for a named point, a point).
 */
export const FeatureCollectionImportRequest = z.object({
  type: z.optional(z.string()),
  features: z.optional(z.array(z.looseObject({
    properties: z.nullish(z.record(z.string(), z.unknown())),
    geometry: z.nullish(z.unknown()),
  }))),
});

export type RegionRequest = z.input<typeof RegionRequest>;
export type FeatureCollectionImportRequest = z.input<typeof FeatureCollectionImportRequest>;
