import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Skeleton } from '../../../components/ui/skeleton';
import { Textarea } from '../../../components/ui/textarea';
import { useI18n } from '../../../hooks/useI18n';
import userService from '../../../services/userService';
import { devLog } from '../../../utils/errorParser';
import type { NotificationJobConfig, User } from '../../../types';
import type { JobConfigFieldsProps } from './index';

export default function NotificationConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<NotificationJobConfig>) {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // One-shot load, race-guarded with an ignore flag set in the cleanup — a slow
  // response for an abandoned render (e.g. job_type switched away and back) cannot
  // overwrite newer state. Same pattern as BusinessUnitMultiSelect.tsx.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoadingUsers(true);
        const data = await userService.getAll({ perpage: 200 });
        const items = data?.data ?? [];
        if (!ignore) setUsers(Array.isArray(items) ? items : []);
      } catch (err) {
        devLog('Failed to load users:', err);
        if (!ignore) setLoadError(t('cronjob.config.userIdsLoadFailed'));
      } finally {
        if (!ignore) setLoadingUsers(false);
      }
    })();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = useMemo(() => value.user_ids ?? [], [value.user_ids]);
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.includes(u.id)),
    [users, selectedIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggle = (userId: string) => {
    if (readOnly) return;
    const next = selectedIds.includes(userId)
      ? selectedIds.filter((id) => id !== userId)
      : [...selectedIds, userId];
    onChange({ ...value, user_ids: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="notification_title">{t('cronjob.config.title')}</Label>
        <Input
          id="notification_title"
          disabled={readOnly}
          value={value.title ?? ''}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notification_message">{t('cronjob.config.message')}</Label>
        <Textarea
          id="notification_message"
          disabled={readOnly}
          value={value.message ?? ''}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notification_type">{t('cronjob.config.type')}</Label>
          <Input
            id="notification_type"
            disabled={readOnly}
            value={value.type ?? ''}
            onChange={(e) => onChange({ ...value, type: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notification_category">{t('cronjob.config.category')}</Label>
          <Input
            id="notification_category"
            disabled={readOnly}
            value={value.category ?? ''}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('cronjob.config.userIds')}</Label>
        {loadingUsers ? (
          <Skeleton className="h-40 w-full" />
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t('cronjob.config.userIdsNoneSelected')}</span>
              ) : (
                selectedUsers.map((u) => (
                  <Badge key={u.id} variant="secondary" className="text-xs gap-1 pr-1">
                    {u.name || u.email}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => toggle(u.id)}
                        className="ml-0.5 hover:text-foreground"
                        aria-label={t('common.action.removeAria', { name: u.name || u.email })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))
              )}
            </div>

            {!readOnly && (
              <>
                <Input
                  placeholder={t('common.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('cronjob.config.userIdsNoneFound')}</p>
                  ) : (
                    filtered.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => toggle(u.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm">{u.name || u.email}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
        {/* I2 fix: notification.go errors with "notification job config missing user_ids"
            when this is empty — the "leave empty" hint was copied from
            DashboardRefreshConfigFields' bu_codes hint, where empty genuinely means "all". */}
        <p className="text-xs text-muted-foreground">{t('cronjob.config.userIdsRequiredHint')}</p>
      </div>
    </div>
  );
}
