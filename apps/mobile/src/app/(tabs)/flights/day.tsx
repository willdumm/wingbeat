import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlightMapScreen } from '@/lib/flight-map-screen';

/** A day's flights at once, from a day header in the list ("Map all"; FlightMapScreen). */
export default function DayScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day: string }>();
  return <FlightMapScreen dayKey={day} onDay={(key) => router.setParams({ day: key })} />;
}
