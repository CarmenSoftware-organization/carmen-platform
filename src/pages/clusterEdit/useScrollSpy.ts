import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks which section is in view via IntersectionObserver and smooth-scrolls to a
 * section on demand. `ids` are DOM element ids rendered by the sections.
 */
export function useScrollSpy(ids: string[], opts?: { rootMargin?: string }) {
  const [activeId, setActiveId] = useState(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first entry that is intersecting, in document order of `ids`.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const byId = new Map(visible.map((e) => [(e.target as HTMLElement).id, true]));
        const next = ids.find((id) => byId.has(id));
        if (next) setActiveId(next);
      },
      { rootMargin: opts?.rootMargin ?? '-45% 0px -50% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), opts?.rootMargin]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActiveId(id);
  }, []);

  return { activeId, scrollTo };
}
