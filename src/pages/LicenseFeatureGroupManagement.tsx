import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureGroupService from '../services/licenseFeatureGroupService';
import type { LicenseFeatureGroup } from '../types';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useI18n } from '../hooks/useI18n';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import Can from '../components/Can';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { LayoutGrid, MoreHorizontal, Pencil, Plus, Search, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';

/**
 * รายการกลุ่มสิทธิ์ license — client-filtered ไม่ใช่ server-side
 *
 * จำนวนกลุ่มมีเพดานเชิงโครงสร้าง (เป็นรายการขายที่คนตั้งเอง ไม่ใช่ข้อมูลที่งอกตามการใช้งาน)
 * จึงดึงครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce** เพราะการพิมพ์ไม่ทำให้เกิด fetch
 */
const PAGE_SIZE = 200;

const LicenseFeatureGroupManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [groups, setGroups] = useState<LicenseFeatureGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [pendingDelete, setPendingDelete] = useState<LicenseFeatureGroup | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await licenseFeatureGroupService.getAll({
        page: 1,
        perpage: PAGE_SIZE,
        sort: 'sort_order:asc',
      });
      setRawResponse(response);
      setGroups(Array.isArray(response?.data) ? response.data : []);
    } catch (err: unknown) {
      devLog('fetch license feature groups failed', err);
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
    return groups.filter((g) => {
      if (activeOnly && !g.is_active) return false;
      if (!q) return true;
      return g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
    });
  }, [groups, search, activeOnly]);

  const handleExport = () => {
    const csv = generateCSV(
      filtered,
      [
        { key: 'code', label: t('pages.licenseFeatureGroups.code') },
        { key: 'name', label: t('pages.licenseFeatureGroups.name') },
        { key: 'description', label: t('pages.licenseFeatureGroups.description') },
        { key: 'sort_order', label: t('pages.licenseFeatureGroups.sortOrder') },
        { key: 'feature_count', label: t('pages.licenseFeatureGroups.featureCount') },
        { key: 'subscription_count', label: t('pages.licenseFeatureGroups.subscriptionCount') },
        { key: 'is_active', label: t('pages.licenseFeatureGroups.active') },
      ],
    );
    downloadCSV(csv, `license-feature-groups-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await licenseFeatureGroupService.delete(pendingDelete.id);
      toast.success(t('pages.licenseFeatureGroups.deleted'));
      setPendingDelete(null);
      await fetchAll();
    } catch (err: unknown) {
      toast.error(getErrorDetail(err, t));
      setPendingDelete(null);
    }
  };

  const columns = useMemo<ColumnDef<LicenseFeatureGroup, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('pages.licenseFeatureGroups.code'),
      cell: ({ row }) => (
        <Link
          to={`/license-feature-groups/${row.original.id}/edit`}
          className="font-mono text-xs text-primary hover:underline whitespace-nowrap"
          title={row.original.code}
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('pages.licenseFeatureGroups.name'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate" title={row.original.name}>{row.original.name}</span>
          {row.original.description && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[320px]"
              title={row.original.description}
            >
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'feature_count',
      header: t('pages.licenseFeatureGroups.featureCount'),
      meta: { headerClassName: 'text-right w-28', cellClassName: 'text-right w-28' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.feature_count}</span>,
    },
    {
      accessorKey: 'subscription_count',
      header: t('pages.licenseFeatureGroups.subscriptionCount'),
      meta: { headerClassName: 'text-right w-28', cellClassName: 'text-right w-28' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.subscription_count}</span>,
    },
    {
      accessorKey: 'is_active',
      header: t('common.status.label'),
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? t('common.status.active') : t('common.status.inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <Can permission="license_feature_group.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.action.rowActions', { name: row.original.name })}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => navigate(`/license-feature-groups/${row.original.id}/edit`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.action.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setPendingDelete(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.action.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      ),
    },
  ], [t, navigate]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.licenseFeatureGroups.title')}
          subtitle={t('pages.licenseFeatureGroups.subtitle')}
          actions={
            <div className="flex gap-3">
              <Button size="sm" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.action.export')}
              </Button>
              <Can permission="license_feature_group.manage">
                <Button size="sm" onClick={() => navigate('/license-feature-groups/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pages.licenseFeatureGroups.newGroup')}
                </Button>
              </Can>
            </div>
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
                placeholder={t('pages.licenseFeatureGroups.searchPlaceholder')}
                className="pl-9"
                aria-label={t('pages.licenseFeatureGroups.searchPlaceholder')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              {t('pages.licenseFeatureGroups.activeOnly')}
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            {error ? (
              <FetchErrorState message={error} onRetry={() => void fetchAll()} />
            ) : loading && groups.length === 0 ? (
              <TableSkeleton columns={6} rows={5} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title={t('pages.licenseFeatureGroups.emptyTitle')}
                description={t('pages.licenseFeatureGroups.emptyDescription')}
                action={
                  <Can permission="license_feature_group.manage">
                    <Button size="sm" onClick={() => navigate('/license-feature-groups/new')}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.licenseFeatureGroups.newGroup')}
                    </Button>
                  </Can>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                data={filtered}
                tableLayout="auto"
                defaultSort={{ id: 'code', desc: false }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t('pages.licenseFeatureGroups.deleteTitle')}
        description={t('pages.licenseFeatureGroups.deleteBody')}
        confirmText={t('common.action.delete')}
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title={t('pages.licenseFeatureGroups.title')}
          endpoint="/api-system/platform/license-feature-groups"
          tabs={[
            { key: 'response', label: 'response', data: rawResponse },
            { key: 'filtered', label: 'filtered', data: filtered },
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureGroupManagement;
