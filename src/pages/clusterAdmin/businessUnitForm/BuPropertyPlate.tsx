import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { StatusToggle } from '../../../components/StatusToggle';
import { HeroName } from '../../businessUnitEdit/HeroName';
import { SeatMeter } from './SeatMeter';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';

export interface BuPropertyPlateProps {
  formData: BusinessUnitFormData;
  logoUrl?: string;
  avatarUrl?: string;
  canEdit: boolean;
  backTo: string;
  licensesTo: string;
  clusterSeat?: { used: number; cap: number };
  onCommit: (name: string, value: string) => void;
  onToggle: (name: string, value: boolean) => void;
}

/**
 * แผ่นป้ายของโรงแรมแห่งนี้ — ตัวตน (โลโก้ ชื่อ ที่ตั้ง สถานะ) คู่กับที่นั่งของ cluster
 * ในแถบเดียว อยู่เหนือแถบ tab จึงเห็นได้จากทุก tab
 *
 * แทนที่การ์ด hero เดิมที่วางโลโก้กับ avatar ติดกันสองแผ่นโดยไม่มีอะไรบอกว่าอันไหนคืออะไร
 * ที่นี่แสดงเครื่องหมายเดียว (โลโก้ก่อน แล้วค่อย avatar แล้วค่อยตัวอักษรแรก) ส่วนการอัปโหลด
 * ทั้งสองรูปพร้อมป้ายกำกับยังอยู่ที่ BusinessUnitBrandingCard ใน tab Overview เหมือนเดิม
 *
 * บรรทัดรองเป็นชื่อโรงแรมจริง ไม่ใช่คำอธิบายหน้าจอ — แฟ้มนี้ต้องบอกได้ว่ามันคือที่ไหน
 * โดยไม่ต้องเปิด tab Hotel
 */
export function BuPropertyPlate({
  formData: f, logoUrl, avatarUrl, canEdit, backTo, licensesTo,
  clusterSeat, onCommit, onToggle,
}: BuPropertyPlateProps) {
  const place = [f.hotel_city, f.hotel_country].filter(Boolean).join(', ');
  const property = [f.hotel_name, place].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      {/* ::before ยืดพื้นที่แตะเป็น 44px โดยกล่องยังสูง 20px เท่าเดิม — ท่าเดียวกับ InlineField
          ที่วัดแล้วว่าลิงก์นี้สูงแค่ 20px บนจอ 390px ซึ่งเล็กกว่าเป้าแตะขั้นต่ำ */}
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
      >
        <ArrowLeft className="size-4" />
        Business units
      </Link>

      <Card className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-6">
          <div className="flex min-w-0 gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
            ) : (
              <div className="bg-primary/90 grid size-12 shrink-0 place-items-center rounded-lg text-lg font-bold text-white">
                {(f.name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                <HeroName value={f.name} disabled={!canEdit} onCommit={(v) => onCommit('name', v)} />
              </h1>

              <p className="text-muted-foreground mt-0.5 truncate text-sm">
                {property || 'No hotel name set — add one under Hotel'}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
                <StatusToggle
                  on={f.is_active}
                  onLabel="Active"
                  offLabel="Inactive"
                  variant="success"
                  disabled={!canEdit}
                  onClick={() => onToggle('is_active', !f.is_active)}
                />
                <StatusToggle
                  on={f.is_hq}
                  onLabel="HQ"
                  offLabel="Not HQ"
                  variant="default"
                  disabled={!canEdit}
                  onClick={() => onToggle('is_hq', !f.is_hq)}
                />
                {/* code เป็นรหัสของระบบ แก้ไม่ได้ที่นี่ — เป็นตัวอักษรกำกับ ไม่ใช่แผ่นสี */}
                {f.code && (
                  <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
                    {f.code}
                  </span>
                )}
              </div>
            </div>
          </div>

          {clusterSeat && (
            <div className="border-t pt-5 sm:border-t-0 sm:pt-0">
              <SeatMeter used={clusterSeat.used} cap={clusterSeat.cap} licensesTo={licensesTo} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
