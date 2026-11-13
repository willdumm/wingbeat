/**
 * The elevation at a point, read from the DEM the tint draws (core's DEM_PMTILES_URL). Hermes
 * can't decode the archive's WebP tiles, so a hidden WebView fetches them with pmtiles.js (the
 * web's version) and hands back one pixel's RGBA; core's decodeTerrarium turns it into meters.
 * The page keeps the last few decoded tiles, so panning within one reads without a fetch.
 */
import { useImperativeHandle, useRef, type Ref } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { DEM_PMTILES_URL, DEM_TILE_SIZE, decodeTerrarium, demZoomFor, latLngToTilePixel } from '@wingbeat/core/elevation';

export interface ElevationReaderRef {
  /** Meters at lngLat on a map at zoom, or null where the DEM has no data (or the fetch failed). */
  elevationAt(lngLat: [number, number], zoom: number): Promise<number | null>;
}

// Its typings default the extra props to undefined, which makes every prop never.
const Web = WebView<Record<never, never>>;

/** How long a read waits for the page (a fetch, or a page that never loaded) before giving up. */
const READ_TIMEOUT_MS = 15_000;

/** Decoded tiles the page keeps (each DEM_TILE_SIZE² RGBA, about 1 MB). */
const TILES_KEPT = 12;

const PAGE = `<!doctype html><meta charset="utf-8">
<script src="https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js" integrity="sha384-QfbOCebHNw8pQiPAOd2IFee2v2A5VYZxBk0+JGZ5H+3mfzVIp6zsQNkTsfGJot93" crossorigin="anonymous"></script>
<script>
const archive = new pmtiles.PMTiles(${JSON.stringify(DEM_PMTILES_URL)});
const tiles = new Map();  // "z/x/y" -> Promise<Uint8ClampedArray | null>, oldest first
function tile(z, x, y) {
  const key = z + '/' + x + '/' + y;
  let p = tiles.get(key);
  if (p) { tiles.delete(key); tiles.set(key, p); return p; }
  p = archive.getZxy(z, x, y).then(async (t) => {
    if (!t || !t.data) return null;
    const bitmap = await createImageBitmap(new Blob([t.data], { type: 'image/webp' }));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${DEM_TILE_SIZE};
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, ${DEM_TILE_SIZE}, ${DEM_TILE_SIZE}).data;
  }).catch(() => null);
  tiles.set(key, p);
  if (tiles.size > ${TILES_KEPT}) tiles.delete(tiles.keys().next().value);
  return p;
}
window.readPixel = (id, z, x, y, px, py) => tile(z, x, y).then((data) => {
  const i = (py * ${DEM_TILE_SIZE} + px) * 4;
  window.ReactNativeWebView.postMessage(JSON.stringify({ id, rgba: data ? Array.from(data.slice(i, i + 4)) : null }));
});
</script>`;

/** Renders nothing visible; mount it while the elevation tool is on. */
export function ElevationReader({ ref }: { ref: Ref<ElevationReaderRef> }) {
  const web = useRef<InstanceType<typeof Web>>(null);
  const loaded = useRef(false);
  const queued = useRef<string[]>([]);
  const pending = useRef(new Map<number, (m: number | null) => void>());
  const nextId = useRef(0);

  useImperativeHandle(ref, () => ({
    elevationAt: ([lng, lat], zoom) => new Promise((resolve) => {
      const z = demZoomFor(zoom);
      const { x, y, px, py } = latLngToTilePixel(lat, lng, z);
      const id = nextId.current++;
      pending.current.set(id, resolve);
      setTimeout(() => { pending.current.get(id)?.(null); pending.current.delete(id); }, READ_TIMEOUT_MS);
      const call = `readPixel(${id}, ${z}, ${x}, ${y}, ${px}, ${py}); true;`;
      if (loaded.current) web.current?.injectJavaScript(call);
      else queued.current.push(call);
    }),
  }), []);

  const onMessage = (e: WebViewMessageEvent) => {
    const { id, rgba } = JSON.parse(e.nativeEvent.data) as { id: number; rgba: number[] | null };
    pending.current.get(id)?.(rgba ? decodeTerrarium(rgba)[0] : null);
    pending.current.delete(id);
  };

  return (
    <Web ref={web} source={{ html: PAGE, baseUrl: 'https://localhost/' }} originWhitelist={['*']}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} pointerEvents="none"
      onMessage={onMessage}
      onLoadEnd={() => {
        loaded.current = true;
        for (const call of queued.current.splice(0)) web.current?.injectJavaScript(call);
      }} />
  );
}
