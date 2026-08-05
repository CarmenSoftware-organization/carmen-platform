import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Trash2, Users } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ListEmptyState } from '../../components/ListEmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import clusterService from '../../services/clusterService';
import { parseApiError } from '../../utils/errorParser';
import type { ClusterUser } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';

const ROLES = ['admin', 'user'] as const;

function displayName(member: ClusterUser): string {
  const parts = [member.userInfo?.firstname, member.userInfo?.middlename, member.userInfo?.lastname].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return member.name || member.username || '-';
}

interface MembersTableProps {
  members: ClusterUser[];
  loading: boolean;
  /** Narrows the already-loaded rows. Task 9 sets this when a duplicate invitation is rejected. */
  searchTerm: string;
  onChanged: () => void;
}

/**
 * Cluster membership table for the cluster-admin Users page. No `clusterId` prop — the
 * membership row id (`member.id`) already scopes `updateClusterUser` / `deleteClusterUser` to
 * the right record, so the writes below never need it.
 */
const MembersTable: React.FC<MembersTableProps> = ({ members, loading, searchTerm, onChanged }) => {
  const [removeTarget, setRemoveTarget] = useState<ClusterUser | null>(null);

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.email ?? '').toLowerCase().includes(q) ||
        (m.username ?? '').toLowerCase().includes(q) ||
        (m.name ?? '').toLowerCase().includes(q),
    );
  }, [members, searchTerm]);

  const handleRoleChange = useCallback(async (member: ClusterUser, role: string) => {
    try {
      await clusterService.updateClusterUser(member.id, { role });
      toast.success('Role updated');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to update role', { description: message });
    }
  }, [onChanged]);

  const handleToggleActive = useCallback(async (member: ClusterUser) => {
    try {
      await clusterService.updateClusterUser(member.id, { is_active: !member.is_active });
      toast.success(member.is_active ? 'Member deactivated' : 'Member activated');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to update member', { description: message });
    }
  }, [onChanged]);

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await clusterService.deleteClusterUser(removeTarget.id);
      toast.success('Member removed');
      setRemoveTarget(null);
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to remove member', { description: message });
    }
  };

  const columns = useMemo<ColumnDef<ClusterUser, unknown>[]>(() => [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => displayName(row),
      meta: { card: 'title' },
      cell: ({ row }) => <span>{displayName(row.original)}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email || '-'}</span>,
    },
    {
      accessorKey: 'role',
      header: 'Role',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.original.role ?? 'user'}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-10', cellClassName: 'w-10', card: 'actions' },
      cell: ({ row }) => {
        const member = row.original;
        const currentRole = member.role ?? 'user';
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${displayName(member)}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ROLES.filter((r) => r !== currentRole).map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => void handleRoleChange(member, r)}
                  className="cursor-pointer capitalize"
                >
                  Make {r}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => void handleToggleActive(member)} className="cursor-pointer">
                {member.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setRemoveTarget(member)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleRoleChange, handleToggleActive]);

  if (loading && members.length === 0) {
    // +1 accounts for the `#` row-index column DataTable always prepends.
    return <TableSkeleton columns={columns.length + 1} rows={5} />;
  }

  if (!loading && rows.length === 0) {
    return (
      <ListEmptyState
        searchTerm={searchTerm}
        activeFilterCount={0}
        icon={Users}
        emptyTitle="No members yet"
        emptyDescription="Invite a user to give them access to this cluster."
      />
    );
  }

  return (
    <div className="relative">
      {loading && members.length > 0 && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading members">
          <div className="text-muted-foreground">Loading members...</div>
        </div>
      )}
      <DataTable columns={columns} data={rows} tableLayout="auto" />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove member"
        description={`Remove "${removeTarget ? displayName(removeTarget) : ''}" from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
};

export default MembersTable;
