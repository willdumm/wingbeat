import { Redirect } from 'expo-router';
import { firstTab } from '@/lib/accounts';
import { useAccounts } from '@/lib/accounts-context';
import { storedDutyTab } from '@/lib/duty-tab';

/**
 * The app opens at `/` (a cold start, or a bare `wingbeat://` link): on a pilot's own duty
 * log (unless they've hidden the Duty tab), on Live for everyone else (docs/mobile-app-plan.md, "Screens (v1)").
 */
export default function Index() {
  const { loaded, active } = useAccounts();
  if (!loaded) return null;
  return <Redirect href={firstTab(active, storedDutyTab(active))} />;
}
