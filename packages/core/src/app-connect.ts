/**
 * "Sign in with Browser" (docs/mobile-app-plan.md, "Auth and pairing"): the app opens
 * APP_CONNECT_PATH on its instance with a PKCE S256 challenge and a state; the signed-in
 * browser connects and redirects to APP_CONNECT_CALLBACK with a device-link token, which the
 * app redeems with its verifier. The Worker and the app share these shapes. Each side hashes
 * with its own SHA-256 (Web Crypto in the Worker, a JS one in the app) and encodes here.
 */

export const APP_CONNECT_PATH = '/app/connect';

/** Where the browser sends the token: the only URL the app's auth session waits for. */
export const APP_CONNECT_CALLBACK = 'wingbeat://connect';

/** A S256 challenge: base64url of a SHA-256 digest, 43 characters without padding. */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636's verifier: 43–128 unreserved characters. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
/** The app's state, echoed back unchanged. */
const CONNECT_STATE = /^[A-Za-z0-9_-]{16,128}$/;

export const isCodeChallenge = (s: unknown): s is string => typeof s === 'string' && CODE_CHALLENGE.test(s);
export const isCodeVerifier = (s: unknown): s is string => typeof s === 'string' && CODE_VERIFIER.test(s);
export const isConnectState = (s: unknown): s is string => typeof s === 'string' && CONNECT_STATE.test(s);

/** Base64url without padding, as a S256 challenge is written. */
export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The URL the app opens: its instance's connect page with the challenge and state. */
export function appConnectUrl(origin: string, challenge: string, state: string): string {
  return `${origin}${APP_CONNECT_PATH}?challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`;
}

/** The redirect back to the app with the token to redeem. */
export function appConnectCallbackUrl(token: string, state: string): string {
  return `${APP_CONNECT_CALLBACK}?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
}
