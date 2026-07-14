import { useEffect, useRef, useState } from 'react';

/**
 * Highlights the section nearest the top of the viewport as the user scrolls.
 * `select` lets a nav click set the active id immediately and suppress the
 * observer for ~600ms so an in-flight smooth-scroll doesn't flicker the highlight.
 */
export function useScrollSpy(ids: string[]): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');
  const suppressUntil = useRef<number>(0);

  const select = (id: string) => {
    suppressUntil.current = Date.now() + 600;
    setActiveId(id);
  };

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return;

    // A callback only carries targets whose intersection *changed* this tick, not
    // every intersecting one — so accumulate the latest state per section here.
    const intersecting = new Map<string, { top: number }>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as Element).id;
          if (entry.isIntersecting) intersecting.set(id, entry.boundingClientRect);
          else intersecting.delete(id);
        }
        if (Date.now() < suppressUntil.current) return;
        // Topmost intersecting section wins; ties resolve in registry order.
        let topId = '';
        let topTop = Infinity;
        for (const id of ids) {
          const rect = intersecting.get(id);
          if (rect && rect.top < topTop) {
            topTop = rect.top;
            topId = id;
          }
        }
        if (topId) setActiveId(topId);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
    // Re-subscribe only when the set of ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  return [activeId, select];
}
