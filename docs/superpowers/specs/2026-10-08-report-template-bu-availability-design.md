# Report Template BU Availability (Phase B)

**Date:** 2026-10-08
**Repos:** `micro-report`, `micro-cronjobs`, `carmen-turborepo-backend-v2` (gateway), `carmen-inventory-frontend-react`
**Builds on:** `2026-10-08-report-template-calculation-method-design.md` (Phase A — tag + admin filter, shipped)
**Status:** Design approved, awaiting spec review

## Problem

Phase A lets admins tag a template with the calculation methods it supports,
but every BU still sees and runs every report. Some reports produce wrong or
empty output under FIFO. In addition, `allow_business_unit` /
`deny_business_unit` have been stored on templates for a long time but are
**enforced nowhere**: the gateway's BU-scoped template list
(`GET /api/:bu_code/reports/templates`) drops `bu_code` and calls micro-report's
global `/api/report-templates`.

## Decisions (from brainstorming)

- **Scope C:** hide from the list **and** block at run time **and** handle
  schedules.
- **Existing schedules → skip + show status (A):** a scheduled run of an
  unavailable template is skipped (no retry, no recipient notification), and the
  inventory schedule list flags it. Removing the tag makes it run again on its
  own. Schedules are never deleted or disabled automatically.
- **allow/deny BU is enforced too**, by the same rule.
- **micro-report owns the rule** (approach 1). Gateway and micro-cronjobs only
  pass the BU through and react to the result.

## The Rule

One pure Go function in micro-report, `model.TemplateAvailability(tmpl, bu)`,
returns `(ok bool, reason string)`. Evaluated in this order:

1. `template_type == "form"` → **available** (printable documents; Phase A
   already saves forms with empty tags and empty BU lists).
2. BU code ∈ `deny_business_unit` → `bu_denied`.
3. `allow_business_unit` non-empty and BU code ∉ it → `bu_not_allowed`.
4. `calculation_methods` non-empty and the BU's `calculation_method` ∉ it →
   `calculation_method_unsupported`.
5. Otherwise → available.

Details:
- **allow/deny shapes in the DB vary** and all must parse: `null`, `""`,
  a JSON string holding CSV (`"T01, T02"` — what the platform Edit page saves),
  or a JSON array of strings. Normalise to a list of trimmed, non-empty codes.
  Any other JSON shape → treated as empty (logged once at warn).
- BU codes compare **trimmed and case-insensitive**.
- BU calculation method unknown (BU row missing / null) → rule 4 is skipped
  (fail open on the costing check only — a missing BU fails elsewhere already).
- `calculation_methods` NULL (not expected; column default is `{}`) → treated
  as empty.

## micro-report

- `model.ReportTemplate`: add `CalculationMethods pq.StringArray`
  (`gorm:"column:calculation_methods;type:enum_calculation_method[]"`, read-only
  — never written by micro-report; GORM `Save` must not include it, use
  `<-:false`).
- New `db.BuCalculationMethod(ctx, buCode) (string, error)` alongside `BuName`,
  reading `tb_business_unit.calculation_method` via `model.PlatformTable`.
- New file `model/availability.go`: `TemplateAvailability`, `parseBuList`.
- **List** — `GET /api/:buCode/report/templates` (`listFlat`): load all
  candidates with the existing filters (`perpage=-1`), drop unavailable ones,
  then paginate in memory (template count is in the tens). `paginate.total`
  reflects the filtered set.
- **Single** — new `GET /api/:buCode/report/templates/:id`: 200 with the
  template when available, 403 (below) when not, 404 when missing.
- **Run-time guard** — one helper used by every handler that resolves a
  template for a BU: `viewer`, `viewer-with-data`, `export-pdf-with-data`,
  `data`, `generate-async` (when `report_template_id` is set). The non-BU
  `/api/reports/generate` is guarded when its body carries a BU and a template
  id. Response on refusal:
  `403 {"error": "...", "code": "REPORT_TEMPLATE_UNAVAILABLE", "reason": "<reason>"}`.
- Global `/api/report-templates` (admin/platform use) is **unchanged**.

## micro-cronjobs

