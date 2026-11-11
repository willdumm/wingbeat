/**
 * Pairing from scanned or opened text, shared by the Add account scanner and the
 * wingbeat://pair link: parse it, check the host, redeem the token, then close the screen.
 */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from '@wingbeat/core/api/client';
import { useAccounts } from './accounts-context';
import { parseFailureMessage, parsePairingLink } from './pairing-link';

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

  const pairFrom = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const parsed = parsePairingLink(text);
    if (!parsed.ok) {
      setStatus({ kind: 'failed', message: parseFailureMessage(parsed.reason, text) });
      return;
    }
    setStatus({ kind: 'pairing', host: parsed.target.host });
    try {
      await addAccount(parsed.target);
      router.dismissTo('/live');
    } catch (err) {
      setStatus({ kind: 'failed', message: pairingErrorMessage(err) });
    }
  }, [addAccount, router]);

  /** Back to waiting for a code after a failure. */
  const reset = useCallback(() => {
    busy.current = false;
    setStatus({ kind: 'idle' });
  }, []);

  return { status, pairFrom, reset };
}

/** The server's reason (a used or expired code says so), or what went wrong. */
function pairingErrorMessage(err: unknown): string {
  if (err instanceof ApiHttpError && err.serverError) return err.serverError;
  if (err instanceof ApiNetworkError || err instanceof ApiTimeoutError) {
    return 'Couldn’t reach the server. Check your connection and scan again.';
  }
  return 'Couldn’t sign in. Make a new code in Wingbeat on the web and scan it.';
}
