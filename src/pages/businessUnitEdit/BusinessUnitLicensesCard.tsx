import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { sumActiveLicenses, licenseStatus, isExpiringSoon } from '../../utils/buLicense';
import { daysLeft, fmtDate } from '../licenses/licenseDates';
import { useI18n } from '../../hooks/useI18n';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import type { BusinessUnitLicense, Subscription } from '../../types';
import type { BusinessUnitSubscriptions } from './useBusinessUnitSubscriptions';
import { LicenseTimeline, useCoverageWindow } from './LicenseTimeline';

interface BusinessUnitLicensesCardProps {
  licenses: BusinessUnitLicense[];
  loading: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ */
  clusterSeat?: { used: number; cap: number };
  /**
   * ปลายทางของปุ่ม "Manage licences" — **ผู้เรียกเป็นคนตัดสิน ห้ามการ์ดประกอบ URL เอง**
   * การ์ดนี้ถูกใช้สอง shell และ cluster admin ไม่มี `subscription.read` จึงเข้า `/licenses/*` ไม่ได้
   */
  manageHref: string;
  /**
   * ปลายทางของปุ่ม "New subscription" — **ผู้เรียกเป็นคนตัดสินเช่นเดียวกับ `manageHref`**
   * ไม่ส่งมา = ไม่มีปุ่ม ซึ่งเป็นค่าตั้งต้นโดยเจตนา: การ์ดนี้ถูกใช้สอง shell และ cluster admin
   * ไม่มี `subscription.manage` จึงผ่าน `PrivateRoute` ของ `/licenses/subscriptions/new` ไม่ได้
   * ผู้เรียกที่ส่งค่านี้ต้องครอบด้วย `<Can permission="subscription.manage">` เองด้วย
   */
  createHref?: string;
  /**
   * สัญญา (subscription) ที่ออกให้ BU นี้ — **ไม่ส่งมา = ไม่มีรายการ** เหลือแค่สรุปที่นั่งเหมือนเดิม
   * ผู้เรียกฝั่ง platform ส่งจาก `useBusinessUnitSubscriptions` ซึ่งยิงคำขอเฉพาะเมื่อมี
   * `subscription.read` · shell ของ cluster admin ไม่มีสิทธิ์นั้นและเข้า `/licenses/subscriptions/*`
   * ไม่ได้ จึงไม่ส่งมา — แต่ละแถวมีลิงก์ไปหน้าสัญญานั้น
   */
  subscriptions?: BusinessUnitSubscriptions;
  now?: Date;
}

const stateVariant = (s: Subscription['state']) =>
  s === 'active' ? 'success' : s === 'expired' ? 'destructive' : 'secondary';

