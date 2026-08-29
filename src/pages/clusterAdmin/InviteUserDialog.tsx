import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import businessUnitService from '../../services/businessUnitService';
import clusterAdminService from '../../services/clusterAdminService';
import { parseApiError } from '../../utils/errorParser';
import { isValidEmail } from '../../utils/validation';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { ROLE_LABEL_KEYS } from '../../utils/roleLabels';
import type { BusinessUnit } from '../../types';

const CLUSTER_ROLES = ['admin', 'user'] as const;
const BU_ROLES = ['admin', 'user'] as const;

const selectClassName = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

interface BuSelection {
  role: string;
  is_default: boolean;
}

interface InviteUserDialogProps {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
  /** Called with the email when the backend reports it already has membership (409). */
  onAlreadyMember: (email: string) => void;
  /** Called with the email when the backend reports an invitation is already pending (409). */
  onAlreadyPending: (email: string) => void;
}

/**
 * Invite-a-user dialog for the cluster-admin Users page. Loads the cluster's business units
 * (same `cluster_id` advance filter as BusinessUnitList) for the per-BU role + default picker,
 * then posts the invitation. See D7 in the task brief for why 409 hands control back to the
 * Members or Invitations tab instead of just showing an error — which tab depends on which of
 * the two reachable 409s came back (see the catch block below).
 */
