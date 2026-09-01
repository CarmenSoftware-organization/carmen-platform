import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, RefreshCw, Ticket } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import { AuditMeta } from '../../../components/AuditMeta';
import { LicenseCoverageBar, type CoverageInterval } from '../LicenseCoverageBar';
import { activeLicense, licenseStatus, isPerpetual, isExpiringSoon } from '../../../utils/clusterLicense';
import { latestActor } from '../../../utils/audit';
import { fmtDate, daysLeft, coverageWindow } from '../licenseDates';
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';
import { useI18n } from '../../../hooks/useI18n';
import { useExpiryThresholds } from '../../../context/ExpiryThresholdContext';
import type { TKey } from '../../../i18n/types';
import { isExpiringSoon as subExpiringSoon } from '../../../utils/subscriptionState';
import type { BusinessUnit, ClusterLicense, ClusterLicenseStatus, Subscription } from '../../../types';

export interface BuQuotaSectionProps {
  clusterId: string;
  /** ป้ายเจ้าของที่ผู้ใช้อ่านออก — ใช้ประกอบลิงก์ Add เท่านั้น (`?ownerLabel=`) ต้องตรงกับ
   *  `ownerFromRow` ใน LicensePurchaseForm.tsx เป๊ะ (`${code} - ${name}`) ไม่งั้นโหมดสร้างกับ
   *  โหมดแก้จะโชว์ป้ายคนละแบบสำหรับ cluster เดียวกัน */
  clusterCode: string;
  clusterName: string;
  /** ควบคุมทั้งปุ่ม Add/Edit/Remove — เพจแม่ (ClusterLicenseDetail) เป็นแหล่งความจริงเดียวของสิทธิ์นี้
   *  (มาจาก `subscription.manage`) จึงไม่ผูก `<Can>` ซ้ำที่นี่ ไม่งั้นจะมีสองแหล่งที่เพี้ยนจากกันได้ */
  canManage: boolean;
  /** จำนวน BU ที่ใช้ไปแล้วของ cluster — มาจาก `cluster.bu_used` (backend view) ที่เพจแม่โหลดมาแล้ว
   *  ไม่ใช่นับ `businessUnits.length` เองฝั่ง client (ต้องอ่านแหล่งเดียวกับ ClusterEdit.tsx และ
   *  ClusterLicenseTable.tsx ไม่งั้นสามหน้าจะแสดงเลขไม่ตรงกันเงียบ ๆ ถ้า backend กรอง/scope ต่างกัน) */
  buUsed: number;
  /** BU ทั้งหมดของ cluster (รวม inactive) — ใช้จัดอันดับ/ขึ้นป้าย Over limit ในตารางด้านล่าง
   *  ต้องเป็นลิสต์เต็ม ไม่ใช่ชุดที่กรอง/แบ่งหน้าแล้ว (ดูคอมเมนต์ของ `rankBusinessUnits`) */
  businessUnits: BusinessUnit[];
  /**
   * ทางอ่าน/ลบใบโควตาที่เพจแม่ถือไว้ (`useLicenseLedger(clusterId, clusterLicenseService)`)
   *
   * ยกขึ้นไปเพราะแถบสรุปหัวหน้า (`LicenseHealthStrip`) ต้องอ่านโควตาของใบที่ชนะจากชุดเดียวกัน
   * ถ้า section ยังดึงเอง เพจจะยิงคำขอชุดที่สองเพื่ออ่านสิ่งเดียวกัน แล้วสองที่จะเพี้ยนจากกัน
   * เงียบ ๆ ตอนหนึ่งในสองโหลดล้ม — ซึ่งเป็นเคสที่ตัวเลข "โควตา" ผิดพลาดแล้วอันตรายที่สุด
   */
  ledger: BuQuotaLedger;
  /**
   * สัญญาทั้งหมดของ cluster (จาก `useClusterSubscriptions` ที่เพจแม่ถือไว้) — ใช้วาดแกนเวลา
   * ของสัญญาในตารางอันดับ BU ด้านล่างเท่านั้น ไม่เกี่ยวกับใบโควตา
   */
  subscriptions: Subscription[];
  subscriptionsLoading: boolean;
  /** โหลดสัญญาไม่สำเร็จ — **ห้ามอ่านเป็น "BU นี้ไม่มีสัญญา"** ต้องขึ้นว่าไม่รู้ */
  subscriptionsFailed: boolean;
}

