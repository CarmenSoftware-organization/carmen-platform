# Carmen Platform — Component Inventory

> **Documented from the live codebase** (`src/components/`), not proposed. This is a
> frontend-only React + TypeScript **admin dashboard** (clusters, business units, users,
> report/print templates, platform RBAC). Built on **shadcn/ui (Radix + CVA)** + Tailwind.
>
> Every component consumes semantic tokens from **[`tokens.md`](./tokens.md)** — no
> hardcoded colors. Test files (`*.test.tsx`) co-locate beside each component.

---

## 1. Primitives — `src/components/ui/` (shadcn/ui)

**⚠️ Do NOT modify these without an explicit reason** (repo rule 2). Radix + CVA under the hood.

| Component | File | Notes |
|-----------|------|-------|
| Avatar | `avatar.tsx` | User/entity image with fallback initials |
| Badge | `badge.tsx` | Status pill — variants `success` / `warning` / `info` / `secondary` / `destructive` / `default`. **The only sanctioned status indicator** (rule 5) |
| Button | `button.tsx` | CVA variants (default/secondary/ghost/destructive/outline) + `size="icon"` |
| Card | `card.tsx` | Flat surface `bg-card` + 1px border — the primary layout container |
| ChipInput | `chip-input.tsx` | Tag/chip editor over a comma-joined string (in ↔ out) |
| ConfirmDialog | `confirm-dialog.tsx` | Destructive-action confirm. **Replaces `window.confirm()`** (rule 3). Self-manages async spinner |
| DataTable | `data-table.tsx` | TanStack Table v8 wrapper. Server-side pagination/sort. **Auto-prepends `#` index column — never add your own** (rule 4) |
| DevDebugSheet | `dev-debug-sheet.tsx` | Dev-only raw-response inspector (wrap in `NODE_ENV === 'development'`) |
| Dialog | `dialog.tsx` | Modal (Radix Dialog) |
| DropdownMenu | `dropdown-menu.tsx` | Row actions, context menus |
| Input | `input.tsx` | Text field; `border-destructive` on validation error |
| JsonViewer | `json-viewer.tsx` | Pretty JSON render for debug sheets |
| Label | `label.tsx` | Form field label |
| Select | `select.tsx` | Dropdown select (Radix) |
| Separator | `separator.tsx` | Horizontal/vertical divider |
| Sheet | `sheet.tsx` | Slide-in panel — filters, mobile nav, debug |
| Skeleton | `skeleton.tsx` | Loading placeholder primitive |
| Table | `table.tsx` | Raw table primitive (DataTable builds on it) |
| Tabs | `tabs.tsx` | Tabbed panels (e.g. ReportTemplate XML editor) |
| Textarea | `textarea.tsx` | Multi-line input |
| Tooltip | `tooltip.tsx` | Hover hints (collapsed sidebar labels, `delayDuration={200}`) |

---

## 2. Layout & navigation

| Component | File | Role |
|-----------|------|------|
| Layout | `Layout.tsx` | Shell orchestrator — owns sidebar collapse state (`localStorage('sidebar-collapsed')`), desktop breadcrumb bar, `allNavItems` registry. Main content margin `md:ml-16` ↔ `md:ml-60` |
| Sidebar | `Sidebar.tsx` | Desktop fixed sidebar (`w-60` / `w-16`) + mobile Sheet drawer. Nav items grouped `Organization` / `Content` / `Platform`; collapsed shows icons + right-side tooltips |
| Breadcrumbs | `Breadcrumbs.tsx` | Route breadcrumb trail (desktop top bar) |
| PageHeader | `PageHeader.tsx` | Standard page title + subtitle + action slot |

---

## 3. Access control

| Component | File | Role |
|-----------|------|------|
| PrivateRoute | `PrivateRoute.tsx` | Route guard — `requiredPermission` / `requireSuperAdmin` props |
| Can | `Can.tsx` | Inline permission-gate wrapper (conditionally render children) |

Both read from `AuthContext` (`hasPermission`, `isSuperAdmin`).

---

## 4. Data display & state

| Component | File | Role |
|-----------|------|------|
| TableSkeleton | `TableSkeleton.tsx` | Initial table load — use only when `loading && items.length === 0` |
| EmptyState | `EmptyState.tsx` | No-data state. Required `icon` + `title`; include `description` + action button |
| ReadOnlyField | `ReadOnlyField.tsx` | Styled read-only value (edit-page read mode) — `bg-muted/50` div |
| VersionBadge | `VersionBadge.tsx` | App version chip (changelog) |
| DialogPreview | `DialogPreview.tsx` | Renders XML `<Label>`+`<Date>`/`<Lookup>` pairs as preview |

