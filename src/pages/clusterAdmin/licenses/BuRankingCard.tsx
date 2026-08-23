import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleGroupCard } from './CollapsibleGroupCard';
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';
import type { BusinessUnit } from '../../../types';

export interface BuRankingCardProps {
  businessUnits: BusinessUnit[];
  clusterId: string;
  /**
   * โควตาที่มีผล — `null` เมื่อโหลดใบไม่สำเร็จ (ไม่ใช่ 0) เพราะ cap ที่คำนวณจากข้อมูลที่โหลด
   * ไม่ได้ไม่ใช่ข้อเท็จจริง ห้ามขึ้นป้าย Over quota จากมัน
   */
  cap: number | null;
}

/**
 * อันดับของหน่วยธุรกิจ — ลำดับที่แพลตฟอร์มใช้ตัดสินว่าหน่วยไหนได้อยู่ในโควตาเมื่อโควตาไม่พอ
 *
 * ยุบไว้เป็นค่าเริ่มต้นเพราะเป็นคำตอบของคำถาม "ถ้าเกินโควตา ใครโดนก่อน" ซึ่งจะถูกถามก็ต่อเมื่อ
 * เกินจริง — และตอนนั้นแถบด้านบนขึ้นสีเตือนไปแล้ว
 *
 * อันดับต้องมาจาก `rankBusinessUnits` เท่านั้น ซึ่งตรงกับ DB view `v_cluster_bu_quota` เป๊ะ
 * ห้ามเรียงเอง — ป้ายที่ไม่ตรงกับด่านจริง (BU ไหนโดน 403) แย่กว่าไม่มีป้าย
 */
export function BuRankingCard({ businessUnits, clusterId, cap }: BuRankingCardProps) {
  const ranked = useMemo(() => rankBusinessUnits(businessUnits), [businessUnits]);
  const overCount = useMemo(() => countOverLimit(ranked, cap), [ranked, cap]);

  const ordered = useMemo(
    () => [...businessUnits].sort((a, b) => (ranked.get(a.id) ?? 0) - (ranked.get(b.id) ?? 0)),
    [businessUnits, ranked],
  );

  const summary =
    businessUnits.length === 0
      ? 'No business units yet'
      : cap == null
        ? `${businessUnits.length} ranked · quota unknown`
        : overCount > 0
          ? `${overCount} beyond quota and read-only`
          : `${businessUnits.length} ranked · all within quota`;

  return (
    <CollapsibleGroupCard label="Business unit ranking" summary={summary}>
      <p className="text-muted-foreground mb-3 text-sm">
        When quota runs short, the platform covers units in this order — HQ first, then oldest.
      </p>
      {businessUnits.length === 0 ? (
        <p className="text-muted-foreground text-sm">This cluster has no business units yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="px-2 py-1.5 text-right whitespace-nowrap">Rank</th>
                <th className="px-2 py-1.5 text-left">Business unit</th>
                <th className="px-2 py-1.5 text-left whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((bu) => {
                const rank = ranked.get(bu.id) ?? 0;
                const over = cap != null && rank > cap;
                return (
                  <tr key={bu.id} className="border-b last:border-0">
                    <td className="text-muted-foreground px-2 py-3 text-right font-mono tabular-nums">
                      {rank}
                    </td>
                    <td className="px-2 py-3">
                      <Link
                        to={`/cluster-admin/${clusterId}/business-units/${bu.id}/edit`}
                        className="text-primary -my-3 inline-block py-3 hover:underline"
                      >
                        {bu.name || bu.code || '(unnamed)'}
                      </Link>
                      {bu.is_hq && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          HQ
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <Badge variant={bu.is_active ? 'success' : 'secondary'}>
                        {bu.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {over && (
                        <Badge variant="destructive" className="ml-1.5 text-[10px]">
                          Beyond quota
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
    </CollapsibleGroupCard>
  );
}
