# Feature Module Template
<!--
  Use this for documenting a COMPLETE feature module end-to-end.
  This is the top-level document — it ties together all Pages, Modals, and Flows
  for a single feature. Individual screens get their own Page/Modal docs;
  this template provides the overview and connects them.
-->

---
**Module Number:** {N}
**Module Name:** {Feature Module Name}
**System / Product:** {Product name}
**Version:** {v1.0}
**Status:** Draft | Review | Stable | Deprecated
**Created:** {YYYY-MM-DD}
**Last Updated:** {YYYY-MM-DD}
**Author:** {Name}
---

## {N}. {Feature Module Name}

---

### {N}.1 Purpose

Describe the purpose and scope of this feature module.

**Key capabilities:**
- {Capability 1}
- {Capability 2}

**Approval support:** Up to {N} approval steps.
**Approval conditions:** {e.g., "Amount-based: < 50K = 3 steps; ≥ 50K = 6 steps"}

**Workflow stages:**

| Stage | Role | Action |
|-------|------|--------|
| 1 | {Role} | {Action — e.g., Creates document} |
| 2 | {Role} | {Action — e.g., Approves quantities} |

---

### {N}.2 {Module Name} List Screen

> The main management screen.

**Doc reference:** {PREFIX}PAGE-{NNN} — {List Page Name}

#### {N}.2.1 Column Definitions

| Column | Description | Sortable | Remarks |
|--------|-------------|----------|---------|
| {Column} | {Description} | Yes / No | {Format, calculation, etc.} |

#### {N}.2.2 Search & Filter

| Filter | Type | Description | Default |
|--------|------|-------------|---------|
| {Filter} | {Type} | {Description} | {Default} |

#### {N}.2.3 Document Status

| Status | Badge Colour | Description |
|--------|-------------|-------------|
| draft | White | Not yet submitted |
| in_progress | Yellow | In approval workflow |
| approved | Green | All stages completed |

#### {N}.2.4 List Screen Actions

| Button / Action | Description | Availability |
|----------------|-------------|-------------|
| New | Opens creation form | Always |
| Edit | Opens in edit mode | Status = Draft only |
| View | Opens read-only detail | All statuses |
| Delete | Deletes document | Status = Draft only |
| Export | Exports list to PDF | Always |
| Print | Browser print dialog | Always |

---

### {N}.3 Document Creation

**Doc reference:** {PREFIX}PAGE-{NNN} — {Create Page Name}

**Creation methods:**

| Method | Description | Use Case |
|--------|-------------|---------|
| Manual | Fill all fields | Ad-hoc requests |
| From Template | Pre-populated from saved template | Recurring orders |
| From Standard | From pre-configured standard | Routine purchases |

#### {N}.3.1 Document Structure

##### {N}.3.1.1 Header Information

| Field | Mandatory | Description | Business Logic / Remark |
|-------|-----------|-------------|--------------------------|
| {Field} | Y / N | {Description} | {Defaults, validation, read-only conditions} |

##### {N}.3.1.2 Summary Information

| Field | Description | Calculation |
|-------|-------------|-------------|
| Sub-Total | Before discounts and tax | Σ (Qty × Unit Price) |
| Discount | Total discount | Σ per-line discounts |
| Tax (VAT) | Tax amount | Per tax profile; overridable per line |
| Total | Final amount | Sub-Total − Discount + Tax |
| Base Total | In base currency | Total × exchange_rate |

##### {N}.3.1.3 Detail Information (Line Items Grid)

| Column | Mandatory | Description | Business Logic / Remark |
|--------|-----------|-------------|--------------------------|
| # | — | Row number | Auto-incremented |
| {Column} | Y / N | {Description} | {Remark} |

**Grid Actions:**

| Button | Description | Business Logic |
|--------|-------------|----------------|
| Add Item | Opens {PREFIX}MODAL-{NNN} | Available when Status = Draft |
| Delete Row | Removes selected row | Confirmation required |
| Copy Row | Duplicates row | Inserted below |
| Bulk Update {Field} | Sets field for all rows | Date picker / value selector |

#### {N}.3.2 Save Validation

