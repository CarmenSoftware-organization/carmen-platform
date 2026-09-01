import { cn } from '../../../lib/utils';

/**
 * ชิ้นส่วนที่ "แผ่น" ทุกใบในโดเมนใบอนุญาตใช้ร่วมกัน
 *
 * รางช่วงเวลาถูกคัดลอกมือมาแล้วสองรอบ (`SubscriptionDraftPlate` #229 → `IssuedLicensePlate` #230)
 * และรอบที่สามกำลังจะเกิดที่หน้าแก้ไขสัญญา — สามสำเนาของเส้นเดียวกันคือสามที่ให้มันเพี้ยนจากกัน
 * ทั้งที่ผู้ใช้อ่านมันเป็นภาษาเดียว จึงยุบมาไว้ที่นี่ก่อนสำเนาที่สามจะเกิด
 */

/**
 * ปลายรางด้านหนึ่ง
 *
 * `bg-muted` บนการ์ดคือคอนทราสต์ 1.07:1 — จุดที่มองไม่เห็น ซึ่งรีโปนี้จ่ายค่าเรียนไปแล้วหนึ่งครั้ง
 * ปลายที่ยังไม่ถูกกำหนดจึงใช้ foreground 40% ซึ่งเห็นเป็นจุดจริง ๆ
 */
function TermEnd({ set }: { set: boolean }) {
  return <span className={cn('size-2 shrink-0 rounded-full', set ? 'bg-primary' : 'bg-muted-foreground/40')} />;
}

export interface TermRailProps {
  /** 'YYYY-MM-DD' ตรงจากฟอร์ม — สตริงว่างคือ "ยังไม่กำหนด" */
  startDate: string;
  /** เหมือนกัน แต่ `null` แปลว่า "ไม่มีวันหมดอายุ" ซึ่งวาดเป็น ∞ ไม่ใช่ขีดกลาง */
  endDate: string | null;
  /** ความยาวของช่วง ตั้งชื่อไว้ตรงกลางราง เช่น "ครอบคลุม 10 ปี" */
  label: string;
  /** จางลงหนึ่งขั้นเมื่อยังไม่มีช่วงเวลาให้พูดถึงจริง */
  labelMuted?: boolean;
  className?: string;
}

/**
 * วันสองวันวาดเป็นช่วงระหว่างกัน โดยมีความยาวของช่วงเขียนไว้ตรงกลาง
 *
 * นี่คือสิ่งที่กล่องวันที่สองกล่องไม่เคยบอก: 19/08/2026 กับ 18/08/2036 เป็นค่าสองค่าที่ไม่รู้จักกัน
 * ไม่มีที่ไหนพูดว่า "10 ปี"
 *
 * รางกับวันที่เป็นสองแถว ไม่ใช่แถวเดียว — ที่ความกว้าง 20rem วันที่สิบตัวอักษรสองตัวบวกความยาว
 * ตรงกลางจะเบียดจนวันที่ตัดกลางค่า ("2026-09-" ขึ้นบรรทัดใหม่เป็น "01")
 *
 * ผู้เรียกควรจำกัดความกว้างเอง (`className="max-w-xl"`) เมื่อแผ่นกว้างเต็มหน้า — รางที่ยืดยาว
 * ~800px อ่านเป็นเส้นคั่น ไม่ใช่ช่วงเวลา และดันความยาวตรงกลางออกห่างจากปลายจนไม่เห็นว่าเกี่ยวกัน
 */
export function TermRail({ startDate, endDate, label, labelMuted, className }: TermRailProps) {
  const noExpiry = endDate === null;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-2">
        <TermEnd set={!!startDate} />
        <span className="bg-border h-px flex-1" />
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
            labelMuted ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {label}
        </span>
        <span className="bg-border h-px flex-1" />
        <TermEnd set={!noExpiry && !!endDate} />
      </div>
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums whitespace-nowrap">
        <span className={cn(!startDate && 'text-muted-foreground/60')}>{startDate || '—'}</span>
        <span className={cn((noExpiry || !endDate) && 'text-muted-foreground/60')}>
          {noExpiry ? '∞' : endDate || '—'}
        </span>
      </div>
    </div>
  );
}

/** หนึ่งบรรทัดของบล็อกตัวตน — ชื่ออ่านง่ายเป็นตัวหลัก id ดิบเป็นบรรทัดรองที่จางลงหนึ่งขั้น */
export function IdentityRow({ label, value, id }: { label: string; value: string; id?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-sm">{value}</p>
      {id && id !== value && <p className="text-muted-foreground/70 truncate font-mono text-[11px]">{id}</p>}
    </div>
  );
}
