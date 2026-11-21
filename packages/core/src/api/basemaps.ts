/**
 * The basemaps route group: the tenant's basemaps (the map's base layers), which Settings
 * adds, edits, hides, reorders and removes (admins). The request schemas are in
 * basemaps-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients. GET /api/bootstrap carries the shown ones in the shape
 * clients draw (`Basemap` in bootstrap.ts).
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { BasemapOrderRequest, BasemapRequest } from './basemaps-requests';

export type { BasemapOrderRequest, BasemapRequest } from './basemaps-requests';

const nullableStr = z.nullable(z.string());

/**
 * A basemap row. shown and detect_retina are SQLite's 0/1; attribution is sanitized HTML.
 * tile_proxy is set when the Worker proxies the tiles under a keyed provider (the url is then
 * a path on the instance).
 */
export const BasemapRow = z.looseObject({
  id: z.number(),
  key: z.string(),
  label: z.string(),
  kind: z.enum(['raster', 'vector']),
  url: z.string(),
  attribution: nullableStr,
  max_zoom: z.nullable(z.number()),
  detect_retina: z.number(),
  shown: z.number(),
  tile_proxy: nullableStr,
  sort_order: z.number(),
});

/** GET /api/basemaps: every basemap, hidden ones included, in display order. */
export const BasemapsResponse = z.looseObject({ basemaps: z.array(BasemapRow) });

/** POST /api/basemaps */
export const BasemapCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number(), key: z.string() });

export type BasemapRow = z.infer<typeof BasemapRow>;
export type BasemapsResponse = z.infer<typeof BasemapsResponse>;
export type BasemapCreateResponse = z.infer<typeof BasemapCreateResponse>;

/** Every basemap, hidden ones too. */
export function getBasemaps(client: ApiClient): Promise<BasemapsResponse> {
  return client.get('/api/basemaps', BasemapsResponse);
}

/** Adds a basemap (last in the order). */
export function createBasemap(client: ApiClient, body: BasemapRequest): Promise<BasemapCreateResponse> {
  return client.write('POST', '/api/basemaps', body, BasemapCreateResponse);
}

/** Changes a basemap's fields (those in body). */
export function updateBasemap(client: ApiClient, id: number, body: BasemapRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/basemaps/' + id, body, OkResponse);
}

/** Sets the display order. */
export function reorderBasemaps(client: ApiClient, body: BasemapOrderRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/basemaps/order', body, OkResponse);
}

/** Removes a basemap. */
export function deleteBasemap(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/basemaps/' + id, undefined, OkResponse);
}
