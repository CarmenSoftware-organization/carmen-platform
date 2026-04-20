# SITEMAP

All routes in the Carmen Platform SPA. Source: `src/App.tsx`.

## Route table

| Path | Component | Access | Purpose |
|---|---|---|---|
| `/` | `Landing` | Public | Marketing/landing page |
| `/login` | `Login` | Public | Username/password form |
| `/dashboard` | `Dashboard` | Authenticated | Home hub, summary cards |
| `/clusters` | `ClusterManagement` | `platform_admin`, `support_manager`, `support_staff` | Cluster list (DataTable + filters + CSV export) |
| `/clusters/new` | `ClusterEdit` | `platform_admin`, `support_manager`, `support_staff` | Create cluster |
| `/clusters/:id/edit` | `ClusterEdit` | `platform_admin`, `support_manager`, `support_staff` | View/edit cluster + BUs + users |
| `/business-units` | `BusinessUnitManagement` | Authenticated | Business unit list |
| `/business-units/new` | `BusinessUnitEdit` | Authenticated | Create BU (collapsible sections) |
| `/business-units/:id/edit` | `BusinessUnitEdit` | Authenticated | View/edit BU |
| `/users` | `UserManagement` | Authenticated | User list (role + status filters) |
| `/users/new` | `UserEdit` | Authenticated | Create user |
| `/users/:id/edit` | `UserEdit` | Authenticated | View/edit user + BU assignments |
| `/report-templates` | `ReportTemplateManagement` | `platform_admin`, `support_manager`, `support_staff` | Report template list |
| `/report-templates/new` | `ReportTemplateEdit` | `platform_admin`, `support_manager`, `support_staff` | Create report template |
| `/report-templates/:id/edit` | `ReportTemplateEdit` | `platform_admin`, `support_manager`, `support_staff` | View/edit report template (XML editors + preview) |
| `/profile` | `Profile` | Authenticated | View/edit own profile, change password |
| `*` | `<Navigate to="/" />` | — | Catch-all redirect to Landing |

"Authenticated" means `PrivateRoute` with no `allowedRoles` prop — any logged-in user passes. Guards that list roles reject other roles with `<AccessDenied>`.

## Sidebar navigation

Defined in `src/components/Layout.tsx`; items are filtered through `hasRole()` from `AuthContext`. Display order:

1. Dashboard — `/dashboard` — all authenticated users
2. Clusters — `/clusters` — `platform_admin`, `support_manager`, `support_staff`
3. Business Units — `/business-units` — all authenticated users
4. Users — `/users` — all authenticated users
5. Report Templates — `/report-templates` — `platform_admin`, `support_manager`, `support_staff`

The user profile + logout menu lives at the bottom of the sidebar (no route — `/profile` is reached from the avatar menu).

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
