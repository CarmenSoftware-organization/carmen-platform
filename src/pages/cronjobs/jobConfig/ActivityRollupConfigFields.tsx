import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useI18n } from '../../../hooks/useI18n';
import type { ActivityRollupJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

export default function ActivityRollupConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<ActivityRollupJobConfig>) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label htmlFor="days_back">{t('cronjob.config.daysBack')}</Label>
      <Input
        id="days_back"
        type="number"
        min={1}
        disabled={readOnly}
        value={value.days_back ?? 2}
        onChange={(e) => onChange({ ...value, days_back: Number(e.target.value) })}
      />
      <p className="text-xs text-muted-foreground">{t('cronjob.config.daysBackHint')}</p>
    </div>
  );
}
