import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import Can from '../components/Can';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/EmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { DateRangeFilter } from '../components/analytics/DateRangeFilter';
import { StatCards } from './usageAnalytics/StatCards';
import { TopList } from './usageAnalytics/TopList';
import { UsageChart } from './usageAnalytics/UsageChart';
import analyticsService from '../services/analyticsService';
import { useAnalyticsFilterOptions } from '../hooks/useAnalyticsFilterOptions';
import { presetRange, ymdInTz, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { useI18n } from '../hooks/useI18n';
import type { AnalyticsOverview } from '../types';

const UsageAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [range, setRange] = useState<DateRange>(() => presetRange(7));
  const [buCode, setBuCode] = useState('');
  const [appId, setAppId] = useState('');
  const [eventType, setEventType] = useState('');

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const { buOptions, appOptions } = useAnalyticsFilterOptions();

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await analyticsService.getOverview({
        from: range.from,
        to: range.to,
        ...(buCode ? { bu_code: buCode } : {}),
        ...(appId ? { app_id: appId } : {}),
        ...(eventType ? { event_type: eventType } : {}),
      });
      setRawResponse(response);
      setOverview(response.data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      setOverview(null);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, buCode, appId, eventType]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const topPageItems = useMemo(
    () => (overview?.top_pages || []).map((p) => ({
      key: p.page_path,
      label: p.page_path,
      sub: t('pages.usageAnalytics.topPageSub', {
        sessions: p.sessions.toLocaleString(),
        users: p.users.toLocaleString(),
      }),
      value: p.events,
    })),
    [overview, t],
  );

  const topElementItems = useMemo(
    () => (overview?.top_elements || []).map((e) => ({
      key: e.element_id,
      label: e.element_id,
      sub: [e.element_text, e.page_path].filter(Boolean).join(' · ') || null,
      value: e.clicks,
    })),
    [overview],
  );

  // drill-down ต้องพาตัวกรองที่ใช้อยู่ "ทั้งชุด" ไปด้วย ไม่ใช่แค่ page path กับช่วงวัน —
  // ถ้าพาไปไม่ครบ ผู้ใช้ที่กรอง BU-001 อยู่จะไปเจอหน้า explorer ที่แสดงทุก BU จำนวนแถว
  // ไม่ตรงกับตัวเลขที่เพิ่งคลิกมา และไม่มี badge บอกด้วยว่าทำไมถึงไม่ตรง
  const goToEvents = (pagePath: string) => {
    const q = new URLSearchParams({ page_path: pagePath, from: range.from, to: range.to });
    if (buCode) q.set('bu_code', buCode);
    if (appId) q.set('app_id', appId);
    if (eventType) q.set('event_type', eventType);
    navigate(`/activity-events?${q.toString()}`);
  };

  const handleExport = () => {
    const rows = overview?.daily || [];
    if (rows.length === 0) { toast.error(t('toast.nothingToExport')); return; }
    const csv = generateCSV(rows, [
      { key: 'day', label: t('pages.usageAnalytics.csvDay') },
      { key: 'clicks', label: t('pages.usageAnalytics.metricClicks') },
      { key: 'page_views', label: t('pages.usageAnalytics.metricPageViews') },
      { key: 'sessions', label: t('pages.usageAnalytics.metricSessions') },
      { key: 'users', label: t('pages.usageAnalytics.metricActiveUsers') },
    ]);
    // ชื่อไฟล์ต้องเป็นวันตามเวลาไทยเหมือนที่ UI แสดง ไม่ใช่วัน UTC ที่ตัดจาก ISO ตรง ๆ —
    // ช่วง 1–7 ส.ค. ตามเวลาไทยมี from เป็น 2026-07-31T17:00Z จะได้ชื่อไฟล์เป็นวันที่ 31 ก.ค.
    // ขอบบนของช่วงเป็น exclusive จึงถอยหนึ่งมิลลิวินาทีก่อนแปลง ให้ได้วันสุดท้ายที่รวมอยู่จริง
    const fromYmd = ymdInTz(range.from);
    const toYmd = ymdInTz(new Date(new Date(range.to).getTime() - 1).toISOString());
    downloadCSV(csv, `usage-analytics-${fromYmd}_${toYmd}.csv`);
    toast.success(t('toast.exported'));
  };

  const isEmpty = !loading && (overview?.summary.events ?? 0) === 0;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('nav.usageAnalytics')}
          subtitle={t('pages.usageAnalytics.subtitle')}
          actions={
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
              <Download className="mr-2 h-4 w-4" />
              {t('common.action.exportCsv')}
            </Button>
          }
        />

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <DateRangeFilter value={range} onChange={setRange} />

            <div className="space-y-2">
              <Label htmlFor="filter-bu">{t('entity.businessUnit.title')}</Label>
              <Select value={buCode || 'all'} onValueChange={(v) => setBuCode(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-bu" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.option.all')}</SelectItem>
                  {buOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-app">{t('common.label.application')}</Label>
              <Select value={appId || 'all'} onValueChange={(v) => setAppId(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-app" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.option.all')}</SelectItem>
                  {appOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">{t('pages.usageAnalytics.eventTypeLabel')}</Label>
              <Select value={eventType || 'all'} onValueChange={(v) => setEventType(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-type" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.option.all')}</SelectItem>
                  <SelectItem value="click">{t('pages.usageAnalytics.eventTypeClick')}</SelectItem>
                  <SelectItem value="page_view">{t('pages.usageAnalytics.eventTypePageView')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <StatCards summary={overview?.summary} loading={loading} />

        {/*
          fetch ล้มเหลว → overview เป็น null: ไม่ render ส่วนผลลัพธ์เลย เพราะกราฟเปล่ากับ
          top list ที่ขึ้น "ไม่มีข้อมูล" อ่านเหมือนผลที่วัดมาได้จริงว่าเป็นศูนย์ ทั้งที่จริง
          คือยังไม่รู้ค่า — เหลือแค่ banner error กับการ์ดสรุปที่แสดงขีดแทนตัวเลข
        */}
        {!error && (isEmpty ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={BarChart3}
                title={t('pages.usageAnalytics.emptyTitle')}
                description={t('pages.usageAnalytics.emptyDescription')}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {loading ? <Skeleton className="h-[340px] w-full" /> : <UsageChart data={overview?.daily || []} />}

            <div className="grid gap-4 lg:grid-cols-2">
              {loading ? (
                <Skeleton className="h-[420px] w-full" />
              ) : (
                <Can
                  permission="activity_event.detail"
                  fallback={(
                    <TopList
                      title={t('pages.usageAnalytics.topPages')}
                      items={topPageItems}
                      emptyLabel={t('pages.usageAnalytics.noData')}
                    />
                  )}
                >
                  <TopList
                    title={t('pages.usageAnalytics.topPages')}
                    items={topPageItems}
                    emptyLabel={t('pages.usageAnalytics.noData')}
                    onSelect={goToEvents}
                  />
                </Can>
              )}
              {loading ? (
                <Skeleton className="h-[420px] w-full" />
              ) : (
                <TopList
                  title={t('pages.usageAnalytics.topElements')}
                  items={topElementItems}
                  emptyLabel={t('pages.usageAnalytics.noData')}
                />
              )}
            </div>
          </>
        ))}
      </div>

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="API Response"
          endpoint="GET /api-system/platform/analytics/overview"
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default UsageAnalytics;
