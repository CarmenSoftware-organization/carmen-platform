# Report Template BU Availability (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A BU only sees, runs and schedules report templates allowed for it: allow/deny BU lists and Phase A's `calculation_methods` are enforced in micro-report; skipped schedule runs are silent and visible as a badge.

**Architecture:** micro-report owns one pure rule (`model.TemplateAvailability`) applied to its BU list endpoint, a new BU single-template endpoint, and a service-layer guard after every template load. A new catalog error `REPORT_TEMPLATE_UNAVAILABLE` (403) flows micro-report → gateway (which now forwards `code`) → inventory FE (`ApiError.appCode`). micro-cronjobs turns that 403 into a typed skip (no retry). The gateway switches its template calls to the BU endpoints and annotates schedules.

**Tech Stack:** Go (gin + GORM) for micro-report and micro-cronjobs; NestJS + `@repo/error-catalog` for the gateway; React + use-intl + TanStack Table for the inventory FE.

**Spec:** `docs/superpowers/specs/2026-10-08-report-template-bu-availability-design.md`

## Global Constraints

- Error code string exactly `REPORT_TEMPLATE_UNAVAILABLE`; HTTP **403** on every path (list create-schedule included).
- Reasons exactly: `bu_denied`, `bu_not_allowed`, `calculation_method_unsupported`.
- Rule order: form → available; deny; allow (non-empty); calculation_methods (non-empty, BU method known).
- BU codes compared trimmed + upper-cased; allow/deny accepted as `null`, `""`, CSV string, or array of strings.
- Global `/api/report-templates` in micro-report is unchanged.
- **No new test files** (user preference). Each task: implement → static checks → existing tests → commit. Existing tests that pin changed URLs/signatures are updated (that is fixing tests, not writing new ones).
- One branch per repo: `feature/report-template-bu-availability`, off fresh `origin/main`. Never commit to `main`.
- Backend-v2 lint: `bunx eslint <files>` **from the app directory** (root has no flat config); never `bun run lint`.
- Go: `go build ./... && go vet ./... && go test ./...` in each Go repo.
- Inventory FE: `bun run typecheck && bun run lint && bun run test:run`.
- Deploy order: data audit → micro-report → micro-cronjobs → gateway (+ error catalog) → inventory FE. Do not push gateway before micro-report is on DEV.

## Review Focus

1. **allow/deny stored as a CSV JSON string with spaces/lowercase** (`" t01 , T02"`) — must match BU `T01`. Pinned in Task 2 Step 2 (`splitCodes` trims + upper-cases).
2. **listFlat pagination after filtering** — page 2 of a filtered set must not skip or repeat rows, and `paginate.total` must count only visible rows. Pinned in Task 4 Step 2 (load all, filter, then slice).
3. **A skipped schedule must not retry or notify** — retry on a deterministic 403 would spam logs and, for `viewer_url`, the retry path could mint later. Pinned in Task 5 Step 3 (skip branch before `retryJob`).
4. **Gateway passthrough must keep non-coded errors unchanged** — every existing upstream error (no `code`) must still render exactly as today. Pinned in Task 6 Step 2 (string path untouched when `code` absent).
5. **Schedule list must not fail when the availability lookup fails** — a micro-report hiccup must degrade to "no badge", not a broken schedule page. Pinned in Task 6 Step 5 (`try/catch` → `null` set → field omitted).

---

### Task 0: Data audit (read-only, before any deploy)

**Files:** none.

- [ ] **Step 1: List templates with non-empty allow/deny on DEV (= production backend)**

In the browser on `http://localhost:3304` (logged in to the platform, `dev` mode), run in the console:

```js
const appId = '<REACT_APP_API_APP_ID from .env.dev>';
const r = await fetch('https://dev.blueledgers.com:4001/api-system/report-templates?perpage=-1', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'x-app-id': appId } });
const j = await r.json();
console.table((j.data ?? []).filter(t => (t.allow_business_unit && t.allow_business_unit !== '' && !(Array.isArray(t.allow_business_unit) && !t.allow_business_unit.length)) || (t.deny_business_unit && t.deny_business_unit !== '' && !(Array.isArray(t.deny_business_unit) && !t.deny_business_unit.length))).map(t => ({ name: t.name, type: t.template_type, allow: JSON.stringify(t.allow_business_unit), deny: JSON.stringify(t.deny_business_unit) })));
```

Expected: a (possibly empty) table. **Stop and show it to the user** — every row starts being enforced when micro-report deploys. Do not continue to the deploy steps of Task 3/4 without their OK. Code tasks may proceed.

---

### Task 1: Error catalog entry (backend-v2)

**Files:**
- Modify: `packages/error-catalog/src/catalog.ts` (after `REPORT_TEMPLATE_VERSION_NOT_FOUND`, ~L2949)
- Regenerate: `packages/error-catalog/reference/error-codes.json`, `.md`

