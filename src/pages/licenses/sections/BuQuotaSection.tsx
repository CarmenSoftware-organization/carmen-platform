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
import clusterLicenseService from '../../../services/clusterLicenseService';
import { useLicenseLedger } from '../useLicenseLedger';
import { activeLicense, licenseStatus, isPerpetual, isExpiringSoon } from '../../../utils/clusterLicense';
import { latestActor } from '../../../utils/audit';
import { fmtDate, daysLeft } from '../licenseDates';
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';
import { useI18n } from '../../../hooks/useI18n';
import type { TKey } from '../../../i18n/types';
import type { BusinessUnit, ClusterLicense, ClusterLicenseStatus } from '../../../types';

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
 * ดึงข้อมูลเอง (เหมือน `SubscriptionSection`) แทนที่จะรับ props จากเพจแม่เหมือน
 * `BusinessUnitLicensesCard` — เพจแม่ส่งแค่ `clusterId` + `canManage` + `businessUnits`
 *
 * มีสองการ์ด: (1) รายการใบซื้อโควตาเดิม อ่านอย่างเดียว + ลิงก์ไปฟอร์มเต็มหน้า (Task 6) เพื่อ
 * สร้าง/แก้ (2) ตาราง BU พร้อมอันดับและป้าย Over limit — อันดับต้องตรงกับ DB view
 * `v_cluster_bu_quota` เป๊ะ (ผ่าน `rankBusinessUnits` ที่ใช้ร่วมกับ
 * `BusinessUnitsSection`/`BusinessUnitList`) ห้ามเรียงเอง
 */
export function BuQuotaSection({ clusterId, clusterCode, clusterName, canManage, buUsed, businessUnits }: BuQuotaSectionProps) {
  const { t } = useI18n();
  const { licenses, loading, saving, loadFailed, reload, remove } =
    useLicenseLedger<ClusterLicense>(clusterId, clusterLicenseService);
  const now = new Date();

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
                          {isPerpetual(l.end_date) ? <span className="text-muted-foreground">{t('common.state.noExpiry')}</span> : fmtDate(l.end_date)}
                        </td>
                        <td className="px-2 py-1 space-x-1 whitespace-nowrap">
                          <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL_KEYS[status])}</Badge>
                          {isExpiringSoon(l, now) && (
                            <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 text-xs text-muted-foreground">{l.reference_no || '-'}</td>
                        <td className="px-2 py-1 text-xs text-muted-foreground max-w-[200px]">
                          <div className="truncate" title={l.note || undefined}>{l.note || '-'}</div>
                          <AuditMeta
                            variant="compact"
                            verb={latest?.verb}
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
