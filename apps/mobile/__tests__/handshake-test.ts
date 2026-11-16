import { fetchUpdateInBackground, handshake, updateForServer, type Updater } from '@/lib/handshake';

test('handshake: the client level against min_client_level, the server against the oldest it supports', () => {
  expect(handshake({ api_version: 1, min_client_level: 1 }, 1, 1)).toBe('ok');
  expect(handshake({ api_version: 3, min_client_level: 2 }, 2, 1)).toBe('ok');
  expect(handshake({ api_version: 3, min_client_level: 3 }, 2, 1)).toBe('client-too-old');
  expect(handshake({ api_version: 1, min_client_level: 1 }, 2, 2)).toBe('server-too-old');
});

test('handshake: a server without api_version predates the handshake', () => {
  expect(handshake({}, 1, 1)).toBe('server-too-old');
  expect(handshake({ api_version: 1 }, 1, 1)).toBe('ok');
});

test('handshake: a server too old wins over a client too old', () => {
  expect(handshake({ api_version: 1, min_client_level: 5 }, 2, 2)).toBe('server-too-old');
});

function fakeUpdater(opts: Partial<{ enabled: boolean; available: boolean; isNew: boolean; fail: boolean }> = {}) {
  const { enabled = true, available = true, isNew = true, fail = false } = opts;
  const calls: string[] = [];
  const updater: Updater = {
    isEnabled: enabled,
    checkForUpdateAsync: async () => { calls.push('check'); if (fail) throw new Error('offline'); return { isAvailable: available }; },
    fetchUpdateAsync: async () => { calls.push('fetch'); return { isNew }; },
    reloadAsync: async () => { calls.push('reload'); },
  };
  return { updater, calls };
}

test('updateForServer: fetches the newest update and reloads into it', async () => {
  const { updater, calls } = fakeUpdater();
  expect(await updateForServer(updater)).toBe('reloading');
  expect(calls).toEqual(['check', 'fetch', 'reload']);
});

test('updateForServer: the store when there is no update, updates are off, or the check fails', async () => {
  const none = fakeUpdater({ available: false });
  expect(await updateForServer(none.updater)).toBe('store');
  expect(none.calls).toEqual(['check']);
  const off = fakeUpdater({ enabled: false });
  expect(await updateForServer(off.updater)).toBe('store');
  expect(off.calls).toEqual([]);
  expect(await updateForServer(fakeUpdater({ fail: true }).updater)).toBe('store');
  expect(await updateForServer(fakeUpdater({ isNew: false }).updater)).toBe('store');
});

test('fetchUpdateInBackground: downloads without reloading', async () => {
  const { updater, calls } = fakeUpdater();
  expect(await fetchUpdateInBackground(updater)).toBe(true);
  expect(calls).toEqual(['check', 'fetch']);
  expect(await fetchUpdateInBackground(fakeUpdater({ available: false }).updater)).toBe(false);
  expect(await fetchUpdateInBackground(fakeUpdater({ fail: true }).updater)).toBe(false);
  expect(await fetchUpdateInBackground(fakeUpdater({ enabled: false }).updater)).toBe(false);
});
