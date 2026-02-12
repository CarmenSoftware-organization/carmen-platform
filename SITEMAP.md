# Carmen Platform - Sitemap

## Route Map

```
/                                    Landing (public)
/login                               Login (public)
/dashboard                           Dashboard (authenticated)
/clusters                            Cluster Management (role-restricted)
/clusters/new                        Cluster Create (role-restricted)
/clusters/:id/edit                   Cluster Edit (role-restricted)
/business-units                      Business Unit Management (authenticated)
/business-units/new                  Business Unit Create (authenticated)
/business-units/:id/edit             Business Unit Edit (authenticated)
/users                               User Management (authenticated)
/users/new                           User Create (authenticated)
/users/:id/edit                      User Edit (authenticated)
/profile                             User Profile (authenticated)
*                                    Redirect to /
```

---

## Pages Overview

### Public Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Public homepage with login link |
| `/login` | Login | Email/password authentication form |

### Protected Pages (All Authenticated Users)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Home page with stats cards and quick navigation to Clusters, Business Units, Users |
| `/business-units` | Business Unit Management | List view with search, filter (status), pagination, CSV export |
| `/business-units/new` | Business Unit Create | Form with 9 collapsible sections (Basic, Hotel, Company, Tax, Date/Time, Numbers, Calculation, Config, DB Connection) |
| `/business-units/:id/edit` | Business Unit Edit | Read-only view with Edit toggle; same 9-section form |
| `/users` | User Management | List view with search, filter (status, role), pagination, CSV export |
| `/users/new` | User Create | Form: username, email, name fields, active status |
| `/users/:id/edit` | User Edit | Read-only view with Edit toggle; includes assigned Business Units table |
| `/profile` | Profile | View/edit own profile info + Change Password dialog |

### Role-Restricted Pages

| Route | Page | Allowed Roles |
|-------|------|---------------|
| `/clusters` | Cluster Management | `platform_admin`, `support_manager`, `support_staff` |
| `/clusters/new` | Cluster Create | `platform_admin`, `support_manager`, `support_staff` |
| `/clusters/:id/edit` | Cluster Edit | `platform_admin`, `support_manager`, `support_staff` |

---

## Sidebar Navigation

```
+---------------------------+
| Carmen Platform (logo)    |
+---------------------------+
| Dashboard        (/)      |  All users
| Clusters         (/)      |  Admin/Support only
| Business Units   (/)      |  All users
| Users            (/)      |  All users
+---------------------------+
| [User Avatar]             |
| Name / Email / Role       |
| Profile | Log out         |
+---------------------------+
```

---

## Page Features Matrix

| Page | Search | Filter | Pagination | CSV Export | CRUD | Debug Sheet |
|------|--------|--------|------------|------------|------|-------------|
| Landing | - | - | - | - | - | - |
| Login | - | - | - | - | - | - |
| Dashboard | - | - | - | - | - | - |
| Cluster Management | Debounced 400ms | Status (Active/Inactive) | Server-side | Yes | List + Delete | Yes |
| Cluster Edit | - | - | - | - | Create / Read / Update | Yes (tabbed) |
| BU Management | Debounced 400ms | Status (Active/Inactive) | Server-side | Yes | List + Delete | Yes |
| BU Edit | - | - | - | - | Create / Read / Update | Yes (tabbed) |
| User Management | Debounced 400ms | Status + Role | Server-side | Yes | List + Delete | Yes |
| User Edit | - | - | - | - | Create / Read / Update | Yes (tabbed) |
| Profile | - | - | - | - | Read / Update + Password | Yes |

---

## User Flows

### Authentication Flow

```
Landing (/) --> Login (/login) --> Dashboard (/dashboard)
                                        |
                                   [Sidebar Nav]
                                   /    |    \
                             Clusters  BUs  Users
```

### CRUD Flow (per entity)

```
Management (list) --[Add]--> Edit (new) --[Save]--> Management (list)
      |                                                    ^
      |--[Click code]----> Edit (read-only)                |
                                |                          |
                           [Edit btn]                      |
                                |                          |
                           Edit (editing) --[Save]---------+
                                |
                           [Cancel] --> Edit (read-only)
```

### Management Page Flow

```
Load page --> Fetch data --> Display table
                  |
         [Search] | [Filter] | [Sort] | [Page change]
                  |
              Re-fetch data --> Update table
                  |
         [Export CSV] --> Download file
         [Delete] --> Confirm dialog --> Delete API --> Re-fetch
```

---

## Access Control Summary

| Role | Dashboard | Clusters | Business Units | Users | Profile |
|------|-----------|----------|---------------|-------|---------|
| `platform_admin` | Yes | Yes | Yes | Yes | Yes |
| `support_manager` | Yes | Yes | Yes | Yes | Yes |
| `support_staff` | Yes | Yes | Yes | Yes | Yes |
| Other roles | Yes | No (Access Denied) | Yes | Yes | Yes |

---

## API Endpoints (Backend)

All API calls use base URL `https://dev.blueledgers.com:4001` with prefix `/api-system/`.

| Entity | List | Get | Create | Update | Delete |
|--------|------|-----|--------|--------|--------|
| Cluster | `GET /api-system/cluster` | `GET /api-system/cluster/:id` | `POST /api-system/cluster` | `PUT /api-system/cluster/:id` | `DELETE /api-system/cluster/:id` |
| Business Unit | `GET /api-system/business-unit` | `GET /api-system/business-unit/:id` | `POST /api-system/business-unit` | `PUT /api-system/business-unit/:id` | `DELETE /api-system/business-unit/:id` |
| User | `GET /api-system/user` | `GET /api-system/user/:id` | `POST /api-system/user` | `PUT /api-system/user/:id` | `DELETE /api-system/user/:id` |
| Auth | - | - | `POST /api-system/auth/login` | - | - |
| Profile | - | `GET /api-system/profile` | - | `PUT /api-system/profile` | - |

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl/Cmd + K` | Focus search input | Management pages |
| `Ctrl/Cmd + S` | Save changes | Edit pages (when editing) |
| `Escape` | Cancel edit / Close dialog | Edit pages |
| `?` | Toggle keyboard shortcuts help | All pages (outside inputs) |
