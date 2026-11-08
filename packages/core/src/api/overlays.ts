/**
 * The overlays route group: the tenant's tile overlays (the extra map layers in the legend),
 * which every page reads and Settings adds, edits and removes, and the tile-metadata lookup
 * behind the overlay forms' "Look up details" (admins only). The request schemas are in
 * overlays-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { OverlayRequest } from './overlays-requests';

export type { OverlayRequest } from './overlays-requests';

const nullableStr = z.nullable(z.string());

/** A tile overlay. default_enabled is SQLite's 0/1; attribution is sanitized HTML. */
export const TileOverlay = z.looseObject({
  id: z.number(),
  label: z.string(),
  url: z.string(),
  attribution: nullableStr,
  max_zoom: z.nullable(z.number()),
  default_enabled: z.number(),
  default_enabled_by_basemap: z.nullable(z.record(z.string(), z.boolean())),
});

/** GET /api/overlays */
export const OverlaysResponse = z.looseObject({ overlays: z.array(TileOverlay) });

/** POST /api/overlays */
export const OverlayCreateResponse = z.looseObject({ ok: z.literal(true), id: z.number() });

/**
 * What a tile server publishes about itself (TileMetadata in src/tile-metadata.ts), null when
 * nothing. attribution is sanitized HTML; url is a tile template, only when the input wasn't one.
 */
export const TileMetadata = z.looseObject({
  source: z.enum(['arcgis', 'tilejson']),
  label: z.optional(z.string()),
  attribution: z.optional(z.string()),
  maxZoom: z.optional(z.number()),
  url: z.optional(z.string()),
});

/** GET /api/tile-metadata?url= */
export const TileMetadataResponse = z.looseObject({ metadata: z.nullable(TileMetadata) });

export type TileOverlay = z.infer<typeof TileOverlay>;
export type OverlaysResponse = z.infer<typeof OverlaysResponse>;
export type OverlayCreateResponse = z.infer<typeof OverlayCreateResponse>;
export type TileMetadataResponse = z.infer<typeof TileMetadataResponse>;

/** Every tile overlay. */
export function getOverlays(client: ApiClient): Promise<OverlaysResponse> {
  return client.get('/api/overlays', OverlaysResponse);
}

/** Adds a tile overlay. */
export function createOverlay(client: ApiClient, body: OverlayRequest): Promise<OverlayCreateResponse> {
  return client.write('POST', '/api/overlays', body, OverlayCreateResponse);
}

/** Changes a tile overlay's fields (those in body). */
export function updateOverlay(client: ApiClient, id: number, body: OverlayRequest): Promise<OkResponse> {
  return client.write('PUT', '/api/overlays/' + id, body, OkResponse);
}

/** Removes a tile overlay. */
export function deleteOverlay(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/overlays/' + id, undefined, OkResponse);
}

/** Looks up a tile server's published details (a tile template, TileJSON or ArcGIS URL). */
export function getTileMetadata(client: ApiClient, url: string): Promise<TileMetadataResponse> {
  return client.get('/api/tile-metadata?url=' + encodeURIComponent(url), TileMetadataResponse);
}
