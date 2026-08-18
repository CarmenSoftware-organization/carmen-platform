import { Link } from 'react-router-dom';
import Can from '../../components/Can';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { seatUtilization } from '../../utils/capacity';
import type { SubscriptionBu, SubscriptionSeat } from '../../types';
import { cn } from '../../lib/utils';

export interface SeatsCardProps {
  seat: SubscriptionSeat;
  bus: SubscriptionBu[];
}

/**
 * Read-only cluster-level seat pool — NOT a per-BU table (spec §6.1: seat is a pool shared
 * by every BU in the cluster; a per-BU breakdown invites the user to sum rows themselves,
 * which is wrong). `cap` is always a finite integer here — there is no "unlimited" seat cap
 * anywhere in this system, so this component never renders that word.
 *
 * `bus[].licensed_users` is what each subscription line "bought" toward the pool, not a
 * per-BU seat cap — the cap itself (`max_license_users`) lives on the BU record and is
 * edited there (linked via "แก้เพดาน"), never here, to avoid a second source of truth.
 */
export function SeatsCard({ seat, bus }: SeatsCardProps) {
  const { used, cap, pending_invites } = seat;
  const u = seatUtilization(used, cap);
  const projected = used + pending_invites;
  const willExceed = projected > cap;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ที่นั่ง</CardTitle>
        <CardDescription>Seat pool shared across every business unit in this cluster</CardDescription>
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
          <span className="text-sm text-muted-foreground">ที่นั่ง</span>
        </div>

        {pending_invites > 0 && (
          <p
            className={cn('text-sm', willExceed ? 'text-warning' : 'text-muted-foreground')}
            role={willExceed ? 'alert' : undefined}
          >
            รอตอบรับ {pending_invites}
            {willExceed && ` → อาจถึง ${projected}/${cap}`}
          </p>
        )}

        <div className="divide-y rounded-md border">
          {bus.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No business units on this subscription yet.</p>
          ) : (
            bus.map((b) => (
              <div key={b.business_unit_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">{b.bu_name} · ซื้อ {b.licensed_users}</span>
                {/* `/business-units/:id/edit` ต้องใช้ `cluster.update` (App.tsx) ซึ่งเป็นคนละสิทธิ์
                    กับ `subscription.manage` ของหน้านี้ — ไม่ห่อ `<Can>` คนที่แก้สัญญาได้แต่แก้
                    cluster ไม่ได้จะกดแล้วเจอหน้า Forbidden (gating-a-page.md ข้อ 3, review M2) */}
                <Can
                  permission="cluster.update"
                  fallback={
                    <span className="text-muted-foreground shrink-0 text-xs">
                      แก้เพดานได้ที่หน้าหน่วยธุรกิจ
                    </span>
                  }
                >
                  <Link
                    to={`/business-units/${b.business_unit_id}/edit`}
                    className="shrink-0 text-primary hover:underline"
                  >
                    แก้เพดาน
                  </Link>
                </Can>
              </div>
            ))
          )}
        </div>

        {/* คำอธิบายนี้ขึ้นเสมอ ไม่ใช่ขึ้นเมื่อผลรวมไม่ตรงกับ cap (review I4): `cap` คือผลรวมของ
            **ทุก BU ที่ active ใน cluster** ไม่ว่าจะอยู่ในสัญญาใบนี้หรือไม่
            (`subscription.service.ts:700-706`) ส่วนรายการข้างบนคือเฉพาะ BU ในสัญญาใบนี้ — สอง
            จำนวนคนละแกนกัน สัญญาที่ครอบ BU บางส่วน (เหตุผลทั้งหมดที่ฟีเจอร์นี้มีอยู่) จึงมีผลรวม
            ไม่เท่า cap เป็นเรื่องปกติ ไม่ใช่ความผิดปกติที่ต้องเตือน */}
        <p className="text-xs text-muted-foreground">
          ที่นั่งเป็น pool ของทั้ง cluster — BU ที่ไม่อยู่ในสัญญานี้ก็สมทบเข้า pool ด้วย ผลรวมที่ซื้อของ
          รายการข้างบนจึงไม่จำเป็นต้องเท่ากับเพดานรวม ({cap})
        </p>
      </CardContent>
    </Card>
  );
}