**Interfaces:**
- Produces: `ERROR_CATALOG.REPORT_TEMPLATE_UNAVAILABLE` (`code: 'REPORT_TEMPLATE_UNAVAILABLE'`, `http_status: 403`).

- [ ] **Step 1: Branch**

```bash
cd ../carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/report-template-bu-availability
```

- [ ] **Step 2: Add the entry** after `REPORT_TEMPLATE_VERSION_NOT_FOUND`:

```ts
  REPORT_TEMPLATE_UNAVAILABLE: {
    code: 'REPORT_TEMPLATE_UNAVAILABLE',
    id: makeId(MODULE.REPORT_TEMPLATE, 4),
    http_status: 403,
    message_en: 'This report is not available for this business unit',
    message_th: 'รายงานนี้ใช้กับหน่วยธุรกิจนี้ไม่ได้',
  },
```

- [ ] **Step 3: Regenerate reference + build + checks**

```bash
cd packages/error-catalog
bun run gen:reference && bun run check-types && bun run build:package && bun run test
cd ../..
```

Expected: reference files gain the entry; tests green (if a test pins the entry count, update it).

- [ ] **Step 4: Commit**

```bash
git add packages/error-catalog
git commit -m "feat(error-catalog): REPORT_TEMPLATE_UNAVAILABLE (403)"
```

---

### Task 2: micro-report — rule, template field, BU method lookup

**Files:**
- Create: `model/availability.go`
- Modify: `model/template.go` (struct, after `DenyBusinessUnit` L36)
- Modify: `db/report_template_repo.go` (`templateSelectCols` L31-35)
- Modify: `db/db.go` (after `BuName` L299)

**Interfaces:**
- Produces:
  - `const model.CodeTemplateUnavailable = "REPORT_TEMPLATE_UNAVAILABLE"`, `model.ReasonBuDenied`, `model.ReasonBuNotAllowed`, `model.ReasonCalcMethodUnsupported`
  - `type model.TemplateUnavailableError struct{ TemplateID, BuCode, Reason string }` (implements `error`)
  - `func model.TemplateAvailability(t *ReportTemplate, buCode, buCalcMethod string) (bool, string)`
  - `func (t *ReportTemplate) CalculationMethods() []string`
  - `func (d *DB) BuCalculationMethod(ctx context.Context, buCode string) (string, error)`

- [ ] **Step 1: Branch**

```bash
cd ../micro-report
git checkout main && git pull --ff-only
git checkout -b feature/report-template-bu-availability
```

- [ ] **Step 2: `model/availability.go`**

```go
package model

import (
	"fmt"
	"strings"
)

// CodeTemplateUnavailable matches REPORT_TEMPLATE_UNAVAILABLE in the gateway's
// error catalog; the gateway maps it to error.code + a localized message, and
// micro-cronjobs treats it as "skip this run".
const CodeTemplateUnavailable = "REPORT_TEMPLATE_UNAVAILABLE"

const (
	ReasonBuDenied              = "bu_denied"
	ReasonBuNotAllowed          = "bu_not_allowed"
	ReasonCalcMethodUnsupported = "calculation_method_unsupported"
)

// TemplateUnavailableError is returned when a template may not be used by a BU.
type TemplateUnavailableError struct {
	TemplateID string
	BuCode     string
	Reason     string
}

func (e *TemplateUnavailableError) Error() string {
	return fmt.Sprintf("template %s is not available for business unit %s: %s", e.TemplateID, e.BuCode, e.Reason)
}

// CalculationMethods returns the template's supported costing methods; empty = all.
func (t *ReportTemplate) CalculationMethods() []string {
	out := []string{}
	for _, m := range strings.Split(t.CalculationMethodsCSV, ",") {
		if m = strings.TrimSpace(m); m != "" {
			out = append(out, m)
		}
	}
	return out
}

// splitCodes turns "t01, T02" into ["T01","T02"].
func splitCodes(s string) []string {
	out := []string{}
	for _, c := range strings.Split(s, ",") {
		if c = strings.ToUpper(strings.TrimSpace(c)); c != "" {
			out = append(out, c)
		}
	}
	return out
}

// ParseBuList normalises allow/deny_business_unit: the platform Edit page
// stores a CSV string, API/seed writers store an array, empty is null or "".
// Any other JSON shape is treated as empty.
func ParseBuList(v any) []string {
	switch t := v.(type) {
	case string:
		return splitCodes(t)
	case []string:
		return splitCodes(strings.Join(t, ","))
	case []any:
		out := []string{}
		for _, x := range t {
			if s, ok := x.(string); ok {
				out = append(out, splitCodes(s)...)
			}
		}
		return out
	default:
		return nil
	}
}

func containsCode(list []string, code string) bool {
	for _, c := range list {
		if c == code {
			return true
		}
	}
	return false
}

// TemplateAvailability decides whether buCode may use t. buCalcMethod "" means
// unknown, which skips the costing rule only.
func TemplateAvailability(t *ReportTemplate, buCode, buCalcMethod string) (bool, string) {
	if t.TemplateType == "form" {
		return true, ""
	}
	bu := strings.ToUpper(strings.TrimSpace(buCode))
	if containsCode(ParseBuList(t.DenyBusinessUnit), bu) {
		return false, ReasonBuDenied
	}
	if allow := ParseBuList(t.AllowBusinessUnit); len(allow) > 0 && !containsCode(allow, bu) {
		return false, ReasonBuNotAllowed
	}
	if methods := t.CalculationMethods(); len(methods) > 0 && buCalcMethod != "" {
		for _, m := range methods {
			if m == buCalcMethod {
				return true, ""
			}
		}
		return false, ReasonCalcMethodUnsupported
	}
	return true, ""
}
```

