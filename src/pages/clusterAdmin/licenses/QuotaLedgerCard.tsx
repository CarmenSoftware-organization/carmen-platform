import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CollapsibleGroupCard } from './CollapsibleGroupCard';
import { AuditMeta } from '../../../components/AuditMeta';
import { latestActor } from '../../../utils/audit';
import { licenseStatus, activeLicense } from '../../../utils/clusterLicense';
import { isPerpetual, fmtDate } from '../../licenses/licenseDates';
import type { ClusterLicense, ClusterLicenseStatus } from '../../../types';

const STATUS_BADGE: Record<ClusterLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  scheduled: { variant: 'secondary', label: 'Scheduled' },
  expired: { variant: 'destructive', label: 'Expired' },
};

export interface QuotaLedgerCardProps {
  licenses: ClusterLicense[];
  loading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}

/**
 * ใบซื้อโควตา BU ทุกใบของคลัสเตอร์ ยุบไว้เป็นค่าเริ่มต้น
 *
 * ตัวเลขที่มีผลจริงอยู่บนแถบด้านบนของหน้าแล้ว (`bu_used` / `bu_cap` จาก backend view) รายการนี้
 * ตอบคำถามรอง — "โควตานั้นมาจากใบไหน ใบใดกำลังจะหมด" — จึงไม่ควรเป็นสิ่งแรกที่คนเห็น
 *
 * โควตาที่มีผลคือ **ใบที่ชนะใบเดียว** (`activeLicense`) ไม่ใช่ผลรวมทุกใบเหมือนที่นั่งของ BU
 * ห้าม sum `licensed_bus` เด็ดขาด — คนละกติกากันคนละชั้น
 */
export function QuotaLedgerCard({ licenses, loading, loadFailed, onRetry }: QuotaLedgerCardProps) {
  const now = new Date();
  const winning = activeLicense(licenses, now);

  const summary = loadFailed
    ? 'Could not load — the quota shown above is unknown, not zero'
    : loading && licenses.length === 0
      ? 'Loading…'
      : licenses.length === 0
        ? 'No quota licence has been issued for this cluster'
        : `${licenses.length} ${licenses.length === 1 ? 'licence' : 'licences'}${
            winning
              ? ` · in force: ${winning.licensed_bus} business units${
                  isPerpetual(winning.end_date) ? ', no expiry' : `, to ${fmtDate(winning.end_date)}`
                }`
              : ' · none in force'
          }`;

  return (
    <CollapsibleGroupCard label="BU quota licences" summary={summary}>
      {loadFailed ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">
            Licence data for this cluster could not be loaded — it is unknown, not empty.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      ) : licenses.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          The platform team issues quota licences. Ask them to add one before this cluster needs
          another business unit.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="px-2 py-1.5 text-right whitespace-nowrap">Quota</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">Start</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">End</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">Status</th>
                <th className="px-2 py-1.5 text-left">Reference</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => {
                const badge = STATUS_BADGE[licenseStatus(l, now)];
                const latest = latestActor(l);
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{l.licensed_bus}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {isPerpetual(l.end_date) ? (
                        <span className="text-muted-foreground">No expiry</span>
                      ) : (
                        fmtDate(l.end_date)
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {winning?.id === l.id && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          In force
                        </Badge>
                      )}
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-xs">
                      <div>{l.reference_no || '-'}</div>
                      <AuditMeta
                        variant="compact"
                        verb={latest?.verb}
                        actor={latest?.actor}
                        className="text-muted-foreground text-[11px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* หมายเหตุของใบไม่ได้ขึ้นมาที่นี่โดยตั้งใจ — ใบที่ backfill มาถือข้อความที่เขียนไว้ให้
              ทีมอ่าน ("ย้ายจาก tb_cluster.max_license_bu") ซึ่งไม่ได้อธิบายอะไรให้ผู้ใช้ปลายทาง */}
        </div>
      )}
    </CollapsibleGroupCard>
  );
}
