import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useI18n } from '../../../hooks/useI18n';
import type { ActivityRetentionJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

export default function ActivityRetentionConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<ActivityRetentionJobConfig>) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="retention_days">{t('cronjob.config.retentionDays')}</Label>
        <Input
          id="retention_days"
          type="number"
          min={1}
          disabled={readOnly}
          value={value.retention_days ?? 365}
          onChange={(e) => onChange({ ...value, retention_days: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">{t('cronjob.config.retentionDaysHint')}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="batch_size">{t('cronjob.config.batchSize')}</Label>
        <Input
          id="batch_size"
          type="number"
          min={1}
          disabled={readOnly}
          value={value.batch_size ?? 10000}
          onChange={(e) => onChange({ ...value, batch_size: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">{t('cronjob.config.batchSizeHint')}</p>
      </div>
    </div>
  );
}
