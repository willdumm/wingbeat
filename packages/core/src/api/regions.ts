/**
 * The regions route group: the tenant's named polygons (home bases and the analytics page's
 * regions), which every page reads and Settings' region editor draws, saves, imports and
 * exports. The logic over them is in ../regions.ts. The request schemas are in
 * regions-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { FeatureCollectionImportRequest, RegionRequest } from './regions-requests';

export type { FeatureCollectionImportRequest, RegionRequest } from './regions-requests';

/** One region: its row id and name, and its geometry as saved (a Polygon or MultiPolygon). */
export const RegionFeatureResponse = z.looseObject({
  type: z.literal('Feature'),
  properties: z.looseObject({ id: z.number(), Name: z.string() }),
  geometry: z.looseObject({ type: z.string(), coordinates: z.array(z.unknown()) }),
});

/** GET /api/regions */
export const RegionsResponse = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(RegionFeatureResponse),
});

/** POST /api/regions */
export const RegionCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number() });

export type RegionsResponse = z.infer<typeof RegionsResponse>;
export type RegionCreateResponse = z.infer<typeof RegionCreateResponse>;

/** Every region, as a GeoJSON FeatureCollection. */
export function getRegions(client: ApiClient): Promise<RegionsResponse> {
  return client.get('/api/regions', RegionsResponse);
}

/** Adds a region. */
export function createRegion(client: ApiClient, body: RegionRequest): Promise<RegionCreateResponse> {
  return client.write('POST', '/api/regions', body, RegionCreateResponse);
}

/** Changes a region's name or geometry (those in body). */
export function updateRegion(client: ApiClient, id: number, body: RegionRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/regions/' + id, body, OkResponse);
}

/** Removes a region. */
export function deleteRegion(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/regions/' + id, undefined, OkResponse);
}

/** Replaces every region with a FeatureCollection's (each feature's Name or name). */
export function importRegions(client: ApiClient, body: FeatureCollectionImportRequest): Promise<OkResponse> {
  return client.write('POST', '/api/regions/import', body, OkResponse);
}
