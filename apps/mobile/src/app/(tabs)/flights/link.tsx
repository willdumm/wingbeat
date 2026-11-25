import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { findFlightByKey, flightKeyPath, parseFlightPath } from '@wingbeat/core/flight-link';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
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
  const { store, lastRefresh } = useFlights();
  const tab = useFlightsTab();
  const valid = isHostedInstance(host) && parseFlightPath(flightKeyPath(key)) === key;
  const account = valid ? linkAccount(accounts, active, host) : null;

  // Once for each link, so switching accounts afterwards isn't undone.
  const switched = useRef<string | null>(null);
  const link = host + '/' + key;
  useEffect(() => {
    if (!loaded || !account || switched.current === link) return;
    switched.current = link;
    if (account.id !== active?.id) setActive(account.id);
  }, [loaded, account, link]);

  if (!valid) return <Placeholder text="This link doesn’t name a flight." />;
  if (!loaded) return <Placeholder />;
  if (!account) {
    return <EmptyState title="Not Signed In" systemImage="person.crop.circle.badge.exclamationmark"
      description={`This flight is on ${host}, which this phone has no account for.`}
      action={{ label: 'Open in Browser', onPress: () => { WebBrowser.openBrowserAsync(origin(host) + flightKeyPath(key)).catch(() => {}); } }} />;
  }
  if (active?.id !== account.id) {
    return <Placeholder text={switched.current === link ? `This flight is on ${host}.` : undefined} />;
  }
  if (!tab.ready || !store) return <Placeholder />;
  const flight = findFlightByKey(tab.flights, key) ?? findFlightByKey(tab.allFlights(), key);
  // Not in the cached copy: it may come with the first refresh.
  if (!flight) return <Placeholder text={lastRefresh ? 'This flight isn’t in the list any more.' : undefined} />;
  return <FlightMapScreen flightId={flight.id} />;
}
