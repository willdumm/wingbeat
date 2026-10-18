// Outbound fetches of admin-supplied URLs (tracker feeds, tile-metadata lookups, webhooks).
// A Worker can't reach a private network, but these URLs are still attacker-influenced
// (a compromised admin account, a stolen session), so every one is held to the same rules:
// public https hostnames only, redirects followed by hand and re-checked, a timeout, and a
// cap on how much body is read.

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

export interface UrlCheckOptions {
  /** The Worker's own request host; fetching ourselves would loop back into the app. */
  ownHost?: string;
}

/** Rejects anything but a plain https URL on a public-looking hostname: no IP literals,
 * localhost, single-label names, private-use TLDs, userinfo, non-443 ports, or (when
 * given) the Worker's own host. */
export function checkPublicHttpsUrl(raw: unknown, opts: UrlCheckOptions = {}): UrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'URL is required' };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: 'URL is not valid' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'URL must use https://' };
  if (u.username || u.password) return { ok: false, error: 'URL must not contain a username or password' };
  if (u.port && u.port !== '443') return { ok: false, error: 'URL must use the default https port' };
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return { ok: false, error: 'URL must use a hostname, not an IP address' };
  if (!host.includes('.')) return { ok: false, error: 'URL must use a public hostname' };
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp|test|invalid|example)$/.test(host)) {
    return { ok: false, error: 'URL must use a public hostname' };
  }
  if (opts.ownHost) {
    const own = opts.ownHost.toLowerCase().replace(/:\d+$/, '');
    if (host === own) return { ok: false, error: 'URL must not point at this server' };
  }
  return { ok: true, url: u };
}

export interface SafeFetchOptions extends UrlCheckOptions {
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
  /** Default 3. */
  maxRedirects?: number;
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  statusText: string;
  /** Response body (empty for a non-2xx response; its body is discarded unread). */
  text: string;
  /** The URL the body came from, after redirects. */
  finalUrl: string;
}

export class SafeFetchError extends Error {}

/**
 * GETs `raw`, following redirects by hand so each hop is re-validated. The Authorization
 * header is dropped when a redirect leaves the original origin. The timeout covers the
 * whole exchange, body included. Throws SafeFetchError on a rejected URL, too many
 * redirects, a timeout, a network failure, or a body over `maxBytes`; a non-2xx status is
 * returned, not thrown.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let headers = { ...opts.headers };
  let origin: string | null = null;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = checkPublicHttpsUrl(current, opts);
    if (!check.ok) throw new SafeFetchError(hop === 0 ? check.error : `Redirected to a disallowed URL (${check.error})`);
    const u = check.url;
    if (origin !== null && u.origin !== origin) {
      headers = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'authorization'));
    }
    origin ??= u.origin;
    let resp: Response;
    try {
      resp = await fetch(u.toString(), { redirect: 'manual', headers, signal });
    } catch (err) {
      throw new SafeFetchError(signal.aborted ? `Timed out after ${opts.timeoutMs / 1000}s` : `Request failed: ${err instanceof Error ? err.message : err}`);
    }
    if (resp.status >= 300 && resp.status < 400) {
      await resp.body?.cancel().catch(() => {});
      const loc = resp.headers.get('Location');
      if (!loc) throw new SafeFetchError(`Redirect (${resp.status}) without a Location`);
      try { current = new URL(loc, u).toString(); } catch { throw new SafeFetchError('Redirect to an invalid URL'); }
      continue;
    }
    if (!resp.ok || !resp.body) {
      await resp.body?.cancel().catch(() => {});
      return { status: resp.status, ok: resp.ok, statusText: resp.statusText, text: '', finalUrl: u.toString() };
    }
    let text: string;
    try {
      text = await readCapped(resp.body, opts.maxBytes);
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError(signal.aborted ? `Timed out after ${opts.timeoutMs / 1000}s` : 'Failed reading the response');
    }
    return { status: resp.status, ok: true, statusText: resp.statusText, text, finalUrl: u.toString() };
  }
  throw new SafeFetchError(`Too many redirects (more than ${maxRedirects})`);
}

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SafeFetchError(`Response is larger than ${Math.round(maxBytes / 1048576)} MB`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}
