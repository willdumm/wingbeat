import { systemLinkRoute } from '@/lib/flight-link';

/** Expo Router's hook for links from outside the app: a flight's web URL goes to its screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return systemLinkRoute(path);
}
