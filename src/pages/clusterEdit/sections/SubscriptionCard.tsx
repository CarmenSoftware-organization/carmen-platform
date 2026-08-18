import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { EmptyState } from '../../../components/EmptyState';
import Can from '../../../components/Can';
import { useAuth } from '../../../context/AuthContext';
import subscriptionService from '../../../services/subscriptionService';
import { seatUtilization } from '../../../utils/capacity';
import { devLog } from '../../../utils/errorParser';
import type { Subscription } from '../../../types';

export interface SubscriptionCardProps {
  clusterId: string;
}

const fmtDate = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Read-only snapshot of the latest subscriptions for this cluster. Fetched here (not passed
 * down from ClusterEdit) — the query is scoped via `advance: { where: { cluster_id } }` on the
 * shared subscriptions list endpoint, not a dedicated endpoint (B1). `sort: 'end_date:desc'` is
 * required: the backend has no default ORDER BY (phase-b-backend-contract.md §8.3), so omitting
 * it makes "latest 5" meaningless.
 *
 * A load failure here is non-fatal to Cluster Edit — this is a supplementary widget on an
 * already-shipped page, not core data. Swallow the error (devLog only) and render nothing at
 * all, rather than an error banner or a broken card, for a page that has to keep working
 * regardless of subscription data availability.
 *
 * **The `subscription.read` check must gate the request itself, not just the markup.** Cluster
 * Edit shipped long before subscriptions existed, so this card runs for every user who opens
 * `/clusters/:id/edit`. Until `subscription.*` is in the `tb_application` allowlist the
 * gateway's `AppIdGuard` answers **401**, not 403 — and a 401 is indistinguishable from an
 * expired token to `tokenRefresh.ts`, which refreshes, retries, gets 401 again, then
 * `clearSession()`s and bounces the user to `/login`. The `.catch` below cannot stop that: the
 * axios interceptor runs first. So the fetch is skipped entirely when the permission is
 * missing — the fourth gate on top of nav/route/`<Can>` (gating-a-page.md).
 */
export function SubscriptionCard({ clusterId }: SubscriptionCardProps) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('subscription.read');
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    subscriptionService
      .getAll({
        perpage: 5,
        sort: 'end_date:desc',
        advance: JSON.stringify({ where: { cluster_id: clusterId } }),
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res?.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        devLog('Failed to load subscriptions for cluster:', err);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, canRead]);

  if (!canRead || failed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Subscription
        </CardTitle>
        <CardDescription>License subscriptions for this cluster</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm" role="status">
            Loading…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="ยังไม่มีสัญญา"
            description="สร้างสัญญาเพื่อกำหนดสิทธิ์และจำนวนที่นั่งให้ cluster นี้"
            action={
              <Can permission="subscription.manage">
                <Button size="sm" onClick={() => navigate(`/subscriptions/new?cluster_id=${clusterId}`)}>
                  สร้างสัญญา
                </Button>
              </Can>
            }
          />
        ) : (
          <ul className="divide-y">
            {items.map((sub) => {
              const seats = seatUtilization(sub.seat_used, sub.seat_cap);
              return (
                <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">{sub.subscription_number}</span>
                      <Badge variant={sub.state === 'active' ? 'success' : 'secondary'} className="text-xs capitalize">
                        {sub.state}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Expires {fmtDate(sub.end_date)} · {sub.feature_count} feature{sub.feature_count === 1 ? '' : 's'} ·{' '}
                      {sub.bu_count} BU{sub.bu_count === 1 ? '' : 's'} · {seats.used}/{seats.cap} seats
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/subscriptions/${sub.id}/edit`)}
                  >
                    จัดการ →
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
