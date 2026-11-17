/**
 * The active account's GET /api/bootstrap, loaded when the account changes and on return to
 * the foreground, and the version handshake it answers (handshake.ts).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getBootstrap, type BootstrapResponse } from '@wingbeat/core/api/bootstrap';
import { useAccounts } from './accounts-context';
import { handshake, type Handshake } from './handshake';

interface BootstrapValue {
  /** The last bootstrap the active account's server answered; null until then. */
  bootstrap: BootstrapResponse | null;
  /** null until the server has answered. */
  handshake: Handshake | null;
}

const BootstrapContext = createContext<BootstrapValue>({ bootstrap: null, handshake: null });

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { client } = useAccounts();
  // Kept with the client it was loaded with: on an account switch the first render has the new
  // client and the old answer (the effect below runs after it), which must not reach the new
  // account (AccountUserSync would save the old instance's name and user onto it).
  const [loaded, setLoaded] = useState<{ client: typeof client; bootstrap: BootstrapResponse } | null>(null);
  const bootstrap = loaded && loaded.client === client ? loaded.bootstrap : null;

  useEffect(() => {
    setLoaded(null);
    if (!client) return;
    let current = true;
    // A failed load keeps the last answer; the next foreground tries again.
    const load = () => getBootstrap(client).then((b) => { if (current) setLoaded({ client, bootstrap: b }); }, () => {});
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => { current = false; sub.remove(); };
  }, [client]);

  return (
    <BootstrapContext.Provider value={{ bootstrap, handshake: bootstrap && handshake(bootstrap) }}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap(): BootstrapValue {
  return useContext(BootstrapContext);
}
