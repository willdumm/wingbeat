import { pushChannel } from '@wingbeat/core/api/push';
import { isSubscribed, pushMapShareUrl, pushRoute, setSubscribed, type Subscription } from '@/lib/push-route';

test('pushRoute: a tracker event to Live, an alert to the alerts sheet, with the host', () => {
  for (const type of ['takeoff', 'landing', 'gap', 'gap_resolved', 'gap_timeout']) {
    expect(pushRoute({ type, tracker_id: 3, host: 'ops.example.com' }))
      .toEqual({ host: 'ops.example.com', href: { pathname: '/live', params: { tracker: '3' } } });
  }
  expect(pushRoute({ type: 'alert' })).toEqual({ host: null, href: { pathname: '/flights/alerts' } });
});

test('pushRoute: an unknown type, or a tracker event without its tracker, just opens the app', () => {
  expect(pushRoute({ type: 'something-new', tracker_id: 3 })).toBeNull();
  expect(pushRoute({ type: 'gap' })).toBeNull();
  expect(pushRoute({})).toBeNull();
  expect(pushRoute(null)).toBeNull();
});

test('subscriptions: every tracker covers each one; turning it on drops the per-tracker rows', () => {
  let subs: Subscription[] = [{ tracker_id: 1, event: 'gap' }, { tracker_id: 2, event: 'gap' }, { tracker_id: 1, event: 'landing' }];
  expect(isSubscribed(subs, { tracker_id: 1, event: 'gap' })).toBe(true);
  expect(isSubscribed(subs, { tracker_id: 3, event: 'gap' })).toBe(false);
  expect(isSubscribed(subs, { tracker_id: null, event: 'gap' })).toBe(false);

  subs = setSubscribed(subs, { tracker_id: null, event: 'gap' }, true);
  expect(subs).toEqual([{ tracker_id: 1, event: 'landing' }, { tracker_id: null, event: 'gap' }]);
  expect(isSubscribed(subs, { tracker_id: 3, event: 'gap' })).toBe(true);

  subs = setSubscribed(subs, { tracker_id: null, event: 'gap' }, false);
  expect(subs).toEqual([{ tracker_id: 1, event: 'landing' }]);
  subs = setSubscribed(subs, { tracker_id: 1, event: 'landing' }, false);
  expect(subs).toEqual([]);
});

test('pushMapShareUrl: the push’s https MapShare page, or none', () => {
  expect(pushMapShareUrl({ type: 'gap', mapshare_url: 'https://share.garmin.com/pilot' })).toBe('https://share.garmin.com/pilot');
  expect(pushMapShareUrl({ type: 'gap', mapshare_url: 'javascript:alert(1)' })).toBeNull();
  expect(pushMapShareUrl({ type: 'gap' })).toBeNull();
  expect(pushMapShareUrl(null)).toBeNull();
});

test('pushChannel: takeoff and landing are flights, gap its own channel, alerts theirs', () => {
  expect(['takeoff', 'landing', 'gap', 'alerts'].map((e) => pushChannel(e as Parameters<typeof pushChannel>[0])))
    .toEqual(['flights', 'flights', 'signal-gaps', 'alerts']);
});
