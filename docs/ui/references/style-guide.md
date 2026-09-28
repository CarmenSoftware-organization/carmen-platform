# Documentation Style Guide

**Applies to:** All UI documentation in this project.

---

## 1. Document Types

| Type | When to Use | Template |
|------|-------------|----------|
| **Feature Module** | End-to-end feature (list → create → approve → ancillary) | `feature-module-template.md` |
| **Page** | Single screen or full-page view | `page-template.md` |
| **Modal** | Popup, dialog, or side-panel | `modal-template.md` |
| **Flow** | Multi-step workflow connecting pages and modals | `flow-template.md` |

Start new features with the Feature Module template. Create individual Page and Modal
docs for screens needing deep-dive detail.

---

## 2. Section Numbering

Hierarchical decimal notation. Top-level number = module number from INDEX.

```
1.          Feature Module
1.1         Purpose
1.2         List Screen
1.2.1       Column Definitions
1.3         Create Form
1.3.1       Header Info
1.3.1.1     Item Search Modal
1.3.1.1.1   Trigger
```

**Rules:**
- Maximum 5 levels deep
- Never skip numbers — use "N/A" for inapplicable sections
- Cross-reference by Doc ID: "See BL-FLOW-002 for the HOD approval workflow"

---

## 3. Field Documentation Tables

### Standard Field Table (forms)

| Field | Mandatory | Description | Business Logic / Remark |
|-------|-----------|-------------|--------------------------|

### Permission-Based Field Table (approval views)

| Field | Edit Permission | Description | Remark |
|-------|----------------|-------------|--------|

- **Edit Permission:** `View Only`, `Editable`, or `Editable ({role} only)`

### Grid Column Table

| Column | Mandatory | Description | Business Logic / Remark |
|--------|-----------|-------------|--------------------------|

---

## 4. Writing Rules for Business Logic

- **Validation:** Write as constraints: `"Cannot be blank"`, `"Must be > 0"`, `"Must be ≤ Requested Qty"`
- **Calculations:** Plain text: `"Qty × Unit Price × (1 − Discount %)"`. No LaTeX.
- **Conditionals:** `"If [condition], then [behaviour]"` — e.g., `"If FOC checked, price = 0"`
- **System messages:** Quote exactly as the user sees them: `"Warning — Zero quantities are not allowed."`
- **Defaults:** `"Default: today's date"`, `"Default: logged-in user's department"`
- **Cross-references:** Always use Doc IDs: `"See BL-PAGE-003 for the detail view"`

---

## 5. Action Button Tables

Every button on every screen must be documented:

| Button | Color / Type | Description | Business Logic / Validation |
|--------|-------------|-------------|------------------------------|

- **Color / Type options:** `Primary (Green)`, `Primary (Blue)`, `Secondary (White)`, `Danger (Red)`, `Link`
- **Business Logic:** What validates, what happens on success, what happens on failure, where user is redirected

---

## 6. Status Values

Use consistent casing throughout the project. Pick ONE approach:

**Option A — snake_case (recommended for API-aligned docs):**
`draft`, `in_progress`, `approved`, `rejected`, `cancel`, `void`, `complete`

**Option B — Title Case (for business-facing docs):**
`Draft`, `In Progress`, `Approved`, `Rejected`, `Cancelled`, `Voided`, `Complete`

Document the choice in `project-config.md` and follow it everywhere.

Every doc with a status field must include:
1. A status table with badge colours
2. A status transition table

---

## 7. Navigation Documentation

Be explicit. Never write "navigates to the next screen." Instead:

- "Redirects to BL-PAGE-003 (PR Detail)"
- "Returns to BL-PAGE-001 (PR List)"
- "Opens BL-MODAL-002 (Vendor Search)"

---

## 8. Edge Cases — Minimum Required

Every Page and Modal must document **at least 6** edge cases:

1. Mandatory field left blank
2. Session expired mid-edit
3. Zero-result search / empty state
4. Network / API error
5. Concurrent edit / stale data detection
6. Permission-based visibility differences

Additional recommended scenarios:
- Duplicate record handling
- Browser back button behaviour
- Double-click / double-submit prevention
- Offline / slow network states

---

## 9. API Endpoint Tables

Mark every API call. Write `TBD` if backend is not designed — never skip the section.

| Method | Endpoint | Purpose |
|--------|----------|---------|

**Rules:**
- If two rows share the same method + path, explain how they differ (e.g., different
  `state_role` in the payload)
- If a state-changing operation uses GET (non-standard), add a remark explaining why
- Include query parameter syntax examples for list endpoints

---

## 10. Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Doc IDs | `{PREFIX}{TYPE}-{NNN}` | `BL-PAGE-001`, `BL-MODAL-003` |
| File names | `{PREFIX}{TYPE}-{NNN}-{slug}.md` | `BL-PAGE-001-pr-list.md` |
| Slugs | lowercase, hyphen-separated | `purchase-request-list` |
| Headings | Title Case for section titles | "Header Information" |
| Field names | As they appear in the UI | "PR Date", "Delivery Point" |
| Status values | Consistent per project choice | `draft` or `Draft` (not both) |

---

## 11. Document Lifecycle

```
Draft → Review → Stable → Deprecated
```

- **Draft:** New, not verified against live app
- **Review:** Ready for team review before dev handoff
- **Stable:** Implemented and matches production
- **Deprecated:** Feature removed or replaced

Always update `Last Updated` when changing content.

---

## 12. Cross-Referencing Rules

- Page opens Modal → Page lists Modal in "Modals Triggered"; Modal lists Page as "Parent"
- Page is in Flow → Flow lists Page in "Constituent Documents"
- Modal is in Flow → Flow lists Modal in "Constituent Documents"
- Page is used by multiple Flows → list ALL flows in "Related Documents"
- INDEX.md updated every time a doc is created or status changes

---

## 13. Shared Pages (Multi-Role)

When a page is used by multiple roles (e.g., the same approval screen for HOD,
Purchase, FC, GM, Owner):

- Either create one page doc that explicitly covers all roles with a permissions table
- Or note in the page title that it's shared: "PR Full Page View (All Approvers)"
- List ALL parent flows in Related Documents, not just the first one

---

## 14. Workflow-Specific Patterns

### Test Credentials
Include test user credentials in flow document frontmatter when a test env exists.

### Workflow History
Any approval flow must document the history log format (datetime, user, action,
current_stage, next_stage, reason).

### Button State Matrices
For approval workflows, document button visibility as a matrix showing which buttons
appear for each combination of line-item states — not just prose descriptions.

### Ancillary Functions
If the feature supports attachments, comments, or activity logging, document them.
If it doesn't, write "N/A" so it's clear they were considered.
