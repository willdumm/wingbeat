/**
 * The elevation at a point, read from the DEM the tint draws (core's DEM_PMTILES_URL). Hermes
 * can't decode the archive's WebP tiles, so a hidden WebView fetches them with pmtiles.js (the
 * web's version) and hands back one pixel's RGBA; core's decodeTerrarium turns it into meters.
 * The page keeps the last few decoded tiles, so panning within one reads without a fetch.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { DEM_PMTILES_URL, DEM_TILE_SIZE, PMTILES_SCRIPT_SRI, PMTILES_SCRIPT_URL, decodeTerrarium, demZoomFor, latLngToTilePixel } from '@wingbeat/core/elevation';

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
<script src="${PMTILES_SCRIPT_URL}" integrity="${PMTILES_SCRIPT_SRI}" crossorigin="anonymous"></script>
<script>
const archive = new pmtiles.PMTiles(${JSON.stringify(DEM_PMTILES_URL)});
// Only once pmtiles.js has loaded (the line above throws if it didn't).
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
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
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pixel', id, rgba: data ? Array.from(data.slice(i, i + 4)) : null }));
});
</script>`;

interface Pending {
  resolve: (m: number | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Renders nothing visible; mount it while the elevation tool is on. */
export function ElevationReader({ ref }: { ref: Ref<ElevationReaderRef> }) {
  const web = useRef<InstanceType<typeof Web>>(null);
  const ready = useRef(false);
  const queued = useRef<string[]>([]);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(0);

  const settle = (id: number, m: number | null) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.current.delete(id);
    p.resolve(m);
  };

  // Unmounted (the tool turned off): the page is gone, so nothing in flight will answer.
  useEffect(() => () => { for (const id of [...pending.current.keys()]) settle(id, null); }, []);

  useImperativeHandle(ref, () => ({
    elevationAt: ([lng, lat], zoom) => new Promise((resolve) => {
      const z = demZoomFor(zoom);
      const { x, y, px, py } = latLngToTilePixel(lat, lng, z);
      const id = nextId.current++;
      pending.current.set(id, { resolve, timer: setTimeout(() => settle(id, null), READ_TIMEOUT_MS) });
      const call = `readPixel(${id}, ${z}, ${x}, ${y}, ${px}, ${py}); true;`;
      if (ready.current) web.current?.injectJavaScript(call);
      else queued.current.push(call);
    }),
  }), []);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type?: unknown; id?: unknown; rgba?: unknown } | undefined;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m?.type === 'ready') {
      ready.current = true;
      for (const call of queued.current.splice(0)) web.current?.injectJavaScript(call);
    } else if (m?.type === 'pixel' && typeof m.id === 'number') {
      settle(m.id, Array.isArray(m.rgba) ? decodeTerrarium(m.rgba)[0] : null);
    }
  };

  // The WebView's own container is flex: 1 (containerStyle, not style): unsized, it covers the
  // map and takes its touches. A 1 px box that takes none.
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <Web ref={web} source={{ html: PAGE, baseUrl: 'https://localhost/' }} originWhitelist={['*']}
        containerStyle={{ width: 1, height: 1, flex: 0 }} style={{ width: 1, height: 1 }}
        onMessage={onMessage}
        // iOS can reap the page's process: the reads in flight are lost, and the reloaded page
        // says 'ready' again, which sends the ones made meanwhile.
        onContentProcessDidTerminate={() => {
          ready.current = false;
          for (const id of [...pending.current.keys()]) settle(id, null);
          web.current?.reload();
        }} />
    </View>
  );
}
