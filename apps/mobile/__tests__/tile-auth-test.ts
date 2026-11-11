jest.mock('@maplibre/maplibre-react-native', () => ({ TransformRequestManager: {} }));

import { tileAuthHeader } from '@/lib/tile-auth';

test("the bearer goes only to the instance's tile proxy", () => {
  const h = tileAuthHeader('a.wingbeat.dummthings.dev', 'tok');
  expect(h).toMatchObject({ name: 'Authorization', value: 'Bearer tok' });
  const re = new RegExp(h.match as string);
  expect(re.test('https://a.wingbeat.dummthings.dev/api/tiles/map/3/1/2@2x.png')).toBe(true);
  expect(re.test('https://a.wingbeat.dummthings.dev/api/flights')).toBe(false);
  expect(re.test('https://aXwingbeat.dummthings.dev/api/tiles/map/3/1/2.png')).toBe(false);
  expect(re.test('https://evil.example/?https://a.wingbeat.dummthings.dev/api/tiles/')).toBe(false);
  expect(re.test('https://a.wingbeat.dummthings.dev.evil.example/api/tiles/x')).toBe(false);
});
