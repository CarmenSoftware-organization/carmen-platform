import React from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { cn } from '../../../lib/utils';
import { FetchErrorState } from '../../../components/FetchErrorState';
import { useI18n } from '../../../hooks/useI18n';
import type { SubscriptionSummary as SummaryType } from '../../../types';

/** คีย์ของการ์ดที่กดแล้วกรองได้ — `deleted` ไม่อยู่ในนี้โดยตั้งใจ (ดู doc ของคอมโพเนนต์) */
export type SummaryFilterKey = 'total' | 'active' | 'expired' | 'expiring_soon';

interface SubscriptionSummaryProps {
  summary: SummaryType | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  /** ไม่ส่ง = การ์ดเป็นตัวเลขอ่านอย่างเดียวเหมือนเดิมทั้งแถบ */
  onFilter?: (key: SummaryFilterKey) => void;
  /** การ์ดที่ตรงกับตัวกรองที่เปิดอยู่ตอนนี้ */
  activeKeys?: SummaryFilterKey[];
  /** การ์ดที่กดไม่ได้ชั่วคราวเพราะตัวกรองอื่นบังอยู่ (ดู `handleStateFilter` ใน SubscriptionTable) */
  disabledKeys?: SummaryFilterKey[];
}

/**
 * Summary band ของหน้ารายการสัญญา — 5 การ์ด (ทั้งหมด/ใช้งาน/หมดอายุ/ใกล้หมดอายุ/ลบแล้ว)
 * ลอกโครงจาก `broadcastManagement/BroadcastSummary.tsx` เพราะมันเป็นแถบ 5 การ์ดแบ่งด้วย
 * divider อยู่แล้วตรงกับที่ต้องการเป๊ะ (ไม่ใช้ `ApplicationRegistrySummary`/`UserDirectorySummary`
 * ซึ่งเป็นการ์ดเดี่ยวผสม bar chart/avatar faces ที่ไม่ตรงรูปที่บรีฟต้องการ)
 *
 * การ์ดสี่ใบแรกกดเพื่อกรองได้เมื่อผู้เรียกส่ง `onFilter` มา — **ได้ก็ต่อเมื่อ `summary` ที่ส่งเข้ามา
 * เป็นตัวเลขที่ไม่ผ่านตัวกรองเท่านั้น** (`subscriptionService.getSummary`) ห้ามป้อนด้วย `summary`
 * ที่ติดมากับ `getAll` เด็ดขาด เพราะตัวนั้นถูกจำกัดด้วยตัวกรองของคำขอ วัดจริงบน DEV: กรอง
 * expiring_soon แล้ว All 14→1 · Active 11→1 · Expired 3→0 · Deleted 5→0 คลิกแรกจะทำให้ทุกการ์ด
 * ที่เหลือเป็น 0 แล้วกดกลับไม่ได้เพราะกลายเป็นทางตัน (เดิมทั้งแถบจึงกดไม่ได้เลยด้วยเหตุผลนี้ ก่อนมี
 * endpoint แยก)
 *
 * "ลบแล้ว" ไม่มีวันกดได้ ไม่ว่าตัวเลขจะมาจากไหน — backend ไม่มีทางให้ list ระเบียนที่ลบแล้ว
 * (§8.2 ของสัญญา) การ์ดที่กดแล้วได้ 0 แถวคือทางตัน จึงคงเป็นตัวเลขอ่านอย่างเดียวตลอดไป
 */
export const SubscriptionSummary: React.FC<SubscriptionSummaryProps> = ({
  summary, loading, error, onRetry, onFilter, activeKeys = [], disabledKeys = [],
}) => {
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
          {items.map(({ key, label, value, color }) => {
            // `deleted` ไม่เคยกดได้ · การ์ดอื่นกดได้เมื่อผู้เรียกส่ง onFilter มาและไม่ได้ถูกบังอยู่
            const filterKey = key === 'deleted' ? null : (key as SummaryFilterKey);
            const disabled = !!filterKey && disabledKeys.includes(filterKey);
            const active = !!filterKey && activeKeys.includes(filterKey);
            const clickable = !!onFilter && !!filterKey && !disabled;

            const body = (
              <>
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
              </>
            );
            const box = 'flex-1 basis-1/2 p-4 text-left sm:basis-1/3 sm:p-6 lg:basis-1/5';

            if (!clickable) {
              return (
                <div
                  key={key}
                  className={cn(box, active && 'bg-muted', disabled && 'opacity-50')}
                  // การ์ดที่ถูกบังยังอ่านค่าได้ แต่ต้องบอกว่าทำไมกดไม่ได้ ไม่ใช่กดแล้วเงียบ
                  title={disabled ? t('pages.subscriptions.clearExpiringSoonFirst') : undefined}
                >
                  {body}
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFilter(filterKey)}
                aria-pressed={active}
                className={cn(
                  box,
                  'transition-colors hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                  active && 'bg-muted',
                )}
              >
                {body}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