- [ ] **Step 3: Template field** — in `model/template.go`, after the `DenyBusinessUnit` line:

```go
	// CalculationMethodsCSV is calculation_methods (enum array) flattened by the
	// repo's select; read-only (->) so Create/Save never write the column.
	CalculationMethodsCSV string `gorm:"->;column:calculation_methods_csv" json:"-"`
```

In `db/report_template_repo.go`, `templateSelectCols` becomes:

```go
const templateSelectCols = `
	rt.*,
	COALESCE(array_to_string(rt.calculation_methods, ','), '') AS calculation_methods_csv,
	CONCAT(COALESCE(uc.firstname, ''), ' ', COALESCE(uc.lastname, '')) AS created_by_name,
	CONCAT(COALESCE(uu.firstname, ''), ' ', COALESCE(uu.lastname, '')) AS updated_by_name,
	CONCAT(COALESCE(ud.firstname, ''), ' ', COALESCE(ud.lastname, '')) AS deleted_by_name`
```

Check `grep -n "Select(" db/report_template_repo.go` — every read path (incl. `FindByID`, `FindByName`) must use `templateSelectCols`; if one selects `rt.*` alone, switch it.

- [ ] **Step 4: `db.BuCalculationMethod`** after `BuName`:

```go
// BuCalculationMethod returns the BU's inventory costing method ("" when the BU
// row is missing or the value is null — callers treat that as unknown).
func (d *DB) BuCalculationMethod(ctx context.Context, buCode string) (string, error) {
	var method sql.NullString
	err := d.platform.WithContext(ctx).
		Table(model.PlatformTable("tb_business_unit")).
		Select("calculation_method::text").
		Where("code = ?", buCode).
		Where("deleted_at IS NULL").
		Limit(1).
		Scan(&method).Error
	if err != nil {
		return "", fmt.Errorf("query bu calculation method for %s: %w", buCode, err)
	}
	return method.String, nil
}
```

(`database/sql` is already imported in db.go for `sql.NullString`.)

- [ ] **Step 5: Static checks + tests**

```bash
go build ./... && go vet ./... && go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add model/availability.go model/template.go db/report_template_repo.go db/db.go
git commit -m "feat: template availability rule (allow/deny BU + calculation methods)"
```

---

### Task 3: micro-report — service guard + run handlers

**Files:**
- Modify: `service/report_service.go` (`ViewReport` ~L102, `prepareExternalDataTemplate` ~L282, `BuildData` ~L436; add two methods)
- Create: `controller/availability.go`
- Modify: `controller/report_controller.go` (`generateAsync` ~L144, `viewReport` ~L279, `viewReportWithData` ~L321, `exportPdfWithData` (same shape), `reportData` ~L419)

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `func (s *ReportService) EnsureAvailable(ctx, tmpl *model.ReportTemplate, buCode string) error`, `func (s *ReportService) EnsureAvailableByID(ctx, templateID, buCode string) error`, `func writeUnavailable(c *gin.Context, err error) bool`.

- [ ] **Step 1: Service methods** (after `NewReportService`):

```go
// EnsureAvailable returns *model.TemplateUnavailableError when buCode may not
// use tmpl. The BU method is looked up only when the template is tagged.
func (s *ReportService) EnsureAvailable(ctx context.Context, tmpl *model.ReportTemplate, buCode string) error {
	method := ""
	if len(tmpl.CalculationMethods()) > 0 {
		m, err := s.db.BuCalculationMethod(ctx, buCode)
		if err != nil {
			return fmt.Errorf("check template availability: %w", err)
		}
		method = m
	}
	if ok, reason := model.TemplateAvailability(tmpl, buCode, method); !ok {
		return &model.TemplateUnavailableError{TemplateID: tmpl.ID, BuCode: buCode, Reason: reason}
	}
	return nil
}

// EnsureAvailableByID loads the template then applies EnsureAvailable.
func (s *ReportService) EnsureAvailableByID(ctx context.Context, templateID, buCode string) error {
	tmpl, err := s.templateRepo.FindByID(ctx, templateID)
	if err != nil {
		return fmt.Errorf("find template: %w", err)
	}
	return s.EnsureAvailable(ctx, tmpl, buCode)
}
```

- [ ] **Step 2: Guard after each load**

`ViewReport`, directly after the `FindByID` error check:

