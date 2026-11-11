/**
 * The accounts for the screens: the list and the active account from the secure store
 * (accounts.ts), pairing a new one, and an API client for the active one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiClient } from '@wingbeat/core/api/client';
import { createAccountStore, secureKeyValue, type Account, type AccountsState } from './accounts';
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
  remove(id: string): Promise<void>;
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

  const value = useMemo<AccountsValue>(() => ({
    ...state,
    loaded,
    active,
    client,
    addAccount,
    setActive: async (id) => setState(await store.setActive(id)),
    remove: async (id) => setState(await store.remove(id)),
  }), [state, loaded, active, client, addAccount]);

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsValue {
  const value = useContext(AccountsContext);
  if (!value) throw new Error('useAccounts outside AccountsProvider');
  return value;
}
