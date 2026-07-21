import { useEffect, useState } from 'react';

// Reactive CSS media-query match. The lazy initializer reads the current match
// synchronously, so the first paint is already correct (no layout flash on mount).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