```go
	if err := s.EnsureAvailable(ctx, tmpl, buCode); err != nil {
		return "", err
	}
```

`BuildData`, same position: `return nil, err`. `prepareExternalDataTemplate`, after the `FindByName` check: `return nil, "", "", err`.

- [ ] **Step 3: `controller/availability.go`**

```go
package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"<module>/model"
)

// writeUnavailable answers 403 REPORT_TEMPLATE_UNAVAILABLE when err carries a
// TemplateUnavailableError; returns false (writes nothing) otherwise.
func writeUnavailable(c *gin.Context, err error) bool {
	var ue *model.TemplateUnavailableError
	if !errors.As(err, &ue) {
		return false
	}
	c.JSON(http.StatusForbidden, gin.H{
		"error":  ue.Error(),
		"code":   model.CodeTemplateUnavailable,
		"reason": ue.Reason,
	})
	return true
}
```

Replace `<module>` with the module path from `go.mod` (copy the `model` import line from `report_controller.go`).

- [ ] **Step 4: Use it in the handlers** — in `viewReport`, `reportData`, `viewReportWithData`, `exportPdfWithData`, make the first statement inside `if err != nil {` (before logging):

```go
		if writeUnavailable(c, err) {
			return
		}
```

In `generateAsync`, after the bind block and before `format :=`:

```go
	if req.ReportTemplateID != "" {
		if err := h.reportSvc.EnsureAvailableByID(c.Request.Context(), req.ReportTemplateID, buCode); err != nil {
			if writeUnavailable(c, err) {
				return
			}
			status := http.StatusInternalServerError
			if errors.Is(err, gorm.ErrRecordNotFound) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
```

(`errors` and `gorm` are already imported in report_controller.go — confirm.)

- [ ] **Step 5: Static checks + tests**

```bash
go build ./... && go vet ./... && go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add service/report_service.go controller/availability.go controller/report_controller.go
git commit -m "feat: refuse unavailable templates at run time (403 REPORT_TEMPLATE_UNAVAILABLE)"
```

---

### Task 4: micro-report — BU list filter + BU single endpoint

**Files:**
- Modify: `controller/template_controller.go` (handler struct/constructor ~L190-207, `listFlat` L582-642, new `getForBU`)
- Modify: `cmd/server/main.go` (L102)

**Interfaces:**
- Consumes: Task 2 (`BuCalculationMethod`, `TemplateAvailability`), Task 3 (`writeUnavailable`).
- Produces: `GET /api/:buCode/report/templates` (filtered), `GET /api/:buCode/report/templates/:id` (200 / 403 / 404).

- [ ] **Step 1: Give the handler the DB**

```go
type TemplateHTTPHandler struct {
	repo   *db.ReportTemplateRepo
	db     *db.DB
	logger *zap.Logger
}

func NewTemplateHTTPHandler(repo *db.ReportTemplateRepo, database *db.DB, logger *zap.Logger) *TemplateHTTPHandler {
	return &TemplateHTTPHandler{repo: repo, db: database, logger: logger}
}
```

(Match the existing field names if they differ.) `main.go` L102: `controller.NewTemplateHTTPHandler(templateRepo, database, logger)`. Register: `r.GET("/api/:buCode/report/templates/:id", h.getForBU)` next to the listFlat route.

- [ ] **Step 2: `listFlat` filters, then paginates**

Replace the block from `templates, total, err := h.repo.FindAllPaginated(...)` through the error check with:

```go
	buCode := c.Param("buCode")
	buMethod, err := h.db.BuCalculationMethod(c.Request.Context(), buCode)
	if err != nil {
		h.logger.Error("bu calculation method failed", zap.Error(err), zap.String("bu_code", buCode))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// โหลดทั้งหมดก่อนแล้วค่อยกรอง+แบ่งหน้าเอง — กรองหลัง LIMIT จะทำหน้าว่าง/total ผิด
	page, perPage := pq.Page, pq.PerPage
	pq.Page, pq.PerPage = 1, -1
	all, _, err := h.repo.FindAllPaginated(c.Request.Context(), pq)
	if err != nil {
		h.logger.Error("list templates failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	visible := make([]model.ReportTemplate, 0, len(all))
	for i := range all {
		if ok, _ := model.TemplateAvailability(&all[i], buCode, buMethod); ok {
			visible = append(visible, all[i])
		}
	}
	total := len(visible)
	templates := visible
	if perPage > 0 {
		if page < 1 {
			page = 1
		}
		start := (page - 1) * perPage
		if start > total {
			start = total
		}
		end := start + perPage
		if end > total {
			end = total
		}
		templates = visible[start:end]
	}
```

and change the final meta to `pagination.BuildMeta(total, page, perPage, len(items))`. Verify in `pkg/pagination` that `PerPage = -1` makes `ApplyToGorm` skip both LIMIT and OFFSET; if OFFSET is still applied from `Page`, setting `Page = 1` above already neutralises it.

- [ ] **Step 3: `getForBU`**

