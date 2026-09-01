import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import { AuditMeta } from '../../../components/AuditMeta';
import businessUnitLicenseService from '../../../services/businessUnitLicenseService';
import type { SeatRow } from '../useClusterSeatLicenses';
import { LicenseCoverageBar, type CoverageInterval } from '../LicenseCoverageBar';
import { sumActiveLicenses, licenseStatus, isExpiringSoon, isMigratedPlaceholder } from '../../../utils/buLicense';
import { latestActor } from '../../../utils/audit';
import { getErrorDetail } from '../../../utils/errorParser';
import { isPerpetual, fmtDate, daysLeft, coverageWindow } from '../licenseDates';
import { useI18n } from '../../../hooks/useI18n';
import type { TKey } from '../../../i18n/types';
import type { BusinessUnitLicense, BuLicenseStatus } from '../../../types';

export interface SeatSectionProps {
  /** ผลของ `useClusterSeatLicenses` ที่เพจแม่ถือไว้ — section นี้ไม่ดึงข้อมูลเอง (ดู docblock) */
  rows: SeatRow[];
  loading: boolean;
  reload: () => void;
  canManage: boolean;
}

// Pure data + catalog keys, module scope — no `t` call here, matching the STATUS_VARIANT/
// STATUS_LABEL_KEYS split established in LicensePurchaseForm.tsx / PurchaseLicenseTable.tsx.
const STATUS_VARIANT: Record<BuLicenseStatus, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'secondary',
  expired: 'destructive',
};
const STATUS_LABEL_KEYS: Record<BuLicenseStatus, TKey> = {
  active: 'common.status.active',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};

/**
 * ลำดับความสำคัญของแถว BU — เรียงตาม "ความผิดปกติ" ไม่ใช่ตามตัวอักษร
 *
 * เรียงตามชื่อทำให้ BU ที่ไม่มีที่นั่งเลย (= เชิญผู้ใช้ใหม่ไม่ได้จริง ๆ ในระบบนี้) ลอยขึ้นไป
 * อยู่เหนือ BU ที่กำลังทำงานอยู่ได้ด้วยเหตุผลเดียวคือชื่อขึ้นต้นด้วยตัวอักษรที่มาก่อน — ในหน้าที่
 * ถูกเปิดเพื่อกวาดหาปัญหา ลำดับแบบนั้นคือการซ่อนคำตอบ
 */
const SEVERITY = { failed: 0, noSeats: 1, expiringSoon: 2, healthy: 3 } as const;

function severityOf(row: SeatRow, now: Date): number {
  if (row.failed) return SEVERITY.failed;
  if (sumActiveLicenses(row.licenses, now) === 0) return SEVERITY.noSeats;
  if (row.licenses.some((l) => isExpiringSoon(l, now))) return SEVERITY.expiringSoon;
  return SEVERITY.healthy;
}

/**
 * วันที่ที่นั่งของ BU นี้จะเริ่มหาย = ใบ active ที่หมดอายุ**ก่อนใคร** ไม่ใช่ใบที่หมดทีหลังสุด
 * ผลรวมที่นั่งจะลดลงในวันนั้น การแสดงใบที่ยาวที่สุดจะทำให้คนวางแผนช้าไปทั้งช่วง
 * (กติกาเดียวกับ `clusterAdmin/licenses/SeatsByBuTable.tsx` — ห้ามให้สองหน้าตอบคนละวัน)
 */
function earliestExpiry(row: SeatRow, now: Date): { date: string | null; soon: boolean } {
  const active = row.licenses.filter((l) => licenseStatus(l, now) === 'active' && !isPerpetual(l.end_date));
  if (active.length === 0) return { date: null, soon: false };
  const first = active.reduce((a, b) => (Date.parse(a.end_date) <= Date.parse(b.end_date) ? a : b));
  return { date: first.end_date, soon: isExpiringSoon(first, now) };
}

