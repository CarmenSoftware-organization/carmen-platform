import React from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useI18n } from '../../hooks/useI18n';
import type { AnalyticsDaily } from '../../types';

interface UsageChartProps {
  data: AnalyticsDaily[];
}

/**
 * กราฟ sessions และ active users รายวัน
 *
 * recharts ถูกใช้เฉพาะในไฟล์นี้ที่เดียว — ถ้าวันหลังต้องเปลี่ยน chart library
 * แก้ที่นี่ไฟล์เดียวโดยไม่ต้องแตะหน้าอื่น
 * สีอ่านจาก CSS custom property เพื่อให้ dark mode ถูกต้องโดยไม่ต้องมีตารางสีซ้ำ
 */
export const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('pages.usageAnalytics.chartTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* `name` คือข้อความที่ Legend และ Tooltip แสดง (ไม่ใช่ dataKey ที่ใช้อ่านข้อมูล)
                  จึงเป็นข้อความที่ผู้ใช้เห็นและต้องแปลตามภาษาที่เลือก */}
              <Area type="monotone" dataKey="sessions" name={t('pages.usageAnalytics.metricSessions')}
                    stroke="hsl(var(--chart-1))" fill="url(#fillSessions)" strokeWidth={2} />
              <Area type="monotone" dataKey="users" name={t('pages.usageAnalytics.metricActiveUsers')}
                    stroke="hsl(var(--chart-2))" fill="url(#fillUsers)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