```go
// @Summary      Get one report template for a business unit
// @Tags         Report Templates
// @Produce      json
// @Param        buCode  path  string  true  "Business unit code"
// @Param        id      path  string  true  "Template ID"
// @Success      200  {object}  model.ReportTemplate
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /api/{buCode}/report/templates/{id} [get]
func (h *TemplateHTTPHandler) getForBU(c *gin.Context) {
	buCode := c.Param("buCode")
	tmpl, err := h.repo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil || tmpl.DeletedAt != nil || !tmpl.IsActive {
		if err == nil || errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	method := ""
	if len(tmpl.CalculationMethods()) > 0 {
		if method, err = h.db.BuCalculationMethod(c.Request.Context(), buCode); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if ok, reason := model.TemplateAvailability(tmpl, buCode, method); !ok {
		writeUnavailable(c, &model.TemplateUnavailableError{TemplateID: tmpl.ID, BuCode: buCode, Reason: reason})
		return
	}
	c.JSON(http.StatusOK, tmpl)
}
```

- [ ] **Step 4: Static checks + tests + swagger**

```bash
go build ./... && go vet ./... && go test ./...
```

If the repo regenerates swagger (`docs/swagger`, `swag init` in Makefile), run it.

- [ ] **Step 5: Commit, push, PR** (only after Task 0's table was shown to the user)

```bash
git add controller/template_controller.go cmd/server/main.go docs/swagger
git commit -m "feat: BU template list filtered by availability + BU single-template endpoint"
git push -u origin feature/report-template-bu-availability
gh pr create --base main --title "feat: enforce report template BU availability (phase B)" --body "allow/deny BU + calculation_methods enforced on /api/:bu/report/templates, new /api/:bu/report/templates/:id, and run-time 403 REPORT_TEMPLATE_UNAVAILABLE (viewer, data, *-with-data, generate-async, async worker). Global /api/report-templates unchanged. Spec: carmen-platform docs/superpowers/specs/2026-10-08-report-template-bu-availability-design.md"
```

---

### Task 5: micro-cronjobs — skip on REPORT_TEMPLATE_UNAVAILABLE

**Files:**
- Create: `internal/model/skipped.go`
- Modify: `internal/executor/report.go` (`mintViewerURL` non-2xx block ~L151-210, `executeFile` non-2xx block ~L379-420)
- Modify: `internal/scheduler/scheduler.go` (L233 block, L286 retry loop, L324 ExecuteNow)

**Interfaces:**
- Produces: `type model.SkippedError struct{ Reason string }`, `func model.SkippedFromResponse(status int, body []byte) error`.

- [ ] **Step 1: Branch + `internal/model/skipped.go`**

```bash
cd ../micro-cronjobs && git checkout main && git pull --ff-only && git checkout -b feature/report-template-bu-availability
```

```go
package model

import (
	"encoding/json"
	"net/http"
)

// SkippedError marks a run that was deliberately not performed (e.g. the report
// template is not available for the BU). The scheduler records it but does not
// retry it.
type SkippedError struct{ Reason string }

func (e *SkippedError) Error() string { return "skipped: " + e.Reason }

// SkippedFromResponse returns *SkippedError when micro-report refused with
// 403 REPORT_TEMPLATE_UNAVAILABLE, nil otherwise.
func SkippedFromResponse(status int, body []byte) error {
	if status != http.StatusForbidden {
		return nil
	}
	var b struct {
		Code   string `json:"code"`
		Reason string `json:"reason"`
	}
	if json.Unmarshal(body, &b) != nil || b.Code != "REPORT_TEMPLATE_UNAVAILABLE" {
		return nil
	}
	if b.Reason == "" {
		b.Reason = "report template unavailable"
	}
	return &SkippedError{Reason: b.Reason}
}
```

- [ ] **Step 2: Executor** — in both non-2xx blocks, right after `errBody, _ := io.ReadAll(resp.Body)`:

`mintViewerURL`:
```go
		if skip := model.SkippedFromResponse(resp.StatusCode, errBody); skip != nil {
			return "", skip
		}
```
`executeFile`:
```go
		if skip := model.SkippedFromResponse(resp.StatusCode, errBody); skip != nil {
			return skip
		}
```
Confirm `executeViewerURL` returns the `mintViewerURL` error before `dispatchNotification` (so no notification goes out) and does not re-wrap with `%v` (if it wraps, use `%w`).

- [ ] **Step 3: Scheduler** — L233 block becomes:

```go
		var lastErr *string
		err := s.executor.Execute(ctx, dj)
		if err != nil {
			errStr := err.Error()
			lastErr = &errStr
			var skipped *model.SkippedError
			if errors.As(err, &skipped) {
				// ตั้งใจข้าม (template ใช้กับ BU นี้ไม่ได้) — ไม่ retry ไม่นับเป็นความล้มเหลว
				s.logger.Info("job skipped", zap.String("id", jobID), zap.String("reason", skipped.Reason))
			} else {
				s.logger.Error("job failed", zap.String("id", jobID), zap.Error(err))
				if maxRetries > 0 {
					s.retryJob(ctx, dj, maxRetries)
				}
			}
		}
```

In `retryJob`'s loop, right after the `Execute` error check opens, stop retrying on a skip:

```go
		if err := s.executor.Execute(ctx, job); err != nil {
			errStr := err.Error()
			var skipped *model.SkippedError
			if errors.As(err, &skipped) {
				_ = s.repo.UpdateLastRun(ctx, job.ID, time.Now(), s.nextRun(job.CronExpression, time.Now()), &errStr)
				return
			}
			// ...existing Warn + UpdateLastRun unchanged
```

`ExecuteNow` (L324) needs no change (it records `lastErr` and returns it; the message starts with `skipped:`). Add `errors` and the model import if missing.

- [ ] **Step 4: Checks + commit + push + PR**

```bash
go build ./... && go vet ./... && go test ./...
git add internal && git commit -m "feat(report): skip runs refused with REPORT_TEMPLATE_UNAVAILABLE (no retry)"
git push -u origin feature/report-template-bu-availability
gh pr create --base main --title "feat(report): skip unavailable report templates" --body "micro-report now answers 403 REPORT_TEMPLATE_UNAVAILABLE when a template is not available for the BU; the executor turns it into SkippedError, the scheduler records 'skipped: <reason>' and does not retry. Harmless before micro-report ships."
```

---

### Task 6: Gateway — code passthrough, BU template calls, schedules

**Files:**
- Modify: `apps/backend-gateway/src/application/reports/reports.service.ts` (`request()` ~L210-217, `listTemplates` ~L365, `getTemplate` ~L398, `createSchedule` ~L593, `listSchedules` ~L688, `ScheduleResponse` ~L127)
- Modify: `apps/backend-gateway/src/application/reports/reports.controller.ts` (`listTemplates` ~L263, `getTemplate` ~L320)
- Modify: `apps/backend-gateway/src/application/reports/swagger/response.ts` (`ScheduleResponseDto` ~L189)
- Modify (existing tests): `reports.service.spec.ts` L152/163/174, `reports.controller.spec.ts` L188/207

**Interfaces:**
- Consumes: Task 1 catalog entry; Task 4 endpoints.
- Produces: `listTemplates(bu_code: string, params)`, `getTemplate(bu_code: string, id: string)`, `ScheduleResponse.template_available?: boolean`, `ScheduleResponse.unavailable_reason?: string`.

- [ ] **Step 1: Back on the backend branch** — `cd ../carmen-turborepo-backend-v2 && git checkout feature/report-template-bu-availability`.

- [ ] **Step 2: `request()` forwards `code`** — replace the `if (!response.ok) { ... }` block:

```ts
    if (!response.ok) {
      const body = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
        error?: unknown;
        message?: string;
        code?: unknown;
        reason?: unknown;
      };
      const text =
        (typeof body.error === 'string' ? body.error : undefined) ?? body.message ?? 'Request failed';
      // มี code (เช่น REPORT_TEMPLATE_UNAVAILABLE) → ส่งเป็น object ให้ exception filter
      // แปลงเป็น error.code ของ catalog + ข้อความตามภาษา; ไม่มี code → พฤติกรรมเดิมทุกอย่าง
      if (typeof body.code === 'string') {
        throw new HttpException(
          {
            error: text,
            code: body.code,
            ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
          },
          response.status,
        );
      }
      throw new HttpException(text, response.status);
    }
```

- [ ] **Step 3: BU template calls**

```ts
  async listTemplates(
    bu_code: string,
    params: { report_group?: string; page?: number; perpage?: number; search?: string; sort?: string; filter?: string } = {},
  ): Promise<ListReportTemplatesResponse> {
    this.logger.debug({ function: 'listTemplates', bu_code, ...params }, ReportsService.name);
    // ...querystring building unchanged...
    return this.reportHttp<ListReportTemplatesResponse>(
      `/api/${encodeURIComponent(bu_code)}/report/templates${query}`,
    );
  }

  async getTemplate(bu_code: string, id: string): Promise<ReportTemplateResponse> {
    this.logger.debug({ function: 'getTemplate', bu_code, id }, ReportsService.name);
    return this.reportHttp<ReportTemplateResponse>(
      `/api/${encodeURIComponent(bu_code)}/report/templates/${encodeURIComponent(id)}`,
    );
  }
```

Controller: add `@Param('bu_code') bu_code: string` to `listTemplates` and `getTemplate` (first param) and pass it (`this.reportsService.listTemplates(bu_code, {...})`, `this.reportsService.getTemplate(bu_code, id)`). Update doc comments. Note `listFlat` rows lack `created_by_name`/`updated_by_name` — the inventory FE does not read them (verified); leave `ReportTemplateResponse` fields optional as they are.

- [ ] **Step 4: `createSchedule` checks first** — right after the debug log:

```ts
    // template ที่ BU นี้ใช้ไม่ได้ → 403 REPORT_TEMPLATE_UNAVAILABLE จาก micro-report ส่งต่อตรง ๆ
    if (report_template_id) {
      await this.getTemplate(bu_code, report_template_id);
    }
```

- [ ] **Step 5: `listSchedules` annotates availability**

`ScheduleResponse` gains:
```ts
  /** false = the template is not available for this BU; runs are skipped */
  template_available?: boolean;
  unavailable_reason?: string;
```

Add a helper below `listSchedules`:
```ts
  /** ids ของ template ที่ BU นี้ใช้ได้; null เมื่อถามไม่ได้ (ไม่ทำให้หน้ารายการพัง) */
  private async availableTemplateIds(bu_code: string): Promise<Set<string> | null> {
    try {
      const res = await this.reportHttp<{ data?: Array<{ id: string }> }>(
        `/api/${encodeURIComponent(bu_code)}/report/templates?perpage=-1&include_print=true`,
      );
      return new Set((res.data ?? []).map((t) => t.id));
    } catch (err) {
      this.logger.warn({ function: 'availableTemplateIds', bu_code, err: String(err) }, ReportsService.name);
      return null;
    }
  }
```

and end `listSchedules` with:
```ts
    const available = schedules.some((s) => s.report_template_id)
      ? await this.availableTemplateIds(bu_code)
      : null;
    return {
      schedules: available
        ? schedules.map((s) =>
            s.report_template_id && !available.has(s.report_template_id)
              ? { ...s, template_available: false }
              : { ...s, template_available: true },
          )
        : schedules,
    };
```

(The list endpoint does not say *why* a template is hidden; `unavailable_reason` stays unset here and is reserved for a later per-id lookup — the FE shows a generic message.) Mirror both fields on `ScheduleResponseDto` with `@ApiPropertyOptional`.

- [ ] **Step 6: Fix the existing specs that pin old URLs/signatures**

- `reports.service.spec.ts` L152/L163: expect `${REPORT_BASE}/api/<bu>/report/templates?` / `.../report/templates`, calling `listTemplates('HQ-001', ...)`.
- L174: `getTemplate('HQ-001', 't 1')` → `/api/HQ-001/report/templates/t%201`.
- `reports.controller.spec.ts` L178-188: call with a `bu_code` and expect `listTemplates('BU-001', {...})`; L207: `getTemplate('BU-001', 'tpl-1')`.
- If a spec asserts the exact `HttpException` thrown by `request()` for an error body, it must still pass unchanged (Review Focus 4).

- [ ] **Step 7: Checks**

```bash
cd apps/backend-gateway && bun run check-types && bunx eslint src/application/reports && bunx jest src/application/reports --runInBand --forceExit; cd ../..
SKIP_TESTS=1 bun run gates
```

Expected: green except the gates already red on `main` (prettier, audit:dependencies, fe-license-fixture) — note them in the PR.

- [ ] **Step 8: Commit, push, PR** (after micro-report is on DEV)

```bash
git add packages/error-catalog apps/backend-gateway/src/application/reports
git commit -m "feat(reports): BU-scoped template calls, forward error codes, flag unavailable schedules"
git push -u origin feature/report-template-bu-availability
gh pr create --base main --title "feat(reports): enforce report template availability per BU (phase B)" --body "Needs micro-report PR deployed first (new /api/:bu/report/templates/:id). Adds REPORT_TEMPLATE_UNAVAILABLE (403) to the error catalog; request() forwards upstream code/reason so error.code reaches the FE; listTemplates/getTemplate use the BU endpoints; createSchedule refuses unavailable templates; listSchedules sets template_available."
```

---

### Task 7: Inventory FE — schedule badge + viewer message

**Files:**
- Modify: `types/report-schedule.ts` (`ReportSchedule`)
- Modify: `routes/report/schedules/use-schedule-table.tsx` (status cell ~L101-113)
- Modify: `routes/report/list/report-component.tsx` (catch ~L166-173)
- Modify: `messages/en.json`, `messages/th.json` (`report`, `reportSchedule`)

**Interfaces:**
- Consumes: gateway `template_available`; `ApiError.appCode`.

- [ ] **Step 1: Branch** — `cd ../carmen-inventory-frontend-react && git stash list | head -1; git checkout main && git pull --ff-only && git checkout -b feature/report-template-bu-availability` (the working tree has an unrelated modified `package.json` — leave it unstaged; never commit it).

- [ ] **Step 2: Type** — `ReportSchedule` gains:
```ts
  /** false = report นี้ใช้กับ BU นี้ไม่ได้แล้ว รอบรันจะถูกข้าม */
  template_available?: boolean;
```

- [ ] **Step 3: i18n** — `messages/en.json`:
  - `reportSchedule.templateUnavailable`: `"Report unavailable"`
  - `reportSchedule.templateUnavailableHint`: `"This report is no longer available for this business unit, so scheduled runs are skipped. Delete the schedule or ask an admin to change the report's settings."`
  - `report.unavailableForBu`: `"This report is not available for this business unit"`

  `messages/th.json`:
  - `reportSchedule.templateUnavailable`: `"รายงานใช้ไม่ได้"`
  - `reportSchedule.templateUnavailableHint`: `"รายงานนี้ใช้กับหน่วยธุรกิจนี้ไม่ได้แล้ว รอบที่ตั้งเวลาไว้จะถูกข้าม ลบกำหนดการนี้หรือติดต่อผู้ดูแลให้ปรับการตั้งค่ารายงาน"`
  - `report.unavailableForBu`: `"รายงานนี้ใช้กับหน่วยธุรกิจนี้ไม่ได้"`

- [ ] **Step 4: Status cell shows the badge**
```tsx
      cell: ({ getValue, row }) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={getValue<boolean>() ? "default" : "secondary"} size="sm">
            {getValue<boolean>() ? ts("active") : ts("inactive")}
          </Badge>
          {row.original.template_available === false && (
            <Badge variant="warning" size="sm" title={t("templateUnavailableHint")}>
              {t("templateUnavailable")}
            </Badge>
          )}
        </div>
      ),
```
Widen `size` from 90 to 160.

- [ ] **Step 5: Viewer message** — in `report-component.tsx`:
```tsx
    } catch (err) {
      viewerWindow?.close();
      // ... existing comment kept ...
      toast.error(
        err instanceof ApiError && err.appCode === "REPORT_TEMPLATE_UNAVAILABLE"
          ? t("unavailableForBu")
          : t("runError"),
        { id: toastId },
      );
    }
```
Import `ApiError` from `@/lib/api-error` if not imported.

- [ ] **Step 6: Checks + commit + push + PR** (after the gateway is on DEV)
```bash
bun run typecheck && bun run lint && bun run test:run
git add types/report-schedule.ts routes/report/schedules/use-schedule-table.tsx routes/report/list/report-component.tsx messages/en.json messages/th.json
git commit -m "feat(report): flag schedules whose report is unavailable + clear viewer message"
git push -u origin feature/report-template-bu-availability
gh pr create --base main --title "feat(report): unavailable report templates (phase B)" --body "Badge on schedules with template_available=false; viewer shows a specific message for REPORT_TEMPLATE_UNAVAILABLE. Tolerates a gateway without the new field."
```

---

### Task 8: Platform copy — allow/deny are now enforced

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (`pages.reportTemplates.allowPlaceholder`, `denyPlaceholder`, `calculationMethodHelp`)

- [ ] **Step 1: Copy** (this repo, branch `feature/report-template-bu-availability`)
  - en `allowPlaceholder`: `'Type BU code + Enter (blank = all; enforced for BU users)'`
  - en `denyPlaceholder`: `'Type BU code + Enter (blank = none; enforced for BU users)'`
  - en `calculationMethodHelp`: `'Leave all unchecked if the report works with every costing method. Business units using an unchecked method will not see or run it.'`
  - th `allowPlaceholder`: `'พิมพ์รหัส BU แล้วกด Enter (ว่าง = ทุก BU · มีผลกับผู้ใช้ BU จริง)'`
  - th `denyPlaceholder`: `'พิมพ์รหัส BU แล้วกด Enter (ว่าง = ไม่มี · มีผลกับผู้ใช้ BU จริง)'`
  - th `calculationMethodHelp`: `'ไม่ต้องเลือกเลย ถ้ารายงานใช้ได้กับทุกวิธีคำนวณต้นทุน · BU ที่ใช้วิธีที่ไม่ได้เลือกจะมองไม่เห็นและรันรายงานนี้ไม่ได้'`

- [ ] **Step 2: Checks + commit**
```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "docs(report-templates): allow/deny and calculation method help say they are enforced"
```

---

### Task 9: Deploy + manual verification on DEV

No code. In the order of the Global Constraints. After each backend step confirm it is live (swagger shows the new route / behaviour), not just that the workflow ran — Actions on backend-v2 are billing-blocked, so its deploy may be manual.

- [ ] **Step 1:** micro-report on DEV → `GET /api/<FIFO_BU>/report/templates` via the inventory app still lists everything (nothing tagged yet).
- [ ] **Step 2:** In the platform, tag a list template `Average` only. In the inventory app on a FIFO BU: report gone from the list; on an AVG BU: present and runs. Through devtools, POST the viewer for the FIFO BU with that template id → 403, toast "This report is not available for this business unit".
- [ ] **Step 3:** Deny a BU code on another template → gone for that BU only. Allow-list a different BU → gone for every other BU. Revert both.
- [ ] **Step 4:** Create a schedule on an AVG BU for the tagged template, then switch the tag to `FIFO` only. Trigger the job (ExecuteNow / wait) → `last_error` starts with `skipped:`, no retry lines in logs, no notification. Schedule list shows the "Report unavailable" badge. Remove the tag → next run succeeds, badge gone.
- [ ] **Step 5:** Revert every tag/list changed during verification.
