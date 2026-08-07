# Field Validation

`validateField(name, value, options?)` in `src/utils/validation.ts` — a `switch` on the **field name**, returning `''` when valid.

## Required

Pass `{ required: true }`. Don't hand-roll the empty check:

```ts
validateField('name', formData.name, { required: true, label: 'Name' })
// → 'Name is required' when blank or whitespace-only
```

Without `required`, an empty value **always passes** — that is the historical contract every existing call site relies on. Requiredness is opt-in, never inferred from the field name.

Older pages still append the manual form; leave them unless you're already editing that block:

```ts
validateField('name', v) || (v.trim() === '' ? 'Name is required' : '')   // legacy
```

## Unknown names pass silently

The `switch` ends in `default: return ''`. Name a field `contact_email` instead of one of the handled email names and it validates nothing — no error, no warning, no type failure.

| Rule | Names |
|---|---|
| email | `email` `hotel_email` `company_email` `from_email` `username` |
| code (2–20 alnum / `_` / `-`) | `code` |
| phone (8–20 digits, `+`, space, `-`, `()`) | `telephone` `hotel_tel` `company_tel` |
| 0–3 alphanumeric | `alias_name` |
| non-negative integer | `max_license_bu` `max_license_users` |
| http(s) URL | `url` `image` |

**Adding a validated field: add a `case`.** Reuse an existing name when the rule matches — that is why email covers five names. Don't write ad-hoc validation in a page for something `validateField` should own.

## Flow

- `onChange` → clear `fieldErrors[name]`
- `onBlur` → `validateField(...)` → set the error
- Pre-submit → re-validate every required field, `return` early if any error
- After a failed save → merge backend `fields` from `parseApiError` into the same `fieldErrors` state

## Display

```tsx
<Input className={fieldErrors[name] ? 'border-destructive' : ''} />
{fieldErrors[name] && <p className="text-xs text-destructive">{fieldErrors[name]}</p>}
```
