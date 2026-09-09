import { Plug } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { CoverageCard, type CoverageRowItem } from './CoverageCard';
import { fmtCoverageRange } from '../../licenses/licenseDates';
import { useI18n } from '../../../hooks/useI18n';
import { useExpiryThresholds } from '../../../context/ExpiryThresholdContext';
import type { InterfaceLicense } from '../../../types';
import type { InterfaceRow } from '../../licenses/useClusterInterfaceLicenses';

export interface InterfaceLicensesCardProps {
  rows: InterfaceRow[];
  failedBus: { id: string; name?: string; code?: string }[];
  loading: boolean;
  clusterId: string;
  onRetry: () => void;
  now?: Date;
}

/**
 * ใบสิทธิ์ interface ทุกใบใน cluster — **สถานะทุกป้ายมาจาก backend** (`in_force`/`state`)
 * ใบที่วันยังไม่หมดแต่ `in_force=false` คือ "ถูกครอบด้วยสัญญาหลัก" ห้ามคำนวณจากวันที่เอง
 * แถวลิงก์ไปแท็บ Licenses ของ BU ในเชลล์ cluster-admin — ไม่ใช่ `/licenses/interface/:id/edit`
 * ซึ่งบังคับ `subscription.read`
 */
export function InterfaceLicensesCard({ rows, failedBus, loading, clusterId, onRetry, now = new Date() }: InterfaceLicensesCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();

  const badgeOf = (l: InterfaceLicense) => {
    if (l.in_force) return <Badge variant="success">{t('common.status.active')}</Badge>;
    if (l.state === 'active') return <Badge variant="warning">{t('pages.businessUnits.interfaceCapped')}</Badge>;
    if (l.state === 'scheduled') return <Badge variant="secondary">{t('common.status.scheduled')}</Badge>;
    return <Badge variant="destructive">{t('common.status.expired')}</Badge>;
  };

  // วาดเฉพาะใบที่ `in_force` — ใบที่หมด/ถูกครอบ/ยังไม่เริ่ม เหลือแค่ตัวนับบนหัวการ์ด (ผู้ใช้เคาะไว้)
  const items: CoverageRowItem[] = rows.filter((r) => r.license.in_force).map(({ bu, license: l }) => {
    const buLabel = bu.code || bu.name || t('pages.clusterAdmin.unnamed');
    return {
      id: l.id,
      start_date: l.start_date,
      end_date: l.end_date,
      live: l.in_force,
      primary: (
        <>
          {l.group?.code ?? l.license_feature_group_id}{' '}
          <span className="text-muted-foreground">· {l.license_number}</span>
        </>
      ),
      secondary: `${l.group?.name ?? ''} · ${fmtCoverageRange(l.start_date, l.end_date, t('common.state.noExpiry'))}`,
      badge: badgeOf(l),
      href: `/cluster-admin/${clusterId}/business-units/${bu.id}/edit?tab=licenses`,
      ariaLabel: t('pages.clusterAdmin.openBusinessUnitLicences', { name: bu.name || buLabel }),
      group: { key: bu.id, label: bu.name ? `${buLabel} · ${bu.name}` : buLabel },
    };
  });

  return (
    <CoverageCard
      icon={Plug}
      label={t('pages.clusterAdmin.coverageInterfaceLabel')}
      items={items}
      totalCount={rows.length}
      loading={loading}
      partialFailText={failedBus.length > 0 ? t('pages.clusterAdmin.coverageLoadFailedPartial', { count: failedBus.length }) : undefined}
      emptyText={t('pages.clusterAdmin.noInterfaceLicensesInCluster')}
      onRetry={onRetry}
      soonDays={thresholds.interface_days}
      now={now}
    />
  );
}
