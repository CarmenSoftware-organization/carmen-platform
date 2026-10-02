# Page Template
<!-- Copy this file for every new screen. Replace all {PLACEHOLDERS}. -->

---
**Doc ID:** {PREFIX}PAGE-{NNN}
**Title:** {Screen / Page Name}
**Domain:** {Domain name}
**Route:** {/path/to/screen}
**Status:** Draft | Review | Stable | Deprecated
**Created:** {YYYY-MM-DD}
**Last Updated:** {YYYY-MM-DD}
**Author:** {Name}
**Parent Flow:** {PREFIX}FLOW-{NNN} — {Flow Name}
---

## {N}.{N} {Screen Name}

> Brief one-sentence description of what this screen is for and who uses it.

---

### {N}.{N}.1 Purpose

Describe the intent of this screen. What task does the user complete here?

---

### {N}.{N}.2 Screen Overview

**Access Path:**
State how the user reaches this screen. Be explicit:
- "From BL-PAGE-001 (PR List) → click **New**"
- "Direct URL: `/procurement/purchase-requests/:id`"

**Permissions Required:**

| Role | Permission | Scope | Notes |
|------|-----------|-------|-------|
| {Role} | `{permission.key}` | Own / Department / All | {condition or remark} |

---

### {N}.{N}.3 Screen Layout

```
[Action Buttons: Save | Submit | Print | Cancel]
─────────────────────────────────────────────────
[{N}.{N}.4 Header Information]
─────────────────────────────────────────────────
[{N}.{N}.5 Summary Information]
─────────────────────────────────────────────────
[{N}.{N}.6 Detail / Grid Information]
  [Add Item Button]  [Bulk Actions]
─────────────────────────────────────────────────
[{N}.{N}.9 Workflow History (if applicable)]
```

---

### {N}.{N}.4 Header Information

| Field | Mandatory | Description | Business Logic / Remark |
|-------|-----------|-------------|--------------------------|
| {Field Name} | Y / N | {What the field represents} | {Validation, defaults, read-only conditions} |

**Read-only fields:** List fields that are always read-only and why.

---

### {N}.{N}.5 Summary Information

> Automatically calculated from line item data. All fields are read-only.

| Field | Description | Calculation Formula |
|-------|-------------|---------------------|
| Sub-Total | Total before discounts and tax | Σ (Qty × Unit Price) for all line items |
| Discount | Total discount amount | Σ of per-line discount amounts |
| Tax (VAT) | Tax amount | Per tax profile; can be overridden per line |
| Total | Final amount | Sub-Total − Discount + Tax |
| Base Currency Total | Total in BU base currency | Total × exchange_rate |

---

### {N}.{N}.6 Detail / Grid Information

| Column | Mandatory | Description | Business Logic / Remark |
|--------|-----------|-------------|--------------------------|
| # | — | Row sequence number | Auto-incremented |
| {Column} | Y / N | {Description} | {Remark} |

**Grid Actions:**

| Button | Description | Business Logic |
|--------|-------------|----------------|
| Add Item | Opens {PREFIX}MODAL-{NNN} (Item Search) | Available when Status = Draft |
| Delete Row (×) | Removes selected row | Confirmation: "Remove this item?" |
| Copy Row | Duplicates a row | New row inserted below |
| Bulk Update {Field} | Sets {Field} for all rows at once | Date picker; applies to all rows |

---

### {N}.{N}.7 Action Buttons

| Button | Color / Type | Description | Business Logic / Validation |
|--------|-------------|-------------|------------------------------|
| Save | Primary (Green) | Saves as Draft | Validates mandatory fields. On success → {PREFIX}PAGE-{NNN}. |
| Submit | Primary (Blue) | Saves and submits | Same as Save + at least 1 line item. Status → `in_progress`. |
| Print | Secondary | Opens browser print dialog | — |
| Cancel | Secondary (White) | Discards changes | Confirmation: "Are you sure?" → {PREFIX}PAGE-{NNN}. |

---

### {N}.{N}.8 Document Status

| Status | Badge Colour | Description |
|--------|-------------|-------------|
| draft | White | Created but not submitted |
| in_progress | Yellow | In approval workflow |
| approved | Green | All stages completed |
| done / done_in_po | Green | Converted to downstream document |
| complete | Green | Fully processed and closed |
| cancel | Red | Cancelled |
| void | Gray | Voided after submission |

**Status Transition Rules:**

| From Status | Action | To Status | Who Can Perform |
|-------------|--------|-----------|-----------------|
| draft | Submit | in_progress | Creator |
| in_progress | Final Approve | approved | Final Approver |
| in_progress | Reject | rejected | Any Approver |

---

### {N}.{N}.9 Workflow History (if applicable)

| Column | Description |
|--------|-------------|
| Date / Time | Timestamp of action |
| User | Name of actor |
| Action | create / approve / reject / sendback / complete / info |
| Current Stage | Stage at time of action |
| Next Stage | Stage after action |
| Reason | Rejection or send-back reason (if applicable) |

Read-only. Cannot be modified.

---

### {N}.{N}.10 Modals Triggered from This Page

| Modal ID | Modal Name | Trigger |
|----------|-----------|---------|
| {PREFIX}MODAL-{NNN} | {Modal Name} | {Click "Add Item" button} |

---

### {N}.{N}.11 Navigation

| Action | Destination |
|--------|------------|
| Save (success) | → {PREFIX}PAGE-{NNN} ({Description}) |
| Cancel | → {PREFIX}PAGE-{NNN} ({Description}) |
| Back | → {PREFIX}PAGE-{NNN} ({Description}) |

---

### {N}.{N}.12 Pagination (for list screens)

- Rows per page: {N} to {N} items
- Navigation: First, Previous, Next, Last
- Default sort: {field}, {direction}

---

### {N}.{N}.13 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/{resource}` | Load screen data |
| POST | `/api/{resource}` | Create |
| PATCH | `/api/{resource}/{id}` | Update |

**Query parameter syntax (for list endpoints):**
- Single filter: `filter=status:draft`
- Multi-value: `filter=status|in:draft,in_progress`
- Date range: `filter=date|date:2025-01-01,2025-12-31`
- Numeric range: `filter=amount|number:1000,50000`

---

### {N}.{N}.14 Edge Cases & Error States

| # | Scenario | System Behaviour |
|---|----------|-----------------|
| 1 | Mandatory field left blank | Inline error below field. Form does not submit. |
| 2 | Session expired mid-edit | Redirects to login. Unsaved data lost. |
| 3 | No results / empty state | Message: "No data" |
| 4 | API error on load | Error message displayed; retry option shown. |
| 5 | Concurrent edit by another user | Stale state warning; refresh required. |
| 6 | User lacks permission | Page not accessible from navigation; access denied. |

---

### {N}.{N}.15 Differences: Create vs. Edit Mode (if applicable)

| Behaviour | Create Mode | Edit Mode |
|-----------|------------|-----------|
| Doc Number | Blank until first save | Pre-filled, read-only |
| All fields | Blank / defaults | Pre-populated |
| Availability | Always | Status = Draft only |

---

### {N}.{N}.16 Related Documents

| Doc ID | Title | Relationship |
|--------|-------|-------------|
| {PREFIX}FLOW-{NNN} | {Flow name} | Parent flow |
| {PREFIX}MODAL-{NNN} | {Modal name} | Opened from this page |
| {PREFIX}PAGE-{NNN} | {Page name} | Navigated to from this page |
