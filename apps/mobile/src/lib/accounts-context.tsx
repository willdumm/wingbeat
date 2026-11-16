/**
 * The accounts for the screens: the list and the active account from the secure store
 * (accounts.ts), pairing a new one, and an API client for the active one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiHttpError, type ApiClient } from '@wingbeat/core/api/client';
import { deleteSession, getMe } from '@wingbeat/core/api/me';
import { accountUserChanged, createAccountStore, secureKeyValue, type Account, type AccountsState, type AccountUser } from './accounts';
import { accountClient, pairWith } from './api';
import type { PairingTarget } from './pairing-link';
import { setTileAuth } from './tile-auth';

interface AccountsValue extends AccountsState {
  /** False until the store has been read. */
  loaded: boolean;
  active: Account | null;
  /** The active account's client; null when it has none or is signed out. */
  client: ApiClient | null;
  /** Pairs with the instance and makes the new account active. Rejects with the API error. */
  addAccount(target: PairingTarget): Promise<Account>;
  setActive(id: string): Promise<void>;
  /**
   * Removes the account from this phone only, for one whose session is already gone (signed
   * out, or its user deleted): a live session would stay in the web's Devices list and keep
   * its push registration. Use signOut for those.
   */
  remove(id: string): Promise<void>;
  /**
   * Signs the account's session out on its instance, then removes it. Rejects with the API
   * error, keeping the account, when the instance can't be reached or refuses.
   */
  signOut(id: string): Promise<void>;
  /** Stores the account's user as its server describes it, when that differs. */
  syncUser(id: string, user: AccountUser): void;
  /** Stores the instance's name, when it differs. */
  syncAppName(id: string, appName: string): void;
  /** A client for each account that's signed in, the active one included. */
  signedInClients(): Promise<ApiClient[]>;
}

const store = createAccountStore(secureKeyValue());
const AccountsContext = createContext<AccountsValue | null>(null);

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountsState>({ accounts: [], activeId: null });
  const [loaded, setLoaded] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);

  useEffect(() => {
    store.load().then(setState).finally(() => setLoaded(true));
  }, []);

  const active = state.accounts.find((a) => a.id === state.activeId) ?? null;

  useEffect(() => {
    let current = true;
    setClient(null);
    setTileAuth(null, null);
    if (!active || active.signedOut) return;
    const id = active.id;
    store.token(id).then((token) => {
      if (!current) return;
      if (!token) {
        store.markSignedOut(id).then(setState);
        return;
      }
      setTileAuth(active.host, token);
      setClient(accountClient(active.host, token, () => { store.markSignedOut(id).then(setState); }));
    });
    return () => { current = false; };
  }, [active?.id, active?.host, active?.signedOut]);

  const addAccount = useCallback(async (target: PairingTarget) => {
    const { token, user } = await pairWith(target);
    const next = await store.add(target.host, user, token);
    setState(next);
    return next.accounts.find((a) => a.id === next.activeId)!;
  }, []);

  const signOut = useCallback(async (id: string) => {
    const account = state.accounts.find((a) => a.id === id);
    const token = account && !account.signedOut ? await store.token(id) : null;
    if (account && token) {
      const c = accountClient(account.host, token, () => {});
      try {
        await deleteSession(c, (await getMe(c)).session_id);
      } catch (err) {
        // A 401: the session is already gone.
        if (!(err instanceof ApiHttpError && err.status === 401)) throw err;
      }
    }
    setState(await store.remove(id));
  }, [state.accounts]);

  const value = useMemo<AccountsValue>(() => ({
    ...state,
    loaded,
    active,
    client,
    addAccount,
    setActive: async (id) => setState(await store.setActive(id)),
    remove: async (id) => setState(await store.remove(id)),
    signOut,
    syncUser: (id, user) => {
      const account = state.accounts.find((a) => a.id === id);
      if (account && account.user.id === user.id && accountUserChanged(account.user, user)) store.updateUser(id, user).then(setState);
    },
    syncAppName: (id, appName) => {
      const account = state.accounts.find((a) => a.id === id);
      if (account && account.appName !== appName) store.setAppName(id, appName).then(setState);
    },
    signedInClients: async () => {
      const clients = await Promise.all(state.accounts.filter((a) => !a.signedOut).map(async (a) => {
        const token = await store.token(a.id);
        return token ? accountClient(a.host, token, () => { store.markSignedOut(a.id).then(setState); }) : null;
      }));
      return clients.filter((c) => c !== null);
    },
  }), [state, loaded, active, client, addAccount, signOut]);

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsValue {
  const value = useContext(AccountsContext);
  if (!value) throw new Error('useAccounts outside AccountsProvider');
  return value;
}
