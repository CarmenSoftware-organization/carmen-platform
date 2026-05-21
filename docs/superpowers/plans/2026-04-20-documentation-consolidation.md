# Documentation Consolidation — Implementation Plan

> Execute via superpowers:executing-plans. Tasks are ordered; each produces a commit.

**Goal:** Rewrite 3 existing docs, create 2 new docs, delete 10 stale docs, leaving a 5-file doc set.

**Spec:** `docs/superpowers/specs/2026-04-20-documentation-consolidation-design.md`

**Source of truth:** Read the audit report in the session context + `src/App.tsx`, `package.json`, `src/services/*`, `src/components/Layout.tsx`, `Dockerfile`, `.github/workflows/build.yml`, `.env.example`, and recent git log.

---

## Task 1: Write `docs/OVERVIEW.md`

Create the product + architecture overview. Use facts from audit report sections 1–4, 11, 16.

- [ ] Step 1: Write new file `docs/OVERVIEW.md`
- [ ] Step 2: Commit with `docs: add consolidated overview`

## Task 2: Write `docs/DEVELOPMENT.md`

Create the dev setup + operational reference. Use facts from audit report sections 8–16.

- [ ] Step 1: Write new file `docs/DEVELOPMENT.md`
- [ ] Step 2: Commit with `docs: add consolidated development guide`

## Task 3: Rewrite top-level `README.md`

Replace current contents with a GitHub-facing landing. Link to `CLAUDE.md`, `SITEMAP.md`, `docs/OVERVIEW.md`, `docs/DEVELOPMENT.md`.

- [ ] Step 1: Rewrite `README.md`
- [ ] Step 2: Commit with `docs: rewrite top-level README`

## Task 4: Rewrite `SITEMAP.md`

Generate from `src/App.tsx` route definitions and `src/components/Layout.tsx` nav items.

- [ ] Step 1: Rewrite `SITEMAP.md`
- [ ] Step 2: Commit with `docs: refresh SITEMAP from current routes`

## Task 5: Refresh `CLAUDE.md`

Surgical edits:
- Update UI primitive list (add `tabs.tsx`, `chip-input.tsx`)
- Add `XmlEditor.tsx`, `DialogPreview.tsx` to components list
- Add `src/utils/xml.ts` to utils section
- Add `/report-templates/*` routes to route examples
- Add Report Templates to nav items example
- Verify existing code examples still match source (spot-check key sections)
- Add new "Report Template Edit Patterns" section with XmlEditor / DialogPreview / ChipInput usage

- [ ] Step 1: Make edits to `CLAUDE.md`
- [ ] Step 2: Commit with `docs: refresh CLAUDE.md with report template patterns and new components`

## Task 6: Delete stale docs

Delete in one commit:
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

- [ ] Step 1: `git rm` all 10 files
- [ ] Step 2: Commit with `docs: remove stale and migration docs`

## Task 7: Verify

- [ ] `ls docs/` shows exactly `OVERVIEW.md`, `DEVELOPMENT.md`, `superpowers/`
- [ ] Top-level has `README.md`, `CLAUDE.md`, `SITEMAP.md`
- [ ] Spot check: click through links in `README.md` to verify no dead relative paths
- [ ] `git log --oneline -10` shows clean commits

---

## Self-review

Placeholder scan: ✓ All content sourced from audit, no TODOs.
Type consistency: N/A (documentation).
Spec coverage: Each spec item maps to a task. Delete list in spec (10 files) matches Task 6 list.
