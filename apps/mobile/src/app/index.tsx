import { Redirect } from 'expo-router';

/** The app opens at `/` (a cold start, or a bare `wingbeat://` link); Live is the first tab. */
export default function Index() {
  return <Redirect href="/live" />;
}
