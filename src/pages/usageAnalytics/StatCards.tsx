import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import type { AnalyticsSummary } from '../../types';

interface StatCardsProps {
  summary?: AnalyticsSummary;
  loading: boolean;
}

/**
 * ป้ายของการ์ดทั้งห้าเป็น "คีย์" ไม่ใช่ข้อความสำเร็จรูป — const ระดับโมดูลเรียก hook ไม่ได้
 * จึงเก็บ TKey ไว้แล้วให้ component แปลตอน render ค่าจะได้เปลี่ยนตามภาษาที่สลับ
 * (แนวเดียวกับ `getRangePresets` ใน utils/analyticsRange.ts)
 */
const FIELDS: { key: keyof AnalyticsSummary; labelKey: TKey }[] = [
  { key: 'events', labelKey: 'pages.usageAnalytics.metricEvents' },
  { key: 'clicks', labelKey: 'pages.usageAnalytics.metricClicks' },
  { key: 'page_views', labelKey: 'pages.usageAnalytics.metricPageViews' },
  { key: 'sessions', labelKey: 'pages.usageAnalytics.metricSessions' },
  { key: 'users', labelKey: 'pages.usageAnalytics.metricActiveUsers' },
];

/**
 * การ์ดตัวเลขสรุปห้าใบบนสุดของหน้า Usage Analytics
 *
 * ไม่มี `summary` (โหลดไม่สำเร็จ) ≠ ค่าเป็นศูนย์ — แสดงขีดแทน ไม่งั้นหน้าจอจะขึ้นเลข 0
 * ห้าใบที่ดูเหมือนตัวเลขที่วัดมาได้จริง ทั้งที่ยังไม่รู้ค่าอะไรเลย
 */
export const StatCards: React.FC<StatCardsProps> = ({ summary, loading }) => {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {FIELDS.map((f) => (
        <Card key={f.key}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t(f.labelKey)}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {summary ? summary[f.key].toLocaleString() : '—'}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
