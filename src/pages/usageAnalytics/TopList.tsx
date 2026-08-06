import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export interface TopListItem {
  key: string;
  label: string;
  sub?: string | null;
  value: number;
}

interface TopListProps {
  title: string;
  items: TopListItem[];
  emptyLabel: string;
  /** ถ้าส่งมา แต่ละแถวจะกดได้ (ใช้ทำ drill-down ไปหน้า raw event) */
  onSelect?: (key: string) => void;
}

/**
 * รายการจัดอันดับแบบแท่งแนวนอน — ความยาวแท่งเทียบกับอันดับหนึ่ง
 * ใช้ div ธรรมดา ไม่พึ่ง chart library เพราะเป็นแค่สัดส่วนเชิงเปรียบเทียบ
 */
export const TopList: React.FC<TopListProps> = ({ title, items, emptyLabel, onSelect }) => {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0) || 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
        {items.map((item) => {
          const row = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-xs" title={item.label}>{item.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {item.value.toLocaleString()}
                </span>
              </div>
              {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
                />
              </div>
            </>
          );

          return onSelect ? (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
            >
              {row}
            </button>
          ) : (
            <div key={item.key} className="px-2 py-1.5">{row}</div>
          );
        })}
      </CardContent>
    </Card>
  );
};
