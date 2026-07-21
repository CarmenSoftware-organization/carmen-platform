import { useMemo, useState } from 'react';
import { RefreshCw, UserPlus, Trash2, Building2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { TableToolbar } from '../TableToolbar';
import { BulkActionBar, type BulkAction } from '../BulkActionBar';
import { InlineCell } from '../InlineCell';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import type { BusinessUnit, ClusterUser } from '../../../types';

export interface UsersSectionProps {
  users: ClusterUser[];
  businessUnits: BusinessUnit[];
  loading: boolean;
  canEdit: boolean;
  onRefresh: () => void;
  onAddUser: () => void;
  onUpdateUser: (id: string, patch: { role?: string; parent_bu_id?: string | null }) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  onBulkRemove: (ids: string[]) => Promise<void>;
  onBulkMoveBu: (ids: string[], buId: string) => Promise<void>;
}

const ROLE_OPTIONS = [{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }];

function displayName(u: ClusterUser): string {
  const parts = [u.userInfo?.firstname, u.userInfo?.middlename, u.userInfo?.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || '');
}

export function UsersSection({
  users, businessUnits, loading, canEdit,
  onRefresh, onAddUser, onUpdateUser, onRemoveUser, onBulkRemove, onBulkMoveBu,
}: UsersSectionProps) {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [confirmRemoveOne, setConfirmRemoveOne] = useState<ClusterUser | null>(null);
  const [moveBuId, setMoveBuId] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (term) {
        const hay = `${displayName(u)} ${u.email ?? ''} ${u.username ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      const active = u.is_active !== false;
      if (activeOnly && !active) return false;
      if (inactiveOnly && active) return false;
      return true;
    });
  }, [users, search, activeOnly, inactiveOnly]);

  // Selection is scoped to the currently-filtered set; reset it whenever filters change.
  const resetSelection = () => setSelected(new Set());
  const rowIds = rows.map((r) => r.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rowIds));

  const buOptions = businessUnits.map((bu) => ({ value: bu.id, label: `${bu.code} - ${bu.name}` }));

  const bulkActions: BulkAction[] = [
    { key: 'remove', label: 'Remove', icon: Trash2, variant: 'destructive', onClick: () => setConfirmBulkRemove(true) },
    { key: 'move', label: 'Move to BU', icon: Building2, disabled: !moveBuId, onClick: () => { void onBulkMoveBu(Array.from(selected), moveBuId).then(resetSelection); } },
  ];

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); resetSelection(); }}
        placeholder="Search users"
        filters={[
          { key: 'active', label: 'Active', active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); resetSelection(); } },
          { key: 'inactive', label: 'Inactive', active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); resetSelection(); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh users">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onAddUser}>
                <UserPlus className="mr-2 h-4 w-4" /> Add User
              </Button>
            )}
          </>
        }
      />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <select aria-label="Bulk: target business unit" value={moveBuId} onChange={(e) => setMoveBuId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Move target BU…</option>
            {buOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <BulkActionBar count={selected.size} onClear={resetSelection} actions={bulkActions} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {users.length === 0 ? 'No users found in this cluster.' : 'No users match your filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted border-b-2">
                {canEdit && (
                  <th className="w-10 px-4 py-2">
                    <input type="checkbox" aria-label="Select all users" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-input" />
                  </th>
                )}
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Parent Business Unit</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const bu = u.parent_bu_id ? businessUnits.find((b) => b.id === u.parent_bu_id) : null;
                return (
                  <tr key={u.id} className="zebra-row border-b transition-colors last:border-0">
                    {canEdit && (
                      <td className="px-4 py-2">
                        <input type="checkbox" aria-label={`Select ${displayName(u)}`} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="h-4 w-4 rounded border-input" />
                      </td>
                    )}
                    <td className="px-4 py-2">{displayName(u)}</td>
                    <td className="text-muted-foreground px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">
                      <InlineCell
                        ariaLabel={`Parent business unit for ${displayName(u)}`}
                        value={u.parent_bu_id ?? ''}
                        disabled={!canEdit}
                        options={[{ value: '', label: '-' }, ...buOptions]}
                        display={bu ? <Badge variant="outline" className="text-xs">{bu.code} - {bu.name}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { parent_bu_id: v || null }); }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <InlineCell
                        ariaLabel={`Role for ${displayName(u)}`}
                        value={u.role ?? 'user'}
                        disabled={!canEdit}
                        options={ROLE_OPTIONS}
                        display={<span>{u.role ?? 'user'}</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { role: v }); }}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Badge variant={u.is_active !== false ? 'success' : 'secondary'} className="text-xs">
                        {u.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className={`text-destructive hover:text-destructive h-7 w-7 ${HIT_SLOP_44}`}
                          aria-label={`Remove ${displayName(u)} from this cluster`} onClick={() => setConfirmRemoveOne(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title="Remove selected users"
        description={`Remove ${selected.size} user(s) from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={async () => { await onBulkRemove(Array.from(selected)); resetSelection(); }}
      />
      <ConfirmDialog
        open={confirmRemoveOne !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemoveOne(null); }}
        title="Remove User from Cluster"
        description={`Remove "${confirmRemoveOne ? displayName(confirmRemoveOne) : ''}" from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={async () => { if (confirmRemoveOne) await onRemoveUser(confirmRemoveOne.id); setConfirmRemoveOne(null); }}
      />
    </div>
  );
}
