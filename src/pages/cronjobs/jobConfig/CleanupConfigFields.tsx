import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useI18n } from '../../../hooks/useI18n';
import type { CleanupJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

export default function CleanupConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<CleanupJobConfig>) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cleanup_action">{t('cronjob.config.action')}</Label>
        <Input
          id="cleanup_action"
          disabled={readOnly}
          value={value.action ?? ''}
          onChange={(e) => onChange({ ...value, action: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cleanup_type">{t('cronjob.config.type')}</Label>
        <Input
          id="cleanup_type"
          disabled={readOnly}
          value={value.type ?? ''}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cleanup_older_than">{t('cronjob.config.olderThan')}</Label>
        <Input
          id="cleanup_older_than"
          placeholder={t('cronjob.config.olderThanPlaceholder')}
          disabled={readOnly}
          value={value.older_than ?? ''}
          onChange={(e) => onChange({ ...value, older_than: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{t('cronjob.config.olderThanHint')}</p>
      </div>
    </div>
  );
}
