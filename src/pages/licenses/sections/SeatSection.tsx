import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import { AuditMeta } from '../../../components/AuditMeta';
import businessUnitLicenseService from '../../../services/businessUnitLicenseService';
import { useLicenseLedger } from '../useLicenseLedger';
import { useClusterSeatLicenses, type SeatRow } from '../useClusterSeatLicenses';
import { sumActiveLicenses, licenseStatus, isExpiringSoon, isMigratedPlaceholder } from '../../../utils/buLicense';
import { latestActor } from '../../../utils/audit';
import { isPerpetual, fmtDate, daysLeft } from '../licenseDates';
import type { BusinessUnit, BusinessUnitLicense, BuLicenseStatus } from '../../../types';

export interface SeatSectionProps {
  clusterId: string;
  businessUnits: BusinessUnit[];
  canManage: boolean;
}

const STATUS_BADGE: Record<BuLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  scheduled: { variant: 'secondary', label: 'Scheduled' },
  expired: { variant: 'destructive', label: 'Expired' },
};

/**
 * ที่นั่งของทุก BU ใน cluster — หนึ่งการ์ดต่อหนึ่ง BU (`SeatRowCard`) เพราะ `useLicenseLedger`
 * ผูกกับ `ownerId` เดียว เรียกในลูปไม่ได้ (กฎของ hooks) จึงต้องแยกเป็นคอมโพเนนต์ลูกต่อ BU
 *
 * **กติกาการนับ**: ที่นั่ง = ผลรวมของทุกใบที่ active (`sumActiveLicenses`) — คนละกติกากับโควตา BU
 * ที่เป็นใบชนะใบเดียว ห้ามลอกสูตรข้ามชั้น (ดู `utils/buLicense.ts` เทียบ `utils/clusterLicense.ts`)
 *
 * ยอดรวมของ cluster นับเฉพาะแถวที่โหลดสำเร็จ — แถวที่ล้ม (`row.failed`) ไม่ถูกนับเป็น 0 เพราะ
 * ในระบบนี้ 0 ที่นั่งแปลว่าเชิญผู้ใช้ใหม่ไม่ได้จริง (FSEG) การกลืน error เป็น 0 คือการโกหกผู้ใช้
 */
export function SeatSection({ clusterId, businessUnits, canManage }: SeatSectionProps) {
  const { rows, loading, reload } = useClusterSeatLicenses(clusterId, businessUnits);
  const now = new Date();

  const okRows = rows.filter((r) => !r.failed);
  const failedRows = rows.filter((r) => r.failed);
  const totalSeats = okRows.reduce((sum, r) => sum + sumActiveLicenses(r.licenses, now), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Seats
          </CardTitle>
          <CardDescription>
            {loading && rows.length === 0 ? (
              'Loading…'
            ) : rows.length === 0 ? (
              'This cluster has no business units yet — seats are issued per business unit.'
            ) : (
              <>
                {totalSeats} seat{totalSeats === 1 ? '' : 's'} across {okRows.length} business unit{okRows.length === 1 ? '' : 's'}
                {failedRows.length > 0 && ` (+ ${failedRows.length} business unit${failedRows.length === 1 ? '' : 's'} unknown)`}
              </>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={Users}
          title="No business units"
          description="This cluster has no business units yet — seats are issued per business unit."
        />
      ) : (
        rows.map((row) => (
          <SeatRowCard key={row.bu.id} row={row} canManage={canManage} onChanged={reload} />
        ))
      )}
    </div>
  );
}

/** การ์ดอ่านอย่างเดียวของ BU เดียว — แยกเป็นคอมโพเนนต์เพราะ useLicenseLedger ผูกกับ ownerId
 *  หนึ่งค่า จะเรียก hook ในลูปไม่ได้ (กฎของ hooks) การสร้าง/แก้ใบย้ายไปฟอร์มเต็มหน้าที่
 *  `/licenses/seats/{new,:id/edit}` (Task 6) แล้ว การ์ดนี้เหลือแค่แสดงผล + ลบ */
