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
import { AuditMeta } from '../../components/AuditMeta';
import { normalizeAudit } from '../../utils/audit';
import { useI18n } from '../../hooks/useI18n';
import { roleLabel } from '../../utils/roleLabels';
import type { ClusterInvitation } from '../../types';
import type { TKey } from '../../i18n/types';
import type { ColumnDef } from '@tanstack/react-table';

// Fallback only — applied to a status value this table cannot map to a known label (see
// STATUS_LABEL_KEYS / statusLabel below). Not used on any of the five known statuses, since
// their catalog values are already Title Case.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Hazard 2 (InvitationsTable.tsx:23/123, per the task brief's original line numbers): the
// invitation-status enum this table's status Badge can render. Not `enum_user_invitation_status`
// itself — 'expired' is a computed *display* status the backend derives from a lapsed `pending`
// row (see this file's doc comment above) — but together with 'expired' this is every value
// `statusVariant()` below already switches on, i.e. the complete set this column can show.
type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

const STATUS_LABEL_KEYS: Record<InvitationStatus, TKey> = {
  pending: 'pages.clusterAdmin.invitationStatusPending',
  accepted: 'pages.clusterAdmin.invitationStatusAccepted',
  declined: 'pages.clusterAdmin.invitationStatusDeclined',
  revoked: 'pages.clusterAdmin.invitationStatusRevoked',
  // Reuses common.status.expired directly rather than duplicating it.
  expired: 'common.status.expired',
};

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
  const { t } = useI18n();
  const [revokeTarget, setRevokeTarget] = useState<ClusterInvitation | null>(null);

  // Resolves a display status to its translated label. Known values (see InvitationStatus
  // above) are exhaustively mapped; anything else falls back to the raw, capitalized value —
  // this table's `status` field is typed as plain `string | undefined` in src/types/index.ts,
  // so an unrecognised future value degrades to English instead of throwing or mistranslating.
  const statusLabel = useCallback((status?: string): string => {
    const key = STATUS_LABEL_KEYS[(status ?? '').toLowerCase() as InvitationStatus];
    return key ? t(key) : (status ? cap(status) : '-');
  }, [t]);

  const handleResend = useCallback(async (invitation: ClusterInvitation) => {
    try {
      await clusterAdminService.resendInvitation(clusterId, invitation.id);
      toast.success(t('pages.clusterAdmin.invitationResent'));
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err, t);
      const description =
        (err as { response?: { status?: number } })?.response?.status === 429
          ? t('pages.clusterAdmin.invitationRateLimited')
          : message;
      toast.error(t('pages.clusterAdmin.resendFailed'), { description });
    }
  }, [clusterId, onChanged, t]);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await clusterAdminService.revokeInvitation(clusterId, revokeTarget.id);
      toast.success(t('pages.clusterAdmin.invitationRevoked'));
      setRevokeTarget(null);
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err, t);
      toast.error(t('pages.clusterAdmin.revokeFailed'), { description: message });
    }
  };

  const columns = useMemo<ColumnDef<ClusterInvitation, unknown>[]>(() => [
    {
      accessorKey: 'email',
      header: t('common.field.email'),
      meta: { card: 'title' },
      cell: ({ row }) => <span>{row.original.email}</span>,
    },
    {
      accessorKey: 'cluster_role',
      header: t('common.label.clusterRole'),
      // กว้างเท่ากับคอลัมน์เดียวกันในตาราง Members — ของเดิม w-28 แคบไปจนหัวคอลัมน์ห่อสองบรรทัด
      // มาตั้งแต่ก่อนหน้านี้ ไม่ได้เพิ่งเกิดจากการเปลี่ยนชื่อคอลัมน์ฝั่ง Members
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {roleLabel(t, row.original.cluster_role)}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {statusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'expires_at',
      id: 'expires_at',
      header: t('common.state.expires'),
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight whitespace-nowrap text-muted-foreground">{fmt(row.original.expires_at)}</div>
      ),
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: t('pages.clusterAdmin.invitedColumn'),
      cell: ({ row }) => <AuditMeta variant="cell" actor={normalizeAudit(row.original).created} />,
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
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.action.rowActions', { name: invitation.email })}>
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
                {t('pages.clusterAdmin.resend')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isActionable}
                onClick={() => setRevokeTarget(invitation)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('pages.clusterAdmin.revoke')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleResend, statusLabel, t]);

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
        emptyTitle={t('pages.clusterAdmin.noPendingInvitations')}
        emptyDescription={t('pages.clusterAdmin.inviteToAccessHint')}
      />
    );
  }

  return (
    <div className="relative">
      {loading && invitations.length > 0 && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.clusterAdmin.loadingInvitationsAria')}>
          <div className="text-muted-foreground">{t('pages.clusterAdmin.loadingInvitations')}</div>
        </div>
      )}
      <DataTable columns={columns} data={invitations} tableLayout="auto" />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title={t('pages.clusterAdmin.revokeInvitationTitle')}
        description={t('pages.clusterAdmin.revokeInvitationConfirm', { email: revokeTarget?.email ?? '' })}
        confirmText={t('pages.clusterAdmin.revoke')}
        confirmVariant="destructive"
        onConfirm={handleConfirmRevoke}
      />
    </div>
  );
};

export default InvitationsTable;
