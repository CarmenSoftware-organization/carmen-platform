import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { sumActiveLicenses, licenseStatus, isExpiringSoon } from '../../utils/buLicense';
import { daysLeft } from '../licenses/licenseDates';
import { useI18n } from '../../hooks/useI18n';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import type { BusinessUnitLicense } from '../../types';

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
  now?: Date;
}

/**
 * สรุปที่นั่งของ BU — **อ่านอย่างเดียว** การออก/แก้/ลบใบย้ายไปที่ License Center ทั้งหมดแล้ว
 * เพื่อไม่ให้มีสองที่ที่เขียนของเดียวกันแล้วเพี้ยนจากกัน
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, clusterSeat, manageHref, now = new Date(),
}: BusinessUnitLicensesCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const soon = licenses.filter((l) => isExpiringSoon(l, thresholds.seat_days, now));
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
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
          {soon.map((l) => (
            <Badge key={l.id} variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>
          ))}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={manageHref}>{t('common.action.manageLicences')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {t('pages.businessUnits.seatsManagedInLicenseCenter')}
      </CardContent>
    </Card>
  );
}
