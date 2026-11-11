import { isHostedInstance, parsePairingLink } from '@/lib/pairing-link';

const TOKEN = 'ab'.repeat(32);

describe('parsePairingLink', () => {
  test('the web’s device-link and invite URL', () => {
    expect(parsePairingLink(`https://SeaHawkAir.wingbeat.dummthings.dev/join/${TOKEN}`))
      .toEqual({ ok: true, target: { host: 'seahawkair.wingbeat.dummthings.dev', token: TOKEN } });
    expect(parsePairingLink(`  https://a.wingbeat.dummthings.dev/join/${TOKEN}/\n`))
      .toEqual({ ok: true, target: { host: 'a.wingbeat.dummthings.dev', token: TOKEN } });
  });

  test('wingbeat://pair, with or without the slashes', () => {
    const target = { host: 'seahawkair.staging.wingbeat.dummthings.dev', token: TOKEN };
    expect(parsePairingLink(`wingbeat://pair?host=${target.host}&token=${TOKEN}`)).toEqual({ ok: true, target });
    expect(parsePairingLink(`wingbeat:pair?token=${TOKEN}&host=${target.host}`)).toEqual({ ok: true, target });
  });

  test('anything else isn’t a pairing link', () => {
    for (const text of [
      '', 'hello', TOKEN,
      `http://a.wingbeat.dummthings.dev/join/${TOKEN}`,
      `https://a.wingbeat.dummthings.dev/login/${TOKEN}`,
      `https://a.wingbeat.dummthings.dev/join/${TOKEN}/extra`,
      'https://a.wingbeat.dummthings.dev/join/short',
      `https://a.wingbeat.dummthings.dev/join/${TOKEN}%2F..`,
      `wingbeat://join?host=a.wingbeat.dummthings.dev&token=${TOKEN}`,
      `wingbeat://pair?token=${TOKEN}`,
      `wingbeat://pair?host=a.wingbeat.dummthings.dev`,
      `wingbeat://pair?host=a.wingbeat.dummthings.dev/x&token=${TOKEN}`,
      `wingbeat://pair?host=evil.com%40a.wingbeat.dummthings.dev&token=${TOKEN}`,
      `ftp://a.wingbeat.dummthings.dev/join/${TOKEN}`,
    ]) {
      expect([text, parsePairingLink(text)]).toEqual([text, { ok: false, reason: 'not-a-pairing-link' }]);
    }
  });

  test('a host that isn’t hosted is self-hosted, not an unknown code', () => {
    for (const host of ['flights.example.com', 'wingbeat.dummthings.dev', 'xwingbeat.dummthings.dev',
      'a.wingbeat.dummthings.dev.example.com', 'a.wingbeat.dummthings.dev:8443']) {
      expect(parsePairingLink(`https://${host}/join/${TOKEN}`)).toEqual({ ok: false, reason: 'self-hosted' });
    }
  });
});

test('isHostedInstance', () => {
  expect(isHostedInstance('a.wingbeat.dummthings.dev')).toBe(true);
  expect(isHostedInstance('a.staging.wingbeat.dummthings.dev')).toBe(true);
  expect(isHostedInstance('wingbeat.dummthings.dev')).toBe(false);
});
