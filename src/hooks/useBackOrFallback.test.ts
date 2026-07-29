import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Both router hooks are stubbed so the test can drive `location.key` directly.
// A real MemoryRouter always starts at key 'default' and only mints a real key
// after an actual navigation, which is awkward to set up for a two-case hook.
const router = vi.hoisted(() => ({ navigate: vi.fn(), key: 'default' }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => router.navigate,
    useLocation: () => ({ key: router.key }),
  };
});

import { useBackOrFallback } from './useBackOrFallback';

beforeEach(() => {
  router.navigate.mockClear();
  router.key = 'default';
});

describe('useBackOrFallback', () => {
  it('steps back in history when the current entry is not the first one', () => {
    router.key = 'a1b2c3';
    const { result } = renderHook(() => useBackOrFallback('/dashboard'));

    result.current();

    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('replaces with the fallback when this is the first history entry', () => {
    router.key = 'default';
    const { result } = renderHook(() => useBackOrFallback('/dashboard'));

    result.current();

    expect(router.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('uses whatever fallback the caller passed', () => {
    router.key = 'default';
    const { result } = renderHook(() => useBackOrFallback('/'));

    result.current();

    expect(router.navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
