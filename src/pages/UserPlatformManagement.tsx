import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import userService from "../services/userService";
import userRoleService from "../services/userRoleService";
import { getErrorDetail } from '../utils/errorParser';

import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { Filter, X, Users, Download, Loader2 } from "lucide-react";
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import type { PaginateParams } from "../types";
import type { ColumnDef } from "@tanstack/react-table";

interface UserRecord {
  id: string;
  is_active: boolean;
  username?: string;
  name?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  email?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

const getNameDisplay = (record: UserRecord): string => {
  if (record.firstname || record.middlename || record.lastname) {
    return [record.firstname, record.middlename, record.lastname].filter(Boolean).join(" ");
  }
  return record.name || "-";
};

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
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const storedSearch = localStorage.getItem('search_user_platform') || '';
  const storedStatusFilters = getStoredJSON<string[]>('status_filters_user_platform', []);
  const storedPage = Number(localStorage.getItem('page_user_platform')) || 1;
  const storedSort = localStorage.getItem('sort_user_platform') || '';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedStatusFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  // Platform-role assignment count per visible user, fetched per-row (N+1) after
  // the page loads. undefined => still loading for that user.
  const [rolesCount, setRolesCount] = useState<Record<string, number>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const buildInitialAdvance = () => {
    const where: Record<string, unknown> = {};
    if (storedStatusFilters.length === 1) where.is_active = storedStatusFilters[0] === "true";
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : "";
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem("perpage_user_platform")) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildInitialAdvance(),
    filter: {},
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = (await userService.getAll(params)) as unknown as Record<string, unknown>;
      setRawResponse(data);
      const raw = (data.data || data) as Record<string, unknown>[];
      // Timestamps may arrive flat (created_at) or nested under `audit`; tolerate both.
      const items: UserRecord[] = (Array.isArray(raw) ? raw : []).map((item) => {
        const audit = (item as { audit?: { created?: { at?: string; name?: string }; updated?: { at?: string; name?: string } } }).audit;
        return {
          ...(item as unknown as UserRecord),
          created_at: (item.created_at as string | undefined) ?? audit?.created?.at,
          created_by_name: (item.created_by_name as string | undefined) ?? audit?.created?.name,
          updated_at: (item.updated_at as string | undefined) ?? audit?.updated?.at,
          updated_by_name: (item.updated_by_name as string | undefined) ?? audit?.updated?.name,
        };
      });
      setUsers(items);
      const pag = data.paginate as Record<string, number> | undefined;
      setTotalRows(pag?.total ?? (data.total as number) ?? (Array.isArray(items) ? items.length : 0));
      setError("");
      // Fetch platform-role assignment counts per row in the background (N+1;
      // page size is small). The table renders immediately; counts fill in.
      setRolesCount({});
      void Promise.all(
        items.map(async (u) => {
          try { return [u.id, (await userRoleService.list(u.id)).length] as const; }
          catch { return [u.id, 0] as const; }
        }),
      ).then((pairs) => setRolesCount(Object.fromEntries(pairs)));
    } catch (err: unknown) {
      const msg = "Failed to load users: " + getErrorDetail(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(paginate);
  }, [fetchUsers, paginate]);

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
    localStorage.setItem("perpage_user_platform", String(perpage));
    localStorage.setItem('page_user_platform', String(page));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const buildAdvance = (statuses: string[]) => {
    const where: Record<string, unknown> = {};
    if (statuses.length === 1) where.is_active = statuses[0] === "true";
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : "";
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('status_filters_user_platform', JSON.stringify(next));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('status_filters_user_platform', JSON.stringify([]));
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const handleClearStatusFilter = handleClearAllFilters;

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_user_platform', sort);
    localStorage.setItem('page_user_platform', '1');
    setPaginate((prev) => ({ ...prev, sort, page: 1 }));
  };

  const handleExport = () => {
    const csv = generateCSV(users, [
      { key: 'username', label: 'Username' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'is_active', label: 'Status' },
    ]);
    downloadCSV(csv, `user-platform-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<UserRecord, unknown>[]>(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ row }) => (
          <button
            className="text-left font-medium text-primary hover:underline"
            onClick={() => navigate(`/platform/user-platform/${row.original.id}`)}
          >
            {row.original.username || "-"}
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span>{getNameDisplay(row.original)}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "success" : "secondary"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "roles_count",
        header: "Roles",
        enableSorting: false,
        meta: { cellClassName: 'text-center' },
        cell: ({ row }) => {
          const c = rolesCount[row.original.id];
          if (c === undefined) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />;
          return <Badge variant="secondary">{c}</Badge>;
        },
      },
      {
        accessorKey: "created_at",
        id: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
              <div>{fmtDateTime(d.created_at)}</div>
              {d.created_by_name && <div>{d.created_by_name}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: "updated_at",
        id: "updated_at",
        header: "Updated",
        cell: ({ row }) => {
          const d = row.original;
          if (d.updated_at && d.updated_at === d.created_at) return <span className="text-[11px] text-muted-foreground">-</span>;
          return (
            <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
              <div>{fmtDateTime(d.updated_at)}</div>
              {d.updated_by_name && <div>{d.updated_by_name}</div>}
            </div>
          );
        },
      },
    ],
    [navigate, rolesCount],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="User Platform"
          subtitle="Assign platform roles and scope to users"
          actions={
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || users.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          }
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
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Filter users by status</SheetDescription>
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
            {!error && users.length === 0 && !loading ? (
              <EmptyState
                icon={Users}
                title="No users found"
                description={searchTerm ? `No users matching "${searchTerm}"` : "No users are available."}
              />
            ) : !error ? (
              <div className="relative">
                {loading && users.length === 0 ? (
                  <TableSkeleton columns={7} rows={paginate.perpage || 5} />
                ) : (
                <>
                {loading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading users">
                    <div className="text-muted-foreground">Loading...</div>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={users}
                  serverSide
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

      <DevDebugSheet title="API Response" endpoint="GET /api-system/user" data={rawResponse} />
    </Layout>
  );
};

export default UserPlatformManagement;
