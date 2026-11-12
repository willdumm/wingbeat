/**
 * What leaves the phone with a Sentry event: no flight or location data
 * (docs/mobile-app-plan.md, "Stack"). Console breadcrumbs are dropped, since a logged value
 * can be anything (a response, a position), and a request's URL keeps its origin and path but
 * not its query string (tracker ids, time ranges).
 */
import type { Breadcrumb } from '@sentry/react-native';

const withoutQuery = (url: string) => url.replace(/[?#].*$/, '');

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  if (b.category === 'console') return null;
  if ((b.category === 'fetch' || b.category === 'xhr') && typeof b.data?.url === 'string') {
    return { ...b, data: { ...b.data, url: withoutQuery(b.data.url) } };
  }
  return b;
}
