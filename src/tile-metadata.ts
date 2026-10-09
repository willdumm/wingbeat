// Tile source metadata lookup for the "Look up details" button in the add-layer and
// add-overlay forms. Given a tile URL template (or a TileJSON / ArcGIS MapServer URL
// pasted directly), guesses where that server publishes metadata and returns whatever
// label / attribution / max zoom it finds. Plain XYZ servers publish nothing, so an
// empty result is normal, not an error.
//
// Runs server-side (GET /api/tile-metadata) because many tileservers allow
// cross-origin tile images but not cross-origin JSON. That makes this a fetch of a
// user-supplied URL, so every hop goes through safeFetchUrl().

export interface TileMetadata {
  /** Where the metadata came from, for the form's status line. */
  source: 'arcgis' | 'tilejson';
  label?: string;
  /** Sanitized HTML — safe to assign to innerHTML (see sanitizeAttribution). */
  attribution?: string;
  maxZoom?: number;
  /** A Leaflet tile template, set only when the input wasn't one already (a pasted
   * TileJSON or MapServer URL) and the metadata says where the tiles are. */
  url?: string;
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_ATTRIBUTION_LENGTH = 1000;

const ARCGIS_SERVICE = /^(.*\/(?:MapServer|ImageServer))(?:\/tile\/.*)?$/i;
const TEMPLATE_TOKEN = /\{[a-z]+\}/i;
const VECTOR_TILE_EXT = /\.(pbf|mvt)(\?|$)/i;

/** Rejects anything but a plain https URL on a public-looking hostname: no IP
 * literals, localhost, single-label names, or private-use TLDs. Workers can't reach a
 * private network anyway, but a hostname check is cheap and keeps the endpoint from
 * being a general-purpose fetch proxy. */
function safeFetchUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  if (!host.includes('.')) return null;
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp|test|invalid|example)$/.test(host)) return null;
  return u;
}

/** GETs `raw` and parses it as JSON, following redirects by hand so each hop is
 * re-checked by safeFetchUrl(). Returns null on any failure. */
