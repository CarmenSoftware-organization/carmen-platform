import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSpy } from './useScrollSpy';

type IOEntry = Pick<IntersectionObserverEntry, 'isIntersecting'> & {
  target: { id: string };
  boundingClientRect: { top: number };
};
type IOCallback = (entries: IOEntry[]) => void;

let ioCallback: IOCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class MockIO {
  constructor(cb: IOCallback) {
    ioCallback = cb;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn();
}

beforeEach(() => {
  ioCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal('IntersectionObserver', MockIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const entry = (id: string, top: number): IOEntry => ({
  isIntersecting: true,
  target: { id },
  boundingClientRect: { top },
});

describe('useScrollSpy', () => {
  it('starts on the first id', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    expect(result.current[0]).toBe('a');
  });

  it('activates the topmost intersecting section', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => ioCallback?.([entry('b', 12)]));
    expect(result.current[0]).toBe('b');
  });

  it('manual select wins and suppresses the observer briefly', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => result.current[1]('c'));
    expect(result.current[0]).toBe('c');
    act(() => ioCallback?.([entry('a', 0)])); // ignored during suppression window
    expect(result.current[0]).toBe('c');
  });

  it('falls back to the first id without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useScrollSpy(['x', 'y']));
    expect(result.current[0]).toBe('x');
  });

  it('keeps the topmost section active when a lower one newly intersects', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => ioCallback?.([entry('a', 5)]));
    expect(result.current[0]).toBe('a');
    // b newly intersects below a; this batch does NOT re-include a.
    act(() => ioCallback?.([entry('b', 40)]));
    expect(result.current[0]).toBe('a');
  });

  it('picks the higher section when several intersect in one batch', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => ioCallback?.([entry('c', 30), entry('b', 10)]));
    expect(result.current[0]).toBe('b');
  });

  it('drops a section once it stops intersecting', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b', 'c']));
    act(() => ioCallback?.([entry('a', 5), entry('b', 40)]));
    expect(result.current[0]).toBe('a');
    act(() =>
      ioCallback?.([
        { isIntersecting: false, target: { id: 'a' }, boundingClientRect: { top: 5 } },
      ]),
    );
    expect(result.current[0]).toBe('b');
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() => useScrollSpy(['a', 'b']));
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
