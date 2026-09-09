import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { daysLeft, fmtDate } from '../licenses/licenseDates';
import { useI18n } from '../../hooks/useI18n';
import { LicenseTimeline, useCoverageWindow } from './LicenseTimeline';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import type { InterfaceLicense } from '../../types';

interface BusinessUnitInterfaceLicensesCardProps {
  licenses: InterfaceLicense[];
  loading: boolean;
  /** ปุ่ม "จัดการ" — ผู้เรียกตัดสิน URL เหมือน BusinessUnitLicensesCard (cluster admin เข้า /licenses ไม่ได้) */
  manageHref: string;
  /** ปุ่มออกใบใหม่ — ไม่ส่ง = ไม่มีปุ่ม ผู้เรียกครอบสิทธิ์ subscription.manage เอง */
  createHref?: string;
  /**
   * ปลายทางเมื่อกดแถวใบหนึ่ง — ผู้เรียกตัดสิน URL เช่นเดียวกับ `manageHref` (route
   * `/licenses/interface/:id/edit` บังคับ `subscription.read`) ไม่ส่ง = แถวไม่เป็นลิงก์
   */
  editHref?: (id: string) => string;
  now?: Date;
}

/**
 * สรุปใบสิทธิ์ interface ของ BU — **สถานะทุกป้ายมาจาก backend** (`state`/`in_force`/`contract_state`)
 * การ์ดนี้ห้ามคำนวณจากวันที่เอง: ใบที่วันยังไม่หมดแต่ `in_force=false` คือ "ถูกครอบด้วยสัญญาหลัก"
 * ซึ่งเป็นจุดที่หน้าจอโกหกได้ง่ายที่สุดในดีไซน์นี้ (สเปก §5.4)
 */
export default function BusinessUnitInterfaceLicensesCard({
  licenses,
  loading,
  manageHref,
  createHref,
  editHref,
  now = new Date(),
}: BusinessUnitInterfaceLicensesCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const inForce = licenses.filter((l) => l.in_force);
  // ใบที่ช่วงวันที่ยัง active แต่ backend บอกว่าใช้ไม่ได้ = ถูกครอบด้วยสัญญาหลัก
  const capped = licenses.filter((l) => l.state === 'active' && !l.in_force);
  const soonMs = thresholds.interface_days * 24 * 60 * 60 * 1000;
  const window = useCoverageWindow(now);
  const toItem = (l: InterfaceLicense) => ({ start_date: l.start_date, end_date: l.end_date, live: l.in_force });

  const badgeOf = (l: InterfaceLicense) => {
    if (l.in_force) return <Badge variant="success">{t('common.status.active')}</Badge>;
    if (l.state === 'active') return <Badge variant="warning">{t('pages.businessUnits.interfaceCapped')}</Badge>;
    if (l.state === 'scheduled') return <Badge variant="secondary">{t('common.status.scheduled')}</Badge>;
    return <Badge variant="destructive">{t('common.status.expired')}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold">{t('pages.businessUnits.interfaceLicensesTitle')}</h3>
          <p className="text-muted-foreground text-xs">
            {loading
              ? t('common.busy.loadingEllipsis')
              : t('pages.businessUnits.interfaceInForceCount', { count: inForce.length, total: licenses.length })}
          </p>
          {!loading && licenses.length > 0 && (
            <LicenseTimeline variant="group" items={licenses.map(toItem)} window={window} now={now} />
          )}
          {capped.length > 0 && (
            <p className="text-warning text-xs">
              {t('pages.businessUnits.interfaceCappedHint', {
                state: t(`common.status.${capped[0].contract_state}`),
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to={manageHref}>{t('common.action.manageLicences')}</Link>
          </Button>
          {createHref && (
            <Button asChild size="sm">
              <Link to={createHref}>
                <Plus className="mr-2 h-4 w-4" />
                {t('pages.licenses.addInterfaceLicense')}
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!loading && licenses.length === 0 && (
          <p className="text-muted-foreground text-xs">{t('pages.businessUnits.noInterfaceLicenses')}</p>
        )}
        {licenses.map((l) => {
          const left = new Date(l.end_date).getTime() - now.getTime();
          // ป้าย "เหลืออีกกี่วัน" ขึ้นเฉพาะใบที่ใช้ได้จริง — ใบที่ถูกครอบอยู่แล้วไม่มีอะไรให้นับถอยหลัง
          const soon = l.in_force && left <= soonMs;
          const rowClass = 'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs';
          const body = (
            <>
              <div className="min-w-0 space-y-0.5">
                {/* อ่าน `group` แบบกันพลาดเหมือนที่ตาราง/ฟอร์มทำ — endpoint ราย BU อาจไม่ pack
                    `group` มาให้สักแถว แล้ว map ทั้งก้อนจะ throw ตอน render ทำให้แท็บ Licenses
                    ทั้งแท็บขาวทั้งหน้า ไม่ใช่แค่แถวเดียวหาย */}
                <div className="font-mono">
                  {l.group?.code ?? l.license_feature_group_id}{' '}
                  <span className={editHref ? 'text-muted-foreground group-hover:underline' : 'text-muted-foreground'}>
                    · {l.license_number}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {l.group?.name ?? ''} · {fmtDate(l.start_date)} – {fmtDate(l.end_date)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LicenseTimeline
                  variant="item"
                  items={[toItem(l)]}
                  window={window}
                  now={now}
                  label={t('pages.licenses.coverageBarLabel', { text: `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)}` })}
                />
                {soon && <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>}
                {badgeOf(l)}
                {editHref && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                )}
              </div>
            </>
          );
          // ทั้งแถวเป็นลิงก์ (ไม่ใช่แค่เลขที่) รูปเดียวกับแถวสัญญาใน BusinessUnitLicensesCard —
          // ยังเป็น <a> จริงจึงเปิดแท็บใหม่/คลิกกลางได้
          return editHref ? (
            <Link
              key={l.id}
              to={editHref(l.id)}
              aria-label={t('pages.businessUnits.openInterfaceLicense', { number: l.license_number })}
              className={`group ${rowClass} transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              {body}
            </Link>
          ) : (
            <div key={l.id} className={rowClass}>{body}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
