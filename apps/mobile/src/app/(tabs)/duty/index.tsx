import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { currentDutyMonth, dutyPeriodLabel, type DutyInputFlight } from '@wingbeat/core/duty';
import { dutyLogPdfName, dutyLogTypstSource } from '@wingbeat/core/duty-pdf';
import { useAccounts } from '@/lib/accounts-context';
import {
  dutyExportOptions, dutyMonth, dutyMonthIndex, dutyMonthOf, dutyMonths, dutyMonthView, dutyPilots, dutyPilotShown,
  type DutyExportOption,
} from '@/lib/duty';
import { DutyList } from '@/lib/duty-list';
import { useDutyPdf } from '@/lib/duty-pdf';
import { EmptyState } from '@/lib/empty-state';
import { useFlights } from '@/lib/flights-context';
import { Placeholder } from '@/lib/placeholder';
import { accountPrefKey, parseDutyPilot } from '@/lib/prefs';
import { useStoredState } from '@/lib/stored-state';
import { useDutyLog } from '@/lib/use-duty-log';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

/**
 * A pilot's duty log, read-only (the web's, from Settings → Pilots): the pilot picked from
 * the header's menu (kept per account), else the user's own, a month at a time up to this one.
 * The header's Export PDF menu shares the web's PDF of the month, a quarter or 12 months.
 */
export default function DutyScreen() {
  const router = useRouter();
  const tab = useFlightsTab();
  const { active } = useAccounts();
  const { store, generation, refresh } = useFlights();
  const now = useNow(60_000);
  const [picked, setPicked] = useStoredState(active ? accountPrefKey(active.host, active.user.id, 'duty-pilot') : null, parseDutyPilot);
  const pilots = tab.ready ? tab.bootstrap.pilots : [];
  const pilot = dutyPilotShown(pilots, picked, tab.ready ? tab.bootstrap.me.pilot_id ?? null : null);
  const { log, failed, reload } = useDutyLog(pilot?.id ?? null);
  // The month shown; null follows the current one.
  const [shown, setShown] = useState<number | null>(null);

  const tz = tab.ready ? tab.tz : null;
  const current = tz ? dutyMonthIndex(...currentDutyMonth(tz, now)) : 0;
  const index = Math.min(shown ?? current, current);
  const [year, month] = dutyMonthOf(index);
  const view = useMemo(() => {
    if (!tz || !store || !pilot || !log) return null;
    const flights = store.getCompleted() as DutyInputFlight[];
    return dutyMonthView(tz, dutyMonth(tz, now, flights, store.getUnmatched(), pilot, year, month, log));
  }, [tz, store, generation, pilot?.id, pilot?.name, log, year, month, now]);
  const exportOptions = useMemo(() => (tz && store && pilot && log
    ? dutyExportOptions(tz, store.getCompleted() as DutyInputFlight[], pilot.id, index, current) : []),
  [tz, store, generation, pilot?.id, log, index, current]);
  const pdf = useDutyPdf();

  if (!tab.ready) return <Placeholder />;
  if (!pilot) {
    return <EmptyState title="No pilots" systemImage="person.2" description="A pilot’s duty log shows here once an admin adds pilots in Settings on the web." />;
  }
  const offered = dutyPilots(pilots, pilot.id);
  const notice = pdf.status ?? (failed
    ? (log ? 'Couldn’t refresh the duty records; showing the copy saved earlier.' : 'Couldn’t load the duty records. Pull down to try again.')
    : (log ? null : 'Loading…'));
  // The months as the screen computes them, at the time of the export.
  const exportPeriod = (o: DutyExportOption) => {
    if (!store || !log) return;
    const at = Math.floor(Date.now() / 1000);
    const months = dutyMonths(tab.tz, at, store.getCompleted() as DutyInputFlight[], store.getUnmatched(), pilot, o.from, o.to, log);
    const source = dutyLogTypstSource(tab.tz, at, months, tab.bootstrap.instance?.app_name ?? 'Wingbeat');
    pdf.exportPdf(source, dutyLogPdfName(months)).catch((e: unknown) => {
      Alert.alert('PDF export failed', e instanceof Error ? e.message : String(e));
    });
  };
  return (
    <>
      <Stack.Screen options={{ title: pilot.name }} />
      <Stack.Toolbar placement="right">
        {exportOptions.length > 0 && (
          <Stack.Toolbar.Menu icon="square.and.arrow.up" accessibilityLabel="Export PDF" title="Export PDF" disabled={pdf.status != null}>
            {exportOptions.map((o) => (
              <Stack.Toolbar.MenuAction key={o.key} subtitle={o.subtitle} onPress={() => exportPeriod(o)}>
                {o.title}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
        {offered.length > 1 && (
          <Stack.Toolbar.Menu icon="person.crop.circle" accessibilityLabel="Pilot" title="Pilot">
            {offered.map((p) => (
              <Stack.Toolbar.MenuAction key={p.id} isOn={p.id === pilot.id} onPress={() => setPicked(p.id)}>
                {p.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>
      <DutyList
        view={view}
        period={dutyPeriodLabel({ year, month })}
        onPrev={() => setShown(index - 1)}
        onNext={index < current ? () => setShown(index + 1 >= current ? null : index + 1) : null}
        notice={notice}
        onSelect={(id) => router.push({ pathname: '/duty/[id]', params: { id: String(id) } })}
        onRefresh={() => Promise.all([refresh(), reload()]).then(() => {})}
      />
      {pdf.compiler}
    </>
  );
}
