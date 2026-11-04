/**
 * The named-points route group: the tenant's named places (airstrips, lodges), which name
 * flights' takeoff and landing spots, read by the flight editor and the setup guide and
 * edited, imported and exported in Settings' named-points editor. The request schemas are in
 * named-points-requests.ts. Response objects allow unknown keys, so an instance may add
 * fields without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { NamedPointCreateRequest, NamedPointUpdateRequest } from './named-points-requests';
import type { FeatureCollectionImportRequest } from './regions-requests';

export type { NamedPointCreateRequest, NamedPointUpdateRequest } from './named-points-requests';

/** One named point; maxKm is its radius in km, null for the default. */
export const NamedPointFeature = z.looseObject({
  type: z.literal('Feature'),
  properties: z.looseObject({ id: z.number(), name: z.string(), maxKm: z.nullable(z.number()) }),
  geometry: z.looseObject({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) }),
});

/** GET /api/named-points */
export const NamedPointsResponse = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(NamedPointFeature),
});

/** POST /api/named-points: the new row. */
export const NamedPointCreateResponse = z.looseObject({
  id: z.number(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  max_km: z.nullable(z.number()),
});

export type NamedPointsResponse = z.infer<typeof NamedPointsResponse>;
export type NamedPointCreateResponse = z.infer<typeof NamedPointCreateResponse>;

/** Every named point, as a GeoJSON FeatureCollection. */
export function getNamedPoints(client: ApiClient): Promise<NamedPointsResponse> {
  return client.get('/api/named-points', NamedPointsResponse);
}

/** Adds a named point. */
export function createNamedPoint(client: ApiClient, body: NamedPointCreateRequest): Promise<NamedPointCreateResponse> {
  return client.write('POST', '/api/named-points', body, NamedPointCreateResponse);
}

/** Changes a named point's name or radius (those in body). */
export function updateNamedPoint(client: ApiClient, id: number, body: NamedPointUpdateRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/named-points/' + id, body, OkResponse);
}

/** Removes a named point. */
export function deleteNamedPoint(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/named-points/' + id, undefined, OkResponse);
}

/** Replaces every named point with a FeatureCollection's Point features (properties name, maxKm). */
export function importNamedPoints(client: ApiClient, body: FeatureCollectionImportRequest): Promise<OkResponse> {
  return client.write('POST', '/api/named-points/import', body, OkResponse);
}