/**
 * ที่นั่งของทุก BU ใน cluster — **ตารางเดียว** ไม่ใช่การ์ดต่อ BU
 *
 * เดิมเป็นหนึ่งการ์ดต่อหนึ่ง BU (`SeatRowCard`) เพราะการ์ดแต่ละใบเรียก `useLicenseLedger` ของตัวเอง
 * และเรียก hook ในลูปไม่ได้ ตอนนี้ข้อมูลทั้งชุดมาจาก `useClusterSeatLicenses` ที่เพจแม่ถือไว้แล้ว
 * (แถบสรุปหัวหน้าต้องใช้ยอดรวมชุดเดียวกัน) เหตุผลเชิงเทคนิคข้อเดียวที่บังคับให้เป็นการ์ดจึงหายไป
 * เหลือแต่ต้นทุน: กรอบการ์ดใบละ ~100px และ EmptyState ขนาด hero ใบละ ~260px สำหรับ BU ที่มีข้อมูล
 * จริงแค่ประโยคเดียวว่า "ไม่มีใบที่นั่ง" — ที่ 2 BU หน้านี้ยาว 1,762px แล้ว ที่ 10 BU จะเกิน 5,000px
 *
 * ปุ่มเพิ่ม/แก้/ลบต่อใบยังอยู่ครบ (เหตุผลที่ `SeatsByBuTable` ของเชลล์ cluster-admin เคยอ้างว่า
 * หน้านี้ต้องเป็นการ์ด) — มันอยู่ในแถวหัวกลุ่มและแถวของใบตามลำดับ ไม่ต้องมีกรอบการ์ดมารองรับ
 *
 * **กติกาการนับ**: ที่นั่ง = ผลรวมของทุกใบที่ active (`sumActiveLicenses`) — คนละกติกากับโควตา BU
 * ที่เป็นใบชนะใบเดียว ห้ามลอกสูตรข้ามชั้น (ดู `utils/buLicense.ts` เทียบ `utils/clusterLicense.ts`)
 *
 * ยอดรวมของ cluster นับเฉพาะแถวที่โหลดสำเร็จ — แถวที่ล้ม (`row.failed`) ไม่ถูกนับเป็น 0 เพราะ
 * ในระบบนี้ 0 ที่นั่งแปลว่าเชิญผู้ใช้ใหม่ไม่ได้จริง (FSEG) การกลืน error เป็น 0 คือการโกหกผู้ใช้
 */
