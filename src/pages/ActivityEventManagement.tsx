import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, MousePointerClick, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { DataTable } from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { DateRangeFilter } from '../components/analytics/DateRangeFilter';
import { EventDetailSheet } from './activityEvents/EventDetailSheet';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import analyticsService from '../services/analyticsService';
import { presetRange, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import type { ActivityEvent } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const ActivityEventManagement: React.FC = () => {
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ค่าเริ่มต้นอ่านจาก query param ที่หน้า /analytics ส่งมาตอน drill-down
  const [range, setRange] = useState<DateRange>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return from && to ? { from, to } : presetRange(7);
  });
  const [pagePath, setPagePath] = useState(searchParams.get('page_path') || '');
  const [sessionId, setSessionId] = useState('');
  const [eventType, setEventType] = useState('');
  const [buCode, setBuCode] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  // Debounce ค่าค้นหา 400ms แล้วค่อย reset ไปหน้า 1 พร้อมกันในรอบเดียว — ถ้า reset
  // ทันทีทุก keystroke (แยกจากตัวนี้) จะสร้าง paginate object ใหม่ทุกครั้ง ทำให้
  // fetchEvents ยิง request ซ้ำก่อนค่า debouncedSearch จะอัปเดตจริง
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPaginate((p) => (p.page === 1 ? p : { ...p, page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

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
        ...(pagePath ? { page_path: pagePath } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(eventType ? { event_type: eventType } : {}),
        ...(buCode ? { bu_code: buCode } : {}),
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
  }, [range.from, range.to, paginate, debouncedSearch, pagePath, sessionId, eventType, buCode]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(() => [
    {
      accessorKey: 'server_ts',
      header: 'เวลา',
      meta: { card: 'title' },
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{fmt(row.original.server_ts)}</span>,
    },
    {
      accessorKey: 'user_name',
      header: 'ผู้ใช้',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.user_name || row.original.user_id.slice(0, 8)}</p>
          {row.original.user_email && (
            <p className="truncate text-[11px] text-muted-foreground">{row.original.user_email}</p>
          )}
        </div>
      ),
    },
    { accessorKey: 'bu_code', header: 'BU', enableSorting: false,
      cell: ({ row }) => row.original.bu_code || '-' },
    {
      accessorKey: 'event_type',
      header: 'ชนิด',
      meta: { card: 'badge' },
      cell: ({ row }) => <Badge variant="secondary">{row.original.event_type}</Badge>,
    },
    {
      accessorKey: 'page_path',
      header: 'หน้า',
      cell: ({ row }) => (
        <span className="block max-w-[280px] truncate font-mono text-xs" title={row.original.page_path}>
          {row.original.page_path}
        </span>
      ),
    },
    {
      accessorKey: 'element_id',
      header: 'Element',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[180px] truncate font-mono text-xs"
              title={row.original.element_text || row.original.element_id || ''}>
          {row.original.element_id || '-'}
        </span>
      ),
    },
    { accessorKey: 'app_name', header: 'App', enableSorting: false, meta: { card: 'hidden' },
      cell: ({ row }) => row.original.app_name || '-' },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-16', cellClassName: 'text-center p-0', card: 'actions' },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`ดูรายละเอียด event ${row.original.event_id}`}
                onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], []);

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_activity_events', String(perpage));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const handleExport = () => {
    if (events.length === 0) { toast.error('ไม่มีข้อมูลให้ export'); return; }
    const csv = generateCSV(events, [
      { key: 'server_ts', label: 'Server time' },
      { key: 'user_name', label: 'User' },
      { key: 'user_email', label: 'Email' },
      { key: 'bu_code', label: 'BU' },
      { key: 'event_type', label: 'Type' },
      { key: 'page_path', label: 'Page' },
      { key: 'element_id', label: 'Element' },
      { key: 'app_name', label: 'App' },
    ]);
    downloadCSV(csv, `activity-events-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const activeFilters = [
    pagePath && { label: `หน้า: ${pagePath}`, clear: () => setPagePath('') },
    sessionId && { label: `session: ${sessionId.slice(0, 8)}…`, clear: () => setSessionId('') },
    eventType && { label: `ชนิด: ${eventType}`, clear: () => setEventType('') },
    buCode && { label: `BU: ${buCode}`, clear: () => setBuCode('') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Activity Events</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              UI telemetry รายรายการ — ใครกดอะไร หน้าไหน เมื่อไหร่
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-[220px] flex-1 space-y-2">
                <Label htmlFor="event-search">ค้นหา</Label>
                <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted-foreground" />
                <Input
                  id="event-search" ref={searchInputRef} className="pl-9"
                  placeholder="page path / element id / element text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPaginate((p) => ({ ...p, page: 1 })); }} />

              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    ตัวกรอง
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader><SheetTitle>ตัวกรอง</SheetTitle></SheetHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-type">ชนิด event</Label>
                      <Select value={eventType || 'all'} onValueChange={(v) => setEventType(v === 'all' ? '' : v)}>
                        <SelectTrigger id="f-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทั้งหมด</SelectItem>
                          <SelectItem value="click">Click</SelectItem>
                          <SelectItem value="page_view">Page view</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-bu">Business Unit (code)</Label>
                      <Input id="f-bu" value={buCode} onChange={(e) => setBuCode(e.target.value)} placeholder="BU-001" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-page">Page path</Label>
                      <Input id="f-page" value={pagePath} onChange={(e) => setPagePath(e.target.value)} placeholder="/procurement/purchase-request" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-session">Session ID</Label>
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
                    <button type="button" onClick={f.clear} aria-label={`ล้างตัวกรอง ${f.label}`}>
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
              <TableSkeleton columns={8} rows={8} />
            ) : !loading && events.length === 0 ? (
              <EmptyState
                icon={MousePointerClick}
                title="ไม่พบ event"
                description="ลองขยายช่วงวัน หรือล้างตัวกรองบางตัวออก"
              />
            ) : (
              <>
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                    <span className="text-sm text-muted-foreground">กำลังโหลด…</span>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={events}
                  serverSide
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  defaultSort={{ id: 'server_ts', desc: true }}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={(sort) => setPaginate((p) => ({ ...p, sort: sort || 'server_ts:desc', page: 1 }))}
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
          setSessionId(sid);
          setPagePath('');
          setPaginate((p) => ({ ...p, page: 1 }));
        }}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="API Response"
          endpoint="GET /api-system/platform/analytics/events"
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default ActivityEventManagement;
