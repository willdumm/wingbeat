/**
 * What a pairing QR code or link says: the instance's host and the device-link or invite
 * token to redeem there (docs/mobile-app-plan.md, "Auth and pairing"). The scanner accepts
 * the URL the web already shows, `https://<host>/join/<token>` (Settings → Devices, and
 * invites), and `wingbeat://pair?host=<host>&token=<token>`.
 */

export interface PairingTarget {
  /** Lowercase hostname, with a port if the link had one. */
  host: string;
  token: string;
}

export type ParseResult =
  | { ok: true; target: PairingTarget }
  | { ok: false; reason: 'not-a-pairing-link' | 'self-hosted' };

/**
 * The domain hosted instances live under (customer.wingbeat.dummthings.dev, and staging's
 * customer.staging.wingbeat.dummthings.dev). Until phase 9's relay answers hosted or
 * self-hosted, the app pairs only with these.
 */
export const HOSTED_DOMAIN = 'wingbeat.dummthings.dev';

/** Whether host is a hosted instance: a subdomain of HOSTED_DOMAIN on the default port.
 * The domain itself is the docs site, not an instance. */
export function isHostedInstance(host: string): boolean {
  return host.endsWith('.' + HOSTED_DOMAIN) && !host.includes(':');
}

// generateToken() in src/auth.ts makes 64 hex characters; this allows any URL-safe token.
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

/** Parses scanned or opened text into the instance and token, or says why it can't pair. */
export function parsePairingLink(text: string): ParseResult {
  const target = pairingTarget(text.trim());
  if (!target) return { ok: false, reason: 'not-a-pairing-link' };
  if (!isHostedInstance(target.host)) return { ok: false, reason: 'self-hosted' };
  return { ok: true, target };
}

function pairingTarget(text: string): PairingTarget | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  let host: string | null;
  let token: string | null;
  if (url.protocol === 'https:') {
    const m = /^\/join\/([^/]+)\/?$/.exec(url.pathname);
    host = url.host;
    token = m ? decodeURIComponent(m[1]) : null;
  } else if (url.protocol === 'wingbeat:') {
    // wingbeat://pair?… parses with 'pair' as the host; wingbeat:pair?… as the path.
    if ((url.host || url.pathname.replace(/^\/+/, '')) !== 'pair') return null;
    host = url.searchParams.get('host');
    token = url.searchParams.get('token');
  } else {
    return null;
  }
  host = host?.toLowerCase() ?? null;
  if (!host || !HOST.test(host) || !token || !TOKEN.test(token)) return null;
  return { host, token };
}

/** What the Add account screen says for a code it can't use. */
export function parseFailureMessage(reason: 'not-a-pairing-link' | 'self-hosted', text: string): string {
  if (reason === 'self-hosted') return 'Self-hosted instances aren’t supported yet.';
  return text.startsWith('http')
    ? 'That isn’t a Wingbeat sign-in code. In Wingbeat on the web, open Settings → Devices and add a phone.'
    : 'That isn’t a Wingbeat sign-in code.';
}
