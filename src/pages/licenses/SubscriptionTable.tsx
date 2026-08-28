import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import subscriptionService from '../../services/subscriptionService';
import { getErrorDetail, devLog } from '../../utils/errorParser';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { DataTable } from '../../components/ui/data-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../../components/ui/sheet';
import { Plus, Filter, X, CreditCard, Download } from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '../../components/SearchInput';
import { ListEmptyState } from '../../components/ListEmptyState';
import { generateCSV, downloadCSV } from '../../utils/csvExport';
import { TableSkeleton } from '../../components/TableSkeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import Can from '../../components/Can';
import { SubscriptionSummary } from './subscriptionManagement/SubscriptionSummary';
import { buildAdvance, type SubscriptionFilters } from './subscriptionManagement/buildAdvance';
import { isExpiringSoon, EXPIRING_SOON_DAYS } from '../../utils/subscriptionState';
import { useAuth } from '../../context/AuthContext';
import { useAllClusters } from '../../hooks/useAllClusters';
import { auditColumns } from '../../components/auditColumns';
import { normalizeAudit, auditCsvFields } from '../../utils/audit';
import { useI18n } from '../../hooks/useI18n';
import type { Subscription, SubscriptionState, SubscriptionSummary as SummaryType, PaginateParams } from '../../types';
import type { ColumnDef } from '@tanstack/react-table';
import type { TKey } from '../../i18n/types';

// สถานะที่แสดงผล (`state`) ชุดเดียวกับที่ badge ในตารางและการ์ด summary ใช้ — ไม่ใช่ `status` ดิบ
// การกรองแปลงกลับเป็นเงื่อนไขบนคอลัมน์จริงใน `buildAdvance`
const STATE_OPTIONS: SubscriptionState[] = ['active', 'inactive', 'expired'];

// backend ไม่มี default sort เลย (`orderBy: {}`) ถ้าไม่ส่ง `sort` — ลำดับแถวข้ามหน้าจะไม่นิ่ง
// (phase-b-backend-contract.md §8.3) จึงต้องมีค่านี้เสมอ ไม่ปล่อยให้ตกไปเป็นสตริงว่าง
const DEFAULT_SORT_ID = 'end_date';
const DEFAULT_SORT_DESC = true;
// ...และคอลัมน์เดียวยังไม่ใช่ลำดับสมบูรณ์: สเปก §9 สั่ง backfill ให้ทุก cluster ได้สัญญาที่
// `end_date` ไกล ๆ เท่ากันหมด → แถวที่ค่าเท่ากันจะสลับตำแหน่งระหว่างคำขอของแต่ละหน้า แล้วแถวซ้ำ/
// แถวหายข้ามหน้าโดยไม่มี error ใด ๆ · `id` เป็น primary key จึง unique เสมอและตัดเสมอทุกกรณี
// (backend รับ multi-sort คั่นด้วย `,`/`;` — contract §8.3)
const SORT_TIEBREAKER = 'id:asc';
const DEFAULT_SORT = `${DEFAULT_SORT_ID}:${DEFAULT_SORT_DESC ? 'desc' : 'asc'},${SORT_TIEBREAKER}`;

/**
 * ต่อ tiebreaker ให้ค่า sort **ทุกค่า** ที่ `DataTable` ส่งมา ไม่ใช่เฉพาะค่าเริ่มต้น — เรียงตาม
 * `status` หรือ `subscription_number` ก็มีค่าซ้ำได้เหมือนกัน · ค่าว่าง (header toggle วนกลับมาที่
 * "ไม่เรียง") ตกกลับไปเป็น DEFAULT_SORT ไม่ใช่ส่งสตริงว่างให้ backend
 */
const withTiebreaker = (sort: string): string => {
  const s = sort.trim();
  if (!s) return DEFAULT_SORT;
  const alreadyHasId = s.split(/[;,]/).some((part) => part.trim().startsWith('id:'));
  return alreadyHasId ? s : `${s},${SORT_TIEBREAKER}`;
};

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

interface SubscriptionTableProps {
  /**
   * true เมื่อ render อยู่ใต้ License Center (`/licenses`) — เนื้อหาจะไม่ห่อ `<Layout>` ของตัวเอง
   * และไม่แสดง `PageHeader` ของตัวเอง เพราะหน้าแม่ห่อ Layout ให้แล้ว หน้าเดียวห่อ Layout สองชั้นจะ
   * ได้ sidebar ซ้อนกัน ค่าเริ่มต้น false รักษาพฤติกรรมเดิมของสมัยที่ยังมี route แบบเต็มหน้าไว้ทุก
   * อย่าง — route นั้นถูกถอดออกไปแล้ว (ตอนนี้มุมมอง "By subscription" ของ `/licenses` เรียกด้วย
   * `embedded` เสมอ) `embedded=false` จึงเหลือแค่เส้นทางที่เทสต์เดิม `SubscriptionTable.test.tsx`
   * render แบบไม่ส่ง prop นี้ใช้อยู่ ไม่ใช่เส้นทางที่ผู้ใช้จริงเจอ
   */
  embedded?: boolean;
}

