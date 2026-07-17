import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { UserDirectorySummary, summarizeUsers, type UserSummaryData } from "./userManagement/UserDirectorySummary";
import userService from "../services/userService";
import { getErrorDetail } from '../utils/errorParser';
import { useAuth } from '../context/AuthContext';

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Plus, Pencil, Trash2, MoreHorizontal, Copy, Check, Filter, X, Building2, Users, Download, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
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
  avatar_url?: string;          // presigned avatar URL (user list + detail)
  firstname?: string;
  middlename?: string;
  lastname?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by_name?: string;
  business_unit?: UserBU[];
}

const getInitials = (record: UserRecord): string => {
  const f = record.firstname?.trim();
  const l = record.lastname?.trim();
  if (f || l) return ((f?.[0] || "") + (l?.[0] || "")).toUpperCase();
  const base = (record.name || record.username || record.email || "").trim();
  return base ? base.slice(0, 2).toUpperCase() : "?";
};

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const UserManagement: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<UserSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const storedSearch = localStorage.getItem('search_users') || '';
  const storedStatusFilters = getStoredJSON<string[]>('status_filters_users', []);
  const storedPage = Number(localStorage.getItem('page_users')) || 1;
  const storedSort = localStorage.getItem('sort_users') || '';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedStatusFilters);
  const [showDeleted, setShowDeleted] = useState<boolean>(getStoredJSON<boolean>('filter_users_deleted', false));
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [hardDeleteUser, setHardDeleteUser] = useState<UserRecord | null>(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserRecord[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [bulkSoftOpen, setBulkSoftOpen] = useState(false);
  const [bulkHardOpen, setBulkHardOpen] = useState(false);
  const [bulkConfirmCode, setBulkConfirmCode] = useState('');
  const [bulkConfirmInput, setBulkConfirmInput] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const buildInitialAdvance = () => {
    const where: Record<string, unknown> = {};
    if (storedStatusFilters.length === 1) where.is_active = storedStatusFilters[0] === "true";
    if (!getStoredJSON<boolean>('filter_users_deleted', false)) where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : "";
  };

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem("perpage_users")) || 10,
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
      const items = (data.data || data) as UserRecord[];
      // Audit moved into a nested `audit` object; flatten for the date columns
      // (tolerate the older flat shape too).
      const mapped = (Array.isArray(items) ? items : []).map((item) => {
        const audit = (item as { audit?: { created?: { at?: string; name?: string }; updated?: { at?: string; name?: string }; deleted?: { at?: string; name?: string } } }).audit;
        return {
          ...item,
          created_at: item.created_at ?? audit?.created?.at,
          created_by_name: item.created_by_name ?? audit?.created?.name,
          updated_at: item.updated_at ?? audit?.updated?.at,
          updated_by_name: item.updated_by_name ?? audit?.updated?.name,
          deleted_at: item.deleted_at ?? audit?.deleted?.at,
          deleted_by_name: item.deleted_by_name ?? audit?.deleted?.name,
        };
      });
      setUsers(mapped);
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

  // Directory band: roll up the whole (non-deleted) set + a deleted-count read.
  // Kept off the `paginate` effect so paging/searching never triggers the
  // full-list read — only mount and population-changing mutations refresh it.
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const [allRes, deletedRes] = await Promise.all([
        userService.getAll({ perpage: -1, advance: JSON.stringify({ where: { deleted_at: null } }) }),
        userService.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { deleted_at: { not: null } } }) }),
      ]);
      const items = ((allRes as { data?: unknown }).data ?? allRes) as Parameters<typeof summarizeUsers>[0];
      const list = Array.isArray(items) ? items : [];
      const deleted = deletedRes as { paginate?: { total?: number }; total?: number };
      const archived = deleted.paginate?.total ?? deleted.total ?? 0;
      setSummary(summarizeUsers(list, archived));
    } catch {
      setSummary(null); // band swaps to its inline error/retry affordance; the table still works
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_users', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_users', '1');
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem("perpage_users", String(perpage));
    localStorage.setItem('page_users', String(page));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const buildAdvance = (statuses: string[], includeDeleted: boolean) => {
    const where: Record<string, unknown> = {};
    if (statuses.length === 1) where.is_active = statuses[0] === "true";
    if (!includeDeleted) where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : "";
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('status_filters_users', JSON.stringify(next));
    localStorage.setItem('page_users', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(next, showDeleted), filter: {} }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('status_filters_users', JSON.stringify([]));
    localStorage.setItem('page_users', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([], showDeleted), filter: {} }));
  };

  const handleShowDeletedToggle = () => {
    const next = !showDeleted;
    setShowDeleted(next);
    localStorage.setItem('filter_users_deleted', JSON.stringify(next));
    localStorage.setItem('page_users', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setShowDeleted(false);
    localStorage.setItem('status_filters_users', JSON.stringify([]));
    localStorage.setItem('filter_users_deleted', JSON.stringify(false));
    localStorage.setItem('page_users', '1');
    setPaginate((prev) => ({ ...prev, page: 1, advance: buildAdvance([], false), filter: {} }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (showDeleted ? 1 : 0);

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_users', sort);
    localStorage.setItem('page_users', '1');
    setPaginate((prev) => ({ ...prev, sort, page: 1 }));
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
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to delete user', { description: getErrorDetail(err) });
    }
  };

  const handleHardDelete = useCallback((user: UserRecord) => {
    setHardDeleteUser(user);
    setHardDeleteConfirm('');
    setCopiedUsername(false);
  }, []);

  const handleConfirmHardDelete = async () => {
    if (!hardDeleteUser) return;
    setHardDeleting(true);
    try {
      await userService.hardDelete(hardDeleteUser.id);
      toast.success('User permanently deleted');
      setHardDeleteUser(null);
      setPaginate((prev) => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to permanently delete user', { description: getErrorDetail(err) });
    } finally {
      setHardDeleting(false);
    }
  };

  const handleCopyUsername = async () => {
    const token = hardDeleteUser?.username || hardDeleteUser?.email || '';
    try {
      await navigator.clipboard.writeText(token);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
      toast.success('Copied username');
    } catch {
      toast.error('Could not copy username');
    }
  };

  const handleSelectionChange = useCallback((rows: UserRecord[]) => {
    setSelectedUsers(rows);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUsers([]);
    setSelectionResetKey((k) => k + 1);
  }, []);

  // Selection is current-page only: discard it whenever the result set changes
  // (page, page size, search, sort, or filters). Without this, TanStack keeps
  // the selection map keyed by row id across data loads, leaving off-page users
  // selected and deletable while no visible checkbox is checked.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, paginate.page, paginate.perpage, paginate.search, paginate.sort, paginate.advance]);

  const rowSelectionLabel = useCallback(
    (u: UserRecord) => `Select ${u.username || u.email || u.user_id || 'user'}`,
    [],
  );

  const summarizeBulk = (results: PromiseSettledResult<unknown>[]) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`Deleted ${ok} user(s)`);
    else if (ok === 0) toast.error(`Failed to delete ${fail} user(s)`);
    else toast.warning(`Deleted ${ok}, ${fail} failed`);
  };

  const handleConfirmBulkSoftDelete = async () => {
    const results = await Promise.allSettled(selectedUsers.map((u) => userService.delete(u.id)));
    summarizeBulk(results);
    setBulkSoftOpen(false);
    clearSelection();
    setPaginate((prev) => ({ ...prev }));
    loadSummary();
  };

  const genBulkCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  const openBulkHardDelete = () => {
    setBulkConfirmCode(genBulkCode());
    setBulkConfirmInput('');
    setBulkHardOpen(true);
  };

  const handleConfirmBulkHardDelete = async () => {
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(selectedUsers.map((u) => userService.hardDelete(u.id)));
      summarizeBulk(results);
      setBulkHardOpen(false);
      setBulkConfirmInput('');
      clearSelection();
      setPaginate((prev) => ({ ...prev }));
      loadSummary();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExport = () => {
    const csv = generateCSV(users, [
      { key: 'username', label: 'Username' },
      { key: 'email', label: 'Email' },
      { key: 'is_active', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ]);
    downloadCSV(csv, `users-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const handleFetchKeycloak = async () => {
    try {
      setSyncing(true);
      await userService.fetchKeycloakUsers();
      toast.success('Users fetched from Keycloak successfully');
      setPaginate(prev => ({ ...prev }));
      loadSummary();
    } catch (err: unknown) {
      toast.error('Failed to fetch users from Keycloak', { description: getErrorDetail(err) });
    } finally {
      setSyncing(false);
    }
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
        id: "avatar",
        header: "",
        enableSorting: false,
        meta: { headerClassName: "w-12", cellClassName: "" },
        cell: ({ row }) => (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {getInitials(row.original)}
            </AvatarFallback>
            {row.original.avatar_url && (
              <AvatarImage
                src={row.original.avatar_url}
                alt=""
                className="absolute inset-0 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </Avatar>
        ),
      },
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ row }) => {
          const label = row.original.username || row.original.user_id || "-";
          return (
            <Link
              to={`/users/${row.original.id}/edit`}
              className="text-primary hover:underline block truncate"
              title={label}
            >
              {label}
            </Link>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const name = getNameDisplay(row.original);
          return (
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate" title={name}>{name}</span>
              {row.original.deleted_at && (
                <Badge variant="destructive" className="shrink-0 text-xs px-1.5 py-0" title={row.original.deleted_by_name ? `Deleted by ${row.original.deleted_by_name}` : undefined}>
                  Deleted
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="truncate" title={row.original.email || undefined}>
            {row.original.email || "-"}
          </div>
        ),
      },

      {
        id: "bu_count",
        header: "BU",
        enableSorting: false,
        meta: { headerClassName: "w-16" },
        cell: ({ row }) => {
          const bus = row.original.business_unit || [];
          const active = bus.filter(b => b.is_active).length;
          const total = bus.length;
          if (total === 0) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-success font-medium">{active}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{total}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        meta: { headerClassName: "w-24" },
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
        meta: { headerClassName: "w-40" },
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
        meta: { headerClassName: "w-40" },
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
      ...(showDeleted ? [{
        id: 'deleted_at',
        header: 'Deleted By',
        meta: { headerClassName: "w-40" },
        cell: ({ row }: { row: { original: UserRecord } }) => {
          const d = row.original;
          if (!d.deleted_at) return <span className="text-muted-foreground">-</span>;
          const fmt = (v: string | undefined) => { if (!v) return '-'; const dt = new Date(v); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`; };
          return (
            <div className="text-[11px] leading-tight text-destructive space-y-0.5">
              <div>{fmt(d.deleted_at)}</div>
              {d.deleted_by_name && <div>{d.deleted_by_name}</div>}
            </div>
          );
        },
        enableSorting: false,
      } as ColumnDef<UserRecord, unknown>] : []),
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
              <Can permission="user.update">
                <DropdownMenuItem onClick={() => navigate(`/users/${row.original.id}/edit`)} className="cursor-pointer">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </Can>
              <Can permission="user.delete">
                <DropdownMenuItem
                  onClick={() => handleDelete(row.original.id)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </Can>
              <Can permission="user.delete">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleHardDelete(row.original)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Hard Delete
                </DropdownMenuItem>
              </Can>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleDelete, handleHardDelete, navigate, showDeleted],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="User Management"
          subtitle="Manage users and permissions"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleFetchKeycloak} disabled={syncing}>
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {syncing ? 'Fetching...' : 'Fetch Keycloak'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || users.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="user.create">
                <Button onClick={() => navigate("/users/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add User</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
            </>
          }
        />

        <UserDirectorySummary summary={summary} loading={summaryLoading} error={summaryError} onRetry={loadSummary} />

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
                    <div className="space-y-3">
                      <span className="text-sm font-medium">Deleted</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showDeleted"
                          checked={showDeleted}
                          onChange={handleShowDeletedToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor="showDeleted" className="text-sm text-muted-foreground cursor-pointer">
                          Show soft-deleted users
                        </label>
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
                    <button
                      onClick={() => handleStatusFilter(s)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={`Remove ${s === "true" ? "Active" : "Inactive"} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {showDeleted && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    Show Deleted
                    <button
                      onClick={handleShowDeletedToggle}
                      className="ml-0.5 hover:text-foreground"
                      aria-label="Remove Show Deleted filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}
            {!error && users.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={Users}
                emptyTitle="No users yet"
                emptyDescription="Get started by creating your first user."
                addAction={
                  <Can permission="user.create">
                    <Button size="sm" onClick={() => navigate('/users/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <>
                {isSuperAdmin && selectedUsers.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedUsers.length} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setBulkSoftOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                      <Button variant="destructive" size="sm" onClick={openBulkHardDelete}>
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Hard Delete
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                <div className="relative">
                  {loading && users.length === 0 ? (
                    <TableSkeleton columns={isSuperAdmin ? 10 : 9} rows={paginate.perpage || 5} />
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
                    enableRowSelection={isSuperAdmin}
                    getRowId={(row) => row.id}
                    onSelectionChange={handleSelectionChange}
                    selectionResetKey={selectionResetKey}
                    getRowSelectionLabel={rowSelectionLabel}
                  />
                  </>
                  )}
                </div>
              </>
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

      <ConfirmDialog
        open={bulkSoftOpen}
        onOpenChange={(open) => { if (!open) setBulkSoftOpen(false); }}
        title={`Delete ${selectedUsers.length} user(s)`}
        description="Soft-delete the selected user(s)? They can be restored later."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmBulkSoftDelete}
      />

      {/* Hard Delete Dialog with username confirmation */}
      <Dialog open={hardDeleteUser !== null} onOpenChange={(open) => { if (!open && !hardDeleting) { setHardDeleteUser(null); setHardDeleteConfirm(''); setCopiedUsername(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete User
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the user and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{hardDeleteUser?.username || hardDeleteUser?.email || '-'}</div>
                {isSuperAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label="Copy username"
                    onClick={handleCopyUsername}
                    disabled={hardDeleting}
                  >
                    {copiedUsername ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {[hardDeleteUser?.firstname, hardDeleteUser?.middlename, hardDeleteUser?.lastname].filter(Boolean).join(' ') || hardDeleteUser?.email || '-'}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hardDeleteConfirm">
                Type <span className="font-mono font-semibold text-destructive">{hardDeleteUser?.username || hardDeleteUser?.email || ''}</span> to confirm
              </Label>
              <Input
                id="hardDeleteConfirm"
                value={hardDeleteConfirm}
                onChange={(e) => setHardDeleteConfirm(e.target.value)}
                placeholder="Enter username to confirm"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setHardDeleteUser(null); setHardDeleteConfirm(''); setCopiedUsername(false); }} disabled={hardDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmHardDelete}
              disabled={hardDeleting || hardDeleteConfirm !== (hardDeleteUser?.username || hardDeleteUser?.email || '')}
            >
              {hardDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {hardDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Hard Delete Dialog with random-code confirmation */}
      <Dialog open={bulkHardOpen} onOpenChange={(open) => { if (!open && !bulkDeleting) { setBulkHardOpen(false); setBulkConfirmInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete {selectedUsers.length} User(s)
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the selected users and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
              {selectedUsers.map((u) => (
                <div key={u.id} className="text-sm font-medium">
                  {u.username || u.email || u.user_id || u.id}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkHardConfirm">
                Type <span className="font-mono font-semibold text-destructive">{bulkConfirmCode}</span> to confirm
              </Label>
              <Input
                id="bulkHardConfirm"
                value={bulkConfirmInput}
                onChange={(e) => setBulkConfirmInput(e.target.value.toUpperCase())}
                placeholder="Enter the 6-character code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkHardOpen(false); setBulkConfirmInput(''); }} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmBulkHardDelete}
              disabled={bulkDeleting || bulkConfirmInput !== bulkConfirmCode}
            >
              {bulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {bulkDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DevDebugSheet title="API Response" endpoint="GET /api-system/user" data={rawResponse} />
    </Layout>
  );
};

export default UserManagement;
