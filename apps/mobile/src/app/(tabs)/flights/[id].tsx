import { useLocalSearchParams } from 'expo-router';
import { FlightMapScreen } from '@/lib/flight-map-screen';

/** One flight, from a row in the list (FlightMapScreen). */
export default function FlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlightMapScreen flightId={Number(id)} />;
}
