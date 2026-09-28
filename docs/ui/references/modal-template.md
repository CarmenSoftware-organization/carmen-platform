# Modal Template
<!-- Copy this file for every new modal/dialog/popup/side-panel. Replace all {PLACEHOLDERS}. -->

---
**Doc ID:** {PREFIX}MODAL-{NNN}
**Title:** {Modal / Dialog Name}
**Domain:** {Domain name}
**Parent Page(s):** {PREFIX}PAGE-{NNN} — {Page Name}
**Status:** Draft | Review | Stable | Deprecated
**Created:** {YYYY-MM-DD}
**Last Updated:** {YYYY-MM-DD}
**Author:** {Name}
**Parent Flow:** {PREFIX}FLOW-{NNN} — {Flow Name}
---

## {N}.{N}.{N}.{N} {Modal Name}

> Brief one-sentence description of what this modal does and when it appears.

---

### {N}.{N}.{N}.{N}.1 Trigger

| Trigger | Source Page | Condition |
|---------|------------|-----------|
| Click **{Button Name}** | {PREFIX}PAGE-{NNN} ({Page Name}) | {e.g., "Available only when Status = draft"} |

---

### {N}.{N}.{N}.{N}.2 Modal Layout

```
[Modal Title: "{Title}"]
────────────────────────────────────
[Search Bar: {placeholder text}  🔍]
[Filter: {Filter1} | {Filter2}]
────────────────────────────────────
[Content Grid / Table]
  # | {Col1} | {Col2} | {Col3}
────────────────────────────────────
[Selected: {N} items]
[Confirm Button]  [Cancel Button]
```

**Modal Size:** Small (400px) | Medium (600px) | Large (full-width) | Full-screen
**Scrollable:** Yes / No — {which section scrolls}

---

### {N}.{N}.{N}.{N}.3 Search & Filter

| Filter | Type | Description | Default |
|--------|------|-------------|---------|
| Search | Free text | Search by {fields} | Blank |
| {Filter} | Dropdown | Filter by {dimension} | All |

**Search trigger:** Real-time (debounced) / On Enter key / On Search button click

---

### {N}.{N}.{N}.{N}.4 Content Grid Columns

| Column | Description | Sortable | Notes |
|--------|-------------|----------|-------|
| # | Row number | No | — |
| {Column} | {Description} | Yes / No | {Notes} |

**Selection behaviour:**
- Multi-select / Single-select
- Selected rows are highlighted
- Selection count shown: "Selected: {N} items"

---

### {N}.{N}.{N}.{N}.5 Action Buttons

| Button | Color / Type | Description | Behaviour |
|--------|-------------|-------------|-----------|
| Confirm | Primary (Green) | Adds selected item(s) to parent | Creates new row(s) on parent page. Modal closes. |
| Cancel | Secondary (White) | Dismisses without changes | No changes. Modal closes. Focus returns to parent. |

---

### {N}.{N}.{N}.{N}.6 Outcomes

| User Action | Modal Result | Parent Page Effect |
|------------|-------------|-------------------|
| Select 1+ items → Confirm | Modal closes | New row(s) added. Pre-populated fields: {list}. User must fill: {list}. |
| Click Cancel | Modal closes | No change |
| Close via X / backdrop click | Same as Cancel | No change |

---

### {N}.{N}.{N}.{N}.7 Auto-Population on Selection

When an item is selected and confirmed, these fields are pre-populated on the parent:

| Parent Field | Pre-populated From |
|------------|-------------------|
| {Field} | {Source — e.g., "Product master"} |
| {Field} | {Source} |

Fields NOT pre-populated (user must fill):
- {Field 1}
- {Field 2}

---

### {N}.{N}.{N}.{N}.8 Validation & Error States

| # | Scenario | System Behaviour |
|---|----------|-----------------|
| 1 | No item selected → Confirm clicked | Confirm disabled until ≥ 1 item selected |
| 2 | Search returns no results | Message: "No {items} found" |
| 3 | Item already exists on parent | {Allow duplicates as separate rows / Block with warning} |
| 4 | API fails to load list | Error: "Failed to load {items}. Please try again." |
| 5 | Session expired | Redirects to login. Modal state lost. |
| 6 | Slow network / loading state | Spinner shown in content area |

---

### {N}.{N}.{N}.{N}.9 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/{bu_code}/{resource}` | Load item list |
| GET params | `?search={query}` | Search by code or name |
| GET params | `?filter={dimension}:{id}` | Filter by category |

---

### {N}.{N}.{N}.{N}.10 Related Documents

| Doc ID | Title | Relationship |
|--------|-------|-------------|
| {PREFIX}PAGE-{NNN} | {Parent page} | Opens this modal via {button} |
| {PREFIX}FLOW-{NNN} | {Flow name} | Parent flow |
