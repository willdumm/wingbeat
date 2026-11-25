import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { findFlightByKey, flightKeyPath, isFlightKey } from '@wingbeat/core/flight-link';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { EmptyState } from '@/lib/empty-state';
import { linkAccount } from '@/lib/flight-link';
import { FlightMapScreen } from '@/lib/flight-map-screen';
import { useFlights } from '@/lib/flights-context';
import { isHostedInstance } from '@/lib/pairing-link';
import { Placeholder } from '@/lib/placeholder';
import { useFlightsTab } from '@/lib/use-flights-tab';

/**
 * One flight, from its web URL (+native-intent.ts): the flight's screen in the URL's account,
 * switching to it first. The flight is looked up by its key each time, since a flight in
 * progress gets a new id as it's re-segmented.
 */
export default function FlightLinkScreen() {
  const { host = '', flight: key = '' } = useLocalSearchParams<{ host?: string; flight?: string }>();
  const { loaded, accounts, active, setActive } = useAccounts();
  const { handshake } = useBootstrap();
  const { refresh } = useFlights();
  const tab = useFlightsTab();
  const valid = isHostedInstance(host) && isFlightKey(key);
  const account = valid ? linkAccount(accounts, active, host) : null;

  // Once for each link, so switching accounts afterwards isn't undone.
  const [switched, setSwitched] = useState<string | null>(null);
  const link = host + '/' + key;
  const switchAccount = async () => {
    if (account && account.id !== active?.id) await setActive(account.id).catch(() => {});
    setSwitched(link);
  };
  useEffect(() => {
    if (loaded && account && switched !== link) switchAccount();
  }, [loaded, account?.id, link]);

  const flight = tab.ready ? findFlightByKey(tab.allFlights(), key) : null;
  // Not in the cached copy: it may come with a refresh, so it's missing only after one.
  const [checked, setChecked] = useState<string | null>(null);
  const missing = tab.ready && active?.id === account?.id && !flight;
  useEffect(() => {
    if (!missing || handshake !== 'ok' || checked === link) return;
    let current = true;
    refresh().finally(() => { if (current) setChecked(link); });
    return () => { current = false; };
  }, [missing, handshake, checked, link]);

  if (!valid) return <Placeholder text="This link doesn’t name a flight." />;
  if (!loaded) return <Placeholder />;
  if (!account) {
    return <EmptyState title="Not Signed In" systemImage="person.crop.circle.badge.exclamationmark"
      description={`This flight is on ${host}, which this phone isn’t signed in to.`}
      action={{ label: 'Open in Browser', onPress: () => { WebBrowser.openBrowserAsync(origin(host) + flightKeyPath(key)).catch(() => {}); } }} />;
  }
  if (active?.id !== account.id) {
    return switched === link
      ? <EmptyState title="Another Account’s Flight" systemImage="person.crop.circle" description={`This flight is on ${host}.`}
        action={{ label: 'Switch Account', onPress: switchAccount }} />
      : <Placeholder />;
  }
  if (!tab.ready) return <Placeholder />;
  if (!flight) {
    if (checked !== link && handshake === 'ok') return <Placeholder />;
    return <EmptyState title="Flight Not Found" systemImage="airplane" description="It isn’t in the list, or the list couldn’t be updated."
      action={{ label: 'Try Again', onPress: () => setChecked(null) }} />;
  }
  return <FlightMapScreen flightId={flight.id} />;
}
