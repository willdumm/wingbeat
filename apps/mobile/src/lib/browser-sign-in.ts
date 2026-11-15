/**
 * "Sign in with Browser" (docs/mobile-app-plan.md, "Auth and pairing"): the address the user
 * types, the PKCE request the app opens in the browser, and the token the browser sends back.
 * The flow itself (the auth session, the redemption) is in use-pairing.ts.
 */
import { sha256 } from '@noble/hashes/sha2';
import { APP_CONNECT_CALLBACK, appConnectUrl, base64url, isConnectState } from '@wingbeat/core/app-connect';
import { HOSTED_DOMAIN, isHostedInstance, isPairingHost, isPairingToken } from './pairing-link';

export type AddressResult =
  | { ok: true; host: string }
  | { ok: false; reason: 'empty' | 'not-an-address' | 'self-hosted' };

/**
 * The instance host for what the user typed: a hosted instance's name (`seahawkair`, or
 * `seahawkair.staging`), its whole host, or a URL on it. Anything else under another domain
 * is self-hosted, which the app doesn't pair with yet.
 */
export function instanceHost(input: string): AddressResult {
  let text = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '');
  text = text.split(/[/?#]/)[0].replace(/\.$/, '');
  if (!text) return { ok: false, reason: 'empty' };
  const host = isHostedInstance(text) ? text
    : /^[a-z0-9-]+(\.staging)?$/.test(text) ? `${text}.${HOSTED_DOMAIN}`
    : null;
  if (host && isPairingHost(host)) return { ok: true, host };
  return { ok: false, reason: isPairingHost(text) && text.includes('.') ? 'self-hosted' : 'not-an-address' };
}

/** What the Add account screen says for an address it can't use. */
export function addressFailureMessage(reason: 'empty' | 'not-an-address' | 'self-hosted'): string {
  if (reason === 'self-hosted') return 'Self-hosted instances aren’t supported yet.';
  return 'Enter your Wingbeat address, like the “yourcompany” in yourcompany.wingbeat.dummthings.dev.';
}

export interface ConnectRequest {
  host: string;
  /** The page the auth session opens. */
  url: string;
  verifier: string;
  state: string;
}

/**
 * The request for host from random hex: the verifier (at least 43 characters) and the state.
 * The caller supplies the randomness (newConnectRequest uses the native UUID generator).
 */
export function connectRequest(host: string, verifier: string, state: string): ConnectRequest {
  const challenge = base64url(sha256(new TextEncoder().encode(verifier)));
  return { host, url: appConnectUrl(`https://${host}`, challenge, state), verifier, state };
}

/** The token in the browser's redirect back to the app, if it's for this request. */
export function connectCallbackToken(url: string, state: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // wingbeat://connect?… parses with 'connect' as the host; wingbeat:connect?… as the path.
  const target = `${parsed.protocol}//${parsed.host || parsed.pathname.replace(/^\/+/, '')}`;
  if (target !== APP_CONNECT_CALLBACK) return null;
  const token = parsed.searchParams.get('token');
  const back = parsed.searchParams.get('state');
  if (!isConnectState(back) || back !== state || !token || !isPairingToken(token)) return null;
  return token;
}
