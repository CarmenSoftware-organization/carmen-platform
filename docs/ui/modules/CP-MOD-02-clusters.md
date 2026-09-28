---
**Module Number:** 2
**Module Name:** Clusters
**System / Product:** Carmen Platform (admin SPA)
**Version:** v1.0 (as of app v1.0.0 / API v3.0.2, 2026-09-29)
**Status:** Draft
**Created:** 2026-09-29
**Last Updated:** 2026-09-29
**Author:** Claude (from code + live capture on DEV)
---

## 2. Clusters

---

### 2.1 Purpose

A **cluster** is the top-level tenant in Carmen: a hotel group that owns business units
(BUs, one per property) and a pool of member users. This module is where platform staff
register clusters, keep their identity up to date, and see at a glance how much of each
cluster's licence is in use.

**Key capabilities:**
- A fleet-wide capacity view: BU and user seats against licences, near-limit and expiring-quota counts
- Server-side list with search, status and soft-deleted filters, sorting on capacity columns, and CSV export
- Create a cluster **with its first BU-quota licence** (the licence is mandatory)
- Edit-in-place identity (name, code, alias, status, logo, avatar) with `doc_version` optimistic locking
- Manage cluster membership (add, remove, bulk remove, inline role change)
- Jump-offs to the cluster's BUs (Module 3), subscriptions and licences (Module 6)
- Per-record change history (from 2026-08-31)

**Approval support:** None. Changes apply immediately on save.
**Approval conditions:** N/A.

**Workflow stages:** N/A. There is no staged workflow. The lifecycle is create → edit → (deactivate) → soft delete.

---

### 2.2 Cluster List Screen

**Doc reference:** CP-PAGE-006 — Cluster List

#### 2.2.1 Column Definitions

| Column | Description | Sortable | Remarks |
|--------|-------------|----------|---------|
| # | Row number | No | Added by DataTable |
| Code | Cluster code | Yes | Link to edit |
| Name | Brand mark + name | Yes | Link to edit; "Deleted" badge when soft-deleted |
| Status | Active / Inactive | Yes | Dot + word, not a badge |
| Business Units | `used / cap` meter | Yes (by used) | Cap 0 = zero; "near" tag from 90% |
| Quota Expires | Winning BU-quota end date | Yes (nulls last) | "—" / "No expiry" / `yyyy-mm-dd` |
| Users | `used / cap` meter | Yes | No cap = ∞ |
| Created / Updated | Relative time + actor | Yes | Default sort `created_at desc` |
| Deleted | When + who | No | Only with "Show soft-deleted" |

#### 2.2.2 Search & Filter

| Filter | Type | Description | Default |
|--------|------|-------------|---------|
| Search | Free text, 400 ms debounce | `name`, `code` | Blank |
| Status | Multi-toggle (Filter Sheet) | Active / Inactive | None |
| Show soft-deleted clusters | Checkbox (Filter Sheet) | Includes deleted rows and adds a Deleted column | Off |
| Quota expiring | Toggle on the Fleet Capacity stat | BU quota expiring ≤ 30 days | Off |

#### 2.2.3 Document Status

| Status | Badge Colour | Description |
|--------|-------------|-------------|
| `is_active = true` | Green dot / success badge | In use |
| `is_active = false` | Hollow dot / plain badge | Disabled |
| `deleted_at` set | Destructive badge "Deleted" | Soft-deleted; list only, no restore in the UI |

#### 2.2.4 List Screen Actions

| Button / Action | Description | Availability |
|----------------|-------------|-------------|
| Add Cluster | → CP-PAGE-007 create | `cluster.create` |
| Edit | → CP-PAGE-007 | `cluster.update` (per cluster) |
| View | Same as Edit; read-only when `cluster.update` doesn't cover the cluster | — |
| Change history | CP-MODAL-003 | `activity_log.read` |
| Delete | Soft delete via CP-MODAL-001 | `cluster.delete` **and** the cluster has 0 BUs |
| Export | CSV of the **current page** | Always (non-empty list) |
| Print | N/A | Not provided |

---

### 2.3 Document Creation

