/**
 * The version handshake (docs/mobile-app-plan.md, "Versions and compatibility: OTA first"):
 * what GET /api/bootstrap's api_version and min_client_level mean for this bundle, and what
 * the app does when it's too old for its server.
 */
import { CLIENT_API_LEVEL } from '@wingbeat/core/api/version';
import type { BootstrapResponse } from '@wingbeat/core/api/bootstrap';

/**
 * The oldest server API level this bundle works with. A server without api_version predates
 * the handshake (and the app routes), so it's too old too.
 */
export const MIN_SERVER_API_VERSION = 1;

export type Handshake = 'ok' | 'client-too-old' | 'server-too-old';

export function handshake(
  bootstrap: Pick<BootstrapResponse, 'api_version' | 'min_client_level'>,
  clientLevel = CLIENT_API_LEVEL,
  minServerVersion = MIN_SERVER_API_VERSION,
): Handshake {
  if (bootstrap.api_version === undefined || bootstrap.api_version < minServerVersion) return 'server-too-old';
  if (clientLevel < (bootstrap.min_client_level ?? 0)) return 'client-too-old';
  return 'ok';
}

/** The parts of expo-updates the update flow uses, so tests can stand in for it. */
export interface Updater {
  isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean }>;
  reloadAsync(): Promise<void>;
}

/**
 * For a client too old for its server: fetches the newest update for this runtime and
 * reloads into it ('reloading'), or, when there's none (the runtime itself is too old) or
 * updates can't run here (a development build), 'store'. Doesn't look at the update's level:
 * if a newer one is still too old, the handshake fails again after the reload, and with no
 * newer update left, this answers 'store'.
 */
export async function updateForServer(updater: Updater): Promise<'reloading' | 'store'> {
  if (!updater.isEnabled) return 'store';
  try {
    if (!(await updater.checkForUpdateAsync()).isAvailable) return 'store';
    if (!(await updater.fetchUpdateAsync()).isNew) return 'store';
    await updater.reloadAsync();
    return 'reloading';
  } catch {
    return 'store';
  }
}

/**
 * The background check on return to the foreground (expo-updates checks on launch by itself):
 * downloads a newer update, which applies on the next cold start. Errors are dropped; the
 * next foreground tries again.
 */
export async function fetchUpdateInBackground(updater: Omit<Updater, 'reloadAsync'>): Promise<boolean> {
  if (!updater.isEnabled) return false;
  try {
    if (!(await updater.checkForUpdateAsync()).isAvailable) return false;
    return (await updater.fetchUpdateAsync()).isNew;
  } catch {
    return false;
  }
}
