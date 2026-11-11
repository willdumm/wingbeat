import { createAccountStore, type KeyValue } from '@/lib/accounts';

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => { map.set(k, v); },
    delete: async (k) => { map.delete(k); },
  };
}

const pat = { id: 1, name: 'Pat', role: 'admin' as const };
const quinn = { id: 2, name: 'Quinn', role: 'viewer' as const };
const A = 'a.wingbeat.dummthings.dev';
const B = 'b.wingbeat.dummthings.dev';

test('an empty store', async () => {
  expect(await createAccountStore(memory()).load()).toEqual({ accounts: [], activeId: null });
});

test('add: one account per host and user, the newest active, tokens kept apart from the list', async () => {
  const kv = memory();
  const store = createAccountStore(kv);
  await store.add(A, pat, 'tok-a1');
  await store.add(B, quinn, 'tok-b2');
  let state = await store.add(A, quinn, 'tok-a2');
  expect(state.accounts.map((a) => a.id)).toEqual([`${A}.1`, `${B}.2`, `${A}.2`]);
  expect(state.activeId).toBe(`${A}.2`);
  expect(await store.token(`${A}.1`)).toBe('tok-a1');
  expect(kv.map.get('accounts')).not.toContain('tok-');

  // Pairing the same user again replaces its token and signs it back in, in place.
  await store.markSignedOut(`${A}.1`);
  state = await store.add(A, { ...pat, name: 'Pat R.' }, 'tok-a1b');
  expect(state.accounts[0]).toEqual({ id: `${A}.1`, host: A, user: { ...pat, name: 'Pat R.' }, signedOut: false });
  expect(state.accounts).toHaveLength(3);
  expect(await store.token(`${A}.1`)).toBe('tok-a1b');
  expect(await createAccountStore(kv).load()).toEqual(state);
});

test('markSignedOut forgets the token and keeps the account', async () => {
  const store = createAccountStore(memory());
  await store.add(A, pat, 'tok');
  const state = await store.markSignedOut(`${A}.1`);
  expect(state.accounts[0].signedOut).toBe(true);
  expect(state.activeId).toBe(`${A}.1`);
  expect(await store.token(`${A}.1`)).toBeNull();
});

test('remove: the token too, and the first remaining account becomes active', async () => {
  const store = createAccountStore(memory());
  await store.add(A, pat, 'tok-a');
  await store.add(B, quinn, 'tok-b');
  let state = await store.remove(`${B}.2`);
  expect(state).toEqual({ accounts: [expect.objectContaining({ id: `${A}.1` })], activeId: `${A}.1` });
  expect(await store.token(`${B}.2`)).toBeNull();
  state = await store.remove(`${A}.1`);
  expect(state).toEqual({ accounts: [], activeId: null });
});

test('setActive ignores an unknown id', async () => {
  const store = createAccountStore(memory());
  await store.add(A, pat, 'tok-a');
  await store.add(B, quinn, 'tok-b');
  expect((await store.setActive(`${A}.1`)).activeId).toBe(`${A}.1`);
  expect((await store.setActive('nope')).activeId).toBe(`${A}.1`);
});

test('a port in the host still makes a valid secure-store key', async () => {
  const kv = memory();
  await createAccountStore(kv).add('localhost:8787', pat, 'tok');
  expect([...kv.map.keys()]).toContain('account-token.localhost_8787.1');
});

test('concurrent changes don’t lose each other', async () => {
  const store = createAccountStore(memory());
  await Promise.all([store.add(A, pat, 'a'), store.add(B, quinn, 'b'), store.markSignedOut(`${A}.1`)]);
  const { accounts } = await store.load();
  expect(accounts.map((a) => [a.id, a.signedOut])).toEqual([[`${A}.1`, true], [`${B}.2`, false]]);
});

test('a list that doesn’t parse loads as empty', async () => {
  const kv = memory();
  kv.map.set('accounts', '{not json');
  expect(await createAccountStore(kv).load()).toEqual({ accounts: [], activeId: null });
});
