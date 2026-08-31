import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureService from '../services/licenseFeatureService';
import type { LicenseFeatureAdminRow } from '../types';
import { FEATURE_STATES, type FeatureState } from '../constants/featureFlags';
import { moduleOf } from './licenses/subscriptionEdit/featureSelection';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useI18n } from '../hooks/useI18n';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { FeatureStateToggle } from '../components/FeatureStateToggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { Tags, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { TKey } from '../i18n/types';

/**
 * คีย์คำอธิบายของหน้านี้โดยเฉพาะ — **ห้ามใช้ของหน้า Feature Flags ซ้ำ**
 * ที่นั่น `hide` แปลว่าเมนูหายและ URL ตรงเจอ 404 ส่วนที่นี่แปลว่าหายจากแค็ตตาล็อกที่ขายได้
 * คนละเรื่องกันสิ้นเชิง การใช้ชุดเดียวกันจะทำให้ผู้ดูแลอ่านแล้วเข้าใจผิดว่ากำลังปิดหน้าจอ
 */
const LICENSE_STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.licenseFeatures.state.active',
  inactive: 'pages.licenseFeatures.state.inactive',
  hide: 'pages.licenseFeatures.state.hide',
};

const LICENSE_STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.licenseFeatures.state.activeHint',
  inactive: 'pages.licenseFeatures.state.inactiveHint',
  hide: 'pages.licenseFeatures.state.hideHint',
};

/**
 * แค็ตตาล็อก license feature — client-filtered ไม่ใช่ server-side
 *
 * แถวทั้งหมดมาจาก `scripts/generate-license-catalog` ฝั่ง backend จำนวนจึงมีเพดานเชิงโครงสร้าง
 * ไม่ได้งอกตามการใช้งาน ดึงครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce** เพราะการพิมพ์
 * ไม่ทำให้เกิด fetch
 *
 * หน้านี้แก้ได้แค่ `state` ไม่มีปุ่มเพิ่ม/ลบแถว — key/label/sort_order เป็นของ generator
 *
 * **บันทึกทันทีทีละแถว ไม่เก็บ draft** ต่างจากหน้า /platform/features โดยเจตนา:
 * ที่นั่น backend เป็น PUT ที่ทับทั้ง map ทีเดียว ส่วนที่นี่แต่ละแถวถือ `doc_version` ของตัวเอง
 * การรวบหลายแถวเป็นชุดเดียวแล้วยิง PATCH ทีละตัวบังคับให้ต้องออกแบบ UX ตอนสำเร็จครึ่ง ๆ
 * ("สำเร็จ 18 ล้มเหลว 2 — แต่ 2 อันไหน") ทั้งที่ปัญหานั้นไม่มีอยู่ถ้าไม่รวบ
 * ผลพลอยได้คือหน้านี้ไม่ต้องมี useUnsavedChanges เพราะไม่มีสถานะค้าง
 */
