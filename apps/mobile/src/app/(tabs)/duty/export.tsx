import { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { currentDutyMonth, dutyExportEarliest, dutyExportRangeError, dutyMonthIndex, dutyMonthYm, dutyRangeLabel } from '@wingbeat/core/duty';
import { errorText } from '@/lib/api';
import { completedFlights, dutyExportMonths, dutyPdfOf } from '@/lib/duty';
import { DutyExportFields } from '@/lib/duty-export-form';
import { useDutyPdf } from '@/lib/duty-pdf';
import { useFlights } from '@/lib/flights-context';
import { Placeholder } from '@/lib/placeholder';
import { intParam } from '@/lib/route-params';
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
  const pilotId = intParam(params.pilot);
  const tab = useFlightsTab();
  const { store } = useFlights();
  const { log, failed } = useDutyLog(pilotId);
  const now = useNow(60_000);
  const cur = tab.ready ? dutyMonthIndex(...currentDutyMonth(tab.tz, now)) : 0;
  // A missing or later month opens at this one.
  const shown = Math.min(intParam(params.shown) ?? cur, cur);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const pdf = useDutyPdf();

  const cancel = (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
  const pilot = tab.ready ? tab.bootstrap.pilots.find((p) => p.id === pilotId) : undefined;
  if (tab.ready && !pilot) return <>{cancel}<Placeholder text="This pilot isn’t on the list any more." /></>;
  if (!log && failed) return <>{cancel}<Placeholder text="Couldn’t load the duty records." /></>;
  if (!tab.ready || !store || !log || !pilot) return <>{cancel}<Placeholder /></>;
  const tz = tab.tz;
  const flights = completedFlights(store);
  const months = dutyExportMonths(dutyExportEarliest(tz, flights, pilot.id, shown, cur), cur);
  const fromI = from ?? shown;
  const toI = to ?? shown;
  const error = dutyExportRangeError(fromI, toI);
  const footer = pdf.status ?? error
    ?? dutyRangeLabel(fromI === toI ? [dutyMonthYm(fromI)] : [dutyMonthYm(fromI), dutyMonthYm(toI)]) + '. ' + HINT;

  const exportRange = async () => {
    if (error) { Alert.alert('Can’t Export', error); return; }
    const { source, name } = dutyPdfOf(tz, Math.floor(Date.now() / 1000), flights, store.getUnmatched(), pilot, fromI, toI, log,
      tab.bootstrap.instance?.app_name ?? 'Wingbeat');
    try {
      await pdf.exportPdf(source, name);
      router.back();
    } catch (e) {
      Alert.alert('PDF export failed', errorText(e));
    }
  };

  return (
    <>
      {cancel}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={pdf.status != null} onPress={exportRange}>Export</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <DutyExportFields months={months} from={fromI} to={toI} onFrom={setFrom} onTo={setTo} footer={footer} />
      {pdf.compiler}
    </>
  );
}
