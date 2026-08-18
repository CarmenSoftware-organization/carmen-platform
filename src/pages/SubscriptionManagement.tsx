import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import subscriptionService from '../services/subscriptionService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, CreditCard, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ListEmptyState } from '../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { SubscriptionSummary } from './subscriptionManagement/SubscriptionSummary';
import { buildAdvance } from './subscriptionManagement/buildAdvance';
import { isExpiringSoon, EXPIRING_SOON_DAYS } from '../utils/subscriptionState';
import { seatUtilization } from '../utils/capacity';
import type { Subscription, SubscriptionStatus, SubscriptionSummary as SummaryType, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'inactive', 'expired'];

// backend ไม่มี default sort เลย (`orderBy: {}`) ถ้าไม่ส่ง `sort` — ลำดับแถวข้ามหน้าจะไม่นิ่ง
// (phase-b-backend-contract.md §8.3) จึงต้องมีค่านี้เสมอ ไม่ปล่อยให้ตกไปเป็นสตริงว่าง
const DEFAULT_SORT = 'end_date:desc';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const fmtDate = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const SubscriptionManagement: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Subscription[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<SummaryType | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const storedSearch = localStorage.getItem('search_subscriptions') || '';
  const storedStatus = getStoredJSON<SubscriptionStatus[]>('filters_subscription_status', []);
  const storedExpiringSoon = getStoredJSON<boolean>('filter_subscription_expiring_soon', false);
  const storedPage = Number(localStorage.getItem('page_subscriptions')) || 1;
  const storedSort = localStorage.getItem('sort_subscriptions') || DEFAULT_SORT;

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus[]>(storedStatus);
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<boolean>(storedExpiringSoon);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_subscription')) || 10,
    sort: storedSort,
    advance: buildAdvance(storedSearch, storedStatus, storedExpiringSoon),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  // `summary` มากับ response เดียวกับ `data[]` เสมอตั้งแต่วันแรก (ไม่เหมือน cluster/application ที่
  // เพิ่ง deploy summary ตามหลัง) จึงไม่ต้องมี fallback fetch ที่สอง — summaryLoading/summaryError
  // จึงแค่สะท้อนสถานะของคำขอเดียวกันนี้ตรง ๆ
  const fetchSubscriptions = useCallback(async (params: PaginateParams) => {
    setLoading(true);
    setSummaryLoading(true);
    try {
      const data = await subscriptionService.getAll(params);
      setRawResponse(data);
      const rows = data.data ?? [];
      setItems(rows);
      setTotalRows(data.paginate?.total ?? rows.length);
      setSummary(data.summary ?? null);
      setError('');
      setSummaryError('');
    } catch (err: unknown) {
      setError('Failed to load subscriptions: ' + getErrorDetail(err));
      setSummaryError('Failed to load subscription summary.');
      devLog('Error fetching subscriptions:', err);
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions(paginate);
  }, [fetchSubscriptions, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_subscriptions', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_subscriptions', '1');
      setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(value, statusFilter, expiringSoonFilter) }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_subscription', String(perpage));
    localStorage.setItem('page_subscriptions', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: SubscriptionStatus) => {
    if (expiringSoonFilter) return; // ต้องปิด "ใกล้หมดอายุ" ก่อน — ดู UI disabled state ด้านล่าง
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_subscription_status', JSON.stringify(next));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(searchTerm, next, expiringSoonFilter) }));
  };

  const handleExpiringSoonToggle = () => {
    const next = !expiringSoonFilter;
    setExpiringSoonFilter(next);
    localStorage.setItem('filter_subscription_expiring_soon', JSON.stringify(next));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(searchTerm, statusFilter, next) }));
  };

  const handleClearStatusFilter = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_subscription_status', JSON.stringify([]));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(searchTerm, [], expiringSoonFilter) }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setExpiringSoonFilter(false);
    localStorage.setItem('filters_subscription_status', JSON.stringify([]));
    localStorage.setItem('filter_subscription_expiring_soon', JSON.stringify(false));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(searchTerm, [], false) }));
  };

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (expiringSoonFilter ? 1 : 0);

  const handleSortChange = (sort: string) => {
    // DataTable's 3-state header toggle can cycle back to "" (unsorted) — never let that
    // through, or the next fetch drops `orderBy` entirely (see DEFAULT_SORT comment above).
    const next = sort || DEFAULT_SORT;
    localStorage.setItem('sort_subscriptions', next);
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, sort: next, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await subscriptionService.delete(deleteId);
      toast.success('Subscription deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete subscription', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(items, [
      { key: 'subscription_number', label: 'Subscription Number' },
      { key: 'cluster_name', label: 'Cluster' },
      { key: 'cluster_code', label: 'Cluster Code' },
      { key: 'state', label: 'State' },
      { key: 'start_date', label: 'Start Date' },
      { key: 'end_date', label: 'End Date' },
      { key: 'seat_used', label: 'Seats Used' },
      { key: 'seat_cap', label: 'Seats Cap' },
      { key: 'bu_count', label: 'BU Count' },
      { key: 'feature_count', label: 'Feature Count' },
    ]);
    downloadCSV(csv, `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<Subscription, unknown>[]>(() => [
    {
      accessorKey: 'subscription_number',
      header: 'Subscription',
      meta: { card: 'title' },
      cell: ({ row }) => (
        <Link to={`/subscriptions/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.subscription_number}
        </Link>
      ),
    },
    {
      id: 'cluster',
      accessorKey: 'cluster_name',
      header: 'Cluster',
      // cluster_name/cluster_code มาจาก join กับ tb_cluster ไม่ใช่คอลัมน์จริงของ tb_subscription —
      // เรียงด้วยคอลัมน์นี้ backend throw 400 (phase-b-backend-contract.md §8.3)
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.cluster_name}</span>
          <span className="text-xs text-muted-foreground font-mono">{row.original.cluster_code}</span>
        </div>
      ),
    },
    {
      id: 'state',
      header: 'Status',
      meta: { card: 'badge' },
      // `state` backend คำนวณให้ ไม่ใช่คอลัมน์จริงเช่นกัน — ห้ามเรียง
      enableSorting: false,
      cell: ({ row }) => {
        const { state, end_date } = row.original;
        const soon = isExpiringSoon(state, end_date);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={state === 'active' ? 'success' : 'secondary'} className="capitalize">
              {state}
            </Badge>
            {soon && <Badge variant="warning">Expiring soon</Badge>}
          </div>
        );
      },
    },
    {
      id: 'seats',
      header: 'Seats',
      // seat_used/seat_cap เป็นค่ารวมจาก usage ของ cluster ไม่ใช่คอลัมน์จริงเหมือนกัน
      enableSorting: false,
      cell: ({ row }) => {
        const u = seatUtilization(row.original.seat_used, row.original.seat_cap);
        return (
          <span className={u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : ''}>
            {u.used} / {u.cap}
          </span>
        );
      },
    },
    {
      accessorKey: 'end_date',
      id: 'end_date',
      header: 'Period',
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground whitespace-nowrap">
          {fmtDate(row.original.start_date)} → {fmtDate(row.original.end_date)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'max-w-12', cellClassName: 'text-center p-0 max-w-12', card: 'actions' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.subscription_number}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* ungated: route /subscriptions/:id/edit ใช้ subscription.read เท่านั้น — คนที่อ่านได้
                อย่างเดียวต้องเปิดหน้าดูได้ (ปุ่มเขียนถูกกั้นภายในหน้า Edit เอง) */}
            <DropdownMenuItem onClick={() => navigate(`/subscriptions/${row.original.id}/edit`)} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <Can permission="subscription.manage">
              <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Subscriptions"
          subtitle="Manage cluster license subscriptions, seat pools, and feature entitlements."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Can permission="subscription.manage">
                <Button onClick={() => navigate('/subscriptions/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Add Subscription</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Can>
            </>
          }
        />

        <SubscriptionSummary
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          onRetry={() => fetchSubscriptions(paginate)}
        />

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onValueChange={handleSearchChange}
                placeholder="ค้นหาเลขที่สัญญา"
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Filter subscriptions by status and expiry</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStatusFilter} disabled={expiringSoonFilter}>
                            Clear
                          </Button>
                        )}
                      </div>
                      {expiringSoonFilter && (
                        <p className="text-xs text-muted-foreground">
                          Locked to Active while showing subscriptions expiring soon.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.map((s) => (
                          <Button
                            key={s}
                            variant={statusFilter.includes(s) ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs capitalize"
                            disabled={expiringSoonFilter}
                            onClick={() => handleStatusFilter(s)}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-sm font-medium">Expiry</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="expiringSoon"
                          checked={expiringSoonFilter}
                          onChange={handleExpiringSoonToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor="expiringSoon" className="text-sm text-muted-foreground cursor-pointer">
                          Expiring within {EXPIRING_SOON_DAYS} days
                        </label>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
                        Clear All Filters
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filters:</span>
                {expiringSoonFilter ? (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    Expiring soon
                    <button onClick={handleExpiringSoonToggle} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : (
                  statusFilter.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1 capitalize">
                      {s}
                      <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && items.length === 0 && !loading ? (
              <ListEmptyState
                searchTerm={searchTerm}
                activeFilterCount={activeFilterCount}
                icon={CreditCard}
                emptyTitle="No subscriptions yet"
                emptyDescription="Get started by creating your first subscription for a cluster."
                addAction={
                  <Can permission="subscription.manage">
                    <Button size="sm" onClick={() => navigate('/subscriptions/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Subscription
                    </Button>
                  </Can>
                }
              />
            ) : !error ? (
              <div className="relative">
                {loading && items.length === 0 ? (
                  <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 10} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading subscriptions">
                        <div className="text-muted-foreground">Loading subscriptions...</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={items}
                      serverSide
                      tableLayout="auto"
                      totalRows={totalRows}
                      page={paginate.page}
                      perpage={paginate.perpage}
                      onPaginateChange={handlePaginateChange}
                      onSortChange={handleSortChange}
                      defaultSort={{ id: 'end_date', desc: true }}
                    />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Subscription"
        description="Are you sure you want to delete this subscription? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/subscriptions" data={rawResponse} />
    </Layout>
  );
};

export default SubscriptionManagement;
