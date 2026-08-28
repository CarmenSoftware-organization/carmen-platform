import { Link } from 'react-router-dom';
import Can from '../../../components/Can';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { seatUtilization } from '../../../utils/capacity';
import type { SubscriptionBu, SubscriptionSeat } from '../../../types';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';

export interface SeatsCardProps {
  seat: SubscriptionSeat;
  /** BU เดียวของสัญญา — `null` เฉพาะข้อมูลผิดรูปจากยุคก่อน migration */
  bu: SubscriptionBu | null;
}

/**
 * Read-only cluster-level seat pool — NOT a per-BU table (spec §6.1: seat is a pool shared
 * by every BU in the cluster; a per-BU breakdown invites the user to sum rows themselves,
 * which is wrong). `cap` is always a finite integer here — there is no "unlimited" seat cap
 * anywhere in this system, so this component never renders that word.
 *
 * `bu.licensed_users` is what this contract's BU "bought" toward the pool, not a
 * per-BU seat cap — there is no such thing any more (carmen-platform Task 3.5): a BU's
 * contribution to the pool is the sum of its own dated licence rows, edited on the BU's own
 * edit page (linked via "แก้เพดาน") in the User Licenses card, never here, to avoid a second
 * source of truth.
 */
export function SeatsCard({ seat, bu }: SeatsCardProps) {
  const { t } = useI18n();
  const { used, cap, pending_invites } = seat;
  const u = seatUtilization(used, cap);
  const projected = used + pending_invites;
  const willExceed = projected > cap;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.subscriptions.seats')}</CardTitle>
        <CardDescription>{t('pages.subscriptions.seatsPoolDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={cn(
              'text-2xl font-semibold tabular-nums',
              u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : '',
            )}
          >
            {used} / {cap}
          </span>
          <span className="text-sm text-muted-foreground">{t('pages.subscriptions.seats')}</span>
        </div>

        {pending_invites > 0 && (
          <p
            className={cn('text-sm', willExceed ? 'text-warning' : 'text-muted-foreground')}
            role={willExceed ? 'alert' : undefined}
          >
            {t('pages.subscriptions.pendingCount', { count: pending_invites })}
            {willExceed && t('pages.subscriptions.upTo', { projected, cap })}
          </p>
        )}

        <div className="divide-y rounded-md border">
          {!bu ? (
            <p className="p-3 text-sm text-muted-foreground">{t('pages.subscriptions.noBusinessUnitLinked')}</p>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">{bu.bu_name} · {t('pages.subscriptions.purchasedCount', { count: bu.licensed_users })}</span>
                {/* `/business-units/:id/edit` ต้องใช้ `cluster.update` (App.tsx) ซึ่งเป็นคนละสิทธิ์
                    กับ `subscription.manage` ของหน้านี้ — ไม่ห่อ `<Can>` คนที่แก้สัญญาได้แต่แก้
                    cluster ไม่ได้จะกดแล้วเจอหน้า Forbidden (gating-a-page.md ข้อ 3, review M2) */}
                <Can
                  permission="cluster.update"
                  fallback={
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('pages.subscriptions.capEditedOnBuPage')}
                    </span>
                  }
                >
                  <Link
                    to={`/business-units/${bu.business_unit_id}/edit`}
                    className="shrink-0 text-primary hover:underline"
                  >
                    {t('pages.subscriptions.editCap')}
                  </Link>
                </Can>
            </div>
          )}
        </div>

        {/* คำอธิบายนี้ขึ้นเสมอ ไม่ใช่ขึ้นเมื่อผลรวมไม่ตรงกับ cap (review I4): `cap` คือผลรวมของ
            **ทุก BU ที่ active ใน cluster** ไม่ว่าจะอยู่ในสัญญาใบนี้หรือไม่
            (`subscription.service.ts:700-706`) ส่วนแถวข้างบนคือ BU เดียวของสัญญาใบนี้ — สอง
            จำนวนคนละแกนกัน และตอนนี้ยิ่งต่างกันเป็นปกติ เพราะหนึ่งใบผูก BU เดียวแต่ pool เป็นของ
            ทั้ง cluster ไม่ใช่ความผิดปกติที่ต้องเตือน */}
        <p className="text-xs text-muted-foreground">
          {t('pages.subscriptions.seatsPoolNote', { cap })}
        </p>
      </CardContent>
    </Card>
  );
}