async function fetchJson(raw: string): Promise<unknown> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = safeFetchUrl(current);
    if (!u) return null;
    let resp: Response;
    try {
      resp = await fetch(u.toString(), {
        redirect: 'manual',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('Location');
      if (!loc) return null;
      current = new URL(loc, u).toString();
      continue;
    }
    if (!resp.ok || !resp.body) return null;
    const text = await readCapped(resp.body);
    if (text === null) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  return null;
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

/** Fills in the template tokens with fixed values so the URL can be fetched as-is
 * (only `{s}` ever appears in a hostname). */
function concreteUrl(template: string): string {
  return template.replace(/\{s\}/gi, 'a').replace(/\{r\}/gi, '');
}

/** Appends `params` to a URL, keeping any query string it already has (API keys,
 * ArcGIS tokens). */
function withQuery(base: string, query: string, params: Record<string, string>): string {
  const sp = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function zoomOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 30 ? v : undefined;
}

async function lookupArcgis(serviceUrl: string, query: string, isTemplate: boolean): Promise<TileMetadata | null> {
  const data = await fetchJson(withQuery(serviceUrl, query, { f: 'json' }));
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    copyrightText?: unknown; mapName?: unknown; name?: unknown;
    documentInfo?: { Title?: unknown };
    tileInfo?: { lods?: { level?: unknown; scale?: unknown }[] };
    maxScale?: unknown; error?: unknown;
  };
  if (d.error) return null;

  // tileInfo.lods lists the whole tiling scheme (usually to level 23) whether or not
  // the service has tiles that deep; maxScale (0 = unlimited) is the real cutoff, e.g.
  // USGS Topo's 9027.98 is exactly level 16. The 1% slack absorbs float noise.
  const maxScale = typeof d.maxScale === 'number' && d.maxScale > 0 ? d.maxScale : 0;
  const levels = (d.tileInfo?.lods ?? [])
    .filter((l) => !maxScale || typeof l.scale !== 'number' || l.scale >= maxScale * 0.99)
    .map((l) => zoomOrUndefined(l.level))
    .filter((l): l is number => l !== undefined);
  const out: TileMetadata = { source: 'arcgis' };
  const label = nonEmpty(d.documentInfo?.Title) ?? nonEmpty(d.mapName) ?? nonEmpty(d.name);
  if (label && label.toLowerCase() !== 'layers') out.label = label;
  const attribution = sanitizeAttribution(nonEmpty(d.copyrightText) ?? '');
  if (attribution) out.attribution = attribution;
  if (levels.length) out.maxZoom = Math.max(...levels);
  // Only a cached (tiled) service has a /tile/ endpoint Leaflet can use.
  if (!isTemplate && d.tileInfo) out.url = withQuery(`${serviceUrl}/tile/{z}/{y}/{x}`, query, {});
  return out.label || out.attribution || out.maxZoom !== undefined || out.url ? out : null;
}

function parseTileJson(data: unknown, isTemplate: boolean): TileMetadata | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as { tilejson?: unknown; tiles?: unknown; name?: unknown; attribution?: unknown; maxzoom?: unknown };
  const tiles = Array.isArray(d.tiles) ? d.tiles.filter((t): t is string => typeof t === 'string') : [];
  // Require one of the TileJSON-defining keys so an unrelated JSON document at a
  // guessed path (a style.json, an error body) isn't mistaken for metadata.
  if (typeof d.tilejson !== 'string' && tiles.length === 0) return null;

  const out: TileMetadata = { source: 'tilejson' };
  const label = nonEmpty(d.name);
  if (label) out.label = label;
  const attribution = sanitizeAttribution(nonEmpty(d.attribution) ?? '');
  if (attribution) out.attribution = attribution;
  const maxZoom = zoomOrUndefined(d.maxzoom);
  if (maxZoom !== undefined) out.maxZoom = maxZoom;
  // Leaflet's L.tileLayer only draws raster tiles.
  if (!isTemplate && tiles[0] && !VECTOR_TILE_EXT.test(tiles[0])) out.url = tiles[0];
  return out;
}

/** How many directories above the tile directory to search for TileJSON. */
const MAX_ANCESTOR_LEVELS = 3;

/** A tile URL reduced to what identifies the tileset: no query string, lowercase
 * template tokens, and no `{s}`/`a.`-style subdomain (TileJSON lists hosts instead). */
function tileIdentity(url: string): string {
  return url.split('?')[0]
    .replace(/\{[a-z]+\}/gi, (m) => m.toLowerCase())
    .replace(/^(https?:\/\/)(?:\{s\}|[a-d])\./i, '$1');
}

/** Candidate TileJSON locations for a tile template, one group per directory level,
 * nearest first. For https://host/data/foo/{z}/{x}/{y}.png the first group is
 *   /data/foo.json (tileserver-gl, OpenMapTiles), /data/foo/tiles.json (MapTiler Cloud),
 *   /data/foo/tilejson.json, /data/foo/metadata.json, /data/foo (Martin, pg_tileserv)
 * and each following group repeats that pattern one directory up (/data.json, …), up
 * to MAX_ANCESTOR_LEVELS. The upward search finds servers that publish TileJSON per
 * dataset above a tile-matrix-set path, e.g. OGC API – Tiles-style
 * /kodiak/nwrhro/tiles/WebMercatorQuad/{z}/{x}/{y}.png → /kodiak/nwrhro/tilejson.json.
 * The template's query string (usually an API key) is carried over to each. */
function tileJsonCandidateLevels(template: string): string[][] {
  const u = new URL(concreteUrl(template));
  const path = decodeURIComponent(u.pathname);
  const tokenAt = path.search(TEMPLATE_TOKEN);
  if (tokenAt < 0) return [];
  const query = u.search.slice(1);
  const levels: string[][] = [];
  let dir = path.slice(0, tokenAt).replace(/\/+$/, '');
  for (let level = 0; level <= MAX_ANCESTOR_LEVELS; level++) {
    const paths = dir
      ? [`${dir}.json`, `${dir}/tiles.json`, `${dir}/tilejson.json`, `${dir}/metadata.json`, dir]
      : ['/tiles.json', '/tilejson.json', '/metadata.json'];
    levels.push(paths.map((p) => withQuery(u.origin + p, query, {})));
    if (!dir) break;
    dir = dir.slice(0, dir.lastIndexOf('/'));
  }
  return levels;
}

