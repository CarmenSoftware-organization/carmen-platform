# Permission Checks

`hasPermission(key, opts?)` from `useAuth()`, or `<Can permission="…">` (which is a thin
wrapper over it). The pure logic is `checkPermission` in `src/utils/permissions.ts`.

## The scoping rule — the argument changes the question

```ts
hasPermission('cluster.update')                          // platform grant OR **any** cluster
hasPermission('cluster.update', { clusterId: c.id })     // platform grant OR **that** cluster
```

| Form | Means | Use for |
|---|---|---|
| no `clusterId` | the user holds this somewhere | nav items, page-level visibility |
| with `clusterId` | the user holds this **here** | any control that reads or writes one record |

A write button gated by the unscoped form is a bug, not a shortcut: a user who administers
cluster A gets the button on cluster B's record, and only the server stops them.

## When the record's cluster can't be resolved

Pass `UNRESOLVED_CLUSTER_ID`, never `undefined`:

```ts
hasPermission('business_unit.update', { clusterId: bu.cluster_id ?? UNRESOLVED_CLUSTER_ID })
```

`undefined` silently falls back to the broad "any cluster" branch — re-opening exactly the hole
above. The sentinel keeps the check on the scoped branch, where no real cluster id can match,
so only a platform-wide grant passes. (Concrete regressions this closed: `UserAccessTree.tsx`,
`UserEdit.tsx`.)

## `<Can>` vs `hasPermission`

- `<Can permission="x" clusterId={id} fallback={…}>` — hiding/replacing rendered UI.
- `hasPermission(…)` — anything that isn't JSX: `disabled`, an early `return` in a handler, a
  `useMemo` that builds columns.

**Never mock `Can` in tests.** It *is* the permission logic; stubbing it makes every permission
test pass regardless of permissions (`testing/mock-boundary.md`).

## Permission-key constants

`PERMISSIONS` in `src/utils/permissions.ts` exists for keys **duplicated inside one file** —
where a literal in `hasPermission('broadcast.send')` and one in `<Can permission="broadcast.send">`
can drift apart unnoticed. Add a constant when a key gains a second call site in the same file;
a key used once stays a literal. Values must stay byte-identical to the backend's keys.
