import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, MousePointerClick, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { DataTable } from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { SearchInput } from '../components/SearchInput';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { DateRangeFilter } from '../components/analytics/DateRangeFilter';
import { EventDetailSheet } from './activityEvents/EventDetailSheet';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { optionLabel, useAnalyticsFilterOptions } from '../hooks/useAnalyticsFilterOptions';
import analyticsService from '../services/analyticsService';
import { presetRange, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { useI18n } from '../hooks/useI18n';
import type { ActivityEvent } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** สตริงนี้แปลงเป็นวันที่ได้จริงหรือไม่ — ใช้กรอง query param ก่อนเอาไปใช้เป็นช่วงวัน */
const isParsableDate = (v: string | null): v is string =>
  !!v && !Number.isNaN(new Date(v).getTime());

const ActivityEventManagement: React.FC = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ค่าเริ่มต้นอ่านจาก query param ที่หน้า /analytics ส่งมาตอน drill-down
  //
  // query param เชื่อถือไม่ได้ (ผู้ใช้แก้ URL เองได้ / bookmark เก่าเพี้ยน) จึงต้อง validate
  // ก่อนรับมาเป็นช่วงวัน — ถ้ารับสตริงอะไรก็ได้ที่ไม่ว่าง DateRangeFilter จะเรียก
  // ymdInTz() → new Date(NaN).toISOString() ตั้งแต่ตอน render แล้ว throw RangeError
  // ซึ่งทำให้ทั้งแอปกลายเป็นจอขาว เพราะแอปนี้ไม่มี error boundary ให้กู้คืน
  const [range, setRange] = useState<DateRange>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return isParsableDate(from) && isParsableDate(to) ? { from, to } : presetRange(7);
  });
  // ตัวกรองที่ /analytics ส่งต่อมาตอน drill-down ต้องรับให้ครบ ไม่งั้นหน้านี้จะแสดง
  // ผลกว้างกว่าตัวเลขที่ผู้ใช้เพิ่งคลิกมาโดยไม่มีอะไรบอก
  const [pagePath, setPagePath] = useState(searchParams.get('page_path') || '');
  const [sessionId, setSessionId] = useState('');
  const [userId, setUserId] = useState('');
  const [eventType, setEventType] = useState(searchParams.get('event_type') || '');
  const [buCode, setBuCode] = useState(searchParams.get('bu_code') || '');
  const [appId, setAppId] = useState(searchParams.get('app_id') || '');

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { buOptions, appOptions } = useAnalyticsFilterOptions();

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);

  const [paginate, setPaginate] = useState(() => ({
    page: 1,
    perpage: Number(localStorage.getItem('perpage_activity_events')) || 25,
    sort: 'server_ts:desc',
  }));
  const [sortResetKey, setSortResetKey] = useState(0);

  // Guard คงอ้างอิงเดิมไว้ถ้า page เป็น 1 อยู่แล้ว เพื่อไม่สร้าง paginate object ใหม่
  // โดยไม่จำเป็น (ป้องกัน fetchEvents ยิงซ้ำเปล่าประโยชน์เมื่อไม่มีอะไรเปลี่ยนจริง)
  const resetPage = useCallback(() => {
    setPaginate((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, []);

  // ค่าตัวกรองข้อความทั้งสี่ (ค้นหา / page path / session id / user id) debounce 400ms
  // ก่อนถูกใช้จริงใน fetchEvents — พิมพ์แต่ละตัวอักษรจะอัปเดตแค่ state ดิบ (ผูกกับ
  // <Input>) ไม่แตะ paginate เลย ส่วน onSettle (=resetPage) รีเซ็ตหน้ากลับไป 1 "ในจังหวะ
  // เดียวกัน" กับตอนที่ค่า debounce นิ่งจริง — ถ้าแยกเป็น useEffect ต่างหากที่คอย watch
  // ค่า debounced แทน จะกลายเป็นสอง render (ค่ากรองใหม่ + page เก่าค้าง แล้วค่อยแก้ page
  // ในรอบถัดไป) ซึ่งจะยิง fetch ทิ้งหนึ่งครั้งด้วย state ที่ไม่ตรงกันก่อนรอบที่ถูกต้อง —
  // ปุ่ม clear/"ดู session นี้ทั้งหมด" ใช้ flush* (ไม่ผ่าน onSettle) แล้วเรียก resetPage()
  // เองในตัว handler แทน เพราะเป็นการกระทำครั้งเดียวที่ไม่ต้องรอ debounce อยู่แล้ว
  const [debouncedSearch, flushSearch] = useDebouncedValue(searchTerm, 400, resetPage);
  const [debouncedPagePath, flushPagePath] = useDebouncedValue(pagePath, 400, resetPage);
  const [debouncedSessionId, flushSessionId] = useDebouncedValue(sessionId, 400, resetPage);
  const [debouncedUserId, flushUserId] = useDebouncedValue(userId, 400, resetPage);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await analyticsService.getEvents({
        from: range.from,
        to: range.to,
        page: paginate.page,
        perpage: paginate.perpage,
        sort: paginate.sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(debouncedPagePath ? { page_path: debouncedPagePath } : {}),
        ...(debouncedSessionId ? { session_id: debouncedSessionId } : {}),
        ...(debouncedUserId ? { user_id: debouncedUserId } : {}),
        ...(eventType ? { event_type: eventType } : {}),
        ...(buCode ? { bu_code: buCode } : {}),
        ...(appId ? { app_id: appId } : {}),
      });
      setRawResponse(response);
      setEvents(response.data || []);
      setTotalRows(response.paginate?.total ?? 0);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      setEvents([]);
      setTotalRows(0);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, paginate, debouncedSearch, debouncedPagePath, debouncedSessionId,
    debouncedUserId, eventType, buCode, appId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(() => [
    {
      accessorKey: 'server_ts',
      header: t('pages.activityEvents.columnTime'),
      meta: { card: 'title' },
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{fmt(row.original.server_ts)}</span>,
    },
    {
      accessorKey: 'user_name',
      header: t('pages.activityEvents.columnUser'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          {/* user_id ประกาศเป็น non-optional แต่ถ้า backend ส่ง null มาจริง .slice() จะ throw
              อยู่ใน cell ของตาราง ซึ่งพังทั้งหน้า — กันไว้ด้วย fallback แทนที่จะเชื่อ type */}
          <p className="truncate text-sm">
            {row.original.user_name || row.original.user_id?.slice(0, 8) || '-'}
          </p>
          {row.original.user_email && (
            <p className="truncate text-[11px] text-muted-foreground">{row.original.user_email}</p>
          )}
        </div>
      ),
    },
    { accessorKey: 'bu_code', header: t('pages.activityEvents.columnBu'), enableSorting: false,
      cell: ({ row }) => row.original.bu_code || '-' },
    {
      accessorKey: 'event_type',
      header: t('pages.activityEvents.columnType'),
      meta: { card: 'badge' },
      cell: ({ row }) => <Badge variant="secondary">{row.original.event_type}</Badge>,
    },
    {
      accessorKey: 'page_path',
      header: t('pages.activityEvents.columnPage'),
      cell: ({ row }) => (
        <span className="block max-w-[280px] truncate font-mono text-xs" title={row.original.page_path}>
          {row.original.page_path}
        </span>
      ),
    },
    {
      accessorKey: 'element_id',
      header: t('pages.activityEvents.columnElement'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[180px] truncate font-mono text-xs"
              title={row.original.element_text || row.original.element_id || ''}>
          {row.original.element_id || '-'}
        </span>
      ),
    },
    { accessorKey: 'app_name', header: t('pages.activityEvents.columnApp'), enableSorting: false, meta: { card: 'hidden' },
      cell: ({ row }) => row.original.app_name || '-' },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0', card: 'actions' },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={t('pages.activityEvents.viewDetailsAria', { id: row.original.event_id })}
                onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [t]);

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_activity_events', String(perpage));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  /**
   * DataTable เก็บ sorting state ไว้ภายในและไม่รับค่าแบบ controlled — พอผู้ใช้กดหัวคอลัมน์
   * วนจนถึงสถานะ "ไม่เรียง" มันจะส่ง '' กลับมาแล้วเอาลูกศรออก แต่ฝั่ง server ไม่มีสถานะนั้น
   * (ค่าที่ไม่อยู่ใน whitelist ตกไปใช้ server_ts:desc เสมอ) หัวตารางจึงจะไม่มีลูกศรทั้งที่
   * ข้อมูลยังเรียงตามเวลาอยู่ — bump key เพื่อ remount DataTable ให้ sorting ภายในกลับไป
   * เท่ากับ defaultSort ตัวบ่งชี้กับข้อมูลจริงจะได้ตรงกัน
   */
  const handleSortChange = (sort: string) => {
    if (!sort) setSortResetKey((k) => k + 1);
    setPaginate((p) => ({ ...p, sort: sort || 'server_ts:desc', page: 1 }));
  };

  const handleExport = () => {
    if (events.length === 0) { toast.error(t('toast.nothingToExport')); return; }
    const csv = generateCSV(events, [
      { key: 'server_ts', label: t('pages.activityEvents.csvServerTime') },
      { key: 'user_name', label: t('pages.activityEvents.columnUser') },
      { key: 'user_email', label: t('common.field.email') },
      { key: 'bu_code', label: t('pages.activityEvents.columnBu') },
      { key: 'event_type', label: t('pages.activityEvents.columnType') },
      { key: 'page_path', label: t('pages.activityEvents.columnPage') },
      { key: 'element_id', label: t('pages.activityEvents.columnElement') },
      { key: 'app_name', label: t('pages.activityEvents.columnApp') },
    ]);
    downloadCSV(csv, `activity-events-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const activeFilters = [
    searchTerm && { label: t('pages.activityEvents.chipSearch', { value: searchTerm }), clear: () => { setSearchTerm(''); flushSearch(''); resetPage(); } },
    pagePath && { label: t('pages.activityEvents.chipPage', { value: pagePath }), clear: () => { setPagePath(''); flushPagePath(''); resetPage(); } },
    sessionId && { label: t('pages.activityEvents.chipSession', { value: sessionId.slice(0, 8) }), clear: () => { setSessionId(''); flushSessionId(''); resetPage(); } },
    userId && { label: t('pages.activityEvents.chipUser', { value: userId.slice(0, 8) }), clear: () => { setUserId(''); flushUserId(''); resetPage(); } },
    eventType && { label: t('pages.activityEvents.chipType', { value: eventType }), clear: () => { setEventType(''); resetPage(); } },
    buCode && { label: t('pages.activityEvents.chipBu', { value: optionLabel(buOptions, buCode) }), clear: () => { setBuCode(''); resetPage(); } },
    appId && { label: t('pages.activityEvents.chipApp', { value: optionLabel(appOptions, appId) }), clear: () => { setAppId(''); resetPage(); } },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('nav.activityEvents')}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {t('pages.activityEvents.subtitle')}
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.action.exportCsv')}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-2">
                <Label htmlFor="event-search">{t('pages.activityEvents.searchLabel')}</Label>
                <SearchInput
                  id="event-search"
                  ref={searchInputRef}
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                  onClear={() => { setSearchTerm(''); flushSearch(''); resetPage(); }}
                  placeholder={t('pages.activityEvents.searchPlaceholder')}
                />
              </div>

              <DateRangeFilter value={range} onChange={(r) => { setRange(r); resetPage(); }} />

              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    {t('common.label.filters')}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>{t('common.label.filters')}</SheetTitle>
                    <SheetDescription>
                      {t('pages.activityEvents.filtersDescription')}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-type">{t('pages.activityEvents.eventTypeLabel')}</Label>
                      <Select value={eventType || 'all'} onValueChange={(v) => { setEventType(v === 'all' ? '' : v); resetPage(); }}>
                        <SelectTrigger id="f-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('common.option.all')}</SelectItem>
                          <SelectItem value="click">{t('pages.activityEvents.eventTypeClick')}</SelectItem>
                          <SelectItem value="page_view">{t('pages.activityEvents.eventTypePageView')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* เลือกจากรายการ ไม่ใช่พิมพ์เอง — code ที่พิมพ์ผิดหนึ่งตัวให้ผลเป็น
                        "ไม่พบ event" โดยไม่มีอะไรบอกว่าพิมพ์ผิด และหน้า /analytics
                        ก็ใช้ <Select> ชุดเดียวกันนี้อยู่แล้ว */}
                    <div className="space-y-2">
                      <Label htmlFor="f-bu">{t('entity.businessUnit.title')}</Label>
                      <Select value={buCode || 'all'} onValueChange={(v) => { setBuCode(v === 'all' ? '' : v); resetPage(); }}>
                        <SelectTrigger id="f-bu"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('common.option.all')}</SelectItem>
                          {buOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-app">{t('common.label.application')}</Label>
                      <Select value={appId || 'all'} onValueChange={(v) => { setAppId(v === 'all' ? '' : v); resetPage(); }}>
                        <SelectTrigger id="f-app"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('common.option.all')}</SelectItem>
                          {appOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-user">{t('pages.activityEvents.userIdLabel')}</Label>
                      <Input
                        id="f-user" value={userId} onChange={(e) => setUserId(e.target.value)}
                        placeholder={t('pages.activityEvents.userIdPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-page">{t('pages.activityEvents.pagePathLabel')}</Label>
                      <Input id="f-page" value={pagePath} onChange={(e) => setPagePath(e.target.value)} placeholder="/procurement/purchase-request" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-session">{t('pages.activityEvents.sessionIdLabel')}</Label>
                      <Input id="f-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((f) => (
                  <Badge key={f.label} variant="secondary" className="gap-1">
                    {f.label}
                    <button type="button" onClick={f.clear} aria-label={t('pages.activityEvents.clearFilterAria', { label: f.label })}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="relative p-0 sm:p-4">
            {loading && events.length === 0 ? (
              <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
            ) : !loading && !error && events.length === 0 ? (
              <EmptyState
                icon={MousePointerClick}
                title={t('pages.activityEvents.emptyTitle')}
                description={t('pages.activityEvents.emptyDescription')}
              />
            ) : (
              <>
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                    <span className="text-sm text-muted-foreground">{t('common.busy.loadingEllipsis')}</span>
                  </div>
                )}
                <DataTable
                  key={sortResetKey}
                  columns={columns}
                  data={events}
                  serverSide
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  defaultSort={{ id: 'server_ts', desc: true }}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={handleSortChange}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <EventDetailSheet
        event={selected}
        onClose={() => setSelected(null)}
        onViewSession={(sid) => {
          setSelected(null);
          setPagePath('');
          flushPagePath('');
          setSessionId(sid);
          flushSessionId(sid);
          resetPage();
        }}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="API Response"
          endpoint="GET /api-system/platform/analytics/records"
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default ActivityEventManagement;
