import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import { AuditMeta } from '../../../components/AuditMeta';
import subscriptionService from '../../../services/subscriptionService';
import { buildAdvance } from '../subscriptionManagement/buildAdvance';
import { isExpiringSoon } from '../../../utils/subscriptionState';
import { getErrorDetail, devLog } from '../../../utils/errorParser';
import { latestActor } from '../../../utils/audit';
import { fmtDate } from '../licenseDates';
import type { Subscription } from '../../../types';

export interface SubscriptionSectionProps {
  clusterId: string;
  canManage: boolean;
}

/**
 * สัญญาทั้งหมดของ cluster นี้ — ดึงด้วย `subscriptionService.getAll` พร้อม advance filter
 * `cluster_id` (ประกอบด้วย `buildAdvance` ตัวเดียวกับที่ `SubscriptionTable` ใช้) ไม่มี endpoint
 * เฉพาะ cluster แยกต่างหาก
 *
 * หนึ่งสัญญาผูกหนึ่ง BU เสมอ (การออกแบบใหม่) — `bu_code` ว่างคือข้อมูลผิดรูปจากยุคก่อน migration
 * ต้องขึ้นป้าย "No BU" ไม่ใช่ช่องว่างเงียบ ๆ
 */
export function SubscriptionSection({ clusterId, canManage }: SubscriptionSectionProps) {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await subscriptionService.getAll({
        perpage: -1,
        sort: 'end_date:desc',
        advance: buildAdvance({ search: '', states: [], expiringSoon: false, clusterId }),
      });
      setItems(res?.data ?? []);
    } catch (err) {
      devLog('Failed to load subscriptions for cluster:', err);
      setErrorMsg(getErrorDetail(err));
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { void reload(); }, [reload]);

  const addHref = `/licenses/subscriptions/new?cluster_id=${clusterId}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscriptions
          </CardTitle>
          <CardDescription>Contracts issued for this cluster&apos;s business units.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" asChild>
            <Link to={addHref}>
              <Plus className="mr-2 h-4 w-4" />
              Add subscription
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading && items.length === 0 ? (
          <TableSkeleton columns={5} rows={3} />
        ) : failed ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">
              Could not load subscriptions for this cluster{errorMsg ? `: ${errorMsg}` : '.'}
            </p>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No subscriptions yet"
            description="This cluster has no subscription contracts."
            action={
              canManage ? (
                <Button size="sm" asChild>
                  <Link to={addHref}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add subscription
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_th]:whitespace-nowrap table-sticky-right [--sticky-right-bg:var(--card)]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-2 py-1 whitespace-nowrap">Subscription</th>
                  <th className="text-left px-2 py-1">Business Unit</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Start</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">End</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">State</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {items.map((sub) => {
                  const soon = isExpiringSoon(sub.state, sub.end_date);
                  const latest = latestActor(sub);
                  return (
                    <tr key={sub.id} className="border-b last:border-0">
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{sub.subscription_number}</td>
                      <td className="px-2 py-1">
                        {sub.bu_code ? (
                          <div className="min-w-0">
                            <div className="truncate">{sub.bu_code}</div>
                            <div className="text-muted-foreground truncate text-xs">{sub.bu_name}</div>
                          </div>
                        ) : (
                          <Badge variant="secondary">No BU</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(sub.start_date)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(sub.end_date)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <div className="space-x-1">
                          <Badge variant={sub.state === 'active' ? 'success' : 'secondary'} className="capitalize">
                            {sub.state}
                          </Badge>
                          {soon && <Badge variant="warning">Expiring soon</Badge>}
                        </div>
                        <AuditMeta
                          variant="compact"
                          verb={latest?.verb}
                          actor={latest?.actor}
                          className="text-muted-foreground text-[11px]"
                        />
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {canManage && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/licenses/subscriptions/${sub.id}/edit`}>Edit</Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
