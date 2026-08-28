import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { FetchErrorState } from '../../components/FetchErrorState';
import { useI18n } from '../../hooks/useI18n';
import type { BroadcastSummary as SummaryType } from '../../types';

interface BroadcastSummaryProps {
  summary: SummaryType | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  statusFilter: string[];
  onStatusFilter: (status: string) => void;
  showDeleted: boolean;
  onToggleDeleted: () => void;
}

export const BroadcastSummary: React.FC<BroadcastSummaryProps> = ({
  summary,
  loading,
  error,
  onRetry,
  statusFilter,
  onStatusFilter,
  showDeleted,
  onToggleDeleted,
}) => {
  const { t } = useI18n();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <FetchErrorState message={t('pages.broadcasts.summaryLoadFailed')} onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }

  // ช่อง Deleted ต่างจากอีกสี่ช่องโดยตั้งใจ: query param `status` รับแค่ active|scheduled|expired
  // การเข้าถึงแถวที่ลบแล้วทำผ่าน include_deleted ฉะนั้นช่องนี้จึงสลับ Show deleted ไม่ใช่กรอง status
  // ที่ต้องมีช่องนี้เพราะ backend ส่ง summary.deleted มาด้วย และ all = active + scheduled + expired
  // + deleted ถ้าไม่แสดง deleted ผู้ใช้จะเห็น All ไม่เท่าผลรวมช่องที่เหลือทันทีที่มีแถวถูกลบ
  const items = [
    { key: 'all', label: t('common.option.all'), value: summary?.all, color: 'text-foreground' },
    { key: 'active', label: t('common.status.active'), value: summary?.active, color: 'text-success' },
    { key: 'scheduled', label: t('common.status.scheduled'), value: summary?.scheduled, color: 'text-info' },
    { key: 'expired', label: t('common.status.expired'), value: summary?.expired, color: 'text-muted-foreground' },
    { key: 'deleted', label: t('common.status.deleted'), value: summary?.deleted, color: 'text-destructive' },
  ] as const;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap divide-x divide-border">
          {items.map(({ key, label, value, color }) => {
            const isActive =
              key === 'deleted'
                ? showDeleted
                : statusFilter.length === 0
                  ? key === 'all'
                  : statusFilter.includes(key);
            return (
              <button
                key={key}
                aria-pressed={isActive}
                onClick={() => (key === 'deleted' ? onToggleDeleted() : onStatusFilter(key))}
                className={cn(
                  'flex-1 basis-1/2 p-4 text-left transition-colors hover:bg-muted/50 sm:basis-1/3 sm:p-6 lg:basis-1/5',
                  isActive && 'bg-muted/30'
                )}
              >
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
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
