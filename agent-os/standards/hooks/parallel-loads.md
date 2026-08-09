# Parallel Loads — `allSettled`, not `all`

Independent requests that fill **separate** pieces of UI go through `Promise.allSettled`.

```ts
const [bus, apps] = await Promise.allSettled([
  businessUnitService.getAll({ page: 1, perpage: 100 }),
  applicationService.getAll({ page: 1, perpage: 100 }),
]);
if (bus.status === 'fulfilled')  setBuOptions(map(bus.value));
if (apps.status === 'fulfilled') setAppOptions(map(apps.value));

const failed = [bus, apps].find((r): r is PromiseRejectedResult => r.status === 'rejected');
if (failed) toast.error(parseApiError(failed.reason).message);
```

`Promise.all` rejects on the first failure and **discards the successful results too** — one
dead request empties both dropdowns, and the user concludes the system has no BUs *and* no
applications. `allSettled` lets each branch fill itself.

- Report the failure — one toast, per `errors/catch-blocks.md`. Silent partial UI is worse than
  a visible error.
- One toast, not one per rejection: two failed requests are one broken page to the user.

## When `Promise.all` is still right

The results feed a **single** derived value that is meaningless if any branch is missing — a
gate, a total, a form's initial state. There, failing whole is the honest outcome. Sequential
`await`s are right when one request's result is another's input.
