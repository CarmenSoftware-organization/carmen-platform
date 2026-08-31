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
  const roleLabelFor = (role: string) => roleOptions.find((o) => o.value === role)?.label ?? role;

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
                {/* Email folded into the name cell rather than given its own column. Four
                    stretchable columns for content this short spread one person across the
                    full card width — name at the far left, address a hand away, role and
                    status two more gaps out — so a row read as four separate readings instead
                    of one. Identity is one fact on two lines now (the shape the business-unit
                    table beside it already uses), and only that column stretches. */}
                <TableHead className="w-96">{t('common.field.name')}</TableHead>
                <TableHead className="w-40">{t('pages.clusters.columnRole')}</TableHead>
                <TableHead className="w-28 text-center">{t('common.status.label')}</TableHead>
                {/* Slack absorber. Every real column is now sized to its content, so without
                    somewhere to put the leftover width the name column swallowed it and left
                    ~650px between a person and their role. Parking it here packs the three
                    facts about a user against each other and leaves the gap in front of the
                    action, which is anchored right by `table-sticky-right` regardless. */}
                <TableHead aria-hidden="true" />
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
                    <TableCell>
                      <div>{displayName(u)}</div>
                      {u.email && (
                        <div className="text-muted-foreground text-xs">{u.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* รอบแยกที่คอมเมนต์เดิมเรียกร้องไว้ (2026-08-31): ช่องอ่านอย่างเดียว
                          เคยแสดงค่าดิบ 'admin' ขณะที่ dropdown ของ field เดียวกันแสดงคำแปล
                          ผู้อ่านจึงเห็นสองภาษาในคอลัมน์เดียว ตอนนี้ทั้งสองใช้ป้ายเดียวกัน
                          และตกกลับไปเป็นค่าดิบเมื่อ backend ส่ง role ที่ไม่รู้จัก — ค่าที่ไม่มี
                          คำแปลต้องไม่หายไปจากหน้าจอ */}
                      <InlineCell
                        ariaLabel={t('pages.clusters.roleForAria', { name: displayName(u) })}
                        value={u.role ?? 'user'}
                        disabled={!canEdit}
                        options={roleOptions}
                        display={<span>{roleLabelFor(u.role ?? 'user')}</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { role: v }); }}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {/* สีสงวนไว้ให้แถวที่ผิดปกติ — ป้ายเขียวทุกแถวคือเสียงรบกวน ไม่ใช่ข้อมูล
                          (กติกาเดียวกับตารางผู้ใช้ในหน้า Business Unit) */}
                      {u.is_active !== false ? (
                        <span className="text-muted-foreground text-xs">{t('common.status.active')}</span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t('common.status.inactive')}</Badge>
                      )}
                    </TableCell>
                    <TableCell aria-hidden="true" />
                    <TableCell className="text-center">
                      {canEdit && (
                        /* Muted until reached for. This column repeats once per row, so drawn
                           in the destructive colour it made a stack of eight red marks the
                           loudest thing on a screen whose subject is licence headroom — and
                           the same rule the status cell above already follows (colour is for
                           the abnormal) has to hold for actions too. The red arrives on hover
                           and focus, right before the click that needs the warning, and the
                           confirm dialog is still the thing that actually guards it. */
                        <Button variant="ghost" size="icon" className={`text-muted-foreground hover:text-destructive focus-visible:text-destructive h-7 w-7 ${HIT_SLOP_44}`}
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
