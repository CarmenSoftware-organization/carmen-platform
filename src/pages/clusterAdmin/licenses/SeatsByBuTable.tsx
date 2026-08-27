import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Group } from '../../businessUnitEdit/shared';
import { sumActiveLicenses, licenseStatus, isExpiringSoon } from '../../../utils/buLicense';
import { isPerpetual, fmtDate, daysLeft } from '../../licenses/licenseDates';
import type { SeatRow } from '../../licenses/useClusterSeatLicenses';

export interface SeatsByBuTableProps {
  rows: SeatRow[];
  loading: boolean;
  clusterId: string;
  onRetry: () => void;
}

/**
 * วันที่ที่นั่งของ BU นี้จะเริ่มหาย = ใบ active ที่หมดอายุก่อนใคร ไม่ใช่ใบที่หมดทีหลังสุด
 * ผลรวมที่นั่งจะลดลงในวันนั้น การแสดงใบที่ยาวที่สุดจะทำให้คนวางแผนช้าไปทั้งช่วง
 */
function earliestExpiry(row: SeatRow, now: Date): { date: string | null; soon: boolean } {
  const active = row.licenses.filter((l) => licenseStatus(l, now) === 'active' && !isPerpetual(l.end_date));
  if (active.length === 0) return { date: null, soon: false };
  const first = active.reduce((a, b) => (Date.parse(a.end_date) <= Date.parse(b.end_date) ? a : b));
  return { date: first.end_date, soon: isExpiringSoon(first, now) };
}

/**
 * ที่นั่งของทุก BU ในคลัสเตอร์เป็นตารางเดียว แทนหนึ่งการ์ดต่อหนึ่ง BU แบบหน้า platform
 *
 * cluster admin มาที่หน้านี้เพื่อเทียบ BU ต่อ BU ("หน่วยไหนยังไม่ได้ซื้อ" · "ของใครหมดก่อน")
 * ซึ่งเป็นงานอ่านแนวนอน การ์ดต่อหน่วยบังคับให้เลื่อนหาแล้วจำ ส่วนหน้า platform ยังใช้การ์ดอยู่
 * เพราะที่นั่นแต่ละการ์ดมีปุ่มเพิ่ม/แก้/ลบของตัวเอง — คนละงาน คนละรูป
 *
 * แถวที่โหลดใบไม่สำเร็จต้องอ่านว่า "ไม่รู้" ไม่ใช่ 0 — ในระบบนี้ 0 ที่นั่งแปลว่าเชิญผู้ใช้ใหม่
 * ไม่ได้จริง การกลืน error เป็น 0 คือการโกหกผู้ใช้ (กติกาเดียวกับ useClusterSeatLicenses)
 */
export function SeatsByBuTable({ rows, loading, clusterId, onRetry }: SeatsByBuTableProps) {
  const now = new Date();
  const failedCount = rows.filter((r) => r.failed).length;

  return (
    <Card className="p-0">
      <Group
        label="Seats by business unit"
        action={
          failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          )
        }
      >
        {loading && rows.length === 0 ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground pt-1 text-sm">
            This cluster has no business units yet.
          </p>
        ) : (
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="px-2 py-1.5 text-left">Business Unit</th>
                  <th className="px-2 py-1.5 text-right whitespace-nowrap">Seats</th>
                  <th className="px-2 py-1.5 text-right whitespace-nowrap">Licences</th>
                  <th className="px-2 py-1.5 text-left whitespace-nowrap">Ends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const seats = sumActiveLicenses(row.licenses, now);
                  const activeCount = row.licenses.filter((l) => licenseStatus(l, now) === 'active').length;
                  const { date, soon } = earliestExpiry(row, now);
                  return (
                    <tr key={row.bu.id} className="border-b last:border-0">
                      {/* ลิงก์กินพื้นที่แตะของทั้งแถว (`-my-3 py-3`) — วัดที่ 390px แล้วตัวอักษร
                          เปล่า ๆ ให้เป้าแตะแค่ 17px ซึ่งเล็กเกินสำหรับนิ้ว */}
                      <td className="px-2 py-3">
                        <Link
                          to={`/cluster-admin/${clusterId}/business-units/${row.bu.id}/edit`}
                          className="text-primary -my-3 inline-block py-3 hover:underline"
                        >
                          {row.bu.name || row.bu.code || '(unnamed)'}
                        </Link>
                        {row.bu.is_hq && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            HQ
                          </Badge>
                        )}
                      </td>

                      {row.failed ? (
                        <td className="text-muted-foreground px-2 py-3 text-sm" colSpan={3}>
                          Could not load licences for this business unit — its seats are unknown,
                          not zero.
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-3 text-right font-mono tabular-nums">{seats}</td>
                          <td className="text-muted-foreground px-2 py-3 text-right font-mono tabular-nums">
                            {activeCount || '—'}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            {activeCount === 0 ? (
                              <span className="text-muted-foreground">Not purchased</span>
                            ) : date == null ? (
                              <span className="text-muted-foreground">No expiry</span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                {fmtDate(date)}
                                {soon && (
                                  <Badge variant="warning" className="text-[10px]">
                                    {daysLeft(date, now)} days left
                                  </Badge>
                                )}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Group>
    </Card>
  );
}