const InviteUserDialog: React.FC<InviteUserDialogProps> = ({
  clusterId,
  open,
  onOpenChange,
  onInvited,
  onAlreadyMember,
  onAlreadyPending,
}) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [clusterRole, setClusterRole] = useState<'admin' | 'user'>('user');
  const [selected, setSelected] = useState<Record<string, BuSelection>>({});
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loadingBUs, setLoadingBUs] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !clusterId) return;
    setEmail('');
    setClusterRole('user');
    setSelected({});
    setFieldErrors({});

    const fetchBusinessUnits = async () => {
      setLoadingBUs(true);
      try {
        // Same cluster_id filter BusinessUnitList uses: the backend rejects a business unit
        // outside the cluster with a 400, so this filter is what keeps the picker honest.
        // perpage: 200 is a fixed cap, not real pagination — a cluster with more than 200
        // business units would silently lose the rest from this picker. Unlikely in practice
        // and out of scope here, but a known bound rather than a silent one.
        const data = await businessUnitService.getAll({
          perpage: 200,
          advance: JSON.stringify({ where: { cluster_id: clusterId } }),
        });
        const items = data.data || data;
        setBusinessUnits(Array.isArray(items) ? items : []);
      } catch (err: unknown) {
        const { message } = parseApiError(err, t);
        toast.error(t('common.state.failedToLoadBusinessUnits'), { description: message });
        setBusinessUnits([]);
      } finally {
        setLoadingBUs(false);
      }
    };
    fetchBusinessUnits();
  }, [open, clusterId, t]);

  const toggleBu = (buId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[buId]) {
        delete next[buId];
      } else {
        next[buId] = { role: 'user', is_default: false };
      }
      return next;
    });
  };

  const updateBuRole = (buId: string, role: string) => {
    setSelected((prev) => (prev[buId] ? { ...prev, [buId]: { ...prev[buId], role } } : prev));
  };

  // At most one entry may carry is_default: true — checking one clears every other.
  const setBuDefault = (buId: string, isDefault: boolean) => {
    setSelected((prev) => {
      const next: Record<string, BuSelection> = {};
      Object.entries(prev).forEach(([id, v]) => {
        next[id] = { ...v, is_default: isDefault && id === buId };
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setFieldErrors({ email: t('pages.clusterAdmin.enterValidEmail') });
      return;
    }
    setSending(true);
    try {
      await clusterAdminService.createInvitation(clusterId, {
        email,
        cluster_role: clusterRole,
        business_units: Object.entries(selected).map(([business_unit_id, v]) => ({
          business_unit_id,
          role: v.role,
          ...(v.is_default ? { is_default: true } : {}),
        })),
      });
      toast.success(t('pages.clusterAdmin.invitationSent'), { description: email });
      onOpenChange(false);
      onInvited();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const { message, fields } = parseApiError(err, t);
      if (status === 409) {
        // The backend has two distinct 409s reachable from this endpoint: INVITATION_ALREADY_MEMBER
        // and INVITATION_ALREADY_PENDING (see user-invitation.service.ts createInvitation —
        // INVITATION_NOT_PENDING is only reachable from revoke/resend, never from here). Both are
        // raised via `Result.errorFromCatalog`, so unlike the OptimisticLockError case documented in
        // src/utils/docVersion.ts (a generically-caught Prisma exception whose catalog code never
        // survives), the gateway's exception filter recovers the specific catalog code from the RPC
        // error's `app_code` and threads it through as `error.code` — the shape is checked at both
        // the top level and nested under `error` since the two documented gateway response shapes in
        // this codebase disagree on which one is used. The catalog's own English message is checked
        // too, as a second, independent line of defense — mirroring isVersionConflict's code-OR-message
        // pattern — so this branch stays correct even if the code doesn't come through as expected.
        const data = (err as { response?: { data?: { code?: string; error?: { code?: string } } } })
          ?.response?.data;
        const code = data?.code ?? data?.error?.code;
        const isAlreadyPending =
          code === 'INVITATION_ALREADY_PENDING' || /already pending|no longer pending/i.test(message);
        if (isAlreadyPending) {
          // A pending invitation already exists — the answer is on the Invitations tab, not here.
          toast.error(t('pages.clusterAdmin.invitationAlreadyPending'), {
            description: t('pages.clusterAdmin.invitationAlreadyPendingDescription', { email }),
          });
          onOpenChange(false);
          onAlreadyPending(email);
        } else {
          // The address is already a member, so the answer is on the Members tab, not here.
          toast.error(t('pages.clusterAdmin.alreadyAMember'), {
            description: t('pages.clusterAdmin.alreadyAMemberDescription', { email }),
          });
          onOpenChange(false);
          onAlreadyMember(email);
        }
      } else if (status === 429) {
        toast.error(t('pages.clusterAdmin.rateLimited'), {
          description: t('pages.clusterAdmin.invitationRateLimited'),
        });
      } else {
        toast.error(t('pages.clusterAdmin.sendInvitationFailed'), { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!sending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pages.clusterAdmin.inviteUser')}</DialogTitle>
          <DialogDescription>
            {t('pages.clusterAdmin.inviteUserDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">{t('common.field.email')}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.email;
                    return next;
                  });
                }
              }}
              placeholder={t('pages.clusterAdmin.emailPlaceholder')}
              className={fieldErrors.email ? 'border-destructive' : ''}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-cluster-role">{t('pages.clusterAdmin.clusterRoleFieldLabel')}</Label>
            <select
              id="invite-cluster-role"
              value={clusterRole}
              onChange={(e) => setClusterRole(e.target.value as 'admin' | 'user')}
              className={selectClassName}
            >
              {CLUSTER_ROLES.map((r) => (
                <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t('pages.clusterAdmin.businessUnitAccessLabel')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('pages.clusterAdmin.businessUnitAccessHint')}
            </p>
            <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
              {loadingBUs ? (
                <div className="text-sm text-muted-foreground text-center py-4">{t('common.state.loadingBusinessUnits')}</div>
              ) : businessUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('common.state.noBusinessUnitsInCluster')}</p>
              ) : (
                businessUnits.map((bu) => {
                  const entry = selected[bu.id];
                  return (
                    <div key={bu.id} className="px-3 py-2 space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!entry}
                          onChange={() => toggleBu(bu.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="font-medium">{bu.name}</span>
                      </label>
                      {entry && (
                        <div className="ml-6 flex flex-wrap items-center gap-3">
                          <select
                            aria-label={t('pages.clusterAdmin.roleInBu', { name: bu.name })}
                            value={entry.role}
                            onChange={(e) => updateBuRole(bu.id, e.target.value)}
                            className={cn(selectClassName, 'w-28')}
                          >
                            {BU_ROLES.map((r) => (
                              <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={entry.is_default}
                              onChange={(e) => setBuDefault(bu.id, e.target.checked)}
                              className="h-4 w-4 rounded border-input"
                            />
                            {t('common.label.default')}
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sending ? t('pages.clusterAdmin.sending') : t('pages.clusterAdmin.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;