| Validation | Error Message | Action |
|------------|---------------|--------|
| Mandatory fields incomplete | "Please complete all required fields." | Inline error highlighting |
| No line items | "At least one item is required." | Alert dialog |
| Qty = 0 | "Zero quantities are not allowed." | Warning |

---

### {N}.4 Document Editing

**Access:** List → Edit (Draft only), or Detail → Edit (Draft only)

Same form as creation ({N}.3) with differences:

| Behaviour | Create | Edit |
|-----------|--------|------|
| Doc Number | Blank until save | Read-only |
| Fields | Blank / defaults | Pre-populated |
| Availability | Always | Draft only |

---

### {N}.5 Document Submission

**Trigger:** Click **Submit** from Create form or Detail screen.

**Pre-submission validation:**
- All mandatory fields complete
- At least one line item
- {Additional rules}

**On submit:**
1. Status: `draft` → `in_progress`
2. Approval workflow triggered — routed to Stage 2
3. Next approver notified
4. Workflow history: action = `create` / `submit`

---

### {N}.6 Approval Workflow

#### {N}.6.1 Display Modes

| Mode | Description | Doc Reference |
|------|-------------|---------------|
| Side Bar View | Compact panel alongside list | {PREFIX}PAGE-{NNN} |
| Full Page View | Full-screen detailed review | {PREFIX}PAGE-{NNN} |

#### {N}.6.2 Editable Fields by Stage

| Field | Stage 2 (HOD) | Stage 3 (Purchase) | Stages 4-6 (FC/GM/Owner) |
|-------|--------------|--------------------|-----------------------------|
| Approved Qty | Editable | View Only | View Only |
| Vendor | View Only | Editable | View Only |
| Unit Price | View Only | Editable | View Only |
| Delivery Date | Editable (Full Page) | View Only | View Only |
| Remark | Editable (Full Page) | Editable | Editable |

#### {N}.6.3 Approval Actions

| Action | Validation | Outcome |
|--------|-----------|---------|
| Approve | Line states must be set | Advances to next stage |
| Reject | Reason required | Status → rejected; requestor notified |
| Send Back | Reason required | Reverts to previous stage |

#### {N}.6.4 Vendor Allocation (if applicable)

| Method | Description |
|--------|-------------|
| Manual Set | Type or select vendor per line |
| Automatic | System assigns by rules (preferred vendor, lowest price) |
| Manual Selection | Opens vendor search modal |

---

### {N}.7 Ancillary Functions

#### {N}.7.1 Attachments
- Supported: {Yes / No / TBD}
- File types: {PDF, Excel, Image}
- Max size: {N} MB

#### {N}.7.2 Comments
- All users with access can add
- Immutable once saved
- Timestamped with author

#### {N}.7.3 Activity Log / Workflow History

| Log Entry | Data Captured |
|-----------|--------------|
| Created | Timestamp, creator |
| Submitted | Timestamp, submitter |
| Approved (Stage N) | Approver, timestamp, approved quantities |
| Rejected | Rejector, timestamp, reason |
| Sent Back | User, timestamp, reason |

---

### {N}.8 Modals in This Module

| Modal ID | Modal Name | Trigger | Parent Page |
|----------|-----------|---------|------------|
| {PREFIX}MODAL-{NNN} | {Name} | {Trigger} | {PREFIX}PAGE-{NNN} |

---

### {N}.9 Pages in This Module

| Page ID | Page Name | Route | Purpose |
|---------|-----------|-------|---------|
| {PREFIX}PAGE-{NNN} | {Name} | {/route} | {Purpose} |

---

### {N}.10 Flows in This Module

| Flow ID | Flow Name | Stage | Purpose |
|---------|-----------|-------|---------|
| {PREFIX}FLOW-{NNN} | {Name} | {Stage N} | {Purpose} |

---

### {N}.11 API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/{module}` | Fetch list |
| GET | `/api/{module}/{id}` | Fetch detail |
| POST | `/api/{module}` | Create |
| PATCH | `/api/{module}/{id}` | Update (Draft) |
| PATCH | `/api/{module}/{id}` | Submit (`state_role: "submit"`) |
| POST | `/api/{module}/{id}/approve` | Approve |
| POST | `/api/{module}/{id}/reject` | Reject |

> Differentiate endpoints with the same method+path by noting the payload difference
> (e.g., `state_role` value).
