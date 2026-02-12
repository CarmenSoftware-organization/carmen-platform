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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { Plus, Pencil, Trash2, Search, MoreHorizontal, Code, Copy, Check, Filter, X, Building2, Users, Download } from "lucide-react";
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import type { PaginateParams } from "../types";
import type { ColumnDef } from "@tanstack/react-table";

interface UserBU {
  id: string;
  is_active: boolean;
}

interface UserRecord {
  id: string;
  user_id: string;
  is_active: boolean;
  username?: string;
  name?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  created_at?: string;
  created_by_name?: string;
  platform_role?: string;
  updated_at?: string;
  updated_by_name?: string;
  business_unit?: UserBU[];
}

const PLATFORM_ROLES = [
  "super_admin",
  "platform_admin",
  "support_manager",
  "support_staff",
  "security_officer",
  "integration_developer",
  "user",
];

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: 1,
    perpage: Number(localStorage.getItem("perpage_users")) || 10,
    search: "",
    sort: "",
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = (await userService.getAll(params)) as unknown as Record<string, unknown>;
      setRawResponse(data);
      const items = (data.data || data) as UserRecord[];
      setUsers(Array.isArray(items) ? items : []);
      const pag = data.paginate as Record<string, number> | undefined;
      setTotalRows(pag?.total ?? (data.total as number) ?? (Array.isArray(items) ? items.length : 0));
      setError("");
    } catch (err: unknown) {
      setError("Failed to load users: " + getErrorDetail(err));
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
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_users", String(perpage));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const buildAdvance = (roles: string[], statuses: string[]) => {
    const where: Record<string, unknown> = {};
    if (roles.length > 0) where.platform_role = { in: roles };
    if (statuses.length === 1) where.is_active = statuses[0] === "true";
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : "";
  };

  const handleRoleFilter = (role: string) => {
    const next = roleFilter.includes(role)
      ? roleFilter.filter((r) => r !== role)
      : [...roleFilter, role];
    setRoleFilter(next);
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(next, statusFilter), filter: {} }));
  };

  const handleClearRoleFilter = () => {
    setRoleFilter([]);
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([], statusFilter), filter: {} }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(roleFilter, next), filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(roleFilter, []), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setRoleFilter([]);
    setStatusFilter([]);
    setPaginate((prev) => ({ ...prev, page: 1, advance: "", filter: {} }));
  };

  const activeFilterCount = (roleFilter.length > 0 ? 1 : 0) + (statusFilter.length > 0 ? 1 : 0);

  const handleSortChange = (sort: string) => {
    setPaginate((prev) => ({ ...prev, sort }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await userService.delete(deleteId);
      toast.success('User deleted successfully');
      setDeleteId(null);
      setPaginate((prev) => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete user', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(users, [
      { key: 'username', label: 'Username' },
      { key: 'email', label: 'Email' },
      { key: 'platform_role', label: 'Role' },
      { key: 'is_active', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `users-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const getNameDisplay = (record: UserRecord): string => {
    if (record.firstname || record.middlename || record.lastname) {
      return [record.firstname, record.middlename, record.lastname].filter(Boolean).join(" ");
    }
    return record.name || "-";
  };

  const columns = useMemo<ColumnDef<UserRecord, unknown>[]>(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ row }) => (
          <span
            className="cursor-pointer text-primary hover:underline"
            onClick={() => navigate(`/users/${row.original.id}/edit`)}
          >
            {row.original.username || row.original.user_id || "-"}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => getNameDisplay(row.original),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.original.email || "-",
      },

      {
        accessorKey: "platform_role",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.platform_role || "-"}
          </Badge>
        ),
      },
      {
        id: "bu_count",
        header: "BU",
        enableSorting: false,
        cell: ({ row }) => {
          const bus = row.original.business_unit || [];
          const active = bus.filter(b => b.is_active).length;
          const total = bus.length;
          if (total === 0) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-green-600 font-medium">{active}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{total}</span>
            </div>
          );
        },
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
        cell: ({ row }) => {
          const d = row.original;
          const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
          return (
            <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
              <div>{fmt(d.created_at)}</div>
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
          if (d.updated_at === d.created_at) return null;
          const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
          return (
            <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
              <div>{fmt(d.updated_at)}</div>
              {d.updated_by_name && <div>{d.updated_by_name}</div>}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { headerClassName: "w-10", cellClassName: "text-center" },
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.username || row.original.email}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/users/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(row.original.id)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleDelete, navigate],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage users and permissions</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || users.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate("/users/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
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
                  className="pl-9 pr-9"
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
                    <SheetDescription>Filter users by role and status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Role</span>
                        {roleFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearRoleFilter}>Clear</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {PLATFORM_ROLES.map((role) => (
                          <Button
                            key={role}
                            variant={roleFilter.includes(role) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleRoleFilter(role)}
                          >
                            {role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Button>
                        ))}
                      </div>
                    </div>
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
                {roleFilter.map((role) => (
                  <Badge key={role} variant="secondary" className="text-xs gap-1 pr-1">
                    {role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    <button onClick={() => handleRoleFilter(role)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
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
                title="No users yet"
                description={searchTerm ? `No users matching "${searchTerm}"` : "Get started by creating your first user."}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/users/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add User
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && users.length === 0 ? (
                  <TableSkeleton columns={8} rows={paginate.perpage || 5} />
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && !!rawResponse && (
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

export default UserManagement;
