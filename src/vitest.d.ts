// Makes @testing-library/jest-dom's matchers (toBeInTheDocument, toHaveValue, …)
// visible to tsc on vitest's `expect`. Lives under src/ so it's in the tsconfig
// `include` (the root vitest.setup.ts that registers them at runtime is not).
import '@testing-library/jest-dom/vitest';
