import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's automatic cleanup is only auto-registered when Vitest `globals` is on.
// We use explicit imports (no globals), so unmount rendered trees after each test
// ourselves — otherwise renders accumulate in the shared jsdom document.
afterEach(() => {
  cleanup();
});

// jsdom has no IntersectionObserver; scrollspy-based components need a no-op stand-in.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// jsdom has no matchMedia. useDarkMode (prefers-color-scheme) and DataTable's
// useMediaQuery both call it. Default: width queries match (desktop → table view)
// so existing management-page tests keep asserting the table; other queries
// (e.g. prefers-color-scheme: dark) do not match → light theme. Individual tests
// override this via vi.stubGlobal to exercise the mobile card view.
// Re-applied in a beforeEach (not stubbed once at file load) because some suites
// call vi.unstubAllGlobals() in their own afterEach (e.g. to reset a stubbed
// localStorage) — that would otherwise wipe this stub for the rest of that file.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});