/** Whether a TileJSON document found by guessing describes the tileset `template`
 * points at. A document right beside the tiles is trusted unless it names other tile
 * URLs; one found further up must list `template` itself among its tiles, since a
 * parent directory can just as easily describe a different (or combined) tileset. */
function describesTemplate(data: unknown, template: string, strict: boolean): boolean {
  const tiles = (data as { tiles?: unknown }).tiles;
  const list = Array.isArray(tiles) ? tiles.filter((t): t is string => typeof t === 'string') : [];
  if (list.length === 0) return !strict;
  const want = tileIdentity(template);
  return list.some((t) => tileIdentity(t) === want);
}

/**
 * Looks up metadata for a tile source. `input` is either a Leaflet template (contains
 * `{z}`) or a direct link to a TileJSON document / ArcGIS MapServer. Returns null when
 * nothing usable was found. Throws only for an input that isn't a fetchable URL.
 */
export async function lookupTileMetadata(input: string): Promise<TileMetadata | null> {
  const isTemplate = /\{z\}/i.test(input);
  const concrete = concreteUrl(input);
  if (!safeFetchUrl(concrete)) throw new Error('URL must be a public https:// address');
  const u = new URL(concrete);
  const query = u.search.slice(1);

  // ArcGIS paths keep their literal {z}/{y}/{x} after "/tile/", so match on the
  // unparsed input rather than the percent-encoded pathname.
  const arcgis = ARCGIS_SERVICE.exec(input.split('?')[0]);
  if (arcgis) return lookupArcgis(concreteUrl(arcgis[1]), query, isTemplate);

  if (!isTemplate) return parseTileJson(await fetchJson(concrete), false);

  // One level at a time, nearest first, so a closer document wins; the guesses within
  // a level are fetched in parallel since most of them 404.
  const levels = tileJsonCandidateLevels(input);
  for (let level = 0; level < levels.length; level++) {
    const docs = await Promise.all(levels[level].map(fetchJson));
    for (const data of docs) {
      const meta = parseTileJson(data, true);
      if (!meta || !(meta.label || meta.attribution || meta.maxZoom !== undefined)) continue;
      if (describesTemplate(data, input, level > 0)) return meta;
    }
  }
  return null;
}

/**
 * Reduces an attribution string to text plus `<a href="http(s)://…">` links — the only
 * markup an attribution legitimately needs. Everything else (tags, event-handler
 * attributes, non-http hrefs) is dropped; character entities like `&copy;` are kept.
 * Applied to anything rendered into the map's attribution line that another user
 * entered (tile overlays) or that came from a third-party server (this lookup).
 */
export function sanitizeAttribution(input: string): string {
  // Cap the input, not the output, so truncation can never split a tag we emit.
  const html = input.slice(0, MAX_ATTRIBUTION_LENGTH);
  let out = '';
  let openAnchor = false;
  let last = 0;
  const tag = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const escapeText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (let m; (m = tag.exec(html)); ) {
    out += escapeText(html.slice(last, m.index));
    last = tag.lastIndex;
    const isClose = m[0][1] === '/';
    if (m[1].toLowerCase() !== 'a') continue;
    if (isClose) {
      if (openAnchor) { out += '</a>'; openAnchor = false; }
      continue;
    }
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[2]);
    const value = href ? (href[1] ?? href[2] ?? href[3]).trim() : '';
    if (!/^https?:\/\//i.test(value)) continue;
    if (openAnchor) out += '</a>';
    out += `<a href="${value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" target="_blank" rel="noopener noreferrer">`;
    openAnchor = true;
  }
  out += escapeText(html.slice(last));
  if (openAnchor) out += '</a>';
  return out.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}