/**
 * สรุปที่นั่งของ BU — **อ่านอย่างเดียว** การออก/แก้/ลบใบย้ายไปที่ License Center ทั้งหมดแล้ว
 * เพื่อไม่ให้มีสองที่ที่เขียนของเดียวกันแล้วเพี้ยนจากกัน
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, clusterSeat, manageHref, createHref, subscriptions, now = new Date(),
}: BusinessUnitLicensesCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const soonMs = thresholds.subscription_days * 24 * 60 * 60 * 1000;
  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const soon = licenses.filter((l) => isExpiringSoon(l, thresholds.seat_days, now));
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;
  const window = useCoverageWindow(now);
  const subItems = subscriptions?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold">{t('pages.businessUnits.userLicensesTitle')}</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground">{t('common.busy.loadingEllipsis')}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {activeCount === 1
                ? t('pages.businessUnits.seatsFromActiveLicenseOne', { count: activeSeats, activeCount })
                : t('pages.businessUnits.seatsFromActiveLicenseMany', { count: activeSeats, activeCount })}
            </p>
          )}
          {clusterSeat && (
            <p className={`text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              {t('pages.businessUnits.clusterPoolSeatsUsed', { used: clusterSeat.used, cap: clusterSeat.cap })}
            </p>
          )}
          {/* แกนเวลาของทุกสัญญาในการ์ด — ช่องโหว่/การทับซ้อนระหว่างใบมองเห็นได้ทันที
              ขึ้นเฉพาะเมื่อมีรายการ: shell ของ cluster admin ไม่ส่ง `subscriptions` มา */}
          {subscriptions && !subscriptions.loading && subItems.length > 0 && (
            <LicenseTimeline
              variant="group"
              items={subItems.map((sub) => ({ start_date: sub.start_date, end_date: sub.end_date, live: sub.state === 'active' }))}
              window={window}
              now={now}
            />
          )}
          {soon.map((l) => (
            <Badge key={l.id} variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to={manageHref}>{t('common.action.manageLicences')}</Link>
          </Button>
          {createHref && (
            <Button asChild size="sm">
              <Link to={createHref}>
                <Plus className="mr-2 h-4 w-4" />
                {t('common.action.newSubscription')}
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {subscriptions ? (
          <>
            {subscriptions.loading && (
              <p className="text-muted-foreground text-xs" role="status">{t('common.busy.loadingEllipsis')}</p>
            )}
            {!subscriptions.loading && subscriptions.failed && (
              <p className="text-destructive text-xs">{t('pages.businessUnits.subscriptionsLoadFailed')}</p>
            )}
            {!subscriptions.loading && !subscriptions.failed && subscriptions.items.length === 0 && (
              <p className="text-muted-foreground text-xs">{t('pages.businessUnits.noSubscriptions')}</p>
            )}
            {subscriptions.items.map((sub) => {
              const left = new Date(sub.end_date).getTime() - now.getTime();
              // ป้ายนับถอยหลังขึ้นเฉพาะสัญญาที่ยังใช้ได้ — ใบที่หมด/ปิดแล้วไม่มีอะไรให้นับ
              const soon = sub.state === 'active' && left <= soonMs;
              return (
                /* ทั้งแถวเป็นลิงก์ไปหน้าสัญญา ไม่ใช่แค่เลขที่ — เป้ากดกว้างกว่าและตรงกับที่ผู้ใช้คาด
                   จากแถวรายการ · ยังเป็น <a> จริงจึงเปิดแท็บใหม่/คลิกกลางได้ */
                <Link
                  key={sub.id}
                  to={`/licenses/subscriptions/${sub.id}/edit`}
                  aria-label={t('pages.businessUnits.openSubscription', { number: sub.subscription_number })}
                  className="group flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-mono group-hover:underline">{sub.subscription_number}</div>
                    <div className="text-muted-foreground">
                      {fmtDate(sub.start_date)} – {fmtDate(sub.end_date)}
                      {' · '}
                      {/* ไม่โชว์ที่นั่งรายแถว: `seat_used/seat_cap` ของสัญญาคือพูลระดับ cluster ซึ่งขึ้นเป็น
                          บรรทัด "Cluster pool" บนหัวการ์ดอยู่แล้ว ซ้ำทุกแถวจะอ่านผิดว่าเป็นของใบนั้น */}
                      {sub.feature_count === 1
                        ? t('pages.businessUnits.subscriptionRowOne', { count: sub.feature_count })
                        : t('pages.businessUnits.subscriptionRowMany', { count: sub.feature_count })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LicenseTimeline
                      variant="item"
                      items={[{ start_date: sub.start_date, end_date: sub.end_date, live: sub.state === 'active' }]}
                      window={window}
                      now={now}
                      label={t('pages.licenses.coverageBarLabel', { text: `${fmtDate(sub.start_date)} – ${fmtDate(sub.end_date)}` })}
                    />
                    {soon && <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(sub.end_date, now) })}</Badge>}
                    <Badge variant={stateVariant(sub.state)}>{t(`common.status.${sub.state}`)}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{t('pages.businessUnits.seatsManagedInLicenseCenter')}</p>
        )}
      </CardContent>
    </Card>
  );
}
