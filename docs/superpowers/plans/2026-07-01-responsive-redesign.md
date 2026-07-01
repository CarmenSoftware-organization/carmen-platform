# Responsive Design Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire carmen-platform UI responsive with a desktop-first approach, ensuring all pages work well on mobile, tablet, and desktop.

**Architecture:** Desktop-first responsive design using Tailwind breakpoints (`sm:`, `md:`, `lg:`). The `md:` breakpoint (768px) is the primary mobile/desktop pivot for the sidebar. The `sm:` breakpoint (640px) handles typography and spacing adjustments. The `lg:` breakpoint (1024px) handles multi-column form layouts.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 3.4, Fluent UI React v9, TanStack Table v8

## Global Constraints

- Desktop-first approach: design for desktop, add responsive overrides for smaller screens
- `md:` (768px) = sidebar pivot (hidden on mobile, visible on desktop)
- `sm:` (640px) = typography/spacing adjustments
- `lg:` (1024px) = multi-column form layouts
- Never use `h-screen` - use `min-h-[100dvh]` for viewport stability
- Preserve existing glassmorphism design language
- Maintain all existing functionality

---

## Task 1: Make DataTable Responsive with Horizontal Scroll

**Files:**
- Modify: `src/components/ui/data-table.tsx:247-299`

**Interfaces:**
- Consumes: existing DataTable component
- Produces: responsive DataTable with horizontal scroll on mobile

- [ ] **Step 1: Add overflow-x-auto wrapper to the Table**

In `src/components/ui/data-table.tsx`, wrap the `<Table>` component with a scrollable container:

```tsx
// Line 248-299, replace the Table section
return (
  <div>
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <Table className="min-w-[640px]">
        <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={(header.column.columnDef.meta as Record<string, string>)?.headerClassName || ''}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ArrowUp className="h-3.5 w-3.5" />,
                        desc: <ArrowDown className="h-3.5 w-3.5" />,
                      }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnsWithIndex.length} className="text-center text-muted-foreground">
                No results found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={(cell.column.columnDef.meta as Record<string, string>)?.cellClassName || ''}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>

    {/* Pagination — sticky at bottom of viewport */}
    {/* ... existing pagination code ... */}
  </div>
);
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Run dev server and verify**

```bash
bun start
```

Verify: Tables scroll horizontally on mobile viewport (< 640px)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/data-table.tsx
git commit -m "feat: add horizontal scroll to DataTable for mobile responsiveness"
```

---

## Task 2: Add Button Text Abbreviation to All Management Pages

