import { useEffect, useState } from 'react';

/** The clock in Unix seconds, ticking every intervalMs. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
