/**
 * The core API client for an account: its instance's origin, its session token as a bearer,
 * and the X-Wingbeat-App header on every request. A 401 means the session was revoked or
 * expired, so the account is marked signed out and nothing retries (docs/mobile-app-plan.md,
 * "Auth and pairing").
 */
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { ApiHttpError, createApiClient, type ApiClient } from '@wingbeat/core/api/client';
import { pair } from '@wingbeat/core/api/app';
import { APP_VERSION_HEADER, appVersionHeaderValue } from '@wingbeat/core/api/version';
import type { AccountUser } from './accounts';
import type { PairingTarget } from './pairing-link';

// A development build has no fingerprint runtime of its own.
const appHeaders = { [APP_VERSION_HEADER]: appVersionHeaderValue(Updates.runtimeVersion ?? 'dev') };

/** An instance's origin. */
export const origin = (host: string) => 'https://' + host;

export function accountClient(host: string, token: string, onSignedOut: () => void): ApiClient {
  const client = createApiClient({ baseUrl: origin(host), auth: { kind: 'bearer', token }, headers: appHeaders });
  const signOutOn401 = (err: unknown): never => {
    if (err instanceof ApiHttpError && err.status === 401) onSignedOut();
    throw err;
  };
  return {
    get: (path, schema) => client.get(path, schema).catch(signOutOn401),
    write: (method, path, body, schema) => client.write(method, path, body, schema).catch(signOutOn401),
  };
}

/** Redeems the scanned token at its instance: the new session's token and its user. */
export async function pairWith(target: PairingTarget): Promise<{ token: string; user: AccountUser }> {
  const client = createApiClient({ baseUrl: origin(target.host), headers: appHeaders });
  const { token, me } = await pair(client, { token: target.token, device_name: Device.deviceName });
  return { token, user: { id: me.id, name: me.name, role: me.role } };
}