**Files:**
- Modify: `src/pages/ClusterManagement.tsx`
- Modify: `src/pages/ApplicationManagement.tsx`
- Modify: `src/pages/UserManagement.tsx`
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/pages/NewsManagement.tsx`
- Modify: `src/pages/RoleManagement.tsx`
- Modify: `src/pages/SuperAdminManagement.tsx`
- Modify: `src/pages/UserPlatformManagement.tsx`
- Modify: `src/pages/TenantMigrationManagement.tsx`

**Interfaces:**
- Consumes: existing Management page patterns
- Produces: responsive button text that abbreviates on mobile

**Note:** `BusinessUnitManagement.tsx` already has this pattern - copy from it.

- [ ] **Step 1: Update ClusterManagement.tsx Add button**

Find the Add button in `src/pages/ClusterManagement.tsx` and replace the text:

```tsx
// Find: <Plus className="mr-2 h-4 w-4" />
// Replace the button text section with:
<Button onClick={() => navigate('/clusters/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Cluster</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 2: Update ApplicationManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/applications/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Application</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 3: Update UserManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/users/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add User</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 4: Update ReportTemplateManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/report-templates/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Template</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 5: Update NewsManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/news/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add News</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 6: Update RoleManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/platform/roles/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Role</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 7: Update SuperAdminManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/platform/super-admins/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Super Admin</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 8: Update UserPlatformManagement.tsx Add button**

```tsx
<Button onClick={() => navigate('/platform/user-platform/new')} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Add Platform User</span>
  <span className="sm:hidden">Add</span>
</Button>
```

- [ ] **Step 9: Update TenantMigrationManagement.tsx (if Add button exists)**

Check if this page has an Add button and apply the same pattern.

- [ ] **Step 10: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/pages/*Management.tsx
git commit -m "feat: add responsive button text abbreviation to all Management pages"
```

---

## Task 3: Make Edit Page Form Grids Fully Responsive

**Files:**
- Modify: `src/pages/ClusterEdit.tsx`
- Modify: `src/pages/UserEdit.tsx`
- Modify: `src/pages/ApplicationEdit.tsx`
- Modify: `src/pages/NewsEdit.tsx`
- Modify: `src/pages/RoleEdit.tsx`
- Modify: `src/pages/UserPlatformEdit.tsx`

**Interfaces:**
- Consumes: existing Edit page patterns
- Produces: responsive form grids that stack on mobile

- [ ] **Step 1: Update ClusterEdit.tsx form grid**

Find the main form grid and ensure it uses:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 2: Update UserEdit.tsx form grid**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 3: Update ApplicationEdit.tsx form grid**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 4: Update NewsEdit.tsx form grid**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 5: Update RoleEdit.tsx form grid**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 6: Update UserPlatformEdit.tsx form grid**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
  {/* form fields */}
</div>
```

- [ ] **Step 7: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/*Edit.tsx
git commit -m "feat: ensure all Edit page form grids are responsive"
```

---

## Task 4: Make Filter Sheets Responsive

**Files:**
- Modify: `src/pages/ClusterManagement.tsx`
- Modify: `src/pages/BusinessUnitManagement.tsx`
- Modify: `src/pages/UserManagement.tsx`
- Modify: `src/pages/ApplicationManagement.tsx`
- Modify: `src/pages/NewsManagement.tsx`
- Modify: `src/pages/RoleManagement.tsx`

**Interfaces:**
- Consumes: existing Filter Sheet patterns
- Produces: responsive Filter Sheets that take full width on mobile

- [ ] **Step 1: Update ClusterManagement.tsx Filter Sheet**

Find the SheetContent for filters and ensure:

```tsx
<SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
```

- [ ] **Step 2: Update all other Management pages with the same pattern**

Apply the same responsive SheetContent pattern to all Management pages.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/*Management.tsx
git commit -m "feat: make Filter Sheets responsive with full width on mobile"
```

---

## Task 5: Make Debug Sheets Responsive

**Files:**
- All `*Management.tsx` and `*Edit.tsx` files with debug sheets

**Interfaces:**
- Consumes: existing Debug Sheet patterns
- Produces: responsive Debug Sheets

- [ ] **Step 1: Update Debug Sheet pattern in all pages**

Find Debug Sheet Content in each page and ensure:

```tsx
<SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
```

- [ ] **Step 2: Update debug pre blocks**

```tsx
<pre className="text-[10px] sm:text-xs bg-gray-900 text-gray-100 rounded-lg p-3 sm:p-4 overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/*Management.tsx src/pages/*Edit.tsx
git commit -m "feat: make Debug Sheets responsive across all pages"
```

---

## Task 6: Make Dialogs/Modals Responsive

**Files:**
- All `*Edit.tsx` files with confirmation dialogs

**Interfaces:**
- Consumes: existing Dialog patterns
- Produces: responsive Dialogs

- [ ] **Step 1: Update Dialog responsive widths**

Find DialogContent in each Edit page and ensure:

```tsx
<DialogContent className="sm:max-w-lg">
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/*Edit.tsx
git commit -m "feat: ensure Dialogs are responsive across all Edit pages"
```

---

## Task 7: Make ReportTemplateEdit Responsive

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx`

**Interfaces:**
- Consumes: existing ReportTemplateEdit layout
- Produces: responsive layout that stacks on mobile

- [ ] **Step 1: Update the main grid layout**

Find the main grid in ReportTemplateEdit.tsx and ensure:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr]">
```

- [ ] **Step 2: Update sticky column for mobile**

```tsx
<div className="lg:sticky lg:top-4 lg:self-start space-y-4 sm:space-y-6">
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx
git commit -m "feat: make ReportTemplateEdit responsive with stacking on mobile"
```

---

## Task 8: Make BusinessUnitEdit Responsive

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx`
- Modify: `src/pages/businessUnitEdit/DatabaseConnectionSection.tsx`
- Modify: `src/pages/businessUnitEdit/CalculationSettingsSection.tsx`
- Modify: `src/pages/businessUnitEdit/ConfigurationSection.tsx`

**Interfaces:**
- Consumes: existing BU Edit sub-components
- Produces: responsive sub-components

- [ ] **Step 1: Update BusinessUnitFormFields.tsx grid**

```tsx
<div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
```

- [ ] **Step 2: Update DatabaseConnectionSection.tsx grid**

```tsx
<div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
```

- [ ] **Step 3: Update CalculationSettingsSection.tsx grid**

```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
```

- [ ] **Step 4: Update ConfigurationSection.tsx grid**

```tsx
<div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
```

- [ ] **Step 5: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/businessUnitEdit/*.tsx
git commit -m "feat: make BusinessUnitEdit sub-components responsive"
```

---

## Task 9: Make PrintTemplateMapping Responsive

**Files:**
- Modify: `src/pages/PrintTemplateMappingManagement.tsx`
- Modify: `src/pages/PrintTemplateMappingEdit.tsx`

**Interfaces:**
- Consumes: existing PrintTemplateMapping pages
- Produces: responsive configuration pages

- [ ] **Step 1: Update PrintTemplateMappingManagement.tsx card grid**

Find the card-grouped layout and ensure responsive grid:

```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
```

- [ ] **Step 2: Update PrintTemplateMappingEdit.tsx form**

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/PrintTemplateMapping*.tsx
git commit -m "feat: make PrintTemplateMapping pages responsive"
```

---

## Task 10: Make Dashboard Responsive

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: existing Dashboard layout
- Produces: responsive Dashboard

- [ ] **Step 1: Check Dashboard layout**

Read `src/pages/Dashboard.tsx` and identify any non-responsive patterns.

- [ ] **Step 2: Update grid layouts**

Ensure all card grids use:

```tsx
<div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: make Dashboard responsive"
```

---

## Task 11: Final Verification

**Files:**
- All modified files

**Interfaces:**
- Consumes: all previous tasks
- Produces: fully responsive application

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Run dev server**

```bash
bun start
```

- [ ] **Step 3: Test responsive behavior**

Verify on these viewports:
- Mobile: 375px (iPhone SE)
- Tablet: 768px (iPad)
- Desktop: 1024px (laptop)
- Large desktop: 1440px

Check:
- Sidebar collapses to hamburger on mobile
- Tables scroll horizontally on mobile
- Forms stack on mobile
- Buttons abbreviate on mobile
- Sheets take full width on mobile
- Typography scales appropriately

- [ ] **Step 4: Run tests**

```bash
bun run test
```

Expected: All tests pass

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete responsive design redesign"
```
