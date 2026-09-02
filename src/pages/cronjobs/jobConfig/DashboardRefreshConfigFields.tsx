import { BusinessUnitMultiSelect } from '../../../components/BusinessUnitMultiSelect';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useI18n } from '../../../hooks/useI18n';
import type { DashboardRefreshJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

// Radix Select.Item rejects an empty-string value (it's reserved to mean "cleared"),
// so the "all tiers" choice is represented by the 'all' sentinel here and translated
// to/from '' at the onChange boundary — same pattern as ActivityEventManagement's
// status/type filters.
const TIERS = ['operational', 'breakdown', 'matrix'];

export default function DashboardRefreshConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<DashboardRefreshJobConfig>) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('cronjob.config.buCodes')}</Label>
        <BusinessUnitMultiSelect
          value={value.bu_codes ?? []}
          onChange={(bu_codes) => onChange({ ...value, bu_codes })}
          disabled={readOnly}
          keyBy="code"
        />
        <p className="text-xs text-muted-foreground">{t('cronjob.config.buCodesEmptyMeansAll')}</p>
      </div>
      <div className="space-y-2">
        <Label>{t('cronjob.config.tier')}</Label>
        <Select
          value={value.tier || 'all'}
          onValueChange={(tier) => onChange({ ...value, tier: tier === 'all' ? '' : tier })}
          disabled={readOnly}
        >
          <SelectTrigger><SelectValue placeholder={t('cronjob.config.tierAll')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('cronjob.config.tierAll')}</SelectItem>
            {TIERS.map((tier) => (
              <SelectItem key={tier} value={tier}>
                {tier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
