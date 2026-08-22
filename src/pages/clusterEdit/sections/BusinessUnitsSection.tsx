import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, ChevronsUpDown } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import Can from '../../../components/Can';
import { AuditMeta } from '../../../components/AuditMeta';
import { TableToolbar } from '../TableToolbar';
import { cycleSort, sortRows, type SortState } from '../tableSort';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';
import { latestActor } from '../../../utils/audit';
import type { BusinessUnit } from '../../../types';

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
  const overLimitCount = useMemo(() => countOverLimit(ranked, maxLicenseBu), [ranked, maxLicenseBu]);

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search business units"
        filters={[
          { key: 'active', label: 'Active', active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); } },
          { key: 'inactive', label: 'Inactive', active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh business units">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Can permission="cluster.create">
              <Button size="sm" onClick={() => onNavigate(`/business-units/new?cluster_id=${clusterId}`)} disabled={atLimit}
                title={atLimit ? `License limit reached (${businessUnits.length}/${maxLicenseBu})` : undefined}>
                Add
              </Button>
            </Can>
          </>
        }
      />
      {overLimitCount > 0 && (
        <p className="px-4 pb-3 text-xs text-destructive">
          {overLimitCount} business units are beyond the licensed quota of {maxLicenseBu}. They are read-only until more quota is purchased.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {businessUnits.length === 0 ? 'No business units found in this cluster.' : 'No business units match your filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted border-b-2">
                {(['code', 'name'] as const).map((key) => (
                  <th key={key} className="px-4 py-2 text-left font-medium">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((s) => cycleSort(s, key))}>
                      {key === 'code' ? 'Code' : 'Name'}
                      <ChevronsUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((bu) => {
                const latest = latestActor(bu);
                return (
                <tr key={bu.id} className="zebra-row border-b transition-colors last:border-0">
                  <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{bu.code}</Badge></td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{bu.name}</span>
                      {maxLicenseBu != null && (ranked.get(bu.id) ?? 0) > maxLicenseBu && (
                        <Badge
                          variant="destructive"
                          className="text-xs"
                          title={`Quota ${maxLicenseBu} · this unit ranks ${ranked.get(bu.id)}`}
                        >
                          Over limit
                        </Badge>
                      )}
                    </div>
                    <AuditMeta
                      variant="compact"
                      verb={latest?.verb}
                      actor={latest?.actor}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={bu.is_active ? 'success' : 'secondary'} className="text-xs">
                      {bu.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${HIT_SLOP_44}`}
                      aria-label={`Edit ${bu.name || bu.code || 'business unit'}`} onClick={() => onNavigate(`/business-units/${bu.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
