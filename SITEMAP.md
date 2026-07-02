# SITEMAP

All routes in the Carmen Platform SPA. Source: `src/App.tsx`.

## Route table

Route guards are **permission-based**: `PrivateRoute` takes `requiredPermission="<module>.<action>"` (checked via `hasPermission()`) or `requireSuperAdmin`. Role names are no longer hard-coded on routes (Platform RBAC).

| Path | Component | Access | Purpose |
|---|---|---|---|
| `/` | `Landing` | Public | Marketing/landing page |
| `/login` | `Login` | Public | Username/password form |
| `/changelog` | `Changelog` | Public | Version history (Keep a Changelog) |
| `/dashboard` | `Dashboard` | Authenticated | Home hub, summary cards |
| `/clusters` | `ClusterManagement` | `cluster.read` | Cluster list (DataTable + filters + CSV export) |
| `/clusters/new` | `ClusterEdit` | `cluster.create` | Create cluster |
| `/clusters/:id/edit` | `ClusterEdit` | `cluster.update` | View/edit cluster + BUs + users |
| `/applications` | `ApplicationManagement` | `application.read` | Application (`x-app-id`) list |
| `/applications/new` | `ApplicationEdit` | `application.create` | Create application |
| `/applications/:id/edit` | `ApplicationEdit` | `application.update` | View/edit application + grouped API-name selector |
| `/business-units` | `BusinessUnitManagement` | `cluster.read` | Business unit list |
| `/business-units/new` | `BusinessUnitEdit` | `cluster.create` | Create BU (sectioned form) |
| `/business-units/:id/edit` | `BusinessUnitEdit` | `cluster.update` | View/edit BU |
| `/tenant-migrations` | `TenantMigrationManagement` | `cluster.read` | Tenant migration deploy operations |
| `/users` | `UserManagement` | `user.read` | User list (role + status filters) |
| `/users/new` | `UserEdit` | `user.create` | Create user |
| `/users/:id/edit` | `UserEdit` | `user.update` | View/edit user + BU assignments |
| `/report-templates` | `ReportTemplateManagement` | `report_template.read` | Report template list |
| `/report-templates/new` | `ReportTemplateEdit` | `report_template.create` | Create report template |
| `/report-templates/:id/edit` | `ReportTemplateEdit` | `report_template.update` | View/edit report template (XML editors + preview) |
| `/print-template-mapping` | `PrintTemplateMappingManagement` | `print_template_mapping.read` | Mapping list grouped by document type |
| `/print-template-mapping/new` | `PrintTemplateMappingEdit` | `print_template_mapping.create` | Create print template mapping |
| `/print-template-mapping/:id/edit` | `PrintTemplateMappingEdit` | `print_template_mapping.update` | View/edit print template mapping |
| `/news` | `NewsManagement` | `news.read` | News list |
| `/news/new` | `NewsEdit` | `news.create` | Create news (image upload) |
| `/news/:id/edit` | `NewsEdit` | `news.update` | View/edit news |
| `/broadcasts/new` | `BroadcastCompose` | `broadcast.send` | Compose broadcast (system / BU targets) |
| `/platform/roles` | `RoleManagement` | `role.read` | Platform role list |
| `/platform/roles/new` | `RoleEdit` | `role.create` | Create platform role |
| `/platform/roles/:id/edit` | `RoleEdit` | `role.update` | View/edit platform role + permissions |
| `/platform/permissions` | `PermissionCatalog` | `role.read` | Read-only permission catalog |
| `/platform/super-admins` | `SuperAdminManagement` | Super admin only | Super admin management |
| `/platform/user-platform` | `UserPlatformManagement` | `user_platform.read` | User ↔ platform-role assignments |
| `/platform/user-platform/:userId` | `UserPlatformEdit` | `user_platform.read` | Edit a user's platform-role scope |
| `/profile` | `Profile` | Authenticated | View/edit own profile, change password |
| `*` | `<Navigate to="/" />` | — | Catch-all redirect to Landing |

"Authenticated" means `PrivateRoute` with no `requiredPermission`/`requireSuperAdmin` — any logged-in user passes. A guard that fails its permission (or super-admin) check renders `<AccessDenied>`.

## Sidebar navigation

Defined in `allNavItems` in `src/components/Layout.tsx`. Items carry a `group` and gate on a single `permission` or `superAdminOnly`, filtered via `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)` from `AuthContext`. Ungrouped items render first; grouped items follow under group headers. Display order:

- **Dashboard** — `/dashboard` — all authenticated users (ungrouped)
- **Organization**
  1. Clusters — `/clusters` — `cluster.read`
  2. Business Units — `/business-units` — `cluster.read`
  3. Tenant Migrations — `/tenant-migrations` — `cluster.read`
  4. Users — `/users` — `user.read`
- **Content**
  5. Report Templates — `/report-templates` — `report_template.read`
  6. Print Mapping — `/print-template-mapping` — `print_template_mapping.read`
  7. News — `/news` — `news.read`
  8. Send Broadcast — `/broadcasts/new` — `broadcast.send`
- **Platform**
  9. Applications — `/applications` — `application.read`
  10. Roles — `/platform/roles` — `role.read`
  11. Super Admins — `/platform/super-admins` — super admin only
  12. User Platform — `/platform/user-platform` — `user_platform.read`

Not in the sidebar (reached from within other pages): `/platform/permissions` (from Role pages), `/changelog` (footer/version badge), `/profile` (avatar menu at the sidebar bottom).

## Route conventions

Every domain entity follows the same two-page pattern:

- **`/<entity>`** → Management page (list view, e.g. `ClusterManagement`)
- **`/<entity>/new`** → Edit page in "create" mode
- **`/<entity>/:id/edit`** → Edit page in "view" mode (switchable to edit)

`XxxManagement` pages: server-side DataTable, debounced search, Sheet-based filters, CSV export, debug sheet (dev).
`XxxEdit` pages: two-mode (read-only + edit), back button, save/cancel, debug sheet (dev), unsaved-changes warning.

## Navigation examples

```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

navigate('/clusters');                              // list
navigate(`/clusters/${id}/edit`);                   // detail
navigate(`/clusters/${created.id}/edit`, {          // after create
  replace: true,
});
navigate(`/business-units/new?cluster_id=${id}`);   // create with query param
```

---

See [docs/OVERVIEW.md](docs/OVERVIEW.md) for pages/entities context and [CLAUDE.md](CLAUDE.md) for page patterns.
