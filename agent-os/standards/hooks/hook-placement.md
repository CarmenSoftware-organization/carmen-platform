# Where Hooks Live, and How They Report Errors

## Placement

| Scope | Location | Example |
|---|---|---|
| used by 2+ pages, or generic | `src/hooks/` | `useDebouncedValue`, `useMediaQuery`, `useUserSearch` |
| one page's sub-flow | that page's subdirectory | `pages/businessUnitEdit/useBusinessUnitUsers` |

Start page-local. Move to `src/hooks/` when a **second** page needs it — not in anticipation.
Same rule as `pages/decomposition.md`.

## Error surface — decided by who can display it

| The hook… | Reports via |
|---|---|
| loads data for the whole page and owns no error UI | `toast.error(parseApiError(err).message)` |
| feeds one component that has somewhere to show it inline | a returned `error: string` |

```ts
// useAnalyticsFilterOptions — nothing on screen belongs to it → toast
if (failed) toast.error(parseApiError(failed.reason).message);

// useUserSearch — the dropdown renders the message → return it
return { results, loading, error };
```

Either way the failure is **reported**. Swallowing it silently is the one wrong answer.

This is the opposite of the services rule (`api/service-module.md`): services never toast,
because they can't know the context. A hook does know it, and is allowed to.

## Context hooks

A context's consumer hook throws when used outside its provider — `useAuth` and `useDarkMode`
both do. Follow it for any new context: a `null` context silently rendering an empty UI is much
harder to diagnose than a stack trace naming the missing provider.

```ts
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
```
