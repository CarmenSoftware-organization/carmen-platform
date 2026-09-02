import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { useI18n } from '../../hooks/useI18n';
import type { CronJobType } from '../../types';
import type { TKey } from '../../i18n/types';

// Kept as a page-local list rather than a shared export — CronJobEdit.tsx already
// duplicates the same six values locally (its job_type Select), so this matches the
// existing pattern instead of introducing a new shared module for one array.
const JOB_TYPES: CronJobType[] = [
  'report',
  'notification',
  'cleanup',
  'dashboard_refresh',
  'activity_rollup',
  'activity_retention',
];

export interface CronJobFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currently APPLIED filter — the source of truth this sheet's fields reset to on open. */
  filter: Record<string, string>;
  onApply: (filter: Record<string, string>) => void;
  onClear: () => void;
}

/**
 * Three fixed Selects (job_type / status / owner) — no `advance` filter grammar, per the
 * design doc ("Non-goals"). Each Select uses the `'all'`-sentinel convention already used in
 * ActivityEventManagement.tsx and jobConfig/ReportConfigFields.tsx: `<SelectItem value="">`
 * throws at runtime on the pinned Radix version, so the empty/"any" choice is represented as
 * the literal string `'all'` in the UI and converted back to an absent key when writing the
 * filter object the service forwards.
 *
 * The gateway's filter grammar (platform_cronjobs.service.ts) only supports *exact* equality:
 * `source_service === ''` for platform-owned, or `source_service === <exact string>` for one
 * named foreign service. There is no "any foreign service" operator and no endpoint that
 * enumerates the foreign source_service values in use, so the Owner select offers exactly the
 * two values the backend can answer — All and Platform — rather than faking a third option the
 * gateway cannot honour.
 */
export default function CronJobFilterSheet({ open, onOpenChange, filter, onApply, onClear }: CronJobFilterSheetProps) {
  const { t } = useI18n();
  const [jobType, setJobType] = useState(filter.job_type ?? '');
  const [status, setStatus] = useState(filter.is_active ?? '');
  const [owner, setOwner] = useState(filter.source_service !== undefined ? 'platform' : '');

  // The Sheet does not unmount between opens, so without this the fields would keep showing
  // whatever was pending from the last time it was open — including a pending edit the user
  // abandoned by closing without Apply, or a filter cleared elsewhere in the meantime.
  useEffect(() => {
    if (!open) return;
    setJobType(filter.job_type ?? '');
    setStatus(filter.is_active ?? '');
    setOwner(filter.source_service !== undefined ? 'platform' : '');
  }, [open, filter]);

  const handleApply = () => {
    const next: Record<string, string> = {};
    if (jobType) next.job_type = jobType;
    if (status) next.is_active = status;
    // '' is itself a meaningful value here (platform-owned = source_service equals empty
    // string on the wire) — the presence of the key, not its truthiness, is what matters.
    if (owner === 'platform') next.source_service = '';
    onApply(next);
    onOpenChange(false);
  };

  const handleClear = () => {
    setJobType('');
    setStatus('');
    setOwner('');
    onClear();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle>{t('common.label.filters')}</SheetTitle>
          <SheetDescription>{t('cronjob.filter.description')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 px-1">
          <div className="space-y-2">
            <Label htmlFor="cronjob-filter-job-type">{t('cronjob.field.jobType')}</Label>
            <Select value={jobType || 'all'} onValueChange={(v) => setJobType(v === 'all' ? '' : v)}>
              <SelectTrigger id="cronjob-filter-job-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.option.all')}</SelectItem>
                {JOB_TYPES.map((jt) => (
                  <SelectItem key={jt} value={jt}>{t(`cronjob.type.${jt}` as TKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cronjob-filter-status">{t('common.status.label')}</Label>
            <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
              <SelectTrigger id="cronjob-filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.option.all')}</SelectItem>
                <SelectItem value="true">{t('cronjob.status.running')}</SelectItem>
                <SelectItem value="false">{t('cronjob.status.stopped')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cronjob-filter-owner">{t('cronjob.column.owner')}</Label>
            <Select value={owner || 'all'} onValueChange={(v) => setOwner(v === 'all' ? '' : v)}>
              <SelectTrigger id="cronjob-filter-owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.option.all')}</SelectItem>
                <SelectItem value="platform">{t('cronjob.owner.platform')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex gap-3 px-1">
          <Button variant="outline" className="flex-1" onClick={handleClear}>
            {t('common.action.clear')}
          </Button>
          <Button className="flex-1" onClick={handleApply}>
            {t('cronjob.filter.apply')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
