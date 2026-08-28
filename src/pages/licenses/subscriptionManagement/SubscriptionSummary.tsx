import React from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { cn } from '../../../lib/utils';
import { FetchErrorState } from '../../../components/FetchErrorState';
import { useI18n } from '../../../hooks/useI18n';
import type { SubscriptionSummary as SummaryType } from '../../../types';

interface SubscriptionSummaryProps {
  summary: SummaryType | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

/**
 * Summary band ของหน้ารายการสัญญา — 5 การ์ด (ทั้งหมด/ใช้งาน/หมดอายุ/ใกล้หมดอายุ/ลบแล้ว)
 * ลอกโครงจาก `broadcastManagement/BroadcastSummary.tsx` เพราะมันเป็นแถบ 5 การ์ดแบ่งด้วย
 * divider อยู่แล้วตรงกับที่ต้องการเป๊ะ (ไม่ใช้ `ApplicationRegistrySummary`/`UserDirectorySummary`
 * ซึ่งเป็นการ์ดเดี่ยวผสม bar chart/avatar faces ที่ไม่ตรงรูปที่บรีฟต้องการ)
 *
 * ต่างจาก `BroadcastSummary` ตรงที่การ์ดที่นี่ไม่คลิกเพื่อกรองได้ — การกรองทั้งหมดของหน้านี้ทำผ่าน
 * filter Sheet เพียงทางเดียว (ดู `buildAdvance.ts`) ทำให้ไม่มีสอง code path ที่แก้ state
 * ตัวกรองเดียวกัน และ "ลบแล้ว" ก็ไม่มีทางคลิกดูรายการได้อยู่แล้ว (§8.2 ของสัญญา backend)
 */
export const SubscriptionSummary: React.FC<SubscriptionSummaryProps> = ({ summary, loading, error, onRetry }) => {
  const { t } = useI18n();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <FetchErrorState message={error} onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }

  const items = [
    { key: 'total', label: t('common.option.all'), value: summary?.total, color: 'text-foreground' },
    { key: 'active', label: t('common.status.active'), value: summary?.active, color: 'text-success' },
    { key: 'expired', label: t('common.status.expired'), value: summary?.expired, color: 'text-muted-foreground' },
    { key: 'expiring_soon', label: t('common.state.expiringSoon'), value: summary?.expiring_soon, color: 'text-warning' },
    { key: 'deleted', label: t('common.status.deleted'), value: summary?.deleted, color: 'text-destructive' },
  ] as const;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap divide-x divide-border">
          {items.map(({ key, label, value, color }) => (
            <div key={key} className="flex-1 basis-1/2 p-4 text-left sm:basis-1/3 sm:p-6 lg:basis-1/5">
              <div className="text-sm font-medium text-muted-foreground">{label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                {loading && value === undefined ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className={cn('text-2xl sm:text-3xl font-bold tracking-tight', color)}>
                    {value ?? 0}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
