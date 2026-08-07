# Tests During Plan Execution

When executing a written implementation plan: **implement, type-check, commit.** Skip the test-writing steps.

- Skip plan steps saying "write the failing test" / "run the test to verify it fails" / "run tests to verify they pass"
- Don't create `*.test.ts(x)` unless the user asks for tests **in the current turn**

## Still required

- **Static checks are not tests.** Run `bun run typecheck` and `bun run lint`.
- **Manual verification is not skipped.** Offer a curl or browser check — that is how the user verifies instead.
- **The existing suite must pass before merge:** `bun run test`.

## Subagents

Dispatching implementer subagents? **Say this to them explicitly.** They do not inherit it — an implementer told only "follow the plan" will write the tests the plan asks for.

## Scope

This overrides `superpowers:test-driven-development` and any TDD step baked into a command. It is a default, not an absolute — if the user asks for tests, write them.