**Loading decision table** (rule 16): skeleton (empty+loading) · overlay (has-data+loading) · EmptyState (empty+idle) · DataTable (otherwise).

---

## 5. Forms & inputs (app-level)

| Component | File | Role |
|-----------|------|------|
| SearchInput | `SearchInput.tsx` | Debounced (400ms) search box for Management pages |
| BusinessUnitMultiSelect | `BusinessUnitMultiSelect.tsx` | Multi-select BU picker |
| UserMultiSelect | `UserMultiSelect.tsx` | Multi-select user picker |
| PermissionPicker | `PermissionPicker.tsx` | Permission assignment UI (RBAC) |
| MarkdownEditor | `MarkdownEditor.tsx` | Markdown authoring (news/content) |
| XmlEditor | `XmlEditor.tsx` | CodeMirror 6 XML editor; falls back to read-only Copy+Download when `readOnly` |
| ImageUpload | `ImageUpload.tsx` | Generic image upload |
| BrandingImageUpload | `BrandingImageUpload.tsx` | BU/cluster branding image upload |

**Form field pattern:** every field renders two modes — edit (Input/Select/checkbox) and
read-only (`ReadOnlyField`). Validation via `validateField` on blur → `border-destructive`
+ `text-xs text-destructive` message.

---

## 6. Feedback & overlays

| Element | Source | Role |
|---------|--------|------|
| Toast | `sonner` (external, wired in `App.tsx`) | `toast.success/error/info/warning`. **Replaces `alert()`** (rule 3) |
| ConfirmDialog | `ui/confirm-dialog.tsx` | Destructive confirms |
| Dialog / Sheet | `ui/` | Modals and slide-in panels |
| Tooltip | `ui/tooltip.tsx` | Hover hints |
| KeyboardShortcuts | `KeyboardShortcuts.tsx` | Global `Ctrl/⌘+K` search, `Ctrl/⌘+S` save, `Esc` cancel, `?` help dialog (auto-wired in Layout) |

---

## 7. Domain-specific cards

Composite feature cards (not primitives) — each encapsulates a platform sub-flow.

| Component | File | Feature |
|-----------|------|---------|
| InterfaceEntitlementCard | `InterfaceEntitlementCard.tsx` | Business-unit interface entitlement control (Phase 1 platform) |
| TenantMigrationCard | `TenantMigrationCard.tsx` | Tenant schema migration (FleetSync + DeployConsole, streaming) |
| TenantSeedCard | `TenantSeedCard.tsx` | Per-BU tenant data seeding (streaming, extensible types) |
| DbConnectionView | `DbConnectionView.tsx` | Database connection detail view |

---

## Component → page-pattern map

The app has **two canonical page patterns** — always copy the closest existing example
(rule 1), don't invent layouts:

| Pattern | Reference | Key components |
|---------|-----------|----------------|
| **Management** (list) | `ClusterManagement.tsx` | PageHeader · SearchInput · filter Sheet · DataTable · TableSkeleton · EmptyState · DevDebugSheet · CSV export |
| **Edit** (CRUD) | `ClusterEdit.tsx` (simple), `ReportTemplateEdit.tsx` (tabbed) | Card sections · ReadOnlyField · edit/read toggle · ConfirmDialog · Tabs · `useUnsavedChanges` · DevDebugSheet (tabbed) |

**Deliberate deviations:** `PrintTemplateMappingManagement.tsx` (card-grouped config, no
DataTable) and `Application*` pages (asymmetric read/write model) — documented in CLAUDE.md.

---

## Token compliance (enforced across all components)

1. Colors via semantic classes only — `bg-primary`, `text-muted-foreground`, `border-border`,
   `bg-card`. **Never** `bg-blue-500` / raw hex / raw green for status.
2. Status → `<Badge variant="…">`, never colored text/backgrounds by hand.
3. Radius via `rounded-lg` (cards) / `rounded-md` (buttons, inputs) / `rounded-sm` (badges).
4. Spacing on the 4px grid — `space-y-4`, `gap-3` (see tokens.md).
5. Dark theme is automatic — semantic tokens flip with `.dark`; no per-component overrides.
