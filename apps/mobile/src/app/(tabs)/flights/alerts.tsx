import { Stack, useRouter } from 'expo-router';
import type { Alert } from '@wingbeat/core/alerts';
import { AlertsList } from '@/lib/alerts-list';
import { EmptyState } from '@/lib/empty-state';
import { Placeholder } from '@/lib/placeholder';
import { useAlerts } from '@/lib/use-alerts';

/**
 * The dashboard's alerts strip, from the Flights header's bell: an unassigned flight opens
 * the flight (its Edit assigns it), a pilot near a duty limit opens their duty log.
 * Maintenance and readings only read, since aircraft are set up on the web.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const alerts = useAlerts();

  const onPress = (alert: Alert): (() => void) | null => {
    if (alert.kind === 'unassigned_flight') {
      return () => { router.dismiss(); router.push({ pathname: '/flights/[id]', params: { id: String(alert.flight_id) } }); };
    }
    if (alert.kind === 'pilot_duty') {
      return () => { router.dismiss(); router.navigate({ pathname: '/duty', params: { pilot: String(alert.pilot_id) } }); };
    }
    return null;
  };
  const aircraftAlerts = alerts?.some((a) => a.kind === 'maintenance' || a.kind === 'timer_not_recorded');

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>Done</Stack.Toolbar.Button>
      </Stack.Toolbar>
      {!alerts ? <Placeholder /> : alerts.length === 0 ? (
        <EmptyState title="No alerts" systemImage="checkmark.circle"
          description="Unassigned flights, maintenance coming due and pilots near a duty limit show here." />
      ) : (
        <AlertsList alerts={alerts} onPress={onPress}
          footer={aircraftAlerts ? 'Maintenance schedules and meter readings are kept in each aircraft’s info on the web.' : undefined} />
      )}
    </>
  );
}
