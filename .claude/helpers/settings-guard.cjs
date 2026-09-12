#!/usr/bin/env node
/**
 * Re-apply this repo's hook-timeout floors after graft rewrites .claude/settings.json.
 *
 * graft's `mergeGraftSettings()` drops every hook entry whose JSON mentions
 * `graft-hooks.cjs` and re-adds its own hardcoded block, so a hand-edited timeout is
 * lost on each wiring refresh -- `reconcileWiring()` fires that refresh once per graft
 * version bump, which is how PR #294's 20s post-edit budget came back as 10s.
 *
 * This guard is `foreign` by that same test (its own entry never names graft's shim),
 * so graft keeps it and it can put the floor back. The repair lands on the NEXT
 * session: Claude Code has already parsed settings.json by the time SessionStart runs.
 *
 * Only ever raises a timeout. Never lowers one, never adds or removes an entry.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** One row per hook whose graft-installed timeout is too small for this repo. */
const FLOORS = [
  {
    event: 'PostToolUse',
    shim: 'graft-hooks.cjs',
    arg: 'post-edit',
    minTimeout: 20000,
    // graft's default leaves only 2s of headroom: handlePostEdit() spends up to
    // CHILD_TIMEOUT_MS (8s) inside `graft check --json` before it even reads the
    // 568-file wiring graph to draw a blast radius. Measured here: 6.8-7.0s typical,
    // p95 8.3s, max 33.9s. Anything over budget is SIGKILLed mid-rebuild -- the case
    // graft's own hooks.d.ts warns about ("can't even release the build lock").
    why: 'post-edit exceeds 10s whenever `graft check` runs long',
  },
];

function eachHookEntry(settings, visit) {
  const hooks = settings && settings.hooks;
  if (!hooks || typeof hooks !== 'object') return;
  for (const [event, blocks] of Object.entries(hooks)) {
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const list = block && block.hooks;
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (entry && typeof entry === 'object') visit(event, entry);
      }
    }
  }
}

function matches(floor, event, command) {
  return (
    event === floor.event &&
    command.includes(floor.shim) &&
    command.trimEnd().endsWith(floor.arg)
  );
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const file = path.join(root, '.claude', 'settings.json');

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return; // missing or hand-broken -- leave it exactly as the user left it
  }

  const repaired = [];
  eachHookEntry(settings, (event, entry) => {
    const command = typeof entry.command === 'string' ? entry.command : '';
    for (const floor of FLOORS) {
      if (!matches(floor, event, command)) continue;
      if (typeof entry.timeout === 'number' && entry.timeout >= floor.minTimeout) continue;
      repaired.push(`${floor.arg} ${entry.timeout ?? 'unset'}ms -> ${floor.minTimeout}ms`);
      entry.timeout = floor.minTimeout;
    }
  });

  if (repaired.length === 0) return;

  // Same shape graft writes (2-space JSON + trailing newline), so the next refresh
  // produces no spurious diff. Rename so a concurrent reader never sees a half file.
  const tmp = `${file}.guard.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(tmp, file);

  console.log(
    `[settings-guard] a graft wiring refresh reset hook timeouts; restored ${repaired.join(', ')} ` +
      `in .claude/settings.json (takes effect next session).`,
  );
}

try {
  main();
} catch {
  // A guard must never fail a session start.
}
