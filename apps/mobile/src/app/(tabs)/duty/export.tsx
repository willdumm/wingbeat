import { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { currentDutyMonth, dutyExportEarliest, dutyExportRangeError, dutyRangeLabel, type DutyInputFlight } from '@wingbeat/core/duty';
import { dutyExportMonths, dutyMonthIndex, dutyMonthOf, dutyPdfOf } from '@/lib/duty';
import { DutyExportFields } from '@/lib/duty-export-form';
import { useDutyPdf } from '@/lib/duty-pdf';
import { useFlights } from '@/lib/flights-context';
import { Placeholder } from '@/lib/placeholder';
import { useDutyLog } from '@/lib/use-duty-log';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

const HINT = 'One section per month. A longer export adds a summary page for each calendar quarter: flight time and '
  + 'rest by month, the §135.267 totals and every warning.';

/**
 * The Duty screen's Export PDF → Custom (the web's export form with From and To picked):
 * any months from the pilot's first flight (at least the last 12) through this one, up to
 * 24 at a time, from the shown month (params pilot; shown, a month index). Export shares
 * the PDF, then closes the form.
 */
export default function DutyExportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pilot: string; shown: string }>();
  const pilotId = Number(params.pilot);
  const shown = Number(params.shown);
  const tab = useFlightsTab();
  const { store } = useFlights();
  const { log } = useDutyLog(pilotId);
  const now = useNow(60_000);
  const [from, setFrom] = useState(shown);
  const [to, setTo] = useState(shown);
  const pdf = useDutyPdf();

  const pilot = tab.ready ? tab.bootstrap.pilots.find((p) => p.id === pilotId) : undefined;
  if (!tab.ready || !store || !log || !pilot) return <Placeholder />;
  const tz = tab.tz;
  const flights = store.getCompleted() as DutyInputFlight[];
  const cur = dutyMonthIndex(...currentDutyMonth(tz, now));
  const months = dutyExportMonths(dutyExportEarliest(tz, flights, pilotId, shown, cur), cur);
  const error = dutyExportRangeError(from, to);
  const ym = (i: number) => { const [year, month] = dutyMonthOf(i); return { year, month }; };
  const footer = pdf.status ?? error ?? dutyRangeLabel(from === to ? [ym(from)] : [ym(from), ym(to)]) + '. ' + HINT;

  const exportRange = async () => {
    if (error) { Alert.alert('Can’t Export', error); return; }
    const { source, name } = dutyPdfOf(tz, Math.floor(Date.now() / 1000), flights, store.getUnmatched(), pilot, from, to, log,
      tab.bootstrap.instance?.app_name ?? 'Wingbeat');
    try {
      await pdf.exportPdf(source, name);
      router.back();
    } catch (e) {
      Alert.alert('PDF export failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={pdf.status != null} onPress={exportRange}>Export</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <DutyExportFields months={months} from={from} to={to} onFrom={setFrom} onTo={setTo} footer={footer} />
      {pdf.compiler}
    </>
  );
}
