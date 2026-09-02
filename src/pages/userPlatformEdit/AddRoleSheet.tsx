import React, { useCallback, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '../../components/ui/sheet';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import userRoleService from '../../services/userRoleService';
import { parseApiError } from '../../utils/errorParser';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Scope } from '../../types';
import { useI18n } from '../../hooks/useI18n';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

interface AddRoleSheetProps {
  userId: string;
  roleOptions: { id: string; name: string }[];
  clusterOptions: { id: string; name: string }[];
  /** Called after a successful grant so the page can refetch its assignments. */
  onAdded: () => void;
}

/**
 * The grant form as a side sheet rather than a panel spliced into the grants list: the
 * list is what the reviewer is reading, and it must not jump when the form opens. It also
 * matches the registry page, where granting happens in its own surface.
 */
export const AddRoleSheet: React.FC<AddRoleSheetProps> = ({
  userId, roleOptions, clusterOptions, onAdded,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [scopeType, setScopeType] = useState<'platform' | 'cluster'>('platform');
  const [clusterId, setClusterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // No saved baseline to diff against — "dirty" means the open form has been touched.
  useUnsavedChanges(open && (roleId !== '' || scopeType !== 'platform' || clusterId !== ''));

  const reset = useCallback(() => {
    setRoleId('');
    setScopeType('platform');
    setClusterId('');
    setFieldErrors({});
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const submit = useCallback(async () => {
    if (!roleId) {
      setFieldErrors((prev) => ({ ...prev, role_id: t('pages.userPlatform.roleRequired') }));
      toast.error(t('pages.userPlatform.selectRole'));
      return;
    }
    if (scopeType === 'cluster' && !clusterId) {
      setFieldErrors((prev) => ({ ...prev, cluster_id: t('pages.userPlatform.clusterRequired') }));
      toast.error(t('pages.userPlatform.selectClusterError'));
      return;
    }
    setSaving(true);
    try {
      const scope: Scope = scopeType === 'cluster'
        ? { type: 'cluster', cluster_id: clusterId }
        : { type: 'platform' };
      await userRoleService.add(userId, { role_id: roleId, scope });
      toast.success(t('pages.userPlatform.roleAssigned'));
      close();
      onAdded();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [roleId, scopeType, clusterId, userId, t, close, onAdded]);

  useGlobalShortcuts({
    onSave: () => { if (open && !saving) submit(); },
    onCancel: () => { if (open) close(); },
  });

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t('pages.userPlatform.addRole')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-4 sm:max-w-sm sm:p-6">
        <SheetHeader>
          <SheetTitle>{t('pages.userPlatform.addRole')}</SheetTitle>
          <SheetDescription>{t('pages.userPlatform.addRoleDescription')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4 px-1">
          <div className="space-y-2">
            <Label htmlFor="role_id">{t('pages.userPlatform.roleFieldLabel')}</Label>
            <select
              id="role_id"
              value={roleId}
              onChange={(e) => { setRoleId(e.target.value); setFieldErrors((prev) => ({ ...prev, role_id: '' })); }}
              onBlur={() => setFieldErrors((prev) => ({ ...prev, role_id: roleId ? '' : t('pages.userPlatform.roleRequired') }))}
              className={`${selectClassName} ${fieldErrors.role_id ? 'border-destructive' : ''}`}
            >
              <option value="">{t('pages.userPlatform.selectRole')}</option>
              {roleOptions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
            </select>
            {fieldErrors.role_id && <p className="text-destructive text-xs">{fieldErrors.role_id}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope_type">{t('pages.userPlatform.scopeLabel')}</Label>
            <select
              id="scope_type"
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as 'platform' | 'cluster');
                setClusterId('');
                setFieldErrors((prev) => ({ ...prev, cluster_id: '' }));
              }}
              className={selectClassName}
            >
              <option value="platform">{t('pages.userPlatform.scopePlatform')}</option>
              <option value="cluster">{t('pages.userPlatform.scopeSpecificCluster')}</option>
            </select>
            <p className="text-muted-foreground text-xs">
              {scopeType === 'platform'
                ? t('pages.userPlatform.scopePlatformHint')
                : t('pages.userPlatform.scopeClusterHint')}
            </p>
          </div>

          {scopeType === 'cluster' && (
            <div className="space-y-2">
              <Label htmlFor="cluster_id">{t('pages.userPlatform.clusterFieldLabel')}</Label>
              <select
                id="cluster_id"
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setFieldErrors((prev) => ({ ...prev, cluster_id: '' })); }}
                onBlur={() => setFieldErrors((prev) => ({ ...prev, cluster_id: clusterId ? '' : t('pages.userPlatform.clusterRequired') }))}
                className={`${selectClassName} ${fieldErrors.cluster_id ? 'border-destructive' : ''}`}
              >
                <option value="">{t('pages.userPlatform.selectCluster')}</option>
                {clusterOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {fieldErrors.cluster_id && <p className="text-destructive text-xs">{fieldErrors.cluster_id}</p>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? t('pages.userPlatform.adding') : t('common.action.add')}
            </Button>
            <Button size="sm" variant="outline" onClick={close} disabled={saving}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
