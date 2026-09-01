import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import superAdminService from '../services/superAdminService';
import { useAuth } from '../context/AuthContext';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Skeleton } from '../components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { UserPicker } from '../components/UserPicker';
import { ShieldAlert, Trash2, Plus, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { cn } from '../lib/utils';
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
import type { SuperAdmin, UserOption } from '../types';
import { useI18n } from '../hooks/useI18n';

// The name to show for a row. Falls back to email, then to nothing at all —
// deliberately NOT to a phrase like "Unknown user": when the frontend is deployed
// ahead of the backend that joins these fields, every row would read as though its
// user had been deleted. An em dash states only what is true (no name here); the
// user_id underneath still identifies the row so it can always be removed.
const rowLabel = (r: SuperAdmin): string => r.name?.trim() || r.email?.trim() || '';

/** Up to two uppercase initials for the avatar. Empty when there is no name and no email. */
const initialsOf = (label: string): string =>
  label
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

// Descend through nested `{ data: ... }` envelopes until the array is found.
// The super-admins endpoint nests deeper than the usual one-level convention.
const extractArray = <T,>(body: unknown): T[] => {
  let cur: unknown = body;
  while (cur && !Array.isArray(cur) && typeof cur === 'object' && 'data' in (cur as Record<string, unknown>)) {
    cur = (cur as Record<string, unknown>).data;
  }
  return Array.isArray(cur) ? (cur as T[]) : [];
};

// A roster this short is read, not searched. The search box only earns its place once the
// list stops fitting on one screen — below that it is a control that never gets used, in a
// page whose whole job is to be scanned in one glance.
const SEARCH_THRESHOLD = 8;

const SuperAdminManagement: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
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

  const showSearch = rows.length > SEARCH_THRESHOLD;

  const filteredRows = useMemo(() => {
    const term = showSearch ? searchTerm.trim().toLowerCase() : '';
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.user_id].some((field) =>
        (field || '').toLowerCase().includes(term),
      ),
    );
  }, [rows, searchTerm, showSearch]);

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
      // list on screen is provably stale. Any other failure changed nothing on the
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

  // The subtitle states the consequence of the list rather than describing the page: the one
  // thing an operator comes here to check is how many people currently hold the privilege.
  const standing = loading && rows.length === 0
    ? t('pages.superAdmins.subtitle')
    : rows.length === 1
      ? t('pages.superAdmins.standingCountOne')
      : t('pages.superAdmins.standingCountOther', { count: rows.length });

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.superAdmins.title')}
          subtitle={
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="text-warning h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {standing}
            </span>
          }
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
          <div className="text-destructive bg-destructive/10 rounded-md p-3 text-sm" role="alert">
            {error}
          </div>
        )}

        {!error && (
          <Card className="overflow-hidden">
            {showSearch && (
              <div className="border-b p-4 sm:px-5">
                <SearchInput
                  ref={searchInputRef}
                  value={searchTerm}
                  onValueChange={handleSearchChange}
                  placeholder={t('pages.superAdmins.searchPlaceholder')}
                  className="sm:max-w-sm"
                />
              </div>
            )}

            {loading && rows.length === 0 ? (
              <RosterSkeleton />
            ) : filteredRows.length === 0 ? (
              <div className="p-4">
                <ListEmptyState
                  searchTerm={showSearch ? searchTerm : ''}
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
              </div>
            ) : (
              <div className="relative">
                {loading && (
                  <div
                    className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center"
                    role="status"
                    aria-label={t('pages.superAdmins.loadingAria')}
                  >
                    <div className="text-muted-foreground">{t('pages.superAdmins.loadingText')}</div>
                  </div>
                )}
                <ul className="divide-y" aria-label={t('pages.superAdmins.rosterAria')}>
                  {filteredRows.map((row) => (
                    <RosterRow
                      key={row.id}
                      row={row}
                      isSelf={Boolean(user?.id) && row.user_id === user?.id}
                      onRemove={() => setRemoveId(row.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
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

/**
 * One person in the roster.
 *
 * `isSelf` removes the revoke control rather than disabling it silently: the page is reachable
 * only by super admins, so the person reading it is often *in* the list, and a live Remove
 * button next to their own name is one click away from locking themselves — and possibly
 * everyone — out of this page. The replacement states the reason, so the missing button reads
 * as a rule rather than as a rendering bug.
 */
const RosterRow: React.FC<{ row: SuperAdmin; isSelf: boolean; onRemove: () => void }> = ({
  row, isSelf, onRemove,
}) => {
  const { t } = useI18n();
  const label = rowLabel(row);
  const initials = initialsOf(label);
  const active = row.is_active !== false;

  // The action wraps onto its own line below `sm` (`flex-wrap` + `w-full`) instead of being
  // rendered twice behind `hidden`/`sm:hidden`: two copies of a Remove button would put two
  // identical controls in the accessibility tree and in every query for it. It also cannot
  // stay in a `shrink-0` cell at every width — the self-guard is a full sentence, and holding
  // it at its intrinsic width on a 390px screen squeezed the identity column down to one
  // character per line, a failure `scrollWidth` never reports.
  const action = isSelf ? (
    <span className="text-muted-foreground text-xs">
      {t('pages.superAdmins.cannotRemoveSelf')}
    </span>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRemove}
      aria-label={t('pages.superAdmins.removeAria', { name: label || row.user_id })}
      className="text-destructive hover:text-destructive hover:bg-destructive/10 -ml-2 sm:ml-0"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {t('common.action.remove')}
    </Button>
  );

  return (
    <li className="hover:bg-muted/40 p-4 transition-colors sm:px-5">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4">
        <Avatar className="mt-0.5 h-9 w-9">
          <AvatarFallback className="text-muted-foreground text-xs font-semibold">
            {initials || '?'}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('truncate text-sm font-medium', !label && 'text-muted-foreground')}>
              {label || '—'}
            </span>
            {isSelf && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {t('pages.superAdmins.selfBadge')}
              </Badge>
            )}
            <Badge variant={active ? 'success' : 'secondary'}>
              {active ? t('common.status.active') : t('common.status.inactive')}
            </Badge>
          </div>
          <div className="text-muted-foreground truncate text-sm">
            {row.email || '—'}
          </div>
          <div className="text-muted-foreground truncate font-mono text-[11px]">
            {row.user_id}
          </div>
          <AuditMeta
            variant="compact"
            verbKey="pages.superAdmins.grantedVerb"
            actor={normalizeAudit(row).created}
          />
        </div>

        {/* Below `sm` this cell is full-width, so it wraps under the identity block; the
            `pl-12` (avatar h-9 + gap-3) lines it up with that block rather than the avatar. */}
        <div className="w-full pl-12 sm:w-auto sm:max-w-48 sm:shrink-0 sm:pl-0 sm:text-right">
          {action}
        </div>
      </div>
    </li>
  );
};

/** Matches the roster's own row rhythm, not a table's — the loaded state has no columns. */
const RosterSkeleton: React.FC = () => (
  <ul className="divide-y">
    {[0, 1, 2].map((i) => (
      <li key={i} className="flex items-start gap-3 p-4 sm:gap-4 sm:px-5">
        <Skeleton className="mt-0.5 h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
      </li>
    ))}
  </ul>
);

export default SuperAdminManagement;
