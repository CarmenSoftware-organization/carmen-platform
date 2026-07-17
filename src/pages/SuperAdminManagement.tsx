import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import superAdminService from '../services/superAdminService';
import userService from '../services/userService';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ShieldAlert, Trash2, Plus, Loader2, MoreHorizontal, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import type { User } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

interface SuperAdminRow {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
}

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

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
  const [rows, setRows] = useState<SuperAdminRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [saData, usersData] = await Promise.all([
        superAdminService.list(),
        userService.getAll({ perpage: 200, sort: 'created_at:desc' }),
      ]);
      setRows(extractArray<SuperAdminRow>(saData));
      setRawResponse(saData);

      const userItems: User[] = (usersData.data || usersData) as User[];
      setUsers(Array.isArray(userItems) ? userItems : []);

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

  // Build a map of user_id -> display label for resolving names
  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of users) {
      const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
      const fullName = parts.join(' ');
      m[u.id] = fullName || u.email || u.name || u.id;
    }
    return m;
  }, [users]);

  // Users not already super-admins
  const superAdminUserIds = useMemo(
    () => new Set(rows.map((r) => r.user_id)),
    [rows],
  );
  const availableUsers = useMemo(
    () => users.filter((u) => !superAdminUserIds.has(u.id)),
    [users, superAdminUserIds],
  );

  const resolveUser = useCallback((user_id: string): string => userMap[user_id] || user_id, [userMap]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => resolveUser(r.user_id).toLowerCase().includes(term) || r.user_id.toLowerCase().includes(term),
    );
  }, [rows, searchTerm, resolveUser]);

  const openAddDialog = () => setShowAddDialog(true);

  const handleAdd = async () => {
    if (!selectedUserId) return;
    try {
      setAdding(true);
      await superAdminService.add(selectedUserId);
      toast.success('Super admin added successfully');
      setSelectedUserId('');
      setShowAddDialog(false);
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to add super admin', { description: parsed.message });
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
      user: resolveUser(r.user_id),
      user_id: r.user_id,
      status: r.is_active !== false ? 'Active' : 'Inactive',
      added: fmt(r.created_at),
    }));
    const csv = generateCSV(data, [
      { key: 'user', label: 'User' },
      { key: 'user_id', label: 'User ID' },
      { key: 'status', label: 'Status' },
      { key: 'added', label: 'Added' },
    ]);
    downloadCSV(csv, `super-admins-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<SuperAdminRow, unknown>[]>(() => [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{resolveUser(row.original.user_id)}</div>
          <div className="font-mono text-[11px] text-muted-foreground truncate">{row.original.user_id}</div>
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
              aria-label={`Actions for ${resolveUser(row.original.user_id)}`}
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
  ], [resolveUser]);

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
                onValueChange={setSearchTerm}
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
                  <TableSkeleton columns={4} rows={5} />
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
          if (!open) setSelectedUserId('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Super Admin</DialogTitle>
            <DialogDescription>
              Grant a platform user full super-admin privileges (bypasses all permission checks).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={loading || adding}>
              <SelectTrigger aria-label="Select user to add as super admin">
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => {
                  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
                  const fullName = parts.join(' ');
                  const label = fullName ? `${fullName} (${u.email || u.id})` : (u.email || u.name || u.id);
                  return (
                    <SelectItem key={u.id} value={u.id}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)} disabled={adding}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={adding || !selectedUserId}>
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
