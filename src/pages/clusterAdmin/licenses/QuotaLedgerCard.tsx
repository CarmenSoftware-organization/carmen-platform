import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CollapsibleGroupCard } from './CollapsibleGroupCard';
import { AuditMeta } from '../../../components/AuditMeta';
import { latestActor } from '../../../utils/audit';
import { licenseStatus, activeLicense } from '../../../utils/clusterLicense';
import { isPerpetual, fmtDate } from '../../licenses/licenseDates';
import { useI18n } from '../../../hooks/useI18n';
import type { TKey } from '../../../i18n/types';
import type { ClusterLicense, ClusterLicenseStatus } from '../../../types';

// Module-scope, so it cannot call t() — holds catalog KEYS only, resolved with t() at the
// render site (same shape as roleLabels.ts's ROLE_LABEL_KEYS).
const STATUS_BADGE: Record<ClusterLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; labelKey: TKey }> = {
  active: { variant: 'success', labelKey: 'common.status.active' },
  scheduled: { variant: 'secondary', labelKey: 'common.status.scheduled' },
  expired: { variant: 'destructive', labelKey: 'common.status.expired' },
};

export interface QuotaLedgerCardProps {
  licenses: ClusterLicense[];
  loading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}

/**
 * ใบซื้อโควตา BU ทุกใบของคลัสเตอร์ ยุบไว้เป็นค่าเริ่มต้น
 *
 * ตัวเลขที่มีผลจริงอยู่บนแถบด้านบนของหน้าแล้ว (`bu_used` / `bu_cap` จาก backend view) รายการนี้
 * ตอบคำถามรอง — "โควตานั้นมาจากใบไหน ใบใดกำลังจะหมด" — จึงไม่ควรเป็นสิ่งแรกที่คนเห็น
 *
 * โควตาที่มีผลคือ **ใบที่ชนะใบเดียว** (`activeLicense`) ไม่ใช่ผลรวมทุกใบเหมือนที่นั่งของ BU
 * ห้าม sum `licensed_bus` เด็ดขาด — คนละกติกากันคนละชั้น
 */
export function QuotaLedgerCard({ licenses, loading, loadFailed, onRetry }: QuotaLedgerCardProps) {
  const { t } = useI18n();
  const now = new Date();
  const winning = activeLicense(licenses, now);

  // Count + in-force clause, joined with a literal ' · ' in code rather than spliced from
  // unrelated fragments — same non-linguistic-separator pattern ClusterPeopleCard.tsx
  // (Task 3) and CapacityStrip.tsx (Task 5) already established.
  const licenceCountText = t(
    licenses.length === 1 ? 'pages.clusterAdmin.licenceCountOne' : 'pages.clusterAdmin.licenceCountMany',
    { count: licenses.length },
  );
  const forceText = winning
    ? isPerpetual(winning.end_date)
      ? t('pages.clusterAdmin.inForceBusinessUnitsNoExpiry', { count: winning.licensed_bus })
      : t('pages.clusterAdmin.inForceBusinessUnitsToDate', { count: winning.licensed_bus, date: fmtDate(winning.end_date) })
    : t('pages.clusterAdmin.noneInForce');

  const summary = loadFailed
    ? t('pages.clusterAdmin.quotaSummaryLoadFailed')
    : loading && licenses.length === 0
      ? t('common.busy.loadingEllipsis')
      : licenses.length === 0
        ? t('pages.clusterAdmin.noQuotaLicenceIssued')
        : `${licenceCountText} · ${forceText}`;

  return (
    <CollapsibleGroupCard label={t('pages.clusterAdmin.buQuotaLicencesLabel')} summary={summary}>
      {loadFailed ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">
            {t('pages.clusterAdmin.licenceDataUnavailable')}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.action.retry')}
          </Button>
        </div>
      ) : licenses.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('pages.clusterAdmin.quotaLicencesIssuedByPlatformTeam')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="px-2 py-1.5 text-right whitespace-nowrap">{t('pages.licenses.quotaColumn')}</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.action.start')}</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('pages.licenses.end')}</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.status.label')}</th>
                <th className="px-2 py-1.5 text-left">{t('common.field.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => {
                const badge = STATUS_BADGE[licenseStatus(l, now)];
                const latest = latestActor(l);
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{l.licensed_bus}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {isPerpetual(l.end_date) ? (
                        <span className="text-muted-foreground">{t('common.state.noExpiry')}</span>
                      ) : (
                        fmtDate(l.end_date)
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
                      {winning?.id === l.id && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          {t('pages.clusterAdmin.inForceBadge')}
                        </Badge>
                      )}
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-xs">
                      <div>{l.reference_no || '-'}</div>
                      <AuditMeta
                        variant="compact"
                        verb={latest?.verb}
                        actor={latest?.actor}
                        className="text-muted-foreground text-[11px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* หมายเหตุของใบไม่ได้ขึ้นมาที่นี่โดยตั้งใจ — ใบที่ backfill มาถือข้อความที่เขียนไว้ให้
              ทีมอ่าน ("ย้ายจาก tb_cluster.max_license_bu") ซึ่งไม่ได้อธิบายอะไรให้ผู้ใช้ปลายทาง */}
        </div>
      )}
    </CollapsibleGroupCard>
  );
}
