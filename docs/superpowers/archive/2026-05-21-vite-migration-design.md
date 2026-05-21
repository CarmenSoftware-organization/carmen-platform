# Vite Migration — Design

**Date:** 2026-05-21
**Author:** Claude Code (Opus 4.7) + Thammanoon Semapru
**Status:** Approved
**Goal:** Replace `react-scripts` 5.0.1 (CRA) with Vite as the dev server and production build tool, unlocking dependency updates that have been blocked by CRA's frozen transitive tree.

## Why

`react-scripts` has been unmaintained since December 2022. Recent dependabot alerts surfaced ~30 transitive-only vulnerabilities pulled in via CRA's webpack toolchain (webpack-dev-server, postcss, picomatch, brace-expansion, etc.). Some were mitigated by `package.json` `overrides`, but the underlying problem — that we can't update Webpack/Babel/etc. independently — remains.

Vite solves this:
- Uses esbuild for dev (no webpack dev server) and Rollup for production
- Each piece of the toolchain is independently versioned and actively maintained
- Faster cold start and HMR than CRA (~10× in practice for projects this size)
- ESLint/Tailwind/PostCSS/TypeScript all keep working — they're toolchain-agnostic

## Scope

In:
- `react-scripts` removal + Vite install
- Config files: `vite.config.ts`, `src/vite-env.d.ts`, updated `tsconfig.json`, updated `package.json` scripts
- `index.html` relocation from `public/` to project root with module script tag
- `process.env.*` → `import.meta.env.*` migration across 18 occurrences
- `src/setupProxy.js` removal (moved into `vite.config.ts`)
- ESLint preservation via `vite-plugin-eslint` (or equivalent) so build still enforces lint with `CI=true`

