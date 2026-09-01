import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import { AuditMeta } from '../../../components/AuditMeta';
import { LicenseCoverageBar } from '../LicenseCoverageBar';
import { isExpiringSoon } from '../../../utils/subscriptionState';
import { latestActor } from '../../../utils/audit';
import { fmtDate, daysLeft, coverageWindow } from '../licenseDates';
import { useI18n } from '../../../hooks/useI18n';
import type { TKey } from '../../../i18n/types';
import type { Subscription, SubscriptionState } from '../../../types';

export interface SubscriptionSectionProps {
  clusterId: string;
  canManage: boolean;
  /** ผลของ `useClusterSubscriptions` ที่เพจแม่ถือไว้ — section นี้ไม่ดึงข้อมูลเอง */
  items: Subscription[];
  loading: boolean;
  failed: boolean;
  errorMsg: string;
  reload: () => void;
}

// Pure data + catalog keys, module scope — no `t` call here. Only 'active' gets the
// 'success' badge; both other states keep the source's original 'secondary' fallback
// (the pre-existing code only ever checked `=== 'active'`, so 'expired' and 'inactive'
// must render identically to each other, not get distinct variants).
const STATE_VARIANT: Record<SubscriptionState, 'success' | 'secondary'> = {
  active: 'success',
  expired: 'secondary',
  inactive: 'secondary',
};
const STATE_LABEL_KEYS: Record<SubscriptionState, TKey> = {
  active: 'common.status.active',
  expired: 'common.status.expired',
  inactive: 'common.status.inactive',
};

/**
 * ลำดับที่ผู้ใช้ต้องเห็นก่อน — พังแล้ว → กำลังจะพัง → หยุดใช้ → ปกติ
 *
 * ของเดิมเรียง `end_date:desc` จาก backend ซึ่งเอาสัญญาที่จบไกลที่สุด (= สบายที่สุด) ขึ้นบนสุด
 * และผลักสัญญาที่หมดอายุแล้วลงล่าง กลับหัวกับเหตุผลที่คนเปิดหน้านี้พอดี
 * เรียงใหม่ฝั่ง client เพราะเกณฑ์นี้คำนวณจาก `state` + วันที่ ซึ่งไม่มีคอลัมน์ให้ backend เรียง
 * (ยังคงขอ `sort: 'end_date:desc'` ไว้เหมือนเดิมเพื่อให้ลำดับตั้งต้นคงที่ก่อนเรียงซ้ำ)
 */
function severityOf(sub: Subscription): number {
  if (sub.state === 'expired') return 0;
  if (isExpiringSoon(sub.state, sub.end_date)) return 1;
  if (sub.state === 'inactive') return 2;
  return 3;
}

/**
 * สัญญาทั้งหมดของ cluster นี้ — ข้อมูลมาจาก `useClusterSubscriptions` ที่เพจแม่ถือไว้ (แถบสรุป
 * หัวหน้าต้องนับสัญญาที่หมดอายุ/ใกล้หมดจากชุดเดียวกัน ไม่งั้นสองที่จะเพี้ยนจากกันเงียบ ๆ ตอน
 * หนึ่งในสองโหลดล้ม)
 *
 * หนึ่งสัญญาผูกหนึ่ง BU เสมอ (การออกแบบใหม่) — `bu_code` ว่างคือข้อมูลผิดรูปจากยุคก่อน migration
 * ต้องขึ้นป้าย "No BU" ไม่ใช่ช่องว่างเงียบ ๆ
 */
