import { useMemo, useState } from 'react';
import { RefreshCw, UserPlus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { TableToolbar } from '../TableToolbar';
import { BulkActionBar, type BulkAction } from '../BulkActionBar';
import { InlineCell } from '../InlineCell';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import type { ClusterUser } from '../../../types';
import { useI18n } from '../../../hooks/useI18n';

export interface UsersSectionProps {
  users: ClusterUser[];
  loading: boolean;
  canEdit: boolean;
  onRefresh: () => void;
  onAddUser: () => void;
  onUpdateUser: (id: string, patch: { role?: string }) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  onBulkRemove: (ids: string[]) => Promise<void>;
}

// ป้ายบทบาทอ่านจากคีย์ร่วม (common.role.*) — สร้างในตัว component เพราะ const ระดับโมดูล
// เรียก hook ไม่ได้ และค่าต้องเปลี่ยนตามภาษาที่สลับ

function displayName(u: ClusterUser): string {
  const parts = [u.userInfo?.firstname, u.userInfo?.middlename, u.userInfo?.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || '');
}

export function UsersSection({
  users, loading, canEdit,
  onRefresh, onAddUser, onUpdateUser, onRemoveUser, onBulkRemove,
}: UsersSectionProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [confirmRemoveOne, setConfirmRemoveOne] = useState<ClusterUser | null>(null);

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

  const roleOptions = [
    { value: 'admin', label: t('common.role.admin') },
    { value: 'user', label: t('common.role.user') },
  ];

  const bulkActions: BulkAction[] = [
    { key: 'remove', label: t('common.action.remove'), icon: Trash2, variant: 'destructive', onClick: () => setConfirmBulkRemove(true) },
  ];

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); resetSelection(); }}
        placeholder={t('pages.clusters.searchUsers')}
        filters={[
          { key: 'active', label: t('common.status.active'), active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); resetSelection(); } },
          { key: 'inactive', label: t('common.status.inactive'), active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); resetSelection(); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label={t('pages.clusters.refreshUsers')}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onAddUser}>
                <UserPlus className="mr-2 h-4 w-4" /> {t('common.action.addUser')}
              </Button>
            )}
          </>
        }
      />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <BulkActionBar count={selected.size} onClear={resetSelection} actions={bulkActions} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {users.length === 0
            ? t('pages.clusters.noUsersInCluster')
            : t('pages.clusters.noUsersMatchFilters')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-sticky-right [--sticky-right-bg:var(--card)]">
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <input type="checkbox" aria-label={t('pages.clusters.selectAllUsers')} checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-input" />
                  </TableHead>
                )}
                <TableHead>{t('common.field.name')}</TableHead>
                <TableHead>{t('common.field.email')}</TableHead>
                <TableHead>{t('pages.clusters.columnRole')}</TableHead>
                <TableHead className="text-center">{t('common.status.label')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                return (
                  <TableRow key={u.id}>
                    {canEdit && (
                      <TableCell>
                        <input type="checkbox" aria-label={t('pages.clusters.selectUserAria', { name: displayName(u) })} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="h-4 w-4 rounded border-input" />
                      </TableCell>
                    )}
                    <TableCell>{displayName(u)}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {/* `display` แสดง "ค่าดิบ" ของ role ไม่ใช่ป้ายที่แปลแล้ว — คงพฤติกรรมเดิม
                          ทุกตัวอักษร (UsersSection.test.tsx ตรึง 'admin' ตัวเล็กไว้) และตรงกับกฎ
                          "ห้ามแปลค่า enum ของ API"
                          หมายเหตุถึงผู้ดูแล: ตัวเลือกใน dropdown แสดง 'Admin'/'User' แต่ช่องอ่าน
                          อย่างเดียวแสดง 'admin' — ความไม่สม่ำเสมอนี้มีมาก่อนงานแปล ถ้าจะแก้ให้ตรงกัน
                          ควรเป็นการเปลี่ยน copy รอบแยก ไม่ใช่แอบเปลี่ยนใน slice แปล */}
                      <InlineCell
                        ariaLabel={t('pages.clusters.roleForAria', { name: displayName(u) })}
                        value={u.role ?? 'user'}
                        disabled={!canEdit}
                        options={roleOptions}
                        display={<span>{u.role ?? 'user'}</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { role: v }); }}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={u.is_active !== false ? 'success' : 'secondary'} className="text-xs">
                        {u.is_active !== false ? t('common.status.active') : t('common.status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className={`text-destructive hover:text-destructive h-7 w-7 ${HIT_SLOP_44}`}
                          aria-label={t('pages.clusters.removeUserAria', { name: displayName(u) })} onClick={() => setConfirmRemoveOne(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title={t('pages.clusters.removeSelectedUsers')}
        description={t('pages.clusters.removeSelectedConfirm', { count: selected.size })}
        confirmText={t('common.action.remove')}
        confirmVariant="destructive"
        onConfirm={async () => { await onBulkRemove(Array.from(selected)); resetSelection(); }}
      />
      <ConfirmDialog
        open={confirmRemoveOne !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemoveOne(null); }}
        title={t('pages.clusters.removeUserFromCluster')}
        description={t('pages.clusters.removeOneConfirm', { name: confirmRemoveOne ? displayName(confirmRemoveOne) : '' })}
        confirmText={t('common.action.remove')}
        confirmVariant="destructive"
        onConfirm={async () => { if (confirmRemoveOne) await onRemoveUser(confirmRemoveOne.id); setConfirmRemoveOne(null); }}
      />
    </div>
  );
}
