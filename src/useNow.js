import { useEffect, useState } from 'react';

// Current time, refreshed every `intervalMs` while it's set; used to show
// elapsed time on requests that are still running.
export default function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!intervalMs) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
