import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { PlatformAccessSummary, summarizeRegistry } from "./userPlatformManagement/PlatformAccessSummary";
import { ScopeRail, RoleChips, hasPlatformWide } from "./userPlatformManagement/roleChips";
import { GrantAccessDialog } from "./userPlatformManagement/GrantAccessDialog";
import userPlatformService from "../services/userPlatformService";
import userRoleService from "../services/userRoleService";
import roleService from "../services/roleService";
import clusterService from "../services/clusterService";
import { parseApiError } from '../utils/errorParser';

import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Filter, X, Users, Download, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import type { PaginateParams, PlatformUserRow } from "../types";
import type { ColumnDef } from "@tanstack/react-table";

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const fmtDateTime = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const UserPlatformManagement: React.FC = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<PlatformUserRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PlatformUserRow | null>(null);

  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('search_user_platform') || '');
  const [roleFilter, setRoleFilter] = useState<string[]>(() => getStoredJSON<string[]>('role_filters_user_platform', []));
  const [scopeFilter, setScopeFilter] = useState<string>(() => localStorage.getItem('scope_filter_user_platform') || '');
  const [statusFilter, setStatusFilter] = useState<string[]>(() => getStoredJSON<string[]>('status_filters_user_platform', []));
  const [showFilters, setShowFilters] = useState(false);

  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  // `cluster_id: null` is deliberate — it is how the endpoint selects platform-wide
  // assignments. Do not let an `if (scope)` truthiness guard drop it.
  const buildAdvance = (roles: string[], scope: string, statuses: string[]) => {
    const where: Record<string, unknown> = {};
    if (roles.length > 0) where.platform_role_id = { in: roles };
    if (scope === 'platform') where.cluster_id = null;
    else if (scope) where.cluster_id = { in: [scope] };
    if (statuses.length === 1) where.is_active = statuses[0] === 'true';
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };

  const storedPage = Number(localStorage.getItem('page_user_platform')) || 1;
  const storedSort = localStorage.getItem('sort_user_platform') || '';

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_user_platform')) || 10,
    search: searchTerm,
    sort: storedSort,
    advance: buildAdvance(roleFilter, scopeFilter, statusFilter),
    filter: {},
  });

  // Registry endpoint returns roles inline and `paginate.total` for the headline —
  // exactly one request per load. No per-row role-count loop, no perpage:-1 sweep.
  const fetchRows = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await userPlatformService.getAll(params);
      setRawResponse(data);
      const items = Array.isArray(data?.data) ? data.data : [];
      setRows(items);
      setTotalRows(data?.paginate?.total ?? items.length);
      setError('');
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      setError(message);
      setRows([]);
      setTotalRows(0);
      toast.error('Failed to load platform users', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(paginate);
  }, [fetchRows, paginate]);

  // Role/cluster names for the filter Sheet and the active-filter chips. Best-effort:
  // if either fails, filtering still works by id — only the display name is missing.
  useEffect(() => {
    (async () => {
      try {
        const r = await roleService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = r.data || r;
        setRoleOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* filter buttons fall back to raw ids */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = c.data || c;
        setClusterOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* same */ }
    })();
  }, []);

  const summary = useMemo(() => summarizeRegistry(rows, totalRows), [rows, totalRows]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_user_platform', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_user_platform', '1');
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_user_platform', String(perpage));
    localStorage.setItem('page_user_platform', String(page));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_user_platform', sort);
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, sort, page: 1 }));
  };

  const handleRoleFilter = (roleId: string) => {
    const next = roleFilter.includes(roleId)
      ? roleFilter.filter((r) => r !== roleId)
      : [...roleFilter, roleId];
    setRoleFilter(next);
    localStorage.setItem('role_filters_user_platform', JSON.stringify(next));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(next, scopeFilter, statusFilter), filter: {} }));
  };

  const handleScopeFilter = (scope: string) => {
    setScopeFilter(scope);
    localStorage.setItem('scope_filter_user_platform', scope);
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(roleFilter, scope, statusFilter), filter: {} }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('status_filters_user_platform', JSON.stringify(next));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(roleFilter, scopeFilter, next), filter: {} }));
  };

  const handleClearRoleFilter = () => {
    setRoleFilter([]);
    localStorage.setItem('role_filters_user_platform', JSON.stringify([]));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([], scopeFilter, statusFilter), filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('status_filters_user_platform', JSON.stringify([]));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(roleFilter, scopeFilter, []), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setRoleFilter([]);
    setScopeFilter('');
    setStatusFilter([]);
    localStorage.setItem('role_filters_user_platform', JSON.stringify([]));
    localStorage.setItem('scope_filter_user_platform', '');
    localStorage.setItem('status_filters_user_platform', JSON.stringify([]));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([], '', []), filter: {} }));
  };

  const activeFilterCount =
    (roleFilter.length > 0 ? 1 : 0) + (scopeFilter ? 1 : 0) + (statusFilter.length > 0 ? 1 : 0);

  // No bulk-revoke route on the backend — a sequential loop over userRoleService.remove
  // that reports honestly which roles failed rather than claiming a blanket success.
  const handleRevokeAll = async () => {
    if (!revokeTarget) return;
    const failed: string[] = [];
    for (const role of revokeTarget.roles) {
      try {
        await userRoleService.remove(revokeTarget.user_id, role.id);
      } catch {
        failed.push(role.role_name || role.role_id);
      }
    }
    if (failed.length === 0) toast.success('Access revoked');
    else toast.error(`Could not revoke: ${failed.join(', ')}`);
    setRevokeTarget(null);
    fetchRows(paginate);
  };

  // One row per assignment — a spreadsheet cell can't filter on several roles at once.
  const handleExport = () => {
    const flat = rows.flatMap((r) =>
      r.roles.map((role) => ({
        username: r.username ?? '',
        email: r.email ?? '',
        is_active: r.is_active ? 'Active' : 'Inactive',
        role: role.role_name ?? role.role_id,
        scope: role.scope.type === 'platform'
          ? 'Platform'
          : (role.scope.cluster_name || role.scope.cluster_id),
        granted_at: role.audit?.created?.at ?? '',
        granted_by: role.audit?.created?.name ?? '',
      })),
    );
    const csv = generateCSV(flat, [
      { key: 'username', label: 'Username' },
      { key: 'email', label: 'Email' },
      { key: 'is_active', label: 'Status' },
      { key: 'role', label: 'Role' },
      { key: 'scope', label: 'Scope' },
      { key: 'granted_at', label: 'Granted at' },
      { key: 'granted_by', label: 'Granted by' },
    ]);
    downloadCSV(csv, `user-platform-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<PlatformUserRow, unknown>[]>(() => [
    {
      accessorKey: 'username',
      header: 'User',
      meta: { card: 'title' },
      cell: ({ row }) => {
        const r = row.original;
        const name = [r.firstname, r.lastname].filter(Boolean).join(' ');
        return (
          <div className="flex items-stretch gap-3">
            <ScopeRail platformWide={hasPlatformWide(r.roles)} />
            <div className="min-w-0">
              <Link
                to={`/platform/user-platform/${r.user_id}`}
                className="font-medium text-primary hover:underline"
              >
                {name || r.username || '-'}
              </Link>
              {!r.is_active && (
                <Badge variant="secondary" className="ml-2 text-xs">Inactive</Badge>
              )}
              <div className="text-muted-foreground truncate text-xs">{r.email || '-'}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'roles',
      header: 'Roles & scope',
      enableSorting: false,
      cell: ({ row }) => <RoleChips roles={row.original.roles} />,
    },
    {
      accessorKey: 'last_granted_at',
      id: 'last_granted_at',
      header: 'Granted',
      meta: { headerClassName: 'w-44' },
      cell: ({ row }) => {
        const roles = row.original.roles;
        // The grantor shown belongs to the most recent grant, which is the one the
        // "Granted" date refers to. Per-role attribution lives on the detail page.
        const newest = roles.reduce<typeof roles[number] | undefined>((acc, r) => {
          const at = r.audit?.created?.at;
          if (!at) return acc;
          return !acc?.audit?.created?.at || at > acc.audit.created.at ? r : acc;
        }, undefined);
        const by = newest?.audit?.created?.name;
        return (
          <div className="text-muted-foreground space-y-0.5 text-[11px] leading-tight">
            <div>{fmtDateTime(row.original.last_granted_at ?? undefined)}</div>
            <div>{by ? `by ${by}` : 'by —'}</div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-20', cellClassName: 'text-center p-0', card: 'actions' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              aria-label={`Actions for ${row.original.username || 'user'}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => navigate(`/platform/user-platform/${row.original.user_id}`)}
              className="cursor-pointer"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Manage roles
            </DropdownMenuItem>
            <Can permission="user_platform.manage">
              <DropdownMenuItem
                onClick={() => setRevokeTarget(row.original)}
                className="cursor-pointer text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke all access
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="User Platform"
          subtitle="Users holding platform roles"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="user_platform.manage">
                <Button size="sm" onClick={() => setShowGrant(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Grant access
                </Button>
              </Can>
            </div>
          }
        />

        <PlatformAccessSummary
          summary={summary}
          loading={loading}
          error={!!error}
          onRetry={() => fetchRows(paginate)}
          onShowInactive={() => handleStatusFilter('false')}
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search users..."
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Filter holders by role, scope and status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStatusFilter}>Clear</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant={statusFilter.includes("true") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("true")}
                        >
                          Active
                        </Button>
                        <Button
                          variant={statusFilter.includes("false") ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStatusFilter("false")}
                        >
                          Inactive
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Role</span>
                        {roleFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearRoleFilter}>Clear</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {roleOptions.length === 0 ? (
                          <p className="text-muted-foreground text-xs">No platform roles available.</p>
                        ) : roleOptions.map((role) => (
                          <Button
                            key={role.id}
                            variant={roleFilter.includes(role.id) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleRoleFilter(role.id)}
                          >
                            {role.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="scope_filter">Scope</Label>
                      <select
                        id="scope_filter"
                        value={scopeFilter}
                        onChange={(e) => handleScopeFilter(e.target.value)}
                        className={selectClassName}
                      >
                        <option value="">Any scope</option>
                        <option value="platform">Platform-wide</option>
                        {clusterOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
                        Clear All Filters
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filters:</span>
                {roleFilter.map((id) => (
                  <Badge key={`role-${id}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {roleOptions.find((r) => r.id === id)?.name || id}
                    <button onClick={() => handleRoleFilter(id)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {scopeFilter && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {scopeFilter === 'platform' ? 'Platform-wide' : (clusterOptions.find((c) => c.id === scopeFilter)?.name || scopeFilter)}
                    <button onClick={() => handleScopeFilter('')} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {statusFilter.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {s === "true" ? "Active" : "Inactive"}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}
            {!error && rows.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Users}
                emptyTitle="No one holds platform roles yet"
                emptyDescription="Grant access to give someone a platform role."
                addAction={
                  <Can permission="user_platform.manage">
                    <Button size="sm" onClick={() => setShowGrant(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Grant access
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && rows.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading platform users">
                    <div className="text-muted-foreground">Loading...</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={rows}
                  serverSide
                  tableLayout="auto"
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={handleSortChange}
                />
                </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <GrantAccessDialog open={showGrant} onOpenChange={setShowGrant} onGranted={() => fetchRows(paginate)} />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke all platform access"
        description={
          revokeTarget
            ? `Remove all ${revokeTarget.roles.length} role assignment${revokeTarget.roles.length === 1 ? '' : 's'} from ${revokeTarget.username || revokeTarget.email}? They will no longer appear in this registry.`
            : ''
        }
        confirmText="Revoke all"
        confirmVariant="destructive"
        onConfirm={handleRevokeAll}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/users" data={rawResponse} />
    </Layout>
  );
};

export default UserPlatformManagement;
