/**
 * Whether the Duty tab shows (Settings → Show Duty in Tab Bar, per account; dutyTabShown has
 * the default) and the stack the duty log opens in: the Duty tab's, or Settings' when the tab
 * is hidden, since a hidden tab can't be navigated to. Kept by the tabs' layout
 * (useDutyTabState), which provides it (DutyTabContext) to the screens' useDutyTab, so the
 * Settings switch moves the tab bar at once.
 */
import { createContext, useContext } from 'react';
import { useAccounts } from './accounts-context';
import type { Account } from './accounts';
import { accountPrefKey, dutyTabShown, parseDutyTab } from './prefs';
import { readStored, useStoredState } from './stored-state';

export interface DutyTab {
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** The duty log's path: the Duty tab's, or the one in Settings. */
  base: '/duty' | '/settings/duty';
}

export const DutyTabContext = createContext<DutyTab>({ shown: false, setShown: () => {}, base: '/settings/duty' });

export const useDutyTab = () => useContext(DutyTabContext);

const dutyTabKey = (a: Account) => accountPrefKey(a.host, a.user.id, 'duty-tab');

/** The account's stored pick, for firstTab. */
export const storedDutyTab = (account: Account | null) => (account ? readStored(dutyTabKey(account), parseDutyTab) : null);

export function useDutyTabState(): DutyTab {
  const { active } = useAccounts();
  const [stored, setShown] = useStoredState(active ? dutyTabKey(active) : null, parseDutyTab);
  const shown = active ? dutyTabShown(stored, active.user) : false;
  return { shown, setShown, base: shown ? '/duty' : '/settings/duty' };
}