function SeatRowCard({ row, canManage, onChanged }: {
  row: SeatRow;
  canManage: boolean;
  onChanged: () => void;
}) {
  // seed จาก batch ของ useClusterSeatLicenses แล้วข้าม GET ตอน mount (skipInitialLoad) — กัน
  // ยิงคำขอซ้ำสองครั้งต่อ BU ทุกครั้งที่เปิดหน้า (review Critical ของ Task 6: การ์ดนี้เคยยิง GET
  // ของตัวเองซ้อนกับ batch เสมอ ทำให้ error ที่ batch เจอไม่ถูกสะท้อนมาที่นี่เลยถ้าคำขอที่สองบังเอิญ
  // สำเร็จ — ตอนนี้การ์ดใช้ผลของ batch ตรง ๆ เป็นค่าตั้งต้น ไม่ยิงซ้ำ) `loadFailed` (ไม่ใช่
  // `licenses.length === 0`) คือสัญญาณเดียวที่บอกว่า "โหลดไม่ได้" ต่างจาก "ไม่มีใบจริง"
  const { licenses, loading, saving, loadFailed, reload, remove } =
    useLicenseLedger<BusinessUnitLicense>(row.bu.id, businessUnitLicenseService, {
      initialLicenses: row.licenses,
      initialLoadFailed: row.failed,
      skipInitialLoad: true,
    });
  const now = new Date();

  const [showExpired, setShowExpired] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BusinessUnitLicense | null>(null);

  // `licenses` ของ hook นี้คือแหล่งความจริงของการ์ดนี้ — `row.licenses` จาก useClusterSeatLicenses
  // ใช้แค่เป็นค่าตั้งต้นตอน mount เท่านั้น (ดูคอมเมนต์ที่ก้อน useLicenseLedger ด้านบน)
  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const expired = licenses.filter((l) => licenseStatus(l, now) === 'expired');
  const visible = showExpired ? licenses : licenses.filter((l) => licenseStatus(l, now) !== 'expired');

  // ลองใหม่เฉพาะ BU นี้ (ไม่ยิงทั้ง batch) แล้วบอก section แม่ให้ reload() ทั้งชุดต่อ — ยอดรวมของ
  // cluster (ใน SeatSection) นับจาก `rows` ของ batch ไม่ใช่จาก `licenses` ของการ์ดนี้ ถ้าไม่เรียก
  // onChanged() ต่อ ยอดรวมจะยังนับ BU นี้เป็น "unknown" ต่อไปแม้การ์ดจะโหลดสำเร็จแล้วก็ตาม
  const retry = async () => {
    await reload();
    onChanged();
  };

  // ป้ายเจ้าของที่ผู้ใช้อ่านออก — ต้องตรงกับ `ownerFromRow` ใน LicensePurchaseForm.tsx เป๊ะ
  // (`${code} - ${name}`) ไม่งั้นโหมดสร้างกับโหมดแก้จะโชว์ป้ายคนละแบบสำหรับใบเดียวกัน
  const addHref = `/licenses/seats/new?bu=${row.bu.id}&ownerLabel=${
    encodeURIComponent(`${row.bu.code} - ${row.bu.name}`)
  }`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            {row.bu.name}
            <Badge variant="outline" className="text-xs font-normal">{row.bu.code}</Badge>
          </CardTitle>
          <CardDescription>
            {loadFailed
              ? 'Seat count unavailable'
              : `${activeSeats} seat${activeSeats === 1 ? '' : 's'} from ${activeCount} active ${activeCount === 1 ? 'license' : 'licenses'}`}
          </CardDescription>
          {loadFailed && (
            <p className="text-xs text-destructive">
              Could not load licenses for this business unit — the seat figures below are unknown, not zero.
            </p>
          )}
        </div>
        {canManage && !loadFailed && (
          <Button asChild size="sm">
            <Link to={addHref}>
              <Plus className="mr-2 h-4 w-4" />
              Add seat license
            </Link>
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loadFailed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              License data for this business unit could not be loaded — it is unknown, not empty.
            </p>
            <Button variant="outline" size="sm" onClick={retry} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        ) : loading && licenses.length === 0 ? (
          <TableSkeleton columns={6} rows={2} />
        ) : licenses.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No licenses yet"
            description="Add the first license to set how many seats this business unit has bought."
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link to={addHref}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add seat license
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            {/* ตรึงคอลัมน์ขวาสุดเฉพาะตอนที่มันเป็นปุ่มจริง — ไม่มีสิทธิ์จัดการ คอลัมน์ท้าย
                จะกลายเป็น Reference ซึ่งไม่ควรถูกตรึง */}
            <table className={`w-full text-sm [&_th]:whitespace-nowrap${canManage ? ' table-sticky-right [--sticky-right-bg:var(--card)]' : ''}`}>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-2 py-1 whitespace-nowrap">Seats</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Start</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">End</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Status</th>
                  <th className="text-left px-2 py-1">Reference</th>
                  {canManage && <th className="px-2 py-1" />}
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const status = licenseStatus(l, now);
                  const badge = STATUS_BADGE[status];
                  const latest = latestActor(l);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{l.licensed_users}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {/* ใบ 2099 อ่านว่า "No expiry" เหมือนใบโควตา BU (ข้อตกลง §2 ข้อ 7) */}
                        {isPerpetual(l.end_date) ? <span className="text-muted-foreground">No expiry</span> : fmtDate(l.end_date)}
                      </td>
                      <td className="px-2 py-1 space-x-1 whitespace-nowrap">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {isExpiringSoon(l, now) && (
                          <Badge variant="warning">{daysLeft(l.end_date, now)} days left</Badge>
                        )}
                        {/* ป้าย [migrated] จาก isMigratedPlaceholder — คนละเรื่องกับ perpetual */}
                        {isMigratedPlaceholder(l) && <Badge variant="warning">End date required</Badge>}
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">
                        <div>{l.reference_no || '-'}</div>
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
                            <Link to={`/licenses/seats/${l.id}/edit`}>Edit</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget(l)}
                            disabled={saving}
                          >
                            Remove
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
            Show expired ({expired.length})
          </Button>
        )}
      </CardContent>

      {canManage && (
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(o) => !o && setRemoveTarget(null)}
          title="Remove license"
          description={`Remove the ${removeTarget?.licensed_users}-seat license. If it is still in force, those seats leave the cluster pool immediately.`}
          confirmVariant="destructive"
          onConfirm={async () => {
            if (removeTarget) await remove(removeTarget.id);
            setRemoveTarget(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
