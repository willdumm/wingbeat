/**
 * A pilot's duty records (GET /api/duty-days: duty and rest days, dated default duties and
 * the operator's §135.267 methods) for the Duty tab. The last copy fetched is kept on the
 * phone per account and pilot (prefs.ts), so the log shows at once and offline; it's fetched
 * again whenever the tab is shown, on return to the foreground and on pull to refresh, and
 * only when the handshake is 'ok'.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDutyLog, type DutyLogResponse } from '@wingbeat/core/api/duty';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { accountPrefKey, parseDutyLog } from './prefs';
import { useStoredState } from './stored-state';

export function useDutyLog(pilotId: number | null): {
  log: DutyLogResponse | null;
  /** The last fetch failed (the log shown, if any, is the stored copy). */
  failed: boolean;
  reload: () => Promise<void>;
} {
  const { active, client } = useAccounts();
  const { handshake } = useBootstrap();
  const key = active && pilotId != null ? accountPrefKey(active.host, active.user.id, `duty-log.${pilotId}`) : null;
  const [log, setLog] = useStoredState(key, parseDutyLog);
  const [failed, setFailed] = useState(false);
  const current = useRef(key);
  current.current = key;

  const reload = useCallback(async () => {
    if (!client || pilotId == null || handshake !== 'ok') return;
    const fetching = key;
    try {
      const fresh = await getDutyLog(client, pilotId);
      if (current.current !== fetching) return;
      setLog(fresh);
      setFailed(false);
    } catch {
      if (current.current === fetching) setFailed(true);
    }
  }, [client, pilotId, handshake, key, setLog]);

  useEffect(() => { setFailed(false); }, [key]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reload(); });
    return () => sub.remove();
  }, [reload]);

  return { log, failed, reload };
}
