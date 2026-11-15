/**
 * Pairing, shared by Add account's "Sign in with Browser", the scanner and the wingbeat://pair
 * link: get a token (from scanned or opened text, or from the signed-in browser), check the
 * host, redeem the token, then close the screen.
 */
import { useCallback, useRef, useState } from 'react';
import { uuid } from 'expo';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from '@wingbeat/core/api/client';
import { APP_CONNECT_CALLBACK } from '@wingbeat/core/app-connect';
import { useAccounts } from './accounts-context';
import { addressFailureMessage, connectCallbackToken, connectRequest, instanceHost } from './browser-sign-in';
import { parseFailureMessage, parsePairingLink, type PairingTarget } from './pairing-link';

export type PairingStatus =
  | { kind: 'idle' }
  | { kind: 'pairing'; host: string }
  | { kind: 'failed'; message: string };

export function usePairing() {
  const { addAccount } = useAccounts();
  const router = useRouter();
  const [status, setStatus] = useState<PairingStatus>({ kind: 'idle' });
  // The camera reports the same code many times a second; only the first one pairs.
  const busy = useRef(false);

  const redeem = useCallback(async (target: PairingTarget) => {
    setStatus({ kind: 'pairing', host: target.host });
    try {
      await addAccount(target);
      router.dismissTo('/live');
    } catch (err) {
      setStatus({ kind: 'failed', message: pairingErrorMessage(err) });
    }
  }, [addAccount, router]);

  const pairFrom = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const parsed = parsePairingLink(text);
    if (!parsed.ok) {
      setStatus({ kind: 'failed', message: parseFailureMessage(parsed.reason, text) });
      return;
    }
    await redeem(parsed.target);
  }, [redeem]);

  /**
   * "Sign in with Browser" for the typed address: the instance's connect page in an auth
   * session that shares Safari's cookies, whose redirect brings back a token only this
   * request's verifier redeems. Cancelling it goes back to idle.
   */
  const signInWithBrowser = useCallback(async (address: string) => {
    if (busy.current) return;
    busy.current = true;
    const parsed = instanceHost(address);
    if (!parsed.ok) {
      setStatus({ kind: 'failed', message: addressFailureMessage(parsed.reason) });
      return;
    }
    // Native UUIDs come from the system's secure random generator: 244 random bits.
    const hex = () => uuid.v4().replace(/-/g, '');
    const request = connectRequest(parsed.host, hex() + hex(), hex());
    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(request.url, APP_CONNECT_CALLBACK);
    } catch {
      setStatus({ kind: 'failed', message: 'Couldn’t open the browser.' });
      return;
    }
    if (result.type !== 'success') {
      busy.current = false;
      return;
    }
    const token = connectCallbackToken(result.url, request.state);
    if (!token) {
      setStatus({ kind: 'failed', message: 'Couldn’t sign in. Try again.' });
      return;
    }
    await redeem({ host: parsed.host, token, codeVerifier: request.verifier });
  }, [redeem]);

  /** Back to waiting for a code after a failure. */
  const reset = useCallback(() => {
    busy.current = false;
    setStatus({ kind: 'idle' });
  }, []);

  return { status, pairFrom, signInWithBrowser, reset };
}

/** The server's reason (a used or expired code says so), or what went wrong. */
function pairingErrorMessage(err: unknown): string {
  if (err instanceof ApiHttpError && err.serverError) return err.serverError;
  if (err instanceof ApiNetworkError || err instanceof ApiTimeoutError) {
    return 'Couldn’t reach the server. Check your connection and try again.';
  }
  return 'Couldn’t sign in. Try again, or make a new code in Wingbeat on the web and scan it.';
}
