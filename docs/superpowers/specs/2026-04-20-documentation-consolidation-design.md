# Documentation Consolidation — Design Spec

**Date:** 2026-04-20
**Status:** Approved for implementation

## Goal

Consolidate 13 doc files into 5, rewriting each from the current codebase state. Delete stale migration/overlap docs.

## Final file set

```
carmen-platform/
├── README.md          (rewrite — top-level intro)
├── CLAUDE.md          (full audit + refresh)
├── SITEMAP.md         (rewrite — current routes)
└── docs/
    ├── OVERVIEW.md    (new — merges PROJECT_SUMMARY + PRD + docs/README)
    └── DEVELOPMENT.md (new — merges QUICK_START + API_CONFIGURATION + AUTHENTICATION_FLOW + LAYOUT_FEATURES)
```

**Deletions (8 files):**
- `docs/README.md`
- `docs/PROJECT_SUMMARY.md`
- `docs/PRD.md`
- `docs/QUICK_START.md`
- `docs/API_CONFIGURATION.md`
- `docs/AUTHENTICATION_FLOW.md`
- `docs/LAYOUT_FEATURES.md`
- `docs/SHADCN_MIGRATION.md`
- `docs/BUN_MIGRATION.md`
- `docs/WHY_BUN.md`

(That's 10 files deleted. Total: 13 existing → rewrite 3 + create 2 + delete 10 = 5 remain. Note: `docs/README.md` merges into `docs/OVERVIEW.md`; `PROJECT_SUMMARY` and `PRD` overlap heavily.)

## File contents

### `README.md` (top-level) — ~80 lines

Purpose: first-impression landing for GitHub readers.

Sections:
- One-paragraph description of the product
- Tech stack bullet list
- Quick start (3 commands: clone, bun install, bun start)
- Link to `docs/OVERVIEW.md`, `docs/DEVELOPMENT.md`, `CLAUDE.md`, `SITEMAP.md`
- License (if any — audit didn't find one, so omit this line)

### `CLAUDE.md` (top-level) — refresh current 1650 lines

Purpose: AI coding guide. Already the primary source of truth for patterns.

Audit + fix:
- Update UI primitive list to include `tabs.tsx` and `chip-input.tsx`
- Add section for **Report Template Edit Patterns**: how `XmlEditor`, `DialogPreview`, `ChipInput` are used, with sample snippets from the shipped code
- Add `src/utils/xml.ts` to Utils section (exports: `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes`, `downloadText`, `XmlValidation`)
- Update route list to include `/report-templates`, `/report-templates/new`, `/report-templates/:id/edit`
- Update nav items list in sidebar section to include Report Templates
- Update "Reusable components" list to include `XmlEditor.tsx`, `DialogPreview.tsx`
- Verify every code example still matches its source file
- Remove any lingering references to deleted/renamed files
- Keep overall structure; surgical edits where drift exists

### `SITEMAP.md` (top-level) — ~120 lines

Purpose: authoritative route map for humans.

Content:
- Route table: path, component, role guards
- Sidebar nav order
- Route patterns section (list/new/edit conventions)
- Navigation examples (`navigate(...)` snippets)

Source: `src/App.tsx` routes + `src/components/Layout.tsx` nav items.

### `docs/OVERVIEW.md` (new) — ~200 lines

Purpose: product + architecture overview for new contributors.

Sections:
1. **What is Carmen Platform** — one paragraph
2. **Users & roles** — list of platform roles with access scope
3. **Core entities** — Cluster, Business Unit, User, Report Template (one paragraph each)
4. **Architecture** — frontend-only React SPA; NestJS backend (separate service); API proxy in dev; deploy as Docker → nginx → EC2 via SSM
5. **Tech stack** — short bullet list (React, TS, Tailwind, shadcn/ui, Radix, TanStack Table, CodeMirror, Axios, Sonner)
6. **Project structure** — tree of `src/` with one-liner per directory
7. **Where things live** — quick table (pages in `src/pages/`, services in `src/services/`, etc.)
8. **Related docs** — links to CLAUDE.md, DEVELOPMENT.md, SITEMAP.md

### `docs/DEVELOPMENT.md` (new) — ~350 lines

Purpose: one-stop dev setup and operational reference.

Sections:
1. **Prerequisites** — Node 20, Bun (preferred) or npm
2. **Setup** — clone, copy `.env.example` → `.env`, install deps
3. **Environment variables** — table of `REACT_APP_*` vars with purposes
4. **Commands** — start, build, test, test:e2e variants
5. **Dev proxy** — `setupProxy.js` explanation (`/api` + `/api-system` → backend, `secure: false`)
6. **API layer** — axios instance, interceptors, headers (`x-app-id`, `Authorization`), base URL logic
7. **Authentication** — login flow, role guards, allowed roles, localStorage keys, token handling, 401/403 behavior
8. **Layout & sidebar** — sidebar states (240px expanded / 64px collapsed), localStorage persistence, mobile drawer, role-filtered nav
9. **E2E testing** — Playwright, `e2e/` structure, test credentials env vars
10. **Docker & deployment** — multi-stage build, nginx, port 3001, CI/CD flow (GitHub Actions → ECR → EC2 via SSM, ARM64)
11. **TypeScript config** — strict mode, relevant settings
12. **Troubleshooting** — self-signed certs, proxy 500s, CORS, port in use

## Style & conventions

- **Audience:** human developers (new contributors primarily); AI assistants rely on CLAUDE.md
- **Tone:** concise, factual, imperative ("Run X", "Copy Y")
- **Code blocks:** always include the language tag
- **Links:** relative paths (`./DEVELOPMENT.md`, `../CLAUDE.md`)
- **No em-dashes or decorative framing;** lists + tables preferred over prose
- **No "TODO"/"TBD"** — if unknown, either investigate or omit
- **Verify everything against source** — facts come from the audit report, not prior docs

## Out of scope

- No new e2e-testing guide (keep in `docs/DEVELOPMENT.md` as a section)
- No contributor guide / CODE_OF_CONDUCT / CONTRIBUTING (if you want these later, separate task)
- No changelog (git log is the changelog)
- No per-feature pages (report templates are covered in CLAUDE.md patterns + OVERVIEW entity list)
- Do not touch anything under `docs/superpowers/` (specs and plans live there; this rewrite is about product/dev docs)

## Success criteria

After implementation:
- 5 doc files exist at the listed paths
- 10 files deleted
- No dead links between remaining docs
- `README.md` links work from GitHub
- `CLAUDE.md` accurately reflects every pattern with no stale examples
- All facts match code as of commit at implementation time
