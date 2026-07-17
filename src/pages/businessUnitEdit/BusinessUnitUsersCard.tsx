import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { UserPlus, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { selectClassName } from './shared';
import { BU_ROLES } from './types';
import { useBusinessUnitUsers } from './useBusinessUnitUsers';

interface BusinessUnitUsersCardProps {
  users: ReturnType<typeof useBusinessUnitUsers>;
  /** Write access for BU membership — the page's `canEdit`. Read-only by default. */
  canEdit?: boolean;
}

const BusinessUnitUsersCard: React.FC<BusinessUnitUsersCardProps> = ({ users, canEdit = false }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base">Users</CardTitle>
          <CardDescription>
            <span className="flex items-center gap-2 mt-0.5">
              <Badge variant="success" className="text-xs px-1.5 py-0">{users.buUsers.filter(u => u.is_active).length} Active</Badge>
              <span className="text-muted-foreground text-xs">of {users.buUsers.length} total</span>
            </span>
          </CardDescription>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={users.handleOpenAddUser}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {users.buUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users assigned yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border bg-muted">
                <th className="text-center font-medium px-4 py-2 w-10">#</th>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2">Email</th>
                <th className="text-left font-medium px-4 py-2">Username</th>
                <th className="text-left font-medium px-4 py-2">BU Role</th>
                <th className="text-center font-medium px-4 py-2">BU Status</th>
                {canEdit && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {[...users.buUsers].sort((a, b) => {
                const nameA = [a.firstname, a.middlename, a.lastname].filter(Boolean).join(' ').toLowerCase();
                const nameB = [b.firstname, b.middlename, b.lastname].filter(Boolean).join(' ').toLowerCase();
                if (nameA !== nameB) return nameA.localeCompare(nameB);
                const emailA = (a.email || '').toLowerCase();
                const emailB = (b.email || '').toLowerCase();
                if (emailA !== emailB) return emailA.localeCompare(emailB);
                return (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase());
              }).map((u, idx) => (
                <tr key={u.id} className="zebra-row border-b last:border-0">
                  <td className="px-4 py-2 text-center text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/users/${u.user_id}/edit`}
                      className="text-primary hover:underline"
                    >
                      {[u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ') || '-'}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{u.email || '-'}</td>
                  <td className="px-4 py-2">{u.username || '-'}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="capitalize text-xs">
                      {u.role || '-'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={u.is_active ? 'success' : 'secondary'} className="text-xs">
                      {u.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${u.username || u.email || 'user'}`} onClick={() => users.handleOpenEditUser(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label={`Remove ${u.username || u.email || 'user'}`} onClick={() => users.handleDeleteUser(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
              <DialogTitle>Edit User in Business Unit</DialogTitle>
              <DialogDescription>
                {users.editingUser && (
                  <span>{users.editingUser.username} — {[users.editingUser.firstname, users.editingUser.middlename, users.editingUser.lastname].filter(Boolean).join(' ') || users.editingUser.email}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>BU Role</Label>
                <select
                  value={users.editUserForm.role}
                  onChange={(e) => users.setEditUserForm(prev => ({ ...prev, role: e.target.value }))}
                  className={selectClassName}
                >
                  {BU_ROLES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>BU Status</Label>
                <select
                  value={users.editUserForm.is_active ? 'true' : 'false'}
                  onChange={(e) => users.setEditUserForm(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                  className={selectClassName}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => users.setEditingUser(null)}>Cancel</Button>
              <Button size="sm" onClick={users.handleSaveEditUser} disabled={users.savingUser}>
                <Save className="mr-2 h-4 w-4" />
                {users.savingUser ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={users.deleteUser !== null}
          onOpenChange={(open) => { if (!open) users.setDeleteUser(null); }}
          title="Remove User"
          description={`Are you sure you want to remove "${users.deleteUser ? ([users.deleteUser.firstname, users.deleteUser.middlename, users.deleteUser.lastname].filter(Boolean).join(' ') || users.deleteUser.username || users.deleteUser.email || 'this user') : ''}" from this business unit?`}
          confirmText="Remove"
          confirmVariant="destructive"
          onConfirm={users.handleConfirmDeleteUser}
        />

        {/* Add User Dialog - picks from cluster users */}
        <Dialog open={users.showAddUser} onOpenChange={users.setShowAddUser}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add User to Business Unit</DialogTitle>
              <DialogDescription>Select a user from this cluster to add</DialogDescription>
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
                      placeholder="Search cluster users..."
                      value={users.addUserSearchTerm}
                      onChange={(e) => users.setAddUserSearchTerm(e.target.value)}
                      className="pl-9"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                  </div>

                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    {users.loadingClusterUsers ? (
                      <div className="text-sm text-muted-foreground text-center py-4">Loading cluster users...</div>
                    ) : users.availableClusterUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {users.clusterUsers.length > 0 ? 'All cluster users are already in this business unit.' : 'No users in this cluster.'}
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
                    {users.availableClusterUsers.length} available of {users.clusterUsers.length} cluster users
                  </div>
              </>
            )}

            {/* Role select */}
            <div className="space-y-2">
              <Label>BU Role</Label>
              <select
                value={users.addUserRole}
                onChange={(e) => users.setAddUserRole(e.target.value)}
                className={selectClassName}
              >
                {BU_ROLES.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => users.setShowAddUser(false)}>Cancel</Button>
            <Button size="sm" onClick={users.handleAddUser} disabled={users.addingUser || !users.selectedClusterUser}>
              <UserPlus className="mr-2 h-4 w-4" />
              {users.addingUser ? 'Adding...' : 'Add User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </CardContent>
  </Card>
);

export default BusinessUnitUsersCard;
