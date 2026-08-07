# Toast & Confirm

`window.alert()` and `window.confirm()` are **never** used — zero occurrences in `src/`. Keep it that way.

## Toast level

Four levels with real semantics. Pick by outcome, not by tone.

| Level | Means | Examples |
|---|---|---|
| `toast.success` | the action fully succeeded | `Cluster saved` |
| `toast.error` | the action failed | any catch the user must see |
| `toast.warning` | **partial** success, or a caveat on the result | `Deleted 3, 2 failed` · `Showing 50 of 200 business units` · `A migration is already running` |
| `toast.info` | **no-op** — nothing needed doing | `Already formatted` · `Nothing to download` · `Already up to date.` |

A bulk action that isn't all-or-nothing ends in `warning`, not `success`. A request that legitimately changed nothing ends in `info` — telling the user "Saved!" when nothing was saved is a lie.

`description` carries the detail; the first argument stays a short headline. In an error toast the description goes through `getErrorDetail` (see `redaction.md`).

## ConfirmDialog

`<ConfirmDialog>` (`components/ui/confirm-dialog.tsx`) for every destructive action — 22 pages use it.

```tsx
<ConfirmDialog
  open={x} onOpenChange={setX}
  title="Delete cluster" description="This cannot be undone."
  confirmVariant="destructive"
  onConfirm={async () => { await service.delete(id); }}
/>
```

- **Don't add your own loading state.** It owns one: `onConfirm` may be async, the confirm button shows a spinner, and both buttons disable while it runs.
- **It blocks dismissal during the request** (`if (!loading) onOpenChange(v)`) — don't wrap it in something that reopens the escape hatch.
- `confirmVariant="destructive"` for deletes; default otherwise.
- `onConfirm` throwing is fine — `finally` clears loading. Handle the error inside if the user needs to see it.
