import { scrubBreadcrumb } from '@/lib/sentry-scrub';

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs, which can quote any value', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'position 58.1 -152.4' })).toBeNull();
  });

  it('keeps a request’s origin and path but not its query', () => {
    expect(scrubBreadcrumb({ category: 'fetch', data: { method: 'GET', url: 'https://a.wingbeat.dummthings.dev/api/flights?tracker=3&since=1700000000', status_code: 200 } }))
      .toEqual({ category: 'fetch', data: { method: 'GET', url: 'https://a.wingbeat.dummthings.dev/api/flights', status_code: 200 } });
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: '/api/tiles/carto/3/4/5.png#x' } })?.data?.url).toBe('/api/tiles/carto/3/4/5.png');
  });

  it('leaves other breadcrumbs alone', () => {
    const b = { category: 'touch', message: 'Touched Pressable' };
    expect(scrubBreadcrumb(b)).toBe(b);
  });
});