- Executor: a 403 whose body `code` is `REPORT_TEMPLATE_UNAVAILABLE` from
  micro-report becomes `ErrSkipped{Reason}`. The check applies to the BU the
  executor actually uses — **`bu_codes[0]`** (`internal/executor/report.go`
  only ever uses the first code; multi-BU fan-out does not exist and is out of
  scope).
- Scheduler: on `errors.As(err, *ErrSkipped)` → **no retry**, no
  notification, `UpdateLastRun(..., lastErr = "skipped: <reason>")`. Any other
  error keeps today's behaviour.

## Gateway (`apps/backend-gateway/src/application/reports`)

- `listTemplates(bu_code, …)` → micro-report `/api/:bu/report/templates`
  (currently `/api/report-templates`). Response shape of `listFlat` differs
  from the global list (no `created_by_name`/`updated_by_name`, adds
  `columns`/`dialog_filters`); the plan must reconcile the swagger response DTO
  and confirm the inventory FE reads only fields present in both.
- `getTemplate(bu_code, id)` → new micro-report single endpoint; 403 passes
  through.
- `createSchedule`: when `report_template_id` is given, check availability via
  the single endpoint first; unavailable → **422** with the same `reason`.
- `listSchedules`: fetch the BU's available template ids once
  (`perpage=-1`, `include_print=true`) and set on each schedule
  `template_available: boolean` and `unavailable_reason?: string`.
  Schedules without a template id → `template_available: true`.
- Viewer/data passthrough: map micro-report's 403 to a gateway 403 keeping
  `code` + `reason` (not a generic 500).
- Run the backend audit gates (`bun run gates`) — `app-api-catalog` /
  `rest-contract` will see the changed upstream paths.

## Inventory frontend

- Report list/picker: no change (backend filters).
- Schedule list: rows with `template_available === false` show a warning badge
  + tooltip with the localized reason; i18n en/th for the three reasons.
- Viewer / data error handling: a 403 with `code === "REPORT_TEMPLATE_UNAVAILABLE"`
  shows "This report is not available for this business unit" (localized)
  instead of the generic error toast.
- Schedule create: a 422 from the gateway surfaces the localized reason.

## Platform (this repo)

No behaviour change. Update the helper/placeholder copy of the allow/deny
fields to say they are now enforced for BU users (en + th).

## Deploy Order

1. **Data audit first** (DEV and production share the DEV backend): list
   templates whose allow/deny lists are non-empty — enforcement turns them on
   for the first time. Review with the user before step 2.
2. micro-report (new endpoint + guards; global endpoint unchanged).
3. micro-cronjobs (skip handling; harmless before step 2 lands).
4. Gateway (switches to BU endpoints — requires step 2).
5. Inventory frontend (badges / messages; tolerates missing new fields).

Each step is backward compatible with the previous state of the next.

## Error Handling

| Situation | Result |
|---|---|
| Unavailable template in list | omitted |
| Unavailable template fetched / run by id | 403 `REPORT_TEMPLATE_UNAVAILABLE` + reason |
| Scheduled run of unavailable template | skipped, `last_error = "skipped: <reason>"`, no retry, no notification |
| Creating a schedule for unavailable template | 422 + reason |
| BU calc method lookup fails (DB error) | 500 (not fail-open — a DB error is not "unknown method") |
| BU calc method null / BU row missing | costing rule skipped |

## Verification

Per user preference, no new test files; existing suites must stay green
(micro-report `go test ./...`, micro-cronjobs `go test ./...`, gateway jest
for `application/reports`, inventory FE vitest). Static: `go vet`, tsc, eslint.
Manual on DEV:
- Tag a template `['average']` on a FIFO BU → gone from that BU's list; viewer by
  id → 403; on an AVG BU → visible and runs.
- Put a BU code in deny → gone for that BU only; allow list with another code →
  gone for all others.
- A schedule on a now-unavailable template → next run `last_error` starts with
  `skipped:`, no notification arrives; schedule list shows the badge; remove the
  tag → next run succeeds.

## Out of Scope

- Normalising allow/deny storage to a single shape.
- Multi-BU schedule fan-out (`bu_codes[1..]`).
- Auto-disabling or deleting schedules.
- Changing the global `/api/report-templates` used by platform admin.
