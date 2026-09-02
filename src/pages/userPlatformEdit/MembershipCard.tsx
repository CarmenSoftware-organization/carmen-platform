import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Building2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';

/**
 * Where the holder sits in the tenant tree. This is *not* platform privilege — it is the
 * context that tells a reviewer whether a cluster-scoped grant lines up with where the
 * person actually works, which is why it is a separate, quieter card rather than another
 * row in the grants list.
 */
export interface MembershipFacts {
  clusters: { id: string; label: string; isActive: boolean }[];
  businessUnits: { id: string; label: string; role?: string; isActive: boolean }[];
}

export function MembershipCard({ membership }: { membership: MembershipFacts }) {
  const { t } = useI18n();
  const { clusters, businessUnits } = membership;
  const empty = clusters.length === 0 && businessUnits.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          {t('pages.userPlatform.membershipTitle')}
        </CardTitle>
        <CardDescription>{t('pages.userPlatform.membershipDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground text-sm">{t('pages.userPlatform.membershipEmpty')}</p>
        ) : (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
            <MembershipRow
              label={t('pages.userPlatform.membershipClusters')}
              items={clusters.map((c) => ({ id: c.id, text: c.label, isActive: c.isActive }))}
              emptyText={t('pages.userPlatform.membershipNone')}
            />
            <MembershipRow
              label={t('pages.userPlatform.membershipBusinessUnits')}
              items={businessUnits.map((b) => ({
                id: b.id,
                text: b.role ? `${b.label} · ${b.role}` : b.label,
                isActive: b.isActive,
              }))}
              emptyText={t('pages.userPlatform.membershipNone')}
            />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function MembershipRow({
  label, items, emptyText,
}: {
  label: string;
  items: { id: string; text: string; isActive: boolean }[];
  emptyText: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.1em] uppercase sm:pt-1">
        {label}
      </dt>
      <dd className="flex flex-wrap items-center gap-1.5">
        {items.length === 0 ? (
          <span className="text-muted-foreground text-sm">{emptyText}</span>
        ) : (
          items.map((item) => (
            <Badge key={item.id} variant={item.isActive ? 'secondary' : 'outline'} className="text-xs">
              {item.text}
              {!item.isActive && (
                <span className="text-muted-foreground ml-1.5">{t('common.status.inactive')}</span>
              )}
            </Badge>
          ))
        )}
      </dd>
    </>
  );
}
