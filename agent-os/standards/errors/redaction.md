# Error Message Redaction

Two error paths reach the user, and they redact differently **on purpose**.

| Path | In production | Why |
|---|---|---|
| `parseApiError(err).message` | shown verbatim | user-caused: validation failure, duplicate name, version conflict. The message is the point — hiding it leaves the user stuck. |
| `getErrorDetail(err)` | `"Please try again later."` | system-caused: 5xx, network, DB. The backend message can carry schema names, SQL, or stack fragments. |

Both are `import.meta.env.DEV`-gated in `errorParser.ts` — dev always sees the real text.

## Choosing

Ask **who caused it**:

- The user can fix it by changing input → `parseApiError`
- The user can only retry or wait → `getErrorDetail`

When unsure, use `getErrorDetail`. A vague message is a smaller failure than a leaked one.

## Rules

- Never `setError(err.message)` or interpolate a raw error into JSX — always through one of the two helpers
- Never `console.error(err)` in shipped paths — `devLog(label, err)` strips it from production
- `toast.error(msg, { description })` follows the same rule: the description is user-visible, so it gets `getErrorDetail`, not the raw error

## Contract with the backend

This holds only while the backend keeps secrets out of the messages `parseApiError` surfaces. It is defence in depth, not the only defence — a backend that puts a connection string in a 400 message defeats it.
