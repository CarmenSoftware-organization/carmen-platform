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
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { SuperAdmin, UserOption } from '../types';
import type { ColumnDef } from '@tanstack/react-table';
import { useI18n } from '../hooks/useI18n';

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
  const { t } = useI18n();
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
      const items = extractArray<SuperAdmin>(saData);
      setRows(items);
      setRawResponse(saData);
      setError('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error(t('pages.superAdmins.loadFailed'), { description: parsed.message });
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      toast.success(t('pages.superAdmins.addSuccess'));
      setSelectedUser(null);
      setShowAddDialog(false);
      pickerOpenRef.current = false;
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error(t('pages.superAdmins.addFailed'), { description: parsed.message });
      // Refetch on 409 only. A 409 here means someone else granted it first, so the
      // table on screen is provably stale. Any other failure changed nothing on the
      // server, and refetching after it would throw away nothing but cost a request.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        // The selection is provably stale too — someone else already granted it.
        // Clear it so Add stays disabled instead of reproducing the identical 409.
        setSelectedUser(null);
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
      toast.success(t('pages.superAdmins.removeSuccess'));
      setRemoveId(null);
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error(t('pages.superAdmins.removeFailed'), { description: parsed.message });
    }
  };

  const handleExport = () => {
    const data = rows.map((r) => ({
      user: rowLabel(r),
      email: r.email || '',
      user_id: r.user_id,
      status: r.is_active !== false ? t('common.status.active') : t('common.status.inactive'),
      ...auditCsvFields(normalizeAudit(r)),
    }));
    const csv = generateCSV(data, [
      { key: 'user', label: t('pages.superAdmins.columnUser') },
      { key: 'email', label: t('common.field.email') },
      { key: 'user_id', label: t('pages.superAdmins.columnUserId') },
      { key: 'status', label: t('common.status.label') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `super-admins-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<SuperAdmin, unknown>[]>(() => [
    {
      id: 'user',
      header: t('pages.superAdmins.columnUser'),
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
      header: t('common.field.email'),
      cell: ({ row }) => (
        <div className="min-w-0 truncate text-sm">
          {row.original.email || <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active !== false ? 'success' : 'secondary'}>
          {row.original.is_active !== false ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    {
      id: 'created_at',
      accessorFn: (row) => normalizeAudit(row).created?.at ?? '',
      header: t('pages.superAdmins.columnAdded'),
      cell: ({ row }) => <AuditMeta variant="cell" actor={normalizeAudit(row.original).created} />,
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('common.action.rowActions', { name: rowLabel(row.original) || row.original.user_id })}
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
              {t('common.action.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [t]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title={t('pages.superAdmins.title')}
          subtitle={t('pages.superAdmins.subtitle')}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Button onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('pages.superAdmins.addSuperAdmin')}</span>
                <span className="sm:hidden">{t('common.action.add')}</span>
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
                placeholder={t('pages.superAdmins.searchPlaceholder')}
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
                emptyTitle={t('pages.superAdmins.emptyTitle')}
                emptyDescription={t('pages.superAdmins.emptyDescription')}
                addAction={
                  <Button size="sm" onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('pages.superAdmins.addSuperAdmin')}
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
                        aria-label={t('pages.superAdmins.loadingAria')}
                      >
                        <div className="text-muted-foreground">{t('pages.superAdmins.loadingText')}</div>
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
            <DialogTitle>{t('pages.superAdmins.addSuperAdmin')}</DialogTitle>
            <DialogDescription>
              {t('pages.superAdmins.addDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <UserPicker
              id="super-admin-user"
              value={selectedUser}
              onChange={setSelectedUser}
              disabledIds={superAdminUserIds}
              disabledLabel={t('pages.superAdmins.alreadySuperAdmin')}
              placeholder={t('pages.superAdmins.pickerPlaceholder')}
              ariaLabel={t('pages.superAdmins.pickerAria')}
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
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={adding || !selectedUser}>
              {adding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {adding ? t('common.busy.adding') : t('pages.superAdmins.addSuperAdmin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title={t('pages.superAdmins.removeTitle')}
        description={t('pages.superAdmins.removeDescription')}
        confirmText={t('common.action.remove')}
        confirmVariant="destructive"
        onConfirm={handleConfirmRemove}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/super-admins" data={rawResponse} />
    </Layout>
  );
};

export default SuperAdminManagement;
