import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { UserPlus, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { selectClassName } from './shared';
import { BU_ROLES } from './types';
import { useBusinessUnitUsers } from './useBusinessUnitUsers';
import { useI18n } from '../../hooks/useI18n';
import { ROLE_LABEL_KEYS, roleLabel } from '../../utils/roleLabels';

interface BusinessUnitUsersCardProps {
  users: ReturnType<typeof useBusinessUnitUsers>;
  /** Write access for BU membership — the page's `canEdit`. Read-only by default. */
  canEdit?: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ — คนที่ active อยู่หลาย BU ในคลัสเตอร์เดียวกันถือแค่ 1 ที่นั่ง
   *  นับ active เฉพาะแถวใน BU นี้จึงเป็นตัวส่วนที่ผิด แถบนี้จึงต้องมาจาก `cluster_seat` ของ backend
   *  (Task 4b.1) ไม่ใช่คำนวณเองจาก `users.buUsers` */
  clusterSeat?: { used: number; cap: number };
}

const BusinessUnitUsersCard: React.FC<BusinessUnitUsersCardProps> = ({ users, canEdit = false, clusterSeat }) => {
  const { t } = useI18n();
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;
  // ผู้ใช้ที่ปิดแล้วไม่คืนที่นั่ง — นับไว้เพื่อตัดสินว่าต้องอธิบายป้าย Shared หรือไม่
  const sharedCount = users.buUsers.filter((u) => u.is_active && u.frees_seat === false).length;

  return (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base">{t('pages.businessUnits.usersLabel')}</CardTitle>
          {/* ไม่ใช้ CardDescription: มันเรนเดอร์เป็น <p> ซึ่งครอบ <div> ของ Badge ไม่ได้ */}
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="success" className="text-xs px-1.5 py-0">{t('pages.businessUnits.activeCountBadge', { count: users.buUsers.filter(u => u.is_active).length })}</Badge>
            <span className="text-muted-foreground text-xs">{t('pages.businessUnits.ofTotalUsers', { total: users.buUsers.length })}</span>
          </div>
          {clusterSeat && (
            <p className={`text-xs mt-1 ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              {t('pages.businessUnits.clusterSeatsUsed', { used: clusterSeat.used, cap: clusterSeat.cap })}
              {over && (
                <> · {t('pages.businessUnits.deactivateMoreHint', { count: clusterSeat.used - clusterSeat.cap })}</>
              )}
            </p>
          )}
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={users.handleOpenAddUser}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('common.action.addUser')}
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {users.buUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pages.businessUnits.noUsersAssignedYet')}</p>
      ) : (
        <div className="overflow-x-auto">
          {sharedCount > 0 && (
            <p className="text-muted-foreground mb-2 text-xs">
              <span className="text-foreground font-medium">{t('pages.businessUnits.sharedLabel')}</span> — {t('pages.businessUnits.sharedExplanation')}
            </p>
          )}
          {/* ตรึงคอลัมน์ปุ่มไว้ขวา — gate ด้วย canEdit เพราะคอลัมน์นั้นถูกถอดทิ้ง
              เมื่อไม่มีสิทธิ์ คอลัมน์ท้ายจะกลายเป็น BU Status ซึ่งไม่ควรถูกตรึง */}
          <Table className={canEdit ? 'table-sticky-right [--sticky-right-bg:var(--card)]' : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>{t('common.field.name')}</TableHead>
                <TableHead>{t('common.field.email')}</TableHead>
                <TableHead>{t('common.field.username')}</TableHead>
                <TableHead>{t('common.label.buRole')}</TableHead>
                <TableHead className="text-center">{t('pages.businessUnits.buStatusLabel')}</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...users.buUsers].sort((a, b) => {
                const nameA = [a.firstname, a.middlename, a.lastname].filter(Boolean).join(' ').toLowerCase();
                const nameB = [b.firstname, b.middlename, b.lastname].filter(Boolean).join(' ').toLowerCase();
                if (nameA !== nameB) return nameA.localeCompare(nameB);
                const emailA = (a.email || '').toLowerCase();
                const emailB = (b.email || '').toLowerCase();
                if (emailA !== emailB) return emailA.localeCompare(emailB);
                return (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase());
              }).map((u, idx) => (
                <TableRow key={u.id}>
                  <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <Link
                      to={`/users/${u.user_id}/edit`}
                      className="text-primary hover:underline"
                    >
                      {[u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ') || '-'}
                    </Link>
                  </TableCell>
                  <TableCell>{u.email || '-'}</TableCell>
                  <TableCell>{u.username || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {u.role ? roleLabel(t, u.role) : '-'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1.5">
                      <Badge variant={u.is_active ? 'success' : 'secondary'} className="text-xs">
                        {u.is_active ? t('common.status.active') : t('common.status.inactive')}
                      </Badge>
                      {/* frees_seat มาจาก backend เท่านั้น (optional — Task 4b.1) — undefined ต้องไม่ขึ้น
                          ป้ายนี้ เพราะยังตัดสินไม่ได้ว่าปิดแล้วคืนที่นั่งหรือเปล่า
                          ป้ายสั้นแทนประโยคเต็ม: ความหมายเหมือนกันทุกแถว การพิมพ์ซ้ำ 10 รอบจึงเป็น
                          เสียงรบกวน — คำอธิบายอยู่เหนือตารางครั้งเดียว (sharedCount ด้านบน) */}
                      {u.is_active && u.frees_seat === false && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          title={t('pages.businessUnits.sharedBadgeTooltip')}
                        >
                          {t('pages.businessUnits.sharedLabel')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('pages.businessUnits.editUserAria', { name: u.username || u.email || t('entity.user.lower') })} onClick={() => users.handleOpenEditUser(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label={t('common.action.removeAria', { name: u.username || u.email || t('entity.user.lower') })} onClick={() => users.handleDeleteUser(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mutating dialogs. Their triggers are already gated above; keeping the
          dialogs themselves behind `canEdit` means no state path can surface a
          write form to a read-only user. */}
      {canEdit && (
        <>
        {/* Edit User BU Dialog */}
        <Dialog open={!!users.editingUser} onOpenChange={(open) => { if (!open) users.setEditingUser(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('pages.businessUnits.editUserInBuTitle')}</DialogTitle>
              <DialogDescription>
                {users.editingUser && (
                  <span>{users.editingUser.username} - {[users.editingUser.firstname, users.editingUser.middlename, users.editingUser.lastname].filter(Boolean).join(' ') || users.editingUser.email}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t('common.label.buRole')}</Label>
                <select
                  value={users.editUserForm.role}
                  onChange={(e) => users.setEditUserForm(prev => ({ ...prev, role: e.target.value }))}
                  className={selectClassName}
                >
                  {BU_ROLES.map((r) => (
                    <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('pages.businessUnits.buStatusLabel')}</Label>
                <select
                  value={users.editUserForm.is_active ? 'true' : 'false'}
                  onChange={(e) => users.setEditUserForm(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                  className={selectClassName}
                >
                  <option value="true">{t('common.status.active')}</option>
                  <option value="false">{t('common.status.inactive')}</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => users.setEditingUser(null)}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={users.handleSaveEditUser} disabled={users.savingUser}>
                <Save className="mr-2 h-4 w-4" />
                {users.savingUser ? t('common.busy.saving') : t('pages.businessUnits.saveButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={users.deleteUser !== null}
          onOpenChange={(open) => { if (!open) users.setDeleteUser(null); }}
          title={t('pages.businessUnits.removeUserTitle')}
          description={t('pages.businessUnits.removeUserConfirm', {
            name: users.deleteUser
              ? ([users.deleteUser.firstname, users.deleteUser.middlename, users.deleteUser.lastname].filter(Boolean).join(' ') || users.deleteUser.username || users.deleteUser.email || t('pages.businessUnits.thisUser'))
              : '',
          })}
          confirmText={t('common.action.remove')}
          confirmVariant="destructive"
          onConfirm={users.handleConfirmDeleteUser}
        />

        {/* Add User Dialog - picks from cluster users */}
        <Dialog open={users.showAddUser} onOpenChange={users.setShowAddUser}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('pages.businessUnits.addUserToBuTitle')}</DialogTitle>
              <DialogDescription>{t('pages.businessUnits.selectUserFromClusterDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Selected user display */}
              {users.selectedClusterUser && (
                <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{users.selectedClusterUser.username || users.selectedClusterUser.email || '-'}</div>
                    <div className="text-xs text-muted-foreground">{users.selectedClusterUser.email || '-'}</div>
                    <div className="text-xs text-muted-foreground">
                      {[users.selectedClusterUser.userInfo?.firstname, users.selectedClusterUser.userInfo?.middlename, users.selectedClusterUser.userInfo?.lastname].filter(Boolean).join(' ') || '-'}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => users.setSelectedClusterUser(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Search + cluster user list */}
              {!users.selectedClusterUser && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t('pages.businessUnits.searchClusterUsersPlaceholder')}
                      value={users.addUserSearchTerm}
                      onChange={(e) => users.setAddUserSearchTerm(e.target.value)}
                      className="pl-9"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                  </div>

                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    {users.loadingClusterUsers ? (
                      <div className="text-sm text-muted-foreground text-center py-4">{t('pages.businessUnits.loadingClusterUsers')}</div>
                    ) : users.availableClusterUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {users.clusterUsers.length > 0 ? t('pages.businessUnits.allClusterUsersAdded') : t('pages.businessUnits.noUsersInCluster')}
                      </p>
                    ) : (
                      <div className="divide-y">
                        {users.availableClusterUsers.map((cu) => (
                          <button
                            key={cu.user_id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                            onClick={() => users.setSelectedClusterUser(cu)}
                          >
                            <div className="text-sm font-medium">{cu.username || cu.email || '-'}</div>
                            <div className="text-xs text-muted-foreground">{cu.email || '-'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[cu.userInfo?.firstname, cu.userInfo?.middlename, cu.userInfo?.lastname].filter(Boolean).join(' ') || '-'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('pages.businessUnits.availableOfTotalClusterUsers', { available: users.availableClusterUsers.length, total: users.clusterUsers.length })}
                  </div>
              </>
            )}

            {/* Role select */}
            <div className="space-y-2">
              <Label>{t('common.label.buRole')}</Label>
              <select
                value={users.addUserRole}
                onChange={(e) => users.setAddUserRole(e.target.value)}
                className={selectClassName}
              >
                {BU_ROLES.map((r) => (
                  <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => users.setShowAddUser(false)}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={users.handleAddUser} disabled={users.addingUser || !users.selectedClusterUser}>
              <UserPlus className="mr-2 h-4 w-4" />
              {users.addingUser ? t('common.busy.adding') : t('common.action.addUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </CardContent>
  </Card>
  );
};

export default BusinessUnitUsersCard;
