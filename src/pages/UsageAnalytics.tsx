import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
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
import businessUnitService from '../services/businessUnitService';
import applicationService from '../services/applicationService';
import { presetRange, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import type { AnalyticsOverview } from '../types';

interface Option { value: string; label: string }

const UsageAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => presetRange(7));
  const [buCode, setBuCode] = useState('');
  const [appId, setAppId] = useState('');
  const [eventType, setEventType] = useState('');

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [buOptions, setBuOptions] = useState<Option[]>([]);
  const [appOptions, setAppOptions] = useState<Option[]>([]);

  // ตัวเลือกใน dropdown โหลดครั้งเดียว — ไม่ผูกกับช่วงวัน
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bus, apps] = await Promise.all([
          businessUnitService.getAll({ page: 1, perpage: 100 }),
          applicationService.getAll({ page: 1, perpage: 100 }),
        ]);
        if (cancelled) return;
        setBuOptions((bus.data || []).map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })));
        setAppOptions((apps.data || []).map((a) => ({ value: a.id, label: a.name })));
      } catch {
        // dropdown ว่างไม่ใช่เรื่องคอขาดบาดตาย — หน้าหลักยังใช้ได้โดยไม่กรอง
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      sub: `${p.sessions.toLocaleString()} sessions · ${p.users.toLocaleString()} users`,
      value: p.events,
    })),
    [overview],
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

  const goToEvents = (pagePath: string) => {
    const q = new URLSearchParams({ page_path: pagePath, from: range.from, to: range.to });
    navigate(`/activity-events?${q.toString()}`);
  };

  const handleExport = () => {
    const rows = overview?.daily || [];
    if (rows.length === 0) { toast.error('ไม่มีข้อมูลให้ export'); return; }
    const csv = generateCSV(rows, [
      { key: 'day', label: 'Day' },
      { key: 'clicks', label: 'Clicks' },
      { key: 'page_views', label: 'Page views' },
      { key: 'sessions', label: 'Sessions' },
      { key: 'users', label: 'Active users' },
    ]);
    downloadCSV(csv, `usage-analytics-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const isEmpty = !loading && !error && (overview?.summary.events ?? 0) === 0;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Usage Analytics</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              ภาพรวมการใช้งานจาก UI telemetry
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <DateRangeFilter value={range} onChange={setRange} />

            <div className="space-y-2">
              <Label htmlFor="filter-bu">Business Unit</Label>
              <Select value={buCode || 'all'} onValueChange={(v) => setBuCode(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-bu" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {buOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-app">Application</Label>
              <Select value={appId || 'all'} onValueChange={(v) => setAppId(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-app" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {appOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">ชนิด event</Label>
              <Select value={eventType || 'all'} onValueChange={(v) => setEventType(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-type" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="click">Click</SelectItem>
                  <SelectItem value="page_view">Page view</SelectItem>
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

        {isEmpty ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={BarChart3}
                title="ยังไม่มี event ในช่วงที่เลือก"
                description="ลองขยายช่วงวัน หรือเอาตัวกรอง Business Unit / Application ออก"
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {loading ? <Skeleton className="h-[340px] w-full" /> : <UsageChart data={overview?.daily || []} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <Can
                permission="activity_event.detail"
                fallback={<TopList title="Top pages" items={topPageItems} emptyLabel="ไม่มีข้อมูล" />}
              >
                <TopList title="Top pages" items={topPageItems} emptyLabel="ไม่มีข้อมูล" onSelect={goToEvents} />
              </Can>
              <TopList title="Top elements" items={topElementItems} emptyLabel="ไม่มีข้อมูล" />
            </div>
          </>
        )}
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
