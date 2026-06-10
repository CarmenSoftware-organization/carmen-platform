import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import userService from "../services/userService";
import { getErrorDetail } from '../utils/errorParser';

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { Search, Code, Copy, Check, Filter, X, Users, Download } from "lucide-react";
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import type { PaginateParams } from "../types";
import type { ColumnDef } from "@tanstack/react-table";

interface UserRecord {
  id: string;
  is_active: boolean;
  username?: string;
  name?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
}

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
  const [copied, setCopied] = useState(false);
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
        const audit = (item as { audit?: { created?: { at?: string }; updated?: { at?: string } } }).audit;
        return {
          ...(item as unknown as UserRecord),
          created_at: (item.created_at as string | undefined) ?? audit?.created?.at,
          updated_at: (item.updated_at as string | undefined) ?? audit?.updated?.at,
        };
      });
      setUsers(items);
      const pag = data.paginate as Record<string, number> | undefined;
      setTotalRows(pag?.total ?? (data.total as number) ?? (Array.isArray(items) ? items.length : 0));
      setError("");
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

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        cell: ({ row }) => <span>{row.original.name || "-"}</span>,
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
        accessorKey: "created_at",
        id: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-[11px] leading-tight text-muted-foreground">{fmtDateTime(row.original.created_at)}</span>
        ),
      },
      {
        accessorKey: "updated_at",
        id: "updated_at",
        header: "Updated",
        cell: ({ row }) => {
          const d = row.original;
          if (d.updated_at && d.updated_at === d.created_at) return <span className="text-[11px] text-muted-foreground">-</span>;
          return <span className="text-[11px] leading-tight text-muted-foreground">{fmtDateTime(d.updated_at)}</span>;
        },
      },
    ],
    [navigate],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Platform</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Assign platform roles and scope to users</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || users.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search users"
                />
                {searchTerm && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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
                  <TableSkeleton columns={6} rows={paginate.perpage || 5} />
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

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/user
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default UserPlatformManagement;