export interface BuQuotaLedger {
  licenses: ClusterLicense[];
  loading: boolean;
  saving: boolean;
  loadFailed: boolean;
  reload: () => void;
  remove: (id: string) => Promise<void>;
}

// Pure data + catalog keys, module scope — no `t` call here, matching the STATUS_VARIANT/
// STATUS_LABEL_KEYS split established in LicensePurchaseForm.tsx / PurchaseLicenseTable.tsx.
const STATUS_VARIANT: Record<ClusterLicenseStatus, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'secondary',
  expired: 'destructive',
};
const STATUS_LABEL_KEYS: Record<ClusterLicenseStatus, TKey> = {
  active: 'common.status.active',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};

/**
 * ส่วนอ่านใบซื้อโควตา BU ของ cluster (tb_cluster_license) — โควตาที่มีผลคือ **ใบที่ชนะใบเดียว**
 * (`activeLicense`) ไม่ใช่ผลรวมของทุกใบเหมือน User Licenses ของ BU ดังนั้นหัวการ์ดและตัวเลขทุกจุด
 * ในไฟล์นี้ต้องอ่านจากใบที่ชนะเท่านั้น ห้าม sum `licensed_bus` เด็ดขาด
 *
 * ข้อมูลใบมาจาก `ledger` ที่เพจแม่ถือไว้ (ดูคอมเมนต์ที่ prop นั้น) — ก่อนหน้านี้ section นี้ดึงเอง
 *
 * มีสองการ์ด: (1) รายการใบซื้อโควตาเดิม อ่านอย่างเดียว + ลิงก์ไปฟอร์มเต็มหน้า (Task 6) เพื่อ
 * สร้าง/แก้ (2) ตาราง BU พร้อมอันดับและป้าย Over limit — อันดับต้องตรงกับ DB view
 * `v_cluster_bu_quota` เป๊ะ (ผ่าน `rankBusinessUnits` ที่ใช้ร่วมกับ
 * `BusinessUnitsSection`/`BusinessUnitList`) ห้ามเรียงเอง
 */
