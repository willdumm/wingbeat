import { Redirect } from 'expo-router';
import { firstTab } from '@/lib/accounts';
import { useAccounts } from '@/lib/accounts-context';

/**
 * The app opens at `/` (a cold start, or a bare `wingbeat://` link): on a pilot's own duty
 * log, on Live for everyone else (docs/mobile-app-plan.md, "Screens (v1)").
 */
export default function Index() {
  const { loaded, active } = useAccounts();
  if (!loaded) return null;
  return <Redirect href={firstTab(active)} />;
}