export function SubscriptionSection({
  clusterId, canManage, items, loading, failed, errorMsg, reload,
}: SubscriptionSectionProps) {
  const { t } = useI18n();
  const now = new Date();
  const nowMs = now.getTime();
  // แกนขยับได้แค่เมื่อข้ามเดือน — ผูก memo กับเดือนปัจจุบันแทนตัว `now` สดที่เปลี่ยนทุก render
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const window = useMemo(() => coverageWindow(now), [monthKey]);

  const ordered = useMemo(() => [...items].sort((a, b) => {
    const d = severityOf(a) - severityOf(b);
    if (d !== 0) return d;
    // ภายในระดับเดียวกัน ตัวที่จบก่อนมาก่อน — มันคือตัวที่ต้องต่อสัญญาก่อน
    return Date.parse(a.end_date) - Date.parse(b.end_date);
  }), [items]);

  const addHref = `/licenses/subscriptions/new?cluster_id=${clusterId}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('common.label.subscriptions')}
          </CardTitle>
          <CardDescription>{t('pages.licenses.subscriptionsCardDescription')}</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" asChild>
            <Link to={addHref}>
              <Plus className="mr-2 h-4 w-4" />
              {t('pages.licenses.addSubscriptionButton')}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading && items.length === 0 ? (
          <TableSkeleton columns={6} rows={3} />
        ) : failed ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-destructive text-sm">
              {errorMsg
                ? `${t('pages.licenses.subscriptionsLoadFailedPrefix')}${errorMsg}`
                : t('pages.licenses.subscriptionsLoadFailed')}
            </p>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('common.action.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={t('pages.licenses.noSubscriptionsYetTitle')}
            description={t('pages.licenses.noSubscriptionContractsDescription')}
            action={
              canManage ? (
                <Button size="sm" asChild>
                  <Link to={addHref}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('pages.licenses.addSubscriptionButton')}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-sticky-right [--sticky-right-bg:var(--card)] w-full text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('entity.subscription.title')}</th>
                  <th className="px-2 py-1.5 text-left">{t('entity.businessUnit.title')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('pages.licenses.coverageColumn')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.action.end')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('pages.licenses.subscriptionStateColumn')}</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((sub) => {
                  const soon = isExpiringSoon(sub.state, sub.end_date);
                  const latest = latestActor(sub);
                  const left = daysLeft(sub.end_date, now);
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
                          <Badge variant="secondary">{t('pages.licenses.noBuBadge')}</Badge>
                        )}
                      </td>
                      {/* แกนเวลาแทนคอลัมน์ Start ที่เป็นตัวเลขล้วน — แทบไม่มีใครอ่านวันเริ่ม
                          เดี่ยว ๆ สิ่งที่คนอ่านคือ "ช่วงนี้ครอบคลุมถึงไหน เทียบกับวันนี้"
                          วันเริ่มยังอ่านได้ครบใน title ของแถบ และในหน้าแก้ไขสัญญา */}
                      <td className="px-2 py-1">
                        <LicenseCoverageBar
                          className="w-24 sm:w-32"
                          intervals={[{
                            start: Date.parse(sub.start_date),
                            end: Date.parse(sub.end_date),
                            dim: sub.state !== 'active',
                          }]}
                          windowStart={window.start}
                          windowEnd={window.end}
                          now={nowMs}
                          label={t('pages.licenses.coverageBarLabel', {
                            text: `${fmtDate(sub.start_date)} – ${fmtDate(sub.end_date)}`,
                          })}
                        />
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {fmtDate(sub.end_date)}
                        <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                          · {left < 0
                            ? t('pages.licenses.expiredDaysAgo', { count: -left })
                            : t('common.state.daysLeft', { count: left })}
                        </span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <div className="space-x-1">
                          <Badge variant={STATE_VARIANT[sub.state]}>
                            {t(STATE_LABEL_KEYS[sub.state])}
                          </Badge>
                          {soon && <Badge variant="warning">{t('common.state.expiringSoon')}</Badge>}
                        </div>
                        <AuditMeta
                          variant="compact"
                          verbKey={latest?.verbKey}
                          actor={latest?.actor}
                          className="text-muted-foreground text-[11px]"
                        />
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {canManage && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/licenses/subscriptions/${sub.id}/edit`}>{t('common.action.edit')}</Link>
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
