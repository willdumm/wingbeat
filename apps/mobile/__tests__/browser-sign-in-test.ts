import { connectCallbackToken, connectRequest, instanceHost } from '@/lib/browser-sign-in';

const TOKEN = 'ab'.repeat(32);
const VERIFIER = 'cd'.repeat(32);
const STATE = 'ef'.repeat(16);

describe('instanceHost', () => {
  test('a hosted instance’s name, host or URL', () => {
    for (const input of ['seahawkair', ' SeaHawkAir ', 'seahawkair.wingbeat.dummthings.dev',
      'https://seahawkair.wingbeat.dummthings.dev/analytics?x=1', 'seahawkair.wingbeat.dummthings.dev.']) {
      expect([input, instanceHost(input)]).toEqual([input, { ok: true, host: 'seahawkair.wingbeat.dummthings.dev' }]);
    }
    expect(instanceHost('seahawkair.staging')).toEqual({ ok: true, host: 'seahawkair.staging.wingbeat.dummthings.dev' });
  });

  test('another domain is self-hosted; nothing, or not a host, says what to type', () => {
    expect(instanceHost('flights.example.com')).toEqual({ ok: false, reason: 'self-hosted' });
    expect(instanceHost('https://flights.example.com/')).toEqual({ ok: false, reason: 'self-hosted' });
    expect(instanceHost('   ')).toEqual({ ok: false, reason: 'empty' });
    for (const input of ['sea hawk', 'a.wingbeat.dummthings.dev:8443', '-x', 'évian']) {
      expect([input, instanceHost(input).ok]).toEqual([input, false]);
    }
  });
});

describe('connectRequest', () => {
  test('opens the connect page with the verifier’s S256 challenge and the state', () => {
    const req = connectRequest('a.wingbeat.dummthings.dev', VERIFIER, STATE);
    // SHA-256 of VERIFIER in base64url, from Node's crypto.
    const challenge = 'OYXayRM_gUSuGrAB3Qop3_3dsb8UpflaokyO7S5b3iw';
    expect(req).toEqual({
      host: 'a.wingbeat.dummthings.dev',
      url: `https://a.wingbeat.dummthings.dev/app/connect?challenge=${challenge}&state=${STATE}`,
      verifier: VERIFIER,
      state: STATE,
    });
  });
});

describe('connectCallbackToken', () => {
  test('the token from the redirect for this request', () => {
    expect(connectCallbackToken(`wingbeat://connect?token=${TOKEN}&state=${STATE}`, STATE)).toBe(TOKEN);
    expect(connectCallbackToken(`wingbeat:connect?state=${STATE}&token=${TOKEN}`, STATE)).toBe(TOKEN);
  });

  test('nothing for another state, another target, or a bad token', () => {
    for (const url of [
      `wingbeat://connect?token=${TOKEN}&state=${'0'.repeat(32)}`,
      `wingbeat://connect?token=${TOKEN}`,
      `wingbeat://pair?token=${TOKEN}&state=${STATE}`,
      `https://connect?token=${TOKEN}&state=${STATE}`,
      `wingbeat://connect?token=short&state=${STATE}`,
      `wingbeat://connect?state=${STATE}`,
      'not a url',
    ]) {
      expect([url, connectCallbackToken(url, STATE)]).toEqual([url, null]);
    }
  });
});
