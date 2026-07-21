import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

type Listener = () => void;

// A controllable matchMedia stub whose result the test can flip at runtime.
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() { return matches; },
    media: '',
    addEventListener: (_: string, cb: Listener) => { listeners.add(cb); },
    removeEventListener: (_: string, cb: Listener) => { listeners.delete(cb); },
    _set(next: boolean) { matches = next; listeners.forEach((cb) => cb()); },
  };
  vi.stubGlobal('matchMedia', (q: string) => { mql.media = q; return mql; });
  return mql;
}

describe('useMediaQuery', () => {
  it('returns the initial match synchronously', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query result changes', () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);

    act(() => { mql._set(true); });
    expect(result.current).toBe(true);
  });
});