const LicenseFeatureManagement: React.FC = () => {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('license_feature.manage');

  const [rows, setRows] = useState<LicenseFeatureAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<FeatureState | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await licenseFeatureService.getAll();
      setRawResponse(response);
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (err: unknown) {
      devLog('fetch license features failed', err);
      setError(getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (!q) return true;
      return r.key.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
    });
  }, [rows, search, stateFilter]);

  const handleExport = () => {
    const csv = generateCSV(
      filtered,
      [
        { key: 'key', label: t('pages.licenseFeatures.key') },
        { key: 'label', label: t('pages.licenseFeatures.label') },
        { key: 'parent_key', label: t('pages.licenseFeatures.module') },
        { key: 'sort_order', label: t('pages.licenseFeatureGroups.sortOrder') },
        { key: 'state', label: t('common.status.label') },
      ],
    );
    downloadCSV(csv, `license-features-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  /**
   * เปลี่ยนสถานะหนึ่งแถวแล้วบันทึกทันที — ปิด toggle ระหว่างรอเพื่อไม่ให้ยิงซ้อน
   * 409 หมายถึงมีคนอื่นแก้แถวนี้ไปแล้ว: แจ้งแล้วดึงใหม่ทั้งชุด ไม่ใช่เขียนทับของเขา
   */
  const handleChange = useCallback(
    async (row: LicenseFeatureAdminRow, next: FeatureState) => {
      if (next === row.state) return;
      setSavingId(row.id);
      try {
        const response = await licenseFeatureService.setState(row.id, next, row.doc_version);
        setRows((prev) => prev.map((r) => (r.id === row.id ? response.data : r)));
        toast.success(t('pages.licenseFeatures.stateSaved'));
      } catch (err: unknown) {
        if (isVersionConflict(err)) {
          notifyVersionConflict(t);
          await fetchAll();
        } else {
          devLog('set license feature state failed', err);
          toast.error(getErrorDetail(err, t));
        }
      } finally {
        setSavingId(null);
      }
    },
    [t, fetchAll],
  );

  const columns = useMemo<ColumnDef<LicenseFeatureAdminRow, unknown>[]>(() => [
    {
      accessorKey: 'key',
      header: t('pages.licenseFeatures.key'),
      meta: { cellClassName: 'font-mono text-[10px] sm:text-xs', card: { primary: true } },
      cell: ({ row }) => <span className="font-mono">{row.original.key}</span>,
    },
    {
      accessorKey: 'label',
      header: t('pages.licenseFeatures.label'),
      cell: ({ row }) => <span className="text-sm">{row.original.label}</span>,
    },
    {
      id: 'module',
      accessorFn: (r) => moduleOf(r.key),
      header: t('pages.licenseFeatures.module'),
      meta: { headerClassName: 'w-40', cellClassName: 'w-40' },
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{moduleOf(row.original.key)}</span>
      ),
    },
    {
      accessorKey: 'state',
      header: t('common.status.label'),
      enableSorting: false,
      meta: { headerClassName: 'w-72', cellClassName: 'w-72' },
      cell: ({ row }) => (
        <FeatureStateToggle
          value={row.original.state}
          onChange={(next) => void handleChange(row.original, next)}
          featureLabel={row.original.label}
          labelKeys={LICENSE_STATE_LABEL}
          hintKeys={LICENSE_STATE_HINT}
          disabled={!canManage || savingId === row.original.id}
        />
      ),
    },
  ], [t, handleChange, canManage, savingId]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.licenseFeatures.title')}
          subtitle={t('pages.licenseFeatures.subtitle')}
          actions={
            <Button size="sm" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t('common.action.export')}
            </Button>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pages.licenseFeatures.searchPlaceholder')}
                className="pl-9"
                aria-label={t('pages.licenseFeatures.searchPlaceholder')}
              />
            </div>
            <Select
              value={stateFilter}
              onValueChange={(v) => setStateFilter(v as FeatureState | 'all')}
            >
              <SelectTrigger className="sm:w-56" aria-label={t('pages.licenseFeatures.filterAll')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pages.licenseFeatures.filterAll')}</SelectItem>
                {FEATURE_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{t(LICENSE_STATE_LABEL[s])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            {error ? (
              <FetchErrorState message={error} onRetry={() => void fetchAll()} />
            ) : loading && rows.length === 0 ? (
              <TableSkeleton columns={4} rows={8} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Tags}
                title={t('pages.licenseFeatures.emptyTitle')}
                description={t('pages.licenseFeatures.emptyDescription')}
              />
            ) : (
              <DataTable
                columns={columns}
                data={filtered}
                tableLayout="auto"
                defaultSort={{ id: 'key', desc: false }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title={t('pages.licenseFeatures.title')}
          endpoint="/api-system/platform/license-features/all"
          tabs={[
            { key: 'response', label: 'response', data: rawResponse },
            { key: 'filtered', label: 'filtered', data: filtered },
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureManagement;