**Doc reference:** CP-PAGE-007 — Cluster Edit (create mode)

**Creation methods:**

| Method | Description | Use Case |
|--------|-------------|---------|
| Manual | Code, Alias, Name + first licence | The only method |
| From Template | N/A | — |
| From Standard | N/A | — |

#### 2.3.1 Document Structure

##### 2.3.1.1 Header Information

| Field | Mandatory | Description | Business Logic / Remark |
|-------|-----------|-------------|--------------------------|
| Code | Y | 2–20 chars `[A-Za-z0-9_-]` | No uppercase transform |
| Alias | N | ≤ 3 alphanumeric | — |
| Name | Y | Display name | — |
| Status | — | Draft-plate toggle | Default Active |
| Business units (first licence) | Y | Whole number > 0 | Sent as `initial_license.licensed_bus` |
| Expires (first licence) | Y unless *Never expires* | Date ≥ today | Perpetual = `2099-12-31T23:59:59.999Z` |

##### 2.3.1.2 Summary Information

N/A at creation. The draft plate previews the quota ("{n} licences", expiry note). In edit
mode the licence rails summarise BU and seat usage (see CP-PAGE-007 §2.3.5).

##### 2.3.1.3 Detail Information (Line Items Grid)

N/A at creation. In edit mode the Business Units and Users tabs play this role (CP-PAGE-007 §2.3.6).

#### 2.3.2 Save Validation

| Validation | Error Message | Action |
|------------|---------------|--------|
| Code blank / bad format | "Code is required" / "Code must be 2-20 alphanumeric characters" | Inline on blur; native `required` blocks submit |
| Name blank | "Name is required" | Same |
| Alias bad format | "Alias must be 1-3 alphanumeric characters" | Inline on blur |
| BU quota blank / ≤ 0 | "Business units is required" / "Must be a positive whole number" | Inline on blur |
| Expiry blank (not perpetual) | Browser native message | Native `required` |
| Server rejects | Banner "Failed to save cluster: {detail}" | Form stays |

---

### 2.4 Document Editing

**Access:** List → Code/Name link or **Edit**. Always available (no draft-only rule); read-only without scoped `cluster.update`.

| Behaviour | Create | Edit |
|-----------|--------|------|
| Doc Number (Code) | Typed | Editable in place |
| Fields | Blank / defaults | Pre-populated |
| Licence | Required | Read-only; changed in Module 6 |
| Locking | — | `doc_version`; 409 → reload, local edits discarded |
| Availability | `cluster.create` | `cluster.update` |

---

### 2.5 Document Submission

N/A. There is no submit step. **Create cluster** and **Save Changes** persist directly.

---

### 2.6 Approval Workflow

N/A. No approval.

#### 2.6.1 Display Modes

| Mode | Description | Doc Reference |
|------|-------------|---------------|
| Full Page | Edit-in-place plate + tabs | CP-PAGE-007 |
| Side Bar View | N/A | — |

#### 2.6.2 Editable Fields by Stage

N/A. Editability depends on permission only (see CP-PAGE-007 §2.3.2).

#### 2.6.3 Approval Actions

N/A.

#### 2.6.4 Vendor Allocation

N/A.

---

### 2.7 Ancillary Functions

#### 2.7.1 Attachments
- Supported: **No** (only brand images: logo + avatar, jpeg/png/webp, ≤ 5 MB)

#### 2.7.2 Comments
- N/A: not supported.

#### 2.7.3 Activity Log / Workflow History

Record change history via CP-MODAL-003 (`entity_type=cluster`), recorded since **2026-08-31**.

| Log Entry | Data Captured |
|-----------|--------------|
| Created | Timestamp, actor (also on the plate audit line) |
| Updated | Timestamp, actor, changed fields ("{n} fields changed", expandable to a detail view) |
| Deleted (soft) | Timestamp, actor (Deleted column on the list) |
| Membership changes | TBD: not confirmed whether add/remove member is logged against the cluster record |

---

### 2.8 Modals in This Module

