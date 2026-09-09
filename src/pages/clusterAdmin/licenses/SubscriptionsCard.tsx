import { FileText } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { CoverageCard, type CoverageRowItem } from './CoverageCard';
import { fmtCoverageRange } from '../../licenses/licenseDates';
import { useI18n } from '../../../hooks/useI18n';
import { useExpiryThresholds } from '../../../context/ExpiryThresholdContext';
import type { BusinessUnit, Subscription } from '../../../types';

export interface SubscriptionsCardProps {
  items: Subscription[];
  loading: boolean;
  failed: boolean;
  /**
   * BU ของ cluster — ใช้แปลง `bu_code` ของสัญญาเป็น id เพื่อประกอบลิงก์ไปแท็บ Licenses ของ BU
   * (แถวสัญญาไม่พก `business_unit_id` มา มีแค่ `bu_code`/`bu_name`)
   */
  businessUnits: BusinessUnit[];
  clusterId: string;
  onRetry: () => void;
  now?: Date;
}

const stateVariant = (s: Subscription['state']) =>
  s === 'active' ? 'success' : s === 'expired' ? 'destructive' : 'secondary';

/**
 * สัญญาทุกใบของ cluster จัดกลุ่มตาม BU เรียงตามวันหมดอายุ
 *
 * ทุกแถวลิงก์ไปแท็บ Licenses ของ BU ในเชลล์ cluster-admin **เสมอ** ไม่ใช่หน้าสัญญา
 * `/licenses/subscriptions/:id/edit` แม้ผู้เรียกจะมี `subscription.read` — หน้านี้เป็นเชลล์ของ
 * cluster admin การพาออกไปเชลล์ platform กลางทางทำให้หลงบริบท (ผู้ใช้เคาะไว้)
 */
export function SubscriptionsCard({
  items, loading, failed, businessUnits, clusterId, onRetry, now = new Date(),
}: SubscriptionsCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const buByCode = new Map(businessUnits.map((bu) => [bu.code, bu]));

  // วาดเฉพาะสัญญาที่คุ้มครองอยู่ — ใบที่หมด/ปิด/ยังไม่เริ่ม เหลือแค่ตัวนับบนหัวการ์ด (ผู้ใช้เคาะไว้)
  const rows: CoverageRowItem[] = items
    .filter((sub) => sub.state === 'active')
    .sort((a, b) => Date.parse(a.end_date) - Date.parse(b.end_date))
    .map((sub) => {
      const bu = buByCode.get(sub.bu_code);
      const buLabel = sub.bu_code || sub.bu_name || t('pages.clusterAdmin.unnamed');
      // ไม่พบ BU ในรายชื่อ (ข้อมูลผิดรูปจากยุคก่อน migration: bu_code ว่าง) = แถวไม่เป็นลิงก์
      const href = bu ? `/cluster-admin/${clusterId}/business-units/${bu.id}/edit?tab=licenses` : undefined;
      return {
        id: sub.id,
        start_date: sub.start_date,
        end_date: sub.end_date,
        live: sub.state === 'active',
        primary: sub.subscription_number,
        secondary: `${fmtCoverageRange(sub.start_date, sub.end_date, t('common.state.noExpiry'))} · ${
          sub.feature_count === 1
            ? t('pages.businessUnits.subscriptionRowOne', { count: sub.feature_count })
            : t('pages.businessUnits.subscriptionRowMany', { count: sub.feature_count })
        }`,
        badge: <Badge variant={stateVariant(sub.state)}>{t(`common.status.${sub.state}`)}</Badge>,
        href,
        ariaLabel: t('pages.clusterAdmin.openBusinessUnitLicences', { name: bu?.name || buLabel }),
        group: { key: sub.bu_code || sub.bu_name || '?', label: sub.bu_name ? `${buLabel} · ${sub.bu_name}` : buLabel },
      };
    });

  return (
    <CoverageCard
      icon={FileText}
      label={t('pages.clusterAdmin.coverageSubscriptionsLabel')}
      items={rows}
      totalCount={items.length}
      loading={loading}
      failed={failed}
      failedText={t('pages.clusterAdmin.subscriptionsLoadFailed')}
      emptyText={t('pages.clusterAdmin.noSubscriptionsInCluster')}
      onRetry={onRetry}
      soonDays={thresholds.subscription_days}
      now={now}
    />
  );
}