Out:
- Test framework migration (no unit tests exist; Playwright e2e is independent)
- Dockerfile changes (Vite's `build.outDir` will be set to `build/` to preserve `COPY /app/build`)
- CI workflow changes (`npm run build` keeps working)
- `.env` schema changes (`REACT_APP_*` prefix preserved via `envPrefix`)

## Architecture Decisions

### 1. Env var prefix — keep `REACT_APP_*`
Set `envPrefix: 'REACT_APP_'` in `vite.config.ts` so `.env`, `.env.uat`, `.env.production`, and CI secrets continue to use the existing `REACT_APP_API_BASE_URL`, `REACT_APP_API_APP_ID`, `REACT_APP_ENV`, `REACT_APP_BUILD_DATE` names. No environment changes required across dev/UAT/prod.

### 2. Runtime access — migrate `process.env` → `import.meta.env`
The 18 source occurrences split as:
- 15× `process.env.NODE_ENV === 'development'` → `import.meta.env.DEV`
- 3× `process.env.REACT_APP_*` → `import.meta.env.REACT_APP_*`
Add `src/vite-env.d.ts` with `/// <reference types="vite/client" />` and an `ImportMetaEnv` interface so all `REACT_APP_*` are typed as `string | undefined`.

### 3. Dev proxy — move to `vite.config.ts`
Replace `src/setupProxy.js` with `server.proxy` config:
```ts
server: {
  port: 3001,
  proxy: {
    '/api':        { target: env.REACT_APP_API_BASE_URL, changeOrigin: true, secure: false },
    '/api-system': { target: env.REACT_APP_API_BASE_URL, changeOrigin: true, secure: false },
  },
}
```
Identical semantics: `changeOrigin: true` + `secure: false` for the self-signed backend.

### 4. Build output directory — keep `build/`
Set `build.outDir: 'build'` in `vite.config.ts`. The Dockerfile's `COPY --from=builder /app/build /usr/share/nginx/html` keeps working as-is. CI workflow doesn't need to know.

### 5. React plugin — `@vitejs/plugin-react`
Use the Babel-based plugin (not `-swc`). It's the default Vite recommendation, integrates with existing Babel-based tooling, and avoids SWC's slight behavior differences on edge cases (React.lazy, decorators, etc.). The performance loss vs SWC is negligible for this project size.

### 6. `index.html` location and content
- Move `public/index.html` → project root.
- Add `<script type="module" src="/src/index.tsx"></script>` before `</body>`.
- Existing content (charset, viewport, theme-color, description, title, noscript, `<div id="root">`) carries over verbatim. No `%PUBLIC_URL%` substitutions exist in the current file, so no template variables to replace.
- Other static assets in `public/` (favicons, manifest if any) stay in `public/` — Vite serves that directory at the root path.

### 7. Tests — drop `react-scripts test`
No `*.test.{ts,tsx}` files exist in `src/`; CLAUDE.md confirms "no unit-test infrastructure for pages". Remove the `test` script. Playwright e2e (`bun run test:e2e`) is independent of the bundler and unaffected.

### 8. ESLint integration — `vite-plugin-eslint`
CRA runs ESLint as part of `react-scripts build` and treats warnings as errors when `CI=true`. To preserve that contract, add `vite-plugin-eslint` (or `vite-plugin-checker` with eslint enabled). Build with `CI=true` should fail on warnings, matching current behavior. ESLint config (`eslintConfig.extends: ["react-app"]`) stays in `package.json`.

### 9. tsconfig.json adjustments
Current settings (`strict`, `jsx: react-jsx`, `module: esnext`, `moduleResolution: node`, `isolatedModules: true`, `noEmit: true`, `skipLibCheck: true`) are all compatible with Vite. Only addition: include the Vite client types — handled via `src/vite-env.d.ts`.

### 10. `package.json` scripts
```jsonc
{
  "scripts": {
    "start": "vite",
    "dev":   "vite",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
    "preview": "vite preview --port 3001",
    "test:e2e":          "npx playwright test",
    "test:e2e:ui":       "npx playwright test --ui",
    "test:e2e:headed":   "npx playwright test --headed",
    "test:e2e:debug":    "npx playwright test --debug",
    "test:e2e:report":   "npx playwright show-report"
  }
}
```
Remove: `eject`, `test` (CRA-only). Add: `preview` (Vite's built-in static server, useful for local prod checks).

## File Inventory

### New files
- `vite.config.ts` (project root)
- `src/vite-env.d.ts`
- `index.html` (project root; moved from `public/`)

### Modified files
- `package.json` — scripts, dependencies, devDependencies, remove `overrides` for transitive deps that webpack pulled in (e.g. picomatch, brace-expansion — may be safe to keep but no longer required once Vite drops the offending transitive)
- `tsconfig.json` — minor `"types": ["vite/client"]` addition (or via vite-env.d.ts reference)
- `src/services/api.ts` — `process.env.REACT_APP_API_BASE_URL` → `import.meta.env.REACT_APP_API_BASE_URL`
- `src/pages/Landing.tsx` — same for `REACT_APP_BUILD_DATE`
- 15 other source files using `process.env.NODE_ENV` → `import.meta.env.DEV`

### Deleted files
- `src/setupProxy.js`
- `public/index.html` (after relocating to root)

### Untouched
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/build.yml`
- `nginx` config (embedded in Dockerfile)
- `e2e/` (Playwright)
- `tailwind.config.js`, `postcss.config.js` (Vite picks them up automatically)
- `src/components/*`, `src/pages/*` business logic
- `src/lib/utils.ts`
- `.env.example`, `.env.*`

## Risk Mitigation

1. **HMR behavior differences.** Vite's HMR is more aggressive than webpack; some context providers may need explicit `// @hmr` hints. Mitigation: after dev server boots, manually exercise route changes + form edits to catch state loss.
2. **CSS load order.** Vite preserves import order but evaluates side-effectful `import './foo.css'` differently in dev vs prod. Mitigation: production build smoke test before committing.
3. **Module type for assets.** Vite treats JSON, SVG, etc. as ES modules by default. Project doesn't import non-code assets directly (icons come from `lucide-react`), so risk is low.
4. **ESLint warnings becoming errors at unexpected times.** `vite-plugin-eslint` exits the dev server on first error by default. Configure with `failOnWarning: false` for dev, override via CI=true in build.
5. **Rollback path.** Keep the `react-scripts` removal as the final commit. If anything goes sideways, `git revert` that one commit restores the CRA build pipeline.

## Success Criteria

- `bun start` (or `npm start`) launches the dev server on port 3001, with the same proxy semantics.
- All routes load and function identically to the CRA build.
- `CI=true bun run build` reports "Compiled successfully" with no warnings, produces `build/` ready for nginx.
- `docker build .` (built locally) produces an image that serves the SPA correctly on port 3001.
- Bundle size: gzipped main JS within ±20% of the current 317 kB.
- Cold start of dev server measurably faster than CRA (~5s vs ~25s baseline).
- Dependabot rescan after merge drops the alert count further (transitive webpack-dev-server / picomatch / etc. removed from the tree).

## Out of Scope (Future Work)

- React 19 upgrade (currently @types/react 19 but react 18 — should be aligned in a follow-up)
- Migrating `@types/node` 25 → matching Node 20 (currently mismatched)
- Replacing `vercel` package (in `dependencies`, looks unused at runtime)
- Removing the `proxy` field from `package.json` (legacy CRA field, will be no-op under Vite — safe to drop)

## References

- Vite docs: https://vitejs.dev/guide/
- `@vitejs/plugin-react` README
- CRA → Vite migration guide: https://github.com/vitejs/awesome-vite#migration-guides
