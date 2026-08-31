import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, ChevronsUpDown } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import Can from '../../../components/Can';
import { AuditMeta } from '../../../components/AuditMeta';
import { TableToolbar } from '../TableToolbar';
import { cycleSort, sortRows, type SortState } from '../tableSort';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';
import { latestActor } from '../../../utils/audit';
import type { BusinessUnit } from '../../../types';
import { useI18n } from '../../../hooks/useI18n';

export interface BusinessUnitsSectionProps {
  clusterId: string;
  businessUnits: BusinessUnit[];
  loading: boolean;
  maxLicenseBu: number | null;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}

const accessor = (bu: BusinessUnit, key: string): unknown => {
  if (key === 'code') return bu.code;
  if (key === 'name') return bu.name;
  if (key === 'status') return bu.is_active ? 1 : 0;
  return '';
};

export function BusinessUnitsSection({
  clusterId, businessUnits, loading, maxLicenseBu, onRefresh, onNavigate,
}: BusinessUnitsSectionProps) {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = businessUnits.filter((bu) => {
      if (term && !(`${bu.code} ${bu.name}`.toLowerCase().includes(term))) return false;
      if (activeOnly && !bu.is_active) return false;
      if (inactiveOnly && bu.is_active) return false;
      return true;
    });
    out = sortRows(out, sort, accessor);
    return out;
  }, [businessUnits, search, activeOnly, inactiveOnly, sort]);

  const atLimit = maxLicenseBu != null && businessUnits.length >= maxLicenseBu;

  // Rank must match `v_cluster_bu_quota` exactly (HQ first, then oldest created_at, then id) —
  // a badge that disagrees with the real gate is worse than no badge, because the user will
  // trust it. Ranked over the full `businessUnits` list (inactive units included, same as the
  // view), never the filtered/sorted `rows` below, so a search or filter never changes which
  // unit shows as over limit. Shared with `BusinessUnitList` (cluster-admin view) via
  // `utils/businessUnitRank.ts` — do not re-inline this comparator here.
  const ranked = useMemo(() => rankBusinessUnits(businessUnits), [businessUnits]);

  // null cap = unknown/unenforced, same convention as `atLimit` above — never coerced to 0,
  // which would falsely mark every row as over limit.
  const { t } = useI18n();
  const overLimitCount = useMemo(() => countOverLimit(ranked, maxLicenseBu), [ranked, maxLicenseBu]);

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder={t('pages.clusters.searchBusinessUnits')}
        filters={[
          { key: 'active', label: t('common.status.active'), active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); } },
          { key: 'inactive', label: t('common.status.inactive'), active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label={t('pages.clusters.refreshBusinessUnits')}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Can permission="cluster.create">
              <Button size="sm" onClick={() => onNavigate(`/business-units/new?cluster_id=${clusterId}`)} disabled={atLimit}
                title={atLimit ? t('pages.clusters.licenseLimitReached', { used: businessUnits.length, cap: maxLicenseBu ?? 0 }) : undefined}>
                {t('common.action.add')}
              </Button>
            </Can>
          </>
        }
      />
      {overLimitCount > 0 && (
        <p className="px-4 pb-3 text-xs text-destructive">
          {t('pages.clusters.overLimitNote', { count: overLimitCount, cap: maxLicenseBu ?? 0 })}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {businessUnits.length === 0
            ? t('pages.clusters.noBuInCluster')
            : t('pages.clusters.noBuMatchFilters')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-sticky-right [--sticky-right-bg:var(--card)]">
            <TableHeader>
              <TableRow>
                {(['code', 'name'] as const).map((key) => (
                  <TableHead key={key}>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((s) => cycleSort(s, key))}>
                      {key === 'code' ? t('common.field.code') : t('common.field.name')}
                      <ChevronsUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </TableHead>
                ))}
                {/* กว้างคงที่: ปล่อยให้ยืด แล้วคอลัมน์ชื่อจะถูกบีบขณะที่ช่องว่างไปกองอยู่
                    ระหว่างสถานะกับปุ่มแก้ไข */}
                <TableHead className="w-32">{t('common.status.label')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((bu) => {
                const latest = latestActor(bu);
                return (
                <TableRow key={bu.id}>
                  <TableCell><Badge variant="outline" className="text-xs">{bu.code}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{bu.name}</span>
                      {maxLicenseBu != null && (ranked.get(bu.id) ?? 0) > maxLicenseBu && (
                        <Badge
                          variant="destructive"
                          className="text-xs"
                          title={t('pages.clusters.overLimitRankTitle', { cap: maxLicenseBu ?? 0, rank: ranked.get(bu.id) ?? 0 })}
                        >
                          {t('pages.clusters.overLimit')}
                        </Badge>
                      )}
                    </div>
                    <AuditMeta
                      variant="compact"
                      verbKey={latest?.verbKey}
                      actor={latest?.actor}
                    />
                  </TableCell>
                  <TableCell>
                    {/* กติกาเดียวกับตารางผู้ใช้: ป้ายสีไว้ให้สถานะที่ผิดปกติเท่านั้น */}
                    {bu.is_active ? (
                      <span className="text-muted-foreground text-xs">{t('common.status.active')}</span>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{t('common.status.inactive')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${HIT_SLOP_44}`}
                      aria-label={t('pages.clusters.editBuAria', { name: bu.name || bu.code || t('pages.clusters.buSingularLower') })} onClick={() => onNavigate(`/business-units/${bu.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
