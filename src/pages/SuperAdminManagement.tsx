import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import superAdminService from '../services/superAdminService';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { UserPicker } from '../components/UserPicker';
import { ShieldAlert, Trash2, Plus, Loader2, MoreHorizontal, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { cn } from '../lib/utils';
import type { SuperAdmin, UserOption } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// The name to show for a row. Falls back to email, then to nothing at all —
// deliberately NOT to a phrase like "Unknown user": when the frontend is deployed
// ahead of the backend that joins these fields, every row would read as though its
// user had been deleted. An em dash states only what is true (no name here); the
// user_id underneath still identifies the row so it can always be removed.
const rowLabel = (r: SuperAdmin): string => r.name?.trim() || r.email?.trim() || '';

// Descend through nested `{ data: ... }` envelopes until the array is found.
// The super-admins endpoint nests deeper than the usual one-level convention.
const extractArray = <T,>(body: unknown): T[] => {
  let cur: unknown = body;
  while (cur && !Array.isArray(cur) && typeof cur === 'object' && 'data' in (cur as Record<string, unknown>)) {
    cur = (cur as Record<string, unknown>).data;
  }
  return Array.isArray(cur) ? (cur as T[]) : [];
};

const SuperAdminManagement: React.FC = () => {
  const [rows, setRows] = useState<SuperAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [adding, setAdding] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('search_super_admins') || '');
  const [showAddDialog, setShowAddDialog] = useState(false);
  // The picker's dropdown owns Escape while it is open; without this guard Radix would
  // dismiss the whole dialog (capture-phase document listener) and discard what was typed.
  // A ref, not state: Radix's DismissableLayer invokes onEscapeKeyDown through a callback
  // that (empirically, verified via console instrumentation) does not always see this
  // component's latest render — a `useState` value read inside that closure can be stale.
  // A ref sidesteps that entirely: `.current` is dereferenced live at call time regardless
  // of which render's closure Radix happens to invoke, so it can never be stale.
  const pickerOpenRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_super_admins', value);
  };

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const saData = await superAdminService.list();
      // The gateway's @EnrichAuditUsers() moves the timestamp into `audit.created.at`;
      // flatten it back to `created_at` here (tolerate the older flat shape too) — the
      // same pattern as BusinessUnitManagement/RoleManagement — so both the Added column
      // and the CSV export (which both read `created_at`) get a real value.
      const items = extractArray<SuperAdmin>(saData).map((item) => ({
        ...item,
        created_at: item.created_at ?? item.audit?.created?.at,
      }));
      setRows(items);
      setRawResponse(saData);
      setError('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error('Failed to load super admins', { description: parsed.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Users already holding the privilege — the picker greys them out instead of
  // letting someone submit a request the backend would reject with 409.
  const superAdminUserIds = useMemo(
    () => new Set(rows.map((r) => r.user_id)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.user_id].some((field) =>
        (field || '').toLowerCase().includes(term),
      ),
    );
  }, [rows, searchTerm]);

  const openAddDialog = () => {
    // Reset the Escape guard on open, not only on close: the dialog is controlled, so
    // closing it from code never fires Radix's onOpenChange, and a stale `true` here
    // would make a reopened dialog ignore Escape entirely.
    pickerOpenRef.current = false;
    setShowAddDialog(true);
  };

  const handleAdd = async () => {
    if (!selectedUser) return;
    try {
      setAdding(true);
      await superAdminService.add(selectedUser.id);
      toast.success('Super admin added successfully');
      setSelectedUser(null);
      setShowAddDialog(false);
      pickerOpenRef.current = false;
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to add super admin', { description: parsed.message });
      // Refetch on 409 only. A 409 here means someone else granted it first, so the
      // table on screen is provably stale. Any other failure changed nothing on the
      // server, and refetching after it would throw away nothing but cost a request.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        await fetchData();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeId) return;
    try {
      await superAdminService.remove(removeId);
      toast.success('Super admin removed successfully');
      setRemoveId(null);
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to remove super admin', { description: parsed.message });
    }
  };

  const handleExport = () => {
    const data = rows.map((r) => ({
      user: rowLabel(r),
      email: r.email || '',
      user_id: r.user_id,
      status: r.is_active !== false ? 'Active' : 'Inactive',
      added: fmt(r.created_at),
    }));
    const csv = generateCSV(data, [
      { key: 'user', label: 'User' },
      { key: 'email', label: 'Email' },
      { key: 'user_id', label: 'User ID' },
      { key: 'status', label: 'Status' },
      { key: 'added', label: 'Added' },
    ]);
    downloadCSV(csv, `super-admins-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<SuperAdmin, unknown>[]>(() => [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const label = rowLabel(row.original);
        return (
          <div className="min-w-0">
            <div className={cn('text-sm font-medium truncate', !label && 'text-muted-foreground')}>
              {label || '—'}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground truncate">
              {row.original.user_id}
            </div>
          </div>
        );
      },
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="min-w-0 truncate text-sm">
          {row.original.email || <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: 'Status',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active !== false ? 'success' : 'secondary'}>
          {row.original.is_active !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Added',
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground">
          {fmt(row.original.created_at)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-16', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Actions for ${rowLabel(row.original) || row.original.user_id}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setRemoveId(row.original.id)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], []);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title="Super Admins"
          subtitle="Platform users who bypass all permission checks"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Add Super Admin</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </>
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="Search super admins..."
                className="flex-1 sm:max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!error && filteredRows.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={0}
                icon={ShieldAlert}
                emptyTitle="No super admins"
                emptyDescription="No platform users have super-admin privileges yet."
                addAction={
                  <Button size="sm" onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Super Admin
                  </Button>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && rows.length === 0 ? (
                  // +1 accounts for the `#` row-index column DataTable always prepends,
                  // so the skeleton matches the loaded table's actual header count.
                  <TableSkeleton columns={columns.length + 1} rows={5} />
                ) : (
                  <>
                    {loading && (
                      <div
                        className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                        role="status"
                        aria-label="Loading super admins"
                      >
                        <div className="text-muted-foreground">Loading super admins...</div>
                      </div>
                    )}
                    <DataTable columns={columns} data={filteredRows} />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Add Super Admin Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSelectedUser(null);
            pickerOpenRef.current = false;
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => {
            // The picker's dropdown owns Escape while it is open; without this guard
            // Radix would dismiss the whole dialog and discard what was typed.
            if (pickerOpenRef.current) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add Super Admin</DialogTitle>
            <DialogDescription>
              Grant a platform user full super-admin privileges (bypasses all permission checks).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <UserPicker
              id="super-admin-user"
              value={selectedUser}
              onChange={setSelectedUser}
              disabledIds={superAdminUserIds}
              disabledLabel="Already super admin"
              placeholder="Search users by name or email"
              disabled={adding}
              onDropdownOpenChange={(v) => {
                pickerOpenRef.current = v;
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddDialog(false);
                setSelectedUser(null);
                pickerOpenRef.current = false;
              }}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={adding || !selectedUser}>
              {adding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {adding ? 'Adding...' : 'Add Super Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title="Remove Super Admin"
        description="Are you sure you want to remove this user's super-admin privileges? They will no longer bypass permission checks."
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={handleConfirmRemove}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/super-admins" data={rawResponse} />
    </Layout>
  );
};

export default SuperAdminManagement;
