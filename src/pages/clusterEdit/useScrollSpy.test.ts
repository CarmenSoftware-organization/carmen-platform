import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSpy } from './useScrollSpy';

type IOEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
let ioCallback: (entries: IOEntry[]) => void;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  class MockIO {
    constructor(cb: (entries: IOEntry[]) => void) { ioCallback = cb; }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', MockIO as unknown as typeof IntersectionObserver);
  // Provide observable elements.
  for (const id of ['a', 'b']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useScrollSpy', () => {
  it('defaults activeId to the first id and observes each element', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    expect(result.current.activeId).toBe('a');
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('updates activeId when a section intersects', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    act(() => {
      ioCallback([{ target: document.getElementById('b')!, isIntersecting: true, intersectionRatio: 1 }]);
    });
    expect(result.current.activeId).toBe('b');
  });

  it('scrollTo calls scrollIntoView on the target element', () => {
    const spy = vi.fn();
    document.getElementById('b')!.scrollIntoView = spy;
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    act(() => result.current.scrollTo('b'));
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