| Modal ID | Modal Name | Trigger | Parent Page |
|----------|-----------|---------|------------|
| CP-MODAL-008 | Add User to Cluster | Users tab → **Add User** | CP-PAGE-007 |
| CP-MODAL-001 | Confirm Dialog (shared) | Delete cluster; remove member(s) | CP-PAGE-006, CP-PAGE-007 |
| CP-MODAL-002 | Filter Sheet (shared) | **Filters** | CP-PAGE-006 |
| CP-MODAL-003 | Activity Trail Sheet (shared) | **Change history** | CP-PAGE-006, CP-PAGE-007 |

---

### 2.9 Pages in This Module

| Page ID | Page Name | Route | Purpose |
|---------|-----------|-------|---------|
| CP-PAGE-006 | Cluster List | `/clusters` | Fleet capacity + find / delete clusters |
| CP-PAGE-007 | Cluster Edit | `/clusters/new`, `/clusters/:id/edit` | Create with first licence; edit identity, BUs, members |

---

### 2.10 Flows in This Module

| Flow ID | Flow Name | Stage | Purpose |
|---------|-----------|-------|---------|
| CP-FLOW-002 | Cluster onboarding (Planned) | Step 1–2 of 4 | Create cluster → add BUs (Module 3) → add users (Module 4) → subscription (Module 6) |

---

### 2.11 API Endpoints Summary

All endpoints are on the `/api-system` backend.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api-system/clusters` | List (`page, perpage, search, searchfields, sort, advance`) |
| GET | `/api-system/clusters/summary` | Fleet capacity (unfiltered) |
| GET | `/api-system/clusters/{id}` | Detail |
| POST | `/api-system/clusters` | Create (with `initial_license`) |
| PUT | `/api-system/clusters/{id}` | Update (with `doc_version`) |
| DELETE | `/api-system/clusters/{id}` | Soft delete |
| POST | `/api-system/clusters/{id}/logo` | Logo upload |
| POST | `/api-system/clusters/{id}/avatar` | Avatar upload |
| GET | `/api-system/user/clusters/{clusterId}` | Members |
| POST | `/api-system/user/clusters` | Add member |
| PUT | `/api-system/user/clusters/{cuId}` | Change member role (`{role}`) |
| DELETE | `/api-system/user/clusters/{cuId}` | Remove member |
| GET | `/api-system/business-units?perpage=-1` | All BUs (filtered on the client) |
| GET | `/api-system/platform/subscriptions?advance=…cluster_id…` | Latest 5 subscriptions |
| GET | `/api-system/platform/activity-logs/record/{id}?entity_type=cluster` | Change history |

> `{cuId}` in the member endpoints is `tb_cluster_user.id` (the membership row), not the
> user id. Two rows share `PUT`/`DELETE` on `/user/clusters/{…}` with the list GET only in
> path shape: the GET takes a **cluster** id, the PUT/DELETE take a **membership** id.

---

### 2.12 Open Findings (from this documentation pass)

Found while documenting. **None has been fixed**; each needs an owner decision.

| # | Where | Finding | Severity |
|---|-------|---------|----------|
| 1 | CP-PAGE-007 | In-app navigation with unsaved plate edits is not blocked (`beforeunload` only), so edits are lost silently | Warning |
| 2 | CP-PAGE-007 | Blanking **Code** in edit mode shows no error, and Save doesn't check `fieldErrors` | Warning |
| 3 | CP-PAGE-007 | Escape inside an inline editor probably reverts **all** pending changes (code reading, unverified) | Warning |
| 4 | CP-PAGE-007 | Validation messages and the bulk-remove toast are English-only in a Thai UI | Info |
| 5 | CP-PAGE-007 | The BU tab loads **every** BU (`perpage=-1`) and filters on the client | Info |
| 6 | CP-PAGE-006 | The expiring-soon filter has no chip, so the badge can count a filter the chip bar doesn't show | Info |
| 7 | CP-PAGE-006 | CSV export covers only the current page | Info |
| 8 | CP-MODAL-008 | A user-list load failure is silent ("No users found.") | Info |
| 9 | CP-MODAL-008 | "Showing X of Y users" compares a post-filter count with a pre-filter total | Info |
| 10 | Repo | `SITEMAP.md` is stale against `src/App.tsx` | Info |
