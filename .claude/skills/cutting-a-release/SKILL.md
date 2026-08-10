---
name: cutting-a-release
description: Cut a release of carmen-platform with `bun run build:bump` — the guard order, what the script writes, and the tag-push order that must not be got wrong. Use when the user asks to cut, bump, tag, or publish a release, or when a release commit or tag needs fixing.
---

# Cutting a release

`bun run build:bump` (`scripts/release.mjs`) cuts a release **locally** — it never pushes
and never fetches. Guards run in this order, all before anything is written:

1. **version drift** — `package.json.version` must still equal `src/data/changelog.json` → `versions[0].version`
2. **branch** — `main` or `chore/release-*`
3. **working tree** — clean
4. **not behind** `@{upstream}`; a branch with no upstream (every fresh `chore/release-*`) falls back to the remote-tracking ref `origin/main`. Skipped only when neither resolves.
5. **`unreleased` non-empty**

Then it prompts for patch/minor/major (pass the level as an argument to skip the prompt),
checks the target **tag `vX.Y.Z` does not already exist**, gates on `typecheck` + `lint` +
`test`, and only then writes `package.json`, `src/data/changelog.json`, and `CHANGELOG.md`,
commits exactly those three with `git commit --only` (anything else you staged stays
staged) as `chore(release): vX.Y.Z`, and creates the annotated tag `vX.Y.Z`.

The version the app displays comes from `src/data/changelog.json` → `versions[0].version`
(`src/components/VersionBadge.tsx`), **not** from `package.json` — `package.json.version`
is a mirror the script keeps in sync.

**Push the tag last.** Cut on `main`: `git push origin HEAD && git push origin vX.Y.Z`.
Cut on a `chore/release-*` branch: `git push origin HEAD` → open the PR → **merge it with a
merge commit, not a squash** → *then* `git push origin vX.Y.Z`. A squash rewrites the
release commit, so a tag pushed before the merge points at an object outside `main`'s
history — and once pushed it can only be fixed by deleting the remote tag and re-tagging.
The script prints whichever order applies.

`bun run changelog` regenerates `CHANGELOG.md` from `src/data/changelog.json` without bumping.

Spec: `docs/superpowers/specs/2026-08-05-build-bump-release-script-design.md`.
