import { afterEach, vi } from 'vitest';
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
