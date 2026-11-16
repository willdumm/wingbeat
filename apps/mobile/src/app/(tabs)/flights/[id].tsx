import { FlightMapScreen } from '@/lib/flight-map-screen';
import { Placeholder } from '@/lib/placeholder';
import { useIntParam } from '@/lib/route-params';

/** One flight, from a row in the list (FlightMapScreen). */
export default function FlightScreen() {
  const id = useIntParam('id');
  return id == null ? <Placeholder text="This link doesn’t name a flight." /> : <FlightMapScreen flightId={id} />;
}
