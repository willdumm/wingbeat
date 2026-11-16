/**
 * The bearer on the map's requests for the active account's keyed basemap tiles
 * (`/api/tiles/…` on its instance, which needs a session), and on no other request:
 * MapLibre's TransformRequestManager adds it to URLs matching tileAuthHeader()'s pattern.
 */
import { TransformRequestManager, type HeaderOptions } from '@maplibre/maplibre-react-native';

const ID = 'wingbeat-tiles';

/** The header for one instance's tile proxy. */
export function tileAuthHeader(host: string, token: string): HeaderOptions {
  return {
    id: ID,
    match: '^https://' + host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/api/tiles/',
    name: 'Authorization',
    value: 'Bearer ' + token,
  };
}

/** Sends the bearer to this instance's tile proxy, or to none (null). */
export function setTileAuth(host: string | null, token: string | null): void {
  if (host && token) TransformRequestManager.addHeader(tileAuthHeader(host, token));
  else TransformRequestManager.removeHeader(ID);
}