const SubscriptionTable: React.FC<SubscriptionTableProps> = ({ embedded = false }) => {
  const { t } = useI18n();
  // Single lookup for every place `state`/`s` (a raw SubscriptionState value) is rendered —
  // the row badge, the filter buttons, the active-filter chips, and the CSV export — so a
  // state can never be named two different ways on the same screen (review I1). `|| s`
  // is a genuine fallback, not a hidden missing key: the three union members ('active',
  // 'inactive', 'expired' — src/types/index.ts:1244) all resolve via common.status.*, and
  // this only fires for a value outside that union (translate() returns '' on a miss).
  const stateLabel = useCallback((s: string) => t(`common.status.${s}` as TKey) || s, [t]);
  const navigate = useNavigate();
  const [items, setItems] = useState<Subscription[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<SummaryType | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const storedSearch = localStorage.getItem('search_subscriptions') || '';
  const storedStates = getStoredJSON<SubscriptionState[]>('filters_subscription_state', []);
  const storedExpiringSoon = getStoredJSON<boolean>('filter_subscription_expiring_soon', false);
  const storedCluster = localStorage.getItem('filter_subscription_cluster') || '';
  const storedPage = Number(localStorage.getItem('page_subscriptions')) || 1;
  const storedSort = withTiebreaker(localStorage.getItem('sort_subscriptions') || '');

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [stateFilter, setStateFilter] = useState<SubscriptionState[]>(storedStates);
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<boolean>(storedExpiringSoon);
  const [clusterFilter, setClusterFilter] = useState<string>(storedCluster);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // รายชื่อ cluster สำหรับตัวกรอง — โหลดเฉพาะเมื่อผู้ใช้อ่าน cluster ได้จริง ด้วยเหตุผลเดียวกับ
  // SubscriptionCard (review C1): ยิงคำขอที่ผู้ใช้ไม่มีสิทธิ์คือการเสี่ยงให้ interceptor เด้งออกจาก
  // ระบบโดยที่หน้าเจ้าของคำขอห้ามไม่ได้
  const { hasPermission } = useAuth();
  const canReadClusters = hasPermission('cluster.read');
  const { clusters, error: clustersError } = useAllClusters(canReadClusters);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_subscription')) || 10,
    sort: storedSort,
    advance: buildAdvance({
      search: storedSearch,
      states: storedStates,
      expiringSoon: storedExpiringSoon,
      clusterId: storedCluster,
    }),
  });

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
      setError(t('pages.subscriptions.loadFailedPrefix') + getErrorDetail(err, t));
      setSummaryError(t('pages.subscriptions.summaryLoadFailed'));
      devLog('Error fetching subscriptions:', err);
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSubscriptions(paginate);
  }, [fetchSubscriptions, paginate]);

  // ตัวกรองปัจจุบันทั้งชุด — ทุก handler ส่งเฉพาะสิ่งที่ตัวเองเปลี่ยนผ่าน `over` ที่เหลือมาจาก
  // state ของ render ปัจจุบัน (ค่าถูกเสมอเพราะ handler ถูกสร้างใหม่ทุก render)
  const advanceFor = (over: Partial<SubscriptionFilters> = {}) =>
    buildAdvance({
      search: searchTerm,
      states: stateFilter,
      expiringSoon: expiringSoonFilter,
      clusterId: clusterFilter,
      ...over,
    });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_subscriptions', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_subscriptions', '1');
      setPaginate(prev => ({ ...prev, page: 1, advance: advanceFor({ search: value }) }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_subscription', String(perpage));
    localStorage.setItem('page_subscriptions', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStateFilter = (state: SubscriptionState) => {
    if (expiringSoonFilter) return; // ต้องปิด "ใกล้หมดอายุ" ก่อน — ดู UI disabled state ด้านล่าง
    const next = stateFilter.includes(state)
      ? stateFilter.filter((s) => s !== state)
      : [...stateFilter, state];
    setStateFilter(next);
    localStorage.setItem('filters_subscription_state', JSON.stringify(next));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: advanceFor({ states: next }) }));
  };

  const handleExpiringSoonToggle = () => {
    const next = !expiringSoonFilter;
    setExpiringSoonFilter(next);
    // buildAdvance ignores `states` entirely once expiringSoon is on (it forces active) — leaving
    // stateFilter populated would make the Filters badge count a filter that has no effect on
    // the request, so clear it here rather than just disabling its buttons (review B2#4: "what
    // the user sees on screen must equal what's sent to the backend").
    const nextStates = next ? [] : stateFilter;
    if (next) setStateFilter([]);
    localStorage.setItem('filter_subscription_expiring_soon', JSON.stringify(next));
    if (next) localStorage.setItem('filters_subscription_state', JSON.stringify([]));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: advanceFor({ states: nextStates, expiringSoon: next }) }));
  };

  const handleClusterFilter = (clusterId: string) => {
    setClusterFilter(clusterId);
    localStorage.setItem('filter_subscription_cluster', clusterId);
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: advanceFor({ clusterId }) }));
  };

  const handleClearStateFilter = () => {
    setStateFilter([]);
    localStorage.setItem('filters_subscription_state', JSON.stringify([]));
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: advanceFor({ states: [] }) }));
  };

  const handleClearAllFilters = () => {
    setStateFilter([]);
    setExpiringSoonFilter(false);
    setClusterFilter('');
    localStorage.setItem('filters_subscription_state', JSON.stringify([]));
    localStorage.setItem('filter_subscription_expiring_soon', JSON.stringify(false));
    localStorage.setItem('filter_subscription_cluster', '');
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({
      ...prev,
      page: 1,
      advance: advanceFor({ states: [], expiringSoon: false, clusterId: '' }),
    }));
  };

  const activeFilterCount =
    (stateFilter.length > 0 ? 1 : 0) + (expiringSoonFilter ? 1 : 0) + (clusterFilter ? 1 : 0);

  const handleSortChange = (sort: string) => {
    // DataTable's 3-state header toggle can cycle back to "" (unsorted) — never let that
    // through, or the next fetch drops `orderBy` entirely (see DEFAULT_SORT comment above).
    // Every value gets the id tiebreaker, not just the default one.
    const next = withTiebreaker(sort);
    localStorage.setItem('sort_subscriptions', next);
    localStorage.setItem('page_subscriptions', '1');
    setPaginate(prev => ({ ...prev, sort: next, page: 1 }));
  };

  const handleExport = () => {
    const rows = items.map((item) => ({
      ...item,
      ...auditCsvFields(normalizeAudit(item)),
      state: stateLabel(item.state),
    }));
    const csv = generateCSV(rows, [
      { key: 'subscription_number', label: t('pages.subscriptions.subscriptionNumber') },
      { key: 'cluster_name', label: t('common.label.cluster') },
      { key: 'cluster_code', label: t('pages.subscriptions.clusterCode') },
      { key: 'state', label: t('pages.subscriptions.state') },
      { key: 'start_date', label: t('pages.subscriptions.startDate') },
      { key: 'end_date', label: t('pages.subscriptions.endDate') },
      { key: 'seat_used', label: t('pages.subscriptions.seatsUsed') },
      { key: 'seat_cap', label: t('pages.subscriptions.seatsCap') },
      { key: 'bu_code', label: t('entity.businessUnit.title') },
      { key: 'bu_name', label: t('pages.subscriptions.businessUnitName') },
      { key: 'feature_count', label: t('pages.subscriptions.featureCount') },
      { key: 'created_at', label: t('common.audit.createdAt') },
      { key: 'created_by', label: t('common.audit.createdBy') },
      { key: 'updated_at', label: t('common.audit.updatedAt') },
      { key: 'updated_by', label: t('common.audit.updatedBy') },
    ]);
    downloadCSV(csv, `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const columns = useMemo<ColumnDef<Subscription, unknown>[]>(() => {
    // auditColumns.tsx hardcodes header: 'Created' as an English literal (shared by ~15
    // pages; rewriting it to take `t` is the shared-infrastructure pass, not this slice —
    // see broadcastColumns.tsx's own note). Override just the header here so this table's
    // Thai header row has no English hole. `hideUpdatedOnCard` keeps the mobile-card
    // behaviour identical to before this change.
    const [createdColumn, updatedColumn] = auditColumns<Subscription>({ hideUpdatedOnCard: true });
    return [
      {
        accessorKey: 'subscription_number',
        header: t('pages.subscriptions.subscription'),
        meta: { card: 'title' },
        cell: ({ row }) => (
          <Link to={`/licenses/subscriptions/${row.original.id}/edit`} className="text-primary hover:underline whitespace-nowrap">
            {row.original.subscription_number}
          </Link>
        ),
      },
      {
        id: 'cluster',
        accessorKey: 'cluster_name',
        header: t('common.label.cluster'),
        // cluster_name/cluster_code มาจาก join กับ tb_cluster ไม่ใช่คอลัมน์จริงของ tb_subscription —
        // เรียงด้วยคอลัมน์นี้ backend throw 400 (phase-b-backend-contract.md §8.3)
        enableSorting: false,
        // mobile card header: both Subscription and Cluster are 'title' — the same dual-title
        // pattern as ClusterManagement's Code+Name columns (data-table.tsx joins multiple title
        // cells with a middot). Cluster must be one of them per the B2 review corrections.
        meta: { card: 'title' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.cluster_name}</span>
            <span className="text-xs text-muted-foreground font-mono">{row.original.cluster_code}</span>
          </div>
        ),
      },
      {
        id: 'bu',
        header: t('entity.businessUnit.title'),
        // bu_code/bu_name มาจากความสัมพันธ์ tb_subscription_bu ที่ backend compose ตอนสร้างแถว
        // ไม่ใช่คอลัมน์จริงของ tb_subscription — เรียงแล้วได้ 400 (phase-b-backend-contract.md §8.3)
        enableSorting: false,
        // ต่างจาก bu_count เดิมที่ซ่อนบนมือถือ (ตัวเลขล้วนไม่มีบริบท): BU คือคู่สัญญา ไม่ใช่ตัวนับ
        // การ์ดที่ไม่บอกว่าใบนี้ของใครทำให้ต้องเปิดทีละใบเพื่อหา
        cell: ({ row }) =>
          row.original.bu_code ? (
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.bu_code}</div>
              <div className="text-muted-foreground truncate text-xs">{row.original.bu_name}</div>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: 'state',
        // "State" ไม่ใช่ "Status": ค่าที่แสดงคือ `state` ที่ backend คำนวณให้ และตัวกรองในฟิลเตอร์ชีต
        // ก็ใช้ชุดเดียวกัน — ป้ายสองที่บนจอเดียวกันต้องเรียกของสิ่งเดียวกันด้วยชื่อเดียวกัน (review I1)
        header: t('pages.subscriptions.state'),
        meta: { card: 'badge' },
        // `state` backend คำนวณให้ ไม่ใช่คอลัมน์จริงเช่นกัน — ห้ามเรียง
        enableSorting: false,
        cell: ({ row }) => {
          const { state, end_date } = row.original;
          const soon = isExpiringSoon(state, end_date);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* No `capitalize` class: the catalog values are already Title Case
                  ('Active'/'Inactive'/'Expired'), and stateLabel is the same lookup the
                  filter buttons/chips and the CSV export use — see the stateLabel comment
                  above for why. */}
              <Badge variant={state === 'active' ? 'success' : 'secondary'}>
                {stateLabel(state)}
              </Badge>
              {soon && <Badge variant="warning">{t('pages.subscriptions.expiringSoon')}</Badge>}
            </div>
          );
        },
      },
      {
        id: 'feature_count',
        header: t('pages.subscriptions.features'),
        enableSorting: false,
        meta: { card: 'hidden' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.feature_count}</span>,
      },
      {
        accessorKey: 'end_date',
        id: 'end_date',
        header: t('pages.subscriptions.period'),
        cell: ({ row }) => (
          <div className="text-[11px] leading-tight text-muted-foreground whitespace-nowrap">
            {fmtDate(row.original.start_date)} → {fmtDate(row.original.end_date)}
          </div>
        ),
      },
      { ...createdColumn, header: t('common.audit.created') },
      { ...updatedColumn, header: t('common.audit.updatedDate') },
    ];
  }, [t, stateLabel]);
  // No actions column: with Delete removed (review B2#1 — the backend can never surface a
  // soft-deleted subscription, so a delete button nobody can verify or undo was worse than no
  // button), the only remaining row action was "Edit", which just duplicated the already-
  // clickable Subscription/Cluster links above. A single-item dropdown that only navigates
  // (never mutates) is redundant chrome, not a genuine menu — so it's gone rather than kept
  // as a one-item DropdownMenu.

  // Export + Add Subscription — same buttons regardless of embedded: spec §3.2 requires the
  // subscription view to keep every capability of the standalone `/subscriptions` page when
  // hosted inside License Center, and CSV export is mandatory on every Management page
  // (root CLAUDE.md). Only the `<PageHeader>` chrome around them (title/subtitle/Layout) is
  // embedding-specific — the actions themselves render in both modes.
  const actions = (
    <>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
        <Download className="mr-2 h-4 w-4" />
        {t('common.action.export')}
      </Button>
      <Can permission="subscription.manage">
        <Button onClick={() => navigate('/licenses/subscriptions/new')}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">{t('pages.subscriptions.addSubscription')}</span>
          <span className="sm:hidden">{t('common.action.add')}</span>
        </Button>
      </Can>
    </>
  );

  const content = (
    <div className="space-y-6 sm:space-y-8">
        {embedded ? (
          <div className="flex justify-end gap-3">{actions}</div>
        ) : (
          <PageHeader
            title={t('common.label.subscriptions')}
            subtitle={t('pages.subscriptions.subtitle')}
            actions={actions}
          />
        )}

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
                placeholder={t('pages.subscriptions.searchNumber')}
                className="flex-1 sm:max-w-sm"
              />
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    {t('common.label.filters')}
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>{t('common.label.filters')}</SheetTitle>
                    <SheetDescription>{t('pages.subscriptions.filterDescription')}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        {/* ป้ายชุดเดียวกับ badge ในตาราง: กรองด้วย `state` (สถานะที่แสดงผล)
                            ไม่ใช่ `status` ดิบ — review I1 */}
                        <span className="text-sm font-medium">{t('pages.subscriptions.state')}</span>
                        {stateFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearStateFilter}>
                            {t('common.action.clear')}
                          </Button>
                        )}
                      </div>
                      {expiringSoonFilter && (
                        <p className="text-xs text-muted-foreground">
                          {t('pages.subscriptions.lockedToActive')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {STATE_OPTIONS.map((s) => (
                          <Button
                            key={s}
                            variant={stateFilter.includes(s) ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            disabled={expiringSoonFilter}
                            onClick={() => handleStateFilter(s)}
                          >
                            {stateLabel(s)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {canReadClusters && (
                      <div className="space-y-3">
                        <Label htmlFor="cluster-filter" className="text-sm font-medium">{t('common.label.cluster')}</Label>
                        <select
                          id="cluster-filter"
                          value={clusterFilter}
                          onChange={(e) => handleClusterFilter(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">{t('pages.subscriptions.allClusters')}</option>
                          {clusters.map((c) => (
                            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                          ))}
                        </select>
                        {clustersError && (
                          <p className="text-xs text-destructive" role="alert">{clustersError}</p>
                        )}
                      </div>
                    )}
                    <div className="space-y-3">
                      <span className="text-sm font-medium">{t('pages.subscriptions.expiry')}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="expiringSoon"
                          checked={expiringSoonFilter}
                          onChange={handleExpiringSoonToggle}
                          className="h-4 w-4 rounded border-input"
                        />
                        <Label htmlFor="expiringSoon" className="text-sm text-muted-foreground cursor-pointer">
                          {t('pages.subscriptions.expiringWithinDays', { days: EXPIRING_SOON_DAYS })}
                        </Label>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={handleClearAllFilters}>
                        {t('common.action.clearAllFilters')}
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('common.action.filtersLabel')}</span>
                {expiringSoonFilter ? (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {t('pages.subscriptions.expiringSoon')}
                    <button onClick={handleExpiringSoonToggle} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : (
                  stateFilter.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                      {stateLabel(s)}
                      <button onClick={() => handleStateFilter(s)} className="ml-0.5 hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
                {clusterFilter && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {clusters.find((c) => c.id === clusterFilter)?.name ?? clusterFilter}
                    <button
                      onClick={() => handleClusterFilter('')}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.subscriptions.clearClusterFilter')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  {t('common.action.clearAll')}
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
                emptyTitle={t('pages.subscriptions.emptyTitle')}
                emptyDescription={t('pages.subscriptions.emptyDescription')}
                addAction={
                  <Can permission="subscription.manage">
                    <Button size="sm" onClick={() => navigate('/licenses/subscriptions/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.subscriptions.addSubscription')}
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
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label={t('pages.subscriptions.loading')}>
                        <div className="text-muted-foreground">{t('pages.subscriptions.loadingEllipsis')}</div>
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
                      defaultSort={{ id: DEFAULT_SORT_ID, desc: DEFAULT_SORT_DESC }}
                    />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
    </div>
  );

  const debugSheet = (
    <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/subscriptions" data={rawResponse} />
  );

  if (embedded) {
    return (
      <>
        {content}
        {debugSheet}
      </>
    );
  }

  return (
    <Layout>
      {content}
      {debugSheet}
    </Layout>
  );
};

export default SubscriptionTable;