export function SeatSection({ rows, loading, reload, canManage }: SeatSectionProps) {
  const { t } = useI18n();
  const now = new Date();
  const nowMs = now.getTime();
  // แกนขยับได้แค่เมื่อข้ามเดือน — ผูก memo กับเดือนปัจจุบันแทนตัว `now` สดที่เปลี่ยนทุก render
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const window = useMemo(() => coverageWindow(now), [monthKey]);

  const [showExpired, setShowExpired] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ buId: string; lic: BusinessUnitLicense } | null>(null);
  const [saving, setSaving] = useState(false);

  const okRows = rows.filter((r) => !r.failed);
  const failedRows = rows.filter((r) => r.failed);
  const totalSeats = okRows.reduce((sum, r) => sum + sumActiveLicenses(r.licenses, now), 0);
  const expiredCount = okRows.reduce(
    (n, r) => n + r.licenses.filter((l) => licenseStatus(l, now) === 'expired').length, 0);

  // `now` สร้างใหม่ทุก render จึงไม่อยู่ใน deps โดยตั้งใจ — ลำดับแถวไม่ควรสลับเองระหว่างที่ผู้ใช้
  // กำลังอ่านอยู่ มันคำนวณใหม่เมื่อ `rows` เปลี่ยน (โหลดเสร็จ/ลบใบ) ซึ่งเป็นจังหวะที่ถูกต้อง
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    const d = severityOf(a, now) - severityOf(b, now);
    if (d !== 0) return d;
    return (a.bu.name || '').toLowerCase().localeCompare((b.bu.name || '').toLowerCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows]);

  // Two independent pluralizable counts (seats, business units) in one sentence — pick the
  // whole-sentence key that matches both, rather than composing translated fragments. See
  // en.ts for why (the noFeaturesAssignedToBu/ToThis "two whole sentences" precedent).
  const seatSummaryKey: TKey = totalSeats === 1
    ? (okRows.length === 1 ? 'pages.licenses.seatSummaryOneOne' : 'pages.licenses.seatSummaryOneMany')
    : (okRows.length === 1 ? 'pages.licenses.seatSummaryManyOne' : 'pages.licenses.seatSummaryManyMany');
  const seatSummaryFailedKey: TKey = failedRows.length === 1
    ? 'pages.licenses.seatSummaryFailedOne'
    : 'pages.licenses.seatSummaryFailedMany';

  const removeLicense = async () => {
    if (!removeTarget) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.delete(removeTarget.buId, removeTarget.lic.id);
      toast.success(t('pages.licenses.licenseRemoved'));
      reload();
    } catch (err) {
      toast.error(t('pages.licenses.removeLicenseFailedTitle'), { description: getErrorDetail(err, t) });
    } finally {
      setSaving(false);
      setRemoveTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('common.field.seats')}
          </CardTitle>
          <CardDescription>
            {loading && rows.length === 0 ? (
              t('common.busy.loadingEllipsis')
            ) : rows.length === 0 ? (
              t('pages.licenses.noBusinessUnitsSeatsDescription')
            ) : (
              <>
                {t(seatSummaryKey, { count: totalSeats, buCount: okRows.length })}
                {failedRows.length > 0 && t(seatSummaryFailedKey, { count: failedRows.length })}
              </>
            )}
          </CardDescription>
        </div>
        {expiredCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowExpired((v) => !v)}>
            {showExpired
              ? t('pages.licenses.hideExpired')
              : t('pages.licenses.showExpired', { count: expiredCount })}
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {loading && rows.length === 0 ? (
          <TableSkeleton columns={6} rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('common.state.noBusinessUnits')}
            description={t('pages.licenses.noBusinessUnitsSeatsDescription')}
          />
        ) : (
          <div className="overflow-x-auto">
            {/* ตรึงคอลัมน์ขวาสุดเฉพาะตอนที่มันเป็นปุ่มจริง — ไม่มีสิทธิ์จัดการ คอลัมน์ท้าย
                จะกลายเป็น Reference ซึ่งไม่ควรถูกตรึง */}
            <table className={`w-full text-sm [&_th]:whitespace-nowrap${canManage ? ' table-sticky-right [--sticky-right-bg:var(--card)]' : ''}`}>
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.field.seats')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.action.start')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.action.end')}</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">{t('common.status.label')}</th>
                  <th className="px-2 py-1.5 text-left">{t('common.field.reference')}</th>
                  {canManage && <th className="px-2 py-1.5" />}
                </tr>
              </thead>
              <tbody>
                {ordered.map((row) => (
                  <BuGroup
                    key={row.bu.id}
                    row={row}
                    now={now}
                    nowMs={nowMs}
                    window={window}
                    canManage={canManage}
                    showExpired={showExpired}
                    saving={saving}
                    onRetry={reload}
                    onRemove={(lic) => setRemoveTarget({ buId: row.bu.id, lic })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {canManage && (
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(o) => !o && setRemoveTarget(null)}
          title={t('pages.licenses.removeLicenseTitle')}
          description={t('pages.licenses.removeSeatDescription', { count: removeTarget?.lic.licensed_users ?? 0 })}
          confirmVariant="destructive"
          onConfirm={removeLicense}
        />
      )}
    </Card>
  );
}

/**
 * หนึ่ง BU = แถวหัวกลุ่มหนึ่งแถว (สรุป + แกนเวลา) แล้วตามด้วยใบของมันทีละแถว
 *
 * แถวหัวกลุ่มกิน colspan ทั้งแถวโดยตั้งใจ: มันตอบคนละคำถามกับคอลัมน์ของใบ (สรุปต่อ BU ไม่ใช่
 * รายละเอียดของใบใบหนึ่ง) การยัดมันลงคอลัมน์เดียวกันจะทำให้หัวคอลัมน์โกหกในครึ่งบนของทุกกลุ่ม
 *
 * BU ที่ไม่มีใบ = **แถวเดียว** ไม่ใช่ EmptyState ขนาด hero — ข้อมูลของมันคือประโยคเดียว
 */
function BuGroup({ row, now, nowMs, window, canManage, showExpired, saving, onRetry, onRemove }: {
  row: SeatRow;
  now: Date;
  nowMs: number;
  window: { start: number; end: number };
  canManage: boolean;
  showExpired: boolean;
  saving: boolean;
  onRetry: () => void;
  onRemove: (lic: BusinessUnitLicense) => void;
}) {
  const { t } = useI18n();

  // ป้ายเจ้าของที่ผู้ใช้อ่านออก — ต้องตรงกับ `ownerFromRow` ใน LicensePurchaseForm.tsx เป๊ะ
  // (`${code} - ${name}`) ไม่งั้นโหมดสร้างกับโหมดแก้จะโชว์ป้ายคนละแบบสำหรับใบเดียวกัน
  const addHref = `/licenses/seats/new?bu=${row.bu.id}&ownerLabel=${
    encodeURIComponent(`${row.bu.code} - ${row.bu.name}`)
  }`;

  const activeSeats = sumActiveLicenses(row.licenses, now);
  const activeCount = row.licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const visible = showExpired
    ? row.licenses
    : row.licenses.filter((l) => licenseStatus(l, now) !== 'expired');

  const intervals: CoverageInterval[] = row.licenses.map((l) => ({
    start: Date.parse(l.start_date),
    end: Date.parse(l.end_date),
    dim: licenseStatus(l, now) === 'expired',
  }));

  const { date: endsOn, soon } = earliestExpiry(row, now);
  const endsText = activeCount === 0
    ? t('pages.licenses.coverageNone')
    : endsOn === null
      ? t('common.state.noExpiry')
      : `${fmtDate(endsOn)} · ${t('common.state.daysLeft', { count: daysLeft(endsOn, now) })}`;

  return (
    <>
      {/* `--sticky-right-bg` ต้องตั้งซ้ำที่แถวนี้ ไม่งั้นเซลล์ที่ถูกตรึงขวาจะยังทาสี `--card`
          ทับพื้นของแถวหัวกลุ่ม กลายเป็นสี่เหลี่ยมขาวโผล่ท้ายแถบ (สัญญา CSS ที่ index.css:381 —
          ตัวแปรรับได้เฉพาะส่วนประกอบ HSL ดิบ จึงใช้ `--muted` เต็มค่า ไม่ใช่ `/40`) */}
      <tr className="bg-muted [--sticky-right-bg:var(--muted)] border-b">
        <td colSpan={5} className="px-2 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{row.bu.name}</span>
            <Badge variant="outline" className="text-xs font-normal">{row.bu.code}</Badge>

            {row.failed ? (
              <span className="text-destructive text-xs">{t('pages.licenses.seatCountUnavailable')}</span>
            ) : row.licenses.length === 0 ? (
              <span className="text-muted-foreground text-xs">{t('pages.licenses.seatsNoLicenseInline')}</span>
            ) : (
              <>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t(
                    activeSeats === 1
                      ? (activeCount === 1 ? 'pages.licenses.seatFromLicenseOneOne' : 'pages.licenses.seatFromLicenseOneMany')
                      : (activeCount === 1 ? 'pages.licenses.seatFromLicenseManyOne' : 'pages.licenses.seatFromLicenseManyMany'),
                    { count: activeSeats, activeCount },
                  )}
                </span>
                <LicenseCoverageBar
                  className="w-28 shrink-0 sm:w-36"
                  intervals={intervals}
                  windowStart={window.start}
                  windowEnd={window.end}
                  now={nowMs}
                  label={t('pages.licenses.coverageBarLabel', { text: endsText })}
                />
                <span className={`text-xs whitespace-nowrap tabular-nums ${soon ? 'text-warning' : 'text-muted-foreground'}`}>
                  {endsText}
                </span>
              </>
            )}
          </div>
        </td>
        {canManage && (
          <td className="px-2 py-2 text-right whitespace-nowrap">
            {row.failed ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('common.action.retry')}
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to={addHref}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pages.licenses.addSeatLicense')}
                </Link>
              </Button>
            )}
          </td>
        )}
      </tr>

      {visible.map((l) => {
        const status = licenseStatus(l, now);
        const latest = latestActor(l);
        return (
          <tr key={l.id} className="border-b last:border-0">
            <td className="px-2 py-1 pl-6 font-mono whitespace-nowrap tabular-nums">{l.licensed_users}</td>
            <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.start_date)}</td>
            <td className="px-2 py-1 whitespace-nowrap">
              {/* ใบ 2099 อ่านว่า "No expiry" เหมือนใบโควตา BU (ข้อตกลง §2 ข้อ 7) */}
              {isPerpetual(l.end_date) ? (
                <span className="text-muted-foreground">{t('common.state.noExpiry')}</span>
              ) : (
                <>
                  {fmtDate(l.end_date)}
                  {/* วันที่ดิบไม่บอกว่ามันไกลหรือใกล้ ผู้อ่านต้องลบเอง ทั้งที่ข้อมูลมีอยู่แล้ว */}
                  <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                    · {status === 'expired'
                      ? t('pages.licenses.expiredDaysAgo', { count: -daysLeft(l.end_date, now) })
                      : t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}
                  </span>
                </>
              )}
            </td>
            <td className="space-x-1 px-2 py-1 whitespace-nowrap">
              <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL_KEYS[status])}</Badge>
              {/* ป้าย [migrated] จาก isMigratedPlaceholder — คนละเรื่องกับ perpetual · ป้าย
                  "เหลือ n วัน" ถูกถอดออกจากตรงนี้แล้ว: คอลัมน์ End บอกจำนวนวันเดียวกันอยู่แล้ว
                  ทุกแถว การซ้ำที่นี่คือการพูดสองครั้งในแถวเดียว */}
              {isMigratedPlaceholder(l) && <Badge variant="warning">{t('pages.licenses.endDateRequiredBadge')}</Badge>}
            </td>
            <td className="text-muted-foreground max-w-[220px] px-2 py-1 text-xs">
              <div className="truncate" title={l.reference_no || undefined}>{l.reference_no || '-'}</div>
              <AuditMeta
                variant="compact"
                verbKey={latest?.verbKey}
                actor={latest?.actor}
                className="text-muted-foreground text-[11px]"
              />
            </td>
            {canManage && (
              <td className="px-2 py-1 text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/licenses/seats/${l.id}/edit`}>{t('common.action.edit')}</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onRemove(l)} disabled={saving}>
                  {t('common.action.remove')}
                </Button>
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}
