import { linkAccount, systemLinkRoute } from '@/lib/flight-link';

const HOST = 'ops.wingbeat.dummthings.dev';

test('a flight’s URL on a hosted instance goes to its screen', () => {
  expect(systemLinkRoute(`https://${HOST}/flights/3/1764000000`)).toBe(`/flights/link?host=${HOST}&flight=3%2F1764000000`);
  expect(systemLinkRoute(`https://${HOST}/flights/manual/12/`)).toBe(`/flights/link?host=${HOST}&flight=manual%2F12`);
  expect(systemLinkRoute('https://demo.staging.wingbeat.dummthings.dev/flights/1/2')).toContain('host=demo.staging.');
});

test('any other link is left as it is', () => {
  for (const link of [
    'wingbeat://pair?host=' + HOST + '&token=x', '/flights/alerts', '',
    `https://${HOST}/flights/3`, `https://${HOST}/join/abc`, `http://${HOST}/flights/3/4`,
    'https://wingbeat.dummthings.dev/flights/3/4', 'https://evil.example/flights/3/4',
    `https://${HOST}@evil.example/flights/3/4`,
  ]) expect(systemLinkRoute(link)).toBe(link);
});

test('linkAccount: the active account when it’s on the host, else a signed-in one, else any', () => {
  const a = { id: 'a', host: HOST, signedOut: true };
  const b = { id: 'b', host: HOST, signedOut: false };
  const c = { id: 'c', host: HOST, signedOut: false };
  const other = { id: 'o', host: 'x', signedOut: false };
  expect(linkAccount([a, b, c], c, HOST)).toBe(c);
  expect(linkAccount([a, b, other], other, HOST)).toBe(b);
  expect(linkAccount([a, b], a, HOST)).toBe(b);
  expect(linkAccount([a, other], other, HOST)).toBe(a);
  expect(linkAccount([other], other, HOST)).toBeNull();
});
