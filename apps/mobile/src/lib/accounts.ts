/**
 * The accounts this phone is signed in to, one per instance and user (tenants are per
 * hostname), in expo-secure-store (docs/mobile-app-plan.md, "Auth and pairing"). Each
 * account's session token is its own entry, so the list stays small (some iOS releases
 * refused secure-store values over ~2 KB) and signing out deletes only that token.
 *
 * Takes its storage as a parameter (createAccountStore(kv)) so Jest can use a Map;
 * secureKeyValue() is the real one.
 */
import * as SecureStore from 'expo-secure-store';

export interface AccountUser {
  id: number;
  name: string;
  role: 'admin' | 'viewer';
  /** The pilot the user is (users.pilot_id): the app opens on their duty log. Absent from
   * accounts stored before it and on servers older than it. */
  pilot_id?: number | null;
}

export interface Account {
  /** `<host>.<user id>`: one account per instance and user. */
  id: string;
  host: string;
  user: AccountUser;
  /** Its session was revoked or expired (a 401), so its token is gone; pair again. */
  signedOut: boolean;
  /** The instance's name (its app_name setting, as in the web's top bar), from its last
   * bootstrap; absent until one has loaded. */
  appName?: string;
}

export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AccountsState {
  accounts: Account[];
  /** The account the tabs show, null when there are none. */
  activeId: string | null;
}

const LIST_KEY = 'accounts';
const ACTIVE_KEY = 'accounts.active';
// Secure-store keys allow only [A-Za-z0-9._-]; a host's ':port' becomes '_port'.
const tokenKey = (id: string) => 'account-token.' + id.replace(/[^A-Za-z0-9._-]/g, '_');

function accountId(host: string, userId: number): string {
  return host + '.' + userId;
}

export interface AccountStore {
  load(): Promise<AccountsState>;
  token(id: string): Promise<string | null>;
  /** Adds the account from a pairing (or replaces the one for the same host and user,
   * signing it back in) and makes it active. */
  add(host: string, user: AccountUser, token: string): Promise<AccountsState>;
  /** Forgets the account's token after a 401 and keeps it in the list, signed out. */
  markSignedOut(id: string): Promise<AccountsState>;
  /** Removes the account and its token; the first remaining one becomes active. */
  remove(id: string): Promise<AccountsState>;
  setActive(id: string): Promise<AccountsState>;
  /** Keeps the account's user as its server last described it (bootstrap's me). */
  updateUser(id: string, user: AccountUser): Promise<AccountsState>;
  setAppName(id: string, appName: string): Promise<AccountsState>;
}

export function createAccountStore(kv: KeyValue): AccountStore {
  async function load(): Promise<AccountsState> {
    const [raw, active] = await Promise.all([kv.get(LIST_KEY), kv.get(ACTIVE_KEY)]);
    let accounts: Account[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) accounts = parsed.filter(isAccount);
    } catch {
      // A list that doesn't parse is treated as empty; its tokens are overwritten on re-pairing.
    }
    const activeId = accounts.some((a) => a.id === active) ? active : accounts[0]?.id ?? null;
    return { accounts, activeId };
  }

  async function save(state: AccountsState): Promise<AccountsState> {
    await kv.set(LIST_KEY, JSON.stringify(state.accounts));
    if (state.activeId) await kv.set(ACTIVE_KEY, state.activeId);
    else await kv.delete(ACTIVE_KEY);
    return state;
  }

  // Each change reads the list and writes it back, so changes run one at a time (two
  // requests that both get a 401 mark the account signed out together).
  let queue: Promise<unknown> = Promise.resolve();
  function serial<A extends unknown[]>(change: (...args: A) => Promise<AccountsState>) {
    return (...args: A): Promise<AccountsState> => {
      const run = queue.then(() => change(...args));
      queue = run.catch(() => undefined);
      return run;
    };
  }

  return {
    load,

    token: (id) => kv.get(tokenKey(id)),

    add: serial(async (host: string, user: AccountUser, token: string) => {
      const { accounts } = await load();
      const id = accountId(host, user.id);
      const account: Account = { id, host, user: accountUser(user), signedOut: false };
      // The token first: a list entry without its token would look signed in and fail.
      await kv.set(tokenKey(id), token);
      const i = accounts.findIndex((a) => a.id === id);
      return save({
        accounts: i < 0 ? [...accounts, account] : accounts.map((a) => (a.id === id ? account : a)),
        activeId: id,
      });
    }),

    markSignedOut: serial(async (id: string) => {
      const state = await load();
      await kv.delete(tokenKey(id));
      return save({ ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, signedOut: true } : a)) });
    }),

    remove: serial(async (id: string) => {
      const state = await load();
      await kv.delete(tokenKey(id));
      const accounts = state.accounts.filter((a) => a.id !== id);
      return save({ accounts, activeId: state.activeId === id ? accounts[0]?.id ?? null : state.activeId });
    }),

    setActive: serial(async (id: string) => {
      const state = await load();
      if (!state.accounts.some((a) => a.id === id)) return state;
      return save({ ...state, activeId: id });
    }),

    updateUser: serial(async (id: string, user: AccountUser) => {
      const state = await load();
      return save({ ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, user: accountUser(user) } : a)) });
    }),

    setAppName: serial(async (id: string, appName: string) => {
      const state = await load();
      return save({ ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, appName } : a)) });
    }),
  };
}

/** The fields an account keeps of a user (a bootstrap's me has more). */
function accountUser(user: AccountUser): AccountUser {
  return { id: user.id, name: user.name, role: user.role, pilot_id: user.pilot_id ?? null };
}

/** Whether the server's user differs from the stored one in a field the account keeps. */
export function accountUserChanged(stored: AccountUser, server: AccountUser): boolean {
  return stored.name !== server.name || stored.role !== server.role || (stored.pilot_id ?? null) !== (server.pilot_id ?? null);
}

/** The tab the app opens on: a pilot's own duty log, Live for everyone else. */
export function firstTab(account: Account | null): '/duty' | '/live' {
  return account?.user.pilot_id != null ? '/duty' : '/live';
}

function isAccount(a: unknown): a is Account {
  const x = a as Account;
  return !!x && typeof x.id === 'string' && typeof x.host === 'string' && !!x.user
    && typeof x.user.id === 'number' && typeof x.user.name === 'string' && typeof x.signedOut === 'boolean';
}

/** expo-secure-store as a KeyValue. AFTER_FIRST_UNLOCK so a background refresh or upload
 * (phases 7 and 8) can read a token while the phone is locked. */
export function secureKeyValue(): KeyValue {
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  return {
    get: (key) => SecureStore.getItemAsync(key, options),
    set: (key, value) => SecureStore.setItemAsync(key, value, options),
    delete: (key) => SecureStore.deleteItemAsync(key, options),
  };
}
