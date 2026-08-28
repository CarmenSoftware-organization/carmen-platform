import { Link } from 'react-router-dom';
import { Building2, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/EmptyState';
import { SummaryCardHeader } from './SummaryCardHeader';
import { useI18n } from '../../hooks/useI18n';

export interface ClusterBusinessUnitSummary {
  id: string;
  name: string;
  code: string;
}

/**
 * Past this many rows the card stops summarising and starts being a worse copy of the Business
 * Units page, which has the search, filters, and export this card deliberately does not.
 */
const MAX_ROWS = 8;

export interface ClusterBusinessUnitsCardProps {
  clusterId: string;
  units: ClusterBusinessUnitSummary[];
}

/**
 * The business units this cluster owns, straight from the cluster record — no second request.
 *
 * The row carries the code and the name and nothing else on purpose: `GET /clusters/:id` returns
 * only those two per unit, and a status badge invented from an absent field would be a guess.
 * Status lives on the Business Units page, one click away.
 */
export function ClusterBusinessUnitsCard({ clusterId, units }: ClusterBusinessUnitsCardProps) {
  const { t } = useI18n();
  const listTo = `/cluster-admin/${clusterId}/business-units`;
  const shown = units.slice(0, MAX_ROWS);
  const hidden = units.length - shown.length;

  return (
    <Card>
      <SummaryCardHeader
        title={t('common.label.businessUnitsLabel')}
        count={units.length}
        to={listTo}
        viewAllLabel={t('pages.clusterAdmin.viewAllBusinessUnitsAria')}
      />

      {units.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('common.state.noBusinessUnits')}
          description={t('pages.clusterAdmin.noBusinessUnitsCreatedByPlatformAdmin')}
        />
      ) : (
        <ul className="divide-y">
          {shown.map((bu) => (
            <li key={bu.id}>
              <Link
                to={`${listTo}/${bu.id}/edit`}
                className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5"
              >
                <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                  {bu.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{bu.name}</span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-muted-foreground pt-2.5 text-xs">
              {t('pages.clusterAdmin.moreOnBusinessUnitsPage', { count: hidden })}
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
