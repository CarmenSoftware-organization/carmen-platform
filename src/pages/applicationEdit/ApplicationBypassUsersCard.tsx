import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { UserMultiSelect } from '../../components/UserMultiSelect';
import Can from '../../components/Can';
import applicationService from '../../services/applicationService';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { ApplicationBypassUser, UserOption } from '../../types';

const toOptions = (users: ApplicationBypassUser[]): UserOption[] =>
  users.map((u) => ({ id: u.user_id, name: u.name || u.email || u.user_id, email: u.email }));

const sameIds = (a: UserOption[], b: UserOption[]) =>
  a.length === b.length && a.map((u) => u.id).sort().join() === b.map((u) => u.id).sort().join();

export interface ApplicationBypassUsersCardProps {
  appId: string;
  /** Must be referentially stable between fetches — the card re-seeds when it changes. */
  users: ApplicationBypassUser[];
  onChanged: () => Promise<void>;
}

/** Users who keep full access during maintenance and read-only. Own Save — not the page's form. */
export function ApplicationBypassUsersCard({ appId, users, onChanged }: ApplicationBypassUsersCardProps) {
  const { t } = useI18n();
  const [value, setValue] = useState<UserOption[]>(() => toOptions(users));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(toOptions(users));
  }, [users]);

  const saved = toOptions(users);
  const dirty = !sameIds(value, saved);

  const handleSave = async () => {
    setSaving(true);
    try {
      await applicationService.setBypassUsers(appId, value.map((u) => u.id));
      toast.success(t('pages.applications.bypassUsersSaved'));
      await onChanged();
    } catch (err: unknown) {
      toast.error(t('pages.applications.bypassUsersSaveFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      setSaving(false);
    }
  };

  const readView =
    saved.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t('pages.applications.bypassUsersNone')}</p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {saved.map((u) => (
          <Badge key={u.id} variant="secondary" title={u.email}>{u.name}</Badge>
        ))}
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.applications.bypassUsers')}</CardTitle>
        <CardDescription>{t('pages.applications.bypassUsersDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Can permission="application.update" fallback={readView}>
          <UserMultiSelect
            id="bypass_users"
            value={value}
            onChange={setValue}
            placeholder={t('pages.applications.bypassUsersPlaceholder')}
            disabled={saving}
          />
          {value.length === 0 && (
            <p className="text-muted-foreground text-xs">{t('pages.applications.bypassUsersNone')}</p>
          )}
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? t('common.busy.saving') : t('pages.applications.bypassUsersSave')}
            </Button>
          </div>
        </Can>
      </CardContent>
    </Card>
  );
}