export function BuQuotaSection({
  clusterId, clusterCode, clusterName, canManage, buUsed, businessUnits, ledger,
  subscriptions, subscriptionsLoading, subscriptionsFailed,
}: BuQuotaSectionProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const { licenses, loading, saving, loadFailed, reload, remove } = ledger;
  const now = new Date();
  const nowMs = now.getTime();
  // แกนขยับได้แค่เมื่อข้ามเดือน — ผูก memo กับเดือนปัจจุบันแทนตัว `now` สดที่เปลี่ยนทุก render
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const window = useMemo(() => coverageWindow(now), [monthKey]);

  const [showExpired, setShowExpired] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ClusterLicense | null>(null);

  // ใบที่ชนะ — ตัวเดียวกับที่ backend ใช้ตัดสิน ไม่ใช่ "ใบล่าสุดในรายการ"
  const winning = activeLicense(licenses, now);
  const expired = licenses.filter((l) => licenseStatus(l, now) === 'expired');
  const visible = showExpired ? licenses : licenses.filter((l) => licenseStatus(l, now) !== 'expired');

  // ต่อ `&ownerLabel=` เฉพาะตอนมีทั้งสองส่วนจริง — ตอน cluster ยังโหลดไม่เสร็จ ClusterLicenseDetail
  // ส่ง clusterCode/clusterName มาเป็น `''` ทั้งคู่ (`cluster?.code ?? ''`) ถ้ายัง encode ต่อท้ายอยู่ดี
  // จะได้ ownerLabel เป็น `" - "` ซึ่ง **truthy** แล้วไปบัง fallback ที่ฟอร์มปลายทางตั้งใจไว้
  // (`ownerText = ownerLabel || ownerId`) ผู้ใช้จะเห็น " - " แทนที่จะเห็น cluster id ดิบที่ยังอ่านได้
  const addHref = clusterCode && clusterName
    ? `/licenses/bu-quota/new?cluster=${clusterId}&ownerLabel=${
        encodeURIComponent(`${clusterCode} - ${clusterName}`)
      }`
    : `/licenses/bu-quota/new?cluster=${clusterId}`;

  // จัดอันดับต้องตรงกับ DB view เป๊ะ (utils/businessUnitRank.ts) — ranked over the FULL list,
  // never a filtered subset, so the badge lands on the same BU the backend would 403.
  const ranked = useMemo(() => rankBusinessUnits(businessUnits), [businessUnits]);
  // cap = 0 เมื่อไม่มีใบที่ชนะ ("ไม่มีใบคุ้มครอง") ไม่ใช่ "ไม่จำกัด" — ต่างจาก countOverLimit
  // ที่ตัวมันเองรับ `null` แปลว่า unenforced; ที่นี่คือ 0 จริง ๆ ดังนั้นทุก BU จะขึ้น Over limit ·
  // ข้อยกเว้นเดียวคือตอนโหลดใบล้ม (`loadFailed`) — ตอนนั้น `licenses` ว่างเพราะ error ไม่ใช่เพราะ
  // ไม่มีใบจริง ส่ง `null` ให้ countOverLimit อ่านว่า unenforced (review Important #2: cap ที่คำนวณ
  // จากข้อมูลที่โหลดไม่ได้ ไม่ใช่ข้อเท็จจริง ห้ามขึ้นป้าย Over limit จากมัน)
  const cap = loadFailed ? null : (winning?.licensed_bus ?? 0);
  const overCount = useMemo(() => countOverLimit(ranked, cap), [ranked, cap]);

  /**
   * สัญญาแยกตาม BU — join ด้วย `bu_code` เพราะ `Subscription` **ไม่มี** `business_unit_id`
   * บนสาย (มีแค่ `bu_code`/`bu_name`) รหัส BU ไม่ซ้ำกันภายใน cluster เดียว การ join จึงปลอดภัย
   * ที่นี่ · `bu_code` ว่าง = ข้อมูลผิดรูปจากยุคก่อน migration ทิ้งไปไม่ให้ไปเกาะ BU ผิดตัว
   */
  const subsByBuCode = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    for (const sub of subscriptions) {
      if (!sub.bu_code) continue;
      const list = map.get(sub.bu_code);
      if (list) list.push(sub); else map.set(sub.bu_code, [sub]);
    }
    return map;
  }, [subscriptions]);

  // ใบที่ไม่ชนะจะถูกวาดจาง — โควตาที่มีผลคือใบเดียว แต่ช่วงเวลาของใบอื่นยังเป็นข้อเท็จจริงที่
  // อธิบายว่าทำไมช่วงนี้ถึงมี/ไม่มีความคุ้มครอง (`activeLicense` ตัดสินว่าใบไหนชนะ ไม่ใช่แถบนี้)
  const quotaIntervals = useMemo<CoverageInterval[]>(() => licenses.map((l) => ({
    start: Date.parse(l.start_date),
    end: Date.parse(l.end_date),
    dim: l.id !== winning?.id,
  })), [licenses, winning?.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              {t('pages.licenses.buQuotaCardTitle')}
            </CardTitle>
            <CardDescription>
              {loadFailed
                ? t('pages.licenses.buQuotaLoadFailedDescription')
                : winning
                ? t(isPerpetual(winning.end_date) ? 'pages.licenses.quotaNoExpiry' : 'pages.licenses.quotaExpires', {
                    count: winning.licensed_bus,
                    date: fmtDate(winning.end_date),
                  })
                : t('pages.licenses.noLicenseInForce')}
            </CardDescription>
            {loadFailed && (
              <p className="text-xs text-destructive">
                {t('pages.licenses.buQuotaLoadFailedBanner')}
              </p>
            )}
            {!loadFailed && licenses.length > 0 && (
              <div className="flex max-w-sm items-center gap-2 pt-0.5">
                <LicenseCoverageBar
                  className="w-32 shrink-0 sm:w-44"
                  intervals={quotaIntervals}
                  windowStart={window.start}
                  windowEnd={window.end}
                  now={nowMs}
                  label={t('pages.licenses.coverageBarLabel', {
                    text: winning
                      ? (isPerpetual(winning.end_date)
                          ? t('common.state.noExpiry')
                          : fmtDate(winning.end_date))
                      : t('pages.licenses.coverageNone'),
                  })}
                />
                {/* ช่องว่างบนแกนคือช่วงที่ cluster ไม่มีใบโควตาคุ้มครอง — ตารางวันที่ด้านล่าง
                    ไม่มีทางแสดงเรื่องนี้ได้เลยถ้าใบมีมากกว่าหนึ่งใบ */}
                <span className="text-muted-foreground text-[11px] whitespace-nowrap tabular-nums">
                  {winning
                    ? (isPerpetual(winning.end_date)
                        ? t('common.state.noExpiry')
                        : `${fmtDate(winning.end_date)} · ${t('common.state.daysLeft', { count: daysLeft(winning.end_date, now) })}`)
                    : t('pages.licenses.coverageNone')}
                </span>
              </div>
            )}
            {winning && (
              <p className="text-xs text-muted-foreground">
                {t('pages.licenses.businessUnitsInUse', { used: buUsed, total: winning.licensed_bus })}
                {buUsed > winning.licensed_bus && (
                  <span className="ml-2 text-destructive">
                    {t('pages.licenses.overLimitReadOnly', { count: buUsed - winning.licensed_bus })}
                  </span>
                )}
              </p>
            )}
          </div>
          {canManage && !loadFailed && (
            <Button asChild size="sm">
              <Link to={addHref}>
                <Plus className="mr-2 h-4 w-4" />
                {t('pages.licenses.addBuQuotaLicense')}
              </Link>
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {loadFailed ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t('pages.licenses.buQuotaDataUnavailable')}
              </p>
              <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {t('common.action.retry')}
              </Button>
            </div>
          ) : loading && licenses.length === 0 ? (
            <TableSkeleton columns={6} rows={3} />
          ) : licenses.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={t('pages.licenses.noLicensesYetTitle')}
              description={t('pages.licenses.noBuQuotaLicenseDescription')}
              action={
                canManage ? (
                  <Button asChild size="sm">
                    <Link to={addHref}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('pages.licenses.addBuQuotaLicense')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              {/* ตรึงคอลัมน์ขวาสุดเฉพาะตอนที่มันเป็นปุ่มจริง — ไม่มีสิทธิ์จัดการ คอลัมน์ท้าย
                  จะกลายเป็น Note ซึ่งไม่ควรถูกตรึง ตารางอันดับด้านล่างลงท้ายด้วยตัวเลข
                  จึงไม่ใส่คลาสนี้ */}
              <table className={`w-full text-sm [&_th]:whitespace-nowrap${canManage ? ' table-sticky-right [--sticky-right-bg:var(--card)]' : ''}`}>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('pages.licenses.quotaColumn')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.action.start')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.action.end')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.status.label')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.field.reference')}</th>
                    <th className="text-left px-2 py-1">{t('common.field.note')}</th>
                    {canManage && <th className="px-2 py-1" />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((l) => {
                    const status = licenseStatus(l, now);
                    const latest = latestActor(l);
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{l.licensed_bus}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {isPerpetual(l.end_date) ? (
                            <span className="text-muted-foreground">{t('common.state.noExpiry')}</span>
                          ) : (
                            <>
                              {fmtDate(l.end_date)}
                              {/* วันที่ดิบไม่บอกว่าไกลหรือใกล้ ผู้อ่านต้องลบเอง ทั้งที่ข้อมูลมีอยู่แล้ว */}
                              <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                                · {status === 'expired'
                                  ? t('pages.licenses.expiredDaysAgo', { count: -daysLeft(l.end_date, now) })
                                  : t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1 space-x-1 whitespace-nowrap">
                          <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL_KEYS[status])}</Badge>
                          {isExpiringSoon(l, thresholds.bu_quota_days, now) && (
                            <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 text-xs text-muted-foreground">{l.reference_no || '-'}</td>
                        <td className="px-2 py-1 text-xs text-muted-foreground max-w-[200px]">
                          <div className="truncate" title={l.note || undefined}>{l.note || '-'}</div>
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
                              <Link to={`/licenses/bu-quota/${l.id}/edit`}>{t('common.action.edit')}</Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveTarget(l)}
                              disabled={saving}
                            >
                              {t('common.action.remove')}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {expired.length > 0 && !showExpired && (
            <Button variant="ghost" size="sm" onClick={() => setShowExpired(true)}>
              {t('pages.licenses.showExpired', { count: expired.length })}
            </Button>
          )}
        </CardContent>

        {canManage && (
          <ConfirmDialog
            open={!!removeTarget}
            onOpenChange={(o) => !o && setRemoveTarget(null)}
            title={t('pages.licenses.removeLicenseTitle')}
            description={t('pages.licenses.removeBuQuotaDescription', { count: removeTarget?.licensed_bus ?? 0 })}
            confirmVariant="destructive"
            onConfirm={async () => {
              if (removeTarget) await remove(removeTarget.id);
              setRemoveTarget(null);
            }}
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            {t('common.label.businessUnitsLabel')}
          </CardTitle>
          <CardDescription>
            {loadFailed
              ? t('pages.licenses.buRankQuotaUnavailable')
              : overCount > 0
              ? t(overCount === 1 ? 'pages.licenses.overLimitCountOne' : 'pages.licenses.overLimitCountMany', { count: overCount, cap: cap ?? 0 })
              : t('pages.licenses.rankedExplanation')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {businessUnits.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('common.state.noBusinessUnitsInCluster')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_th]:whitespace-nowrap">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('pages.licenses.rankColumn')}</th>
                    <th className="text-left px-2 py-1">{t('entity.businessUnit.title')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.status.label')}</th>
                    {/* สองคอลัมน์นี้พูดถึง **สัญญา** ของ BU ไม่ใช่ใบโควตา — หัวคอลัมน์จึงตั้งชื่อ
                        ด้วยคำว่า Subscription ให้ชัด ไม่ใช่ "Coverage" ลอย ๆ ที่อ่านได้สองทาง */}
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('entity.subscription.title')}</th>
                    <th className="text-left px-2 py-1 whitespace-nowrap">{t('common.action.end')}</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {[...businessUnits]
                    .sort((a, b) => (ranked.get(a.id) ?? 0) - (ranked.get(b.id) ?? 0))
                    .map((bu) => {
                      const rank = ranked.get(bu.id) ?? 0;
                      // cap === null เมื่อโหลดใบล้ม (`loadFailed`) — ต้องเช็คก่อนเทียบเสมอ ไม่งั้น
                      // `rank > null` จะถูกบังคับเป็น `rank > 0` แล้วขึ้น Over limit ทุกแถวผิด ๆ
                      const over = cap !== null && rank > cap;
                      return (
                        <tr key={bu.id} className="border-b last:border-0">
                          <td className="px-2 py-1 font-mono whitespace-nowrap">{rank}</td>
                          <td className="px-2 py-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{bu.name}</span>
                              <Badge variant="outline" className="text-xs">{bu.code}</Badge>
                            </div>
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            <Badge variant={bu.is_active ? 'success' : 'secondary'} className="text-xs">
                              {bu.is_active ? t('common.status.active') : t('common.status.inactive')}
                            </Badge>
                          </td>
                          <BuSubscriptionCells
                            subs={subsByBuCode.get(bu.code) ?? []}
                            now={now}
                            nowMs={nowMs}
                            window={window}
                            loading={subscriptionsLoading && subscriptions.length === 0}
                            failed={subscriptionsFailed}
                          />
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {over && (
                              <Badge
                                variant="destructive"
                                className="text-xs"
                                title={t('pages.licenses.overLimitTitle', { cap: cap ?? 0, rank })}
                              >
                                {t('pages.licenses.overLimitBadge')}
                              </Badge>
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
    </div>
  );
}

/**
 * สองเซลล์ของ "สัญญาที่มีผลของ BU นี้" — แกนเวลา + วันจบพร้อมจำนวนวันที่เหลือ
 *
 * ช่วงที่วาดทึบคือสัญญา **ที่ active เท่านั้น** สัญญาที่หมดอายุ/หยุดใช้ยังวาดไว้แบบจางเพราะมัน
 * อธิบายว่าช่องว่างบนแกนเกิดจากอะไร แต่ต้องไม่ถูกอ่านว่าเป็นความคุ้มครองที่ยังใช้ได้
 *
 * วันจบที่แสดง = สัญญา active ที่จบ **ช้าที่สุด** — ต่างจากกติกาของที่นั่ง (`SeatSection` ใช้
 * "เร็วที่สุด") โดยตั้งใจ เพราะสองอย่างนี้ตอบคนละคำถาม: ที่นั่งเป็นผลรวมที่จะ **ลดลง** ทันทีที่
 * ใบแรกหมด ส่วนสัญญาเป็นสิทธิ์ใช้งานที่ยัง **มีอยู่** ตราบใดที่ยังมีใบ active สักใบคุ้มอยู่
 *
 * `failed` ต้องมาก่อน `subs.length === 0` เสมอ — "โหลดไม่ได้" กับ "ไม่มีสัญญา" นำไปสู่การ
 * ตัดสินใจคนละอย่าง และอันหลังคือสิ่งที่ทำให้คนไปสร้างสัญญาซ้ำ
 */
function BuSubscriptionCells({ subs, now, nowMs, window, loading, failed }: {
  subs: Subscription[];
  now: Date;
  nowMs: number;
  window: { start: number; end: number };
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();

  if (failed || loading) {
    const text = failed ? t('pages.licenses.healthUnavailableShort') : t('common.busy.loadingEllipsis');
    return (
      <>
        <td className="text-muted-foreground px-2 py-1 text-xs">{text}</td>
        <td className="text-muted-foreground px-2 py-1 text-xs whitespace-nowrap">—</td>
      </>
    );
  }

  const active = subs.filter((s) => s.state === 'active');
  const endsOn = active.length === 0
    ? null
    : active.reduce((a, b) => (Date.parse(a.end_date) >= Date.parse(b.end_date) ? a : b)).end_date;
  const soon = endsOn !== null && active.some((s) => subExpiringSoon(s.state, s.end_date, thresholds.subscription_days) && s.end_date === endsOn);

  if (subs.length === 0) {
    return (
      <>
        <td className="text-muted-foreground px-2 py-1 text-xs">{t('pages.licenses.noActiveSubscription')}</td>
        <td className="text-muted-foreground px-2 py-1 text-xs whitespace-nowrap">—</td>
      </>
    );
  }

  const endsText = endsOn === null
    ? t('pages.licenses.noActiveSubscription')
    : `${fmtDate(endsOn)} · ${t('common.state.daysLeft', { count: daysLeft(endsOn, now) })}`;

  return (
    <>
      <td className="px-2 py-1">
        <LicenseCoverageBar
          className="w-24 sm:w-32"
          intervals={subs.map((s) => ({
            start: Date.parse(s.start_date),
            end: Date.parse(s.end_date),
            dim: s.state !== 'active',
          }))}
          windowStart={window.start}
          windowEnd={window.end}
          now={nowMs}
          label={t('pages.licenses.coverageBarLabel', { text: endsText })}
        />
      </td>
      <td className={`px-2 py-1 text-xs whitespace-nowrap tabular-nums ${soon ? 'text-warning' : 'text-muted-foreground'}`}>
        {endsText}
      </td>
    </>
  );
}
