import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Mail, MoreHorizontal, RotateCw, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ListEmptyState } from '../../components/ListEmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import clusterAdminService from '../../services/clusterAdminService';
import { parseApiError } from '../../utils/errorParser';
import type { ClusterInvitation } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const statusVariant = (
  s?: string,
): 'success' | 'secondary' | 'outline' | 'destructive' | 'warning' => {
  switch ((s ?? '').toLowerCase()) {
    case 'accepted':
      return 'success';
    case 'pending':
      return 'warning';
    case 'revoked':
      return 'destructive';
    case 'declined':
      return 'secondary';
    case 'expired':
      return 'secondary';
    default:
      return 'outline';
  }
};

interface InvitationsTableProps {
  clusterId: string;
  invitations: ClusterInvitation[];
  loading: boolean;
  onChanged: () => void;
}

/**
 * Pending-invitation table for the cluster-admin Users page. Resend and revoke are gated on
 * the *terminal* states (`accepted` / `declined` / `revoked`), not on `status === 'pending'`.
 * That's deliberate: the list's `status` is the backend's *display* status, and a stored-
 * `pending` row past its expiry is presented as `expired` — a value the enum
 * (`enum_user_invitation_status`) doesn't contain. Those rows are still `pending` in the
 * database, and the server accepts both actions on them; resending a lapsed invitation is the
 * main reason an admin opens this table, so gating on the working state instead of the
 * terminal ones would block exactly that.
 */
const InvitationsTable: React.FC<InvitationsTableProps> = ({ clusterId, invitations, loading, onChanged }) => {
  const [revokeTarget, setRevokeTarget] = useState<ClusterInvitation | null>(null);

  const handleResend = useCallback(async (invitation: ClusterInvitation) => {
    try {
      await clusterAdminService.resendInvitation(clusterId, invitation.id);
      toast.success('Invitation resent');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      const description =
        (err as { response?: { status?: number } })?.response?.status === 429
          ? 'Invitation rate limit reached. Please try again later.'
          : message;
      toast.error('Failed to resend invitation', { description });
    }
  }, [clusterId, onChanged]);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await clusterAdminService.revokeInvitation(clusterId, revokeTarget.id);
      toast.success('Invitation revoked');
      setRevokeTarget(null);
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to revoke invitation', { description: message });
    }
  };

  const columns = useMemo<ColumnDef<ClusterInvitation, unknown>[]>(() => [
    {
      accessorKey: 'email',
      header: 'Email',
      meta: { card: 'title' },
      cell: ({ row }) => <span>{row.original.email}</span>,
    },
    {
      accessorKey: 'cluster_role',
      header: 'Cluster Role',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.original.cluster_role ?? 'user'}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)} className="capitalize">
          {row.original.status ? cap(row.original.status) : '-'}
        </Badge>
      ),
    },
    {
      accessorKey: 'expires_at',
      id: 'expires_at',
      header: 'Expires',
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground">{fmt(row.original.expires_at)}</div>
      ),
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: 'Invited',
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground">{fmt(row.original.created_at)}</div>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-10', cellClassName: 'w-10', card: 'actions' },
      cell: ({ row }) => {
        const invitation = row.original;
        // The list's `status` is the backend's *display* status: a stored-`pending` row past
        // its expiry is presented as `expired`, a value the enum does not contain. Those rows
        // are still `pending` in the database, and the server accepts both resend and revoke
        // on them — which is precisely when an admin wants to resend. Gate on the terminal
        // states instead of the working one.
        const isActionable = !['accepted', 'declined', 'revoked'].includes(
          (invitation.status ?? '').toLowerCase(),
        );
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${invitation.email}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!isActionable}
                onClick={() => void handleResend(invitation)}
                className="cursor-pointer"
              >
                <RotateCw className="mr-2 h-4 w-4" />
                Resend
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isActionable}
                onClick={() => setRevokeTarget(invitation)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleResend]);

  if (loading && invitations.length === 0) {
    // +1 accounts for the `#` row-index column DataTable always prepends.
    return <TableSkeleton columns={columns.length + 1} rows={5} />;
  }

  if (!loading && invitations.length === 0) {
    return (
      <ListEmptyState
        searchTerm=""
        activeFilterCount={0}
        icon={Mail}
        emptyTitle="No pending invitations"
        emptyDescription="Invite a user to give them access to this cluster."
      />
    );
  }

  return (
    <div className="relative">
      {loading && invitations.length > 0 && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading invitations">
          <div className="text-muted-foreground">Loading invitations...</div>
        </div>
      )}
      <DataTable columns={columns} data={invitations} tableLayout="auto" />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke invitation"
        description={`Revoke the invitation sent to "${revokeTarget?.email ?? ''}"? They will no longer be able to accept it.`}
        confirmText="Revoke"
        confirmVariant="destructive"
        onConfirm={handleConfirmRevoke}
      />
    </div>
  );
};

export default InvitationsTable;
