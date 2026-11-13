import { useLocalSearchParams } from 'expo-router';
import { FlightMapScreen } from '@/lib/flight-map-screen';

/** One flight, from a row in the duty log (FlightMapScreen). */
export default function DutyFlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlightMapScreen flightId={Number(id)} />;
}
