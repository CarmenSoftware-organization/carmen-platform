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
  /** เหมือนกัน แต่ `null` แปลว่า "ไม่มีวันหมดอายุ" ซึ่งวาดเป็นรางที่จางหายไป ไม่ใช่รางที่มีปลาย */
  endDate: string | null;
  /** ความยาวของช่วง ตั้งชื่อไว้ตรงกลางราง เช่น "ครอบคลุม 10 ปี" — ใบที่ไม่มีวันหมดอายุ
   *  ไม่มีความยาวให้ตั้งชื่อ ป้ายจึงย้ายไปอยู่ปลายขวาแทนกลางราง (ดูคอมเมนต์ของ `TermRail`) */
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
 *
 * **ใบที่ไม่มีวันหมดอายุวาดคนละรูป และนั่นคือประเด็นทั้งหมด** — เดิมมันได้รางเต็มที่จบด้วย
 * `TermEnd set={false}` ซึ่งในไฟล์นี้แปลว่า "ยังไม่กำหนด" สายตาจึงอ่านใบตลอดชีพว่าเป็น
 * *ใบที่กรอกไม่ครบ* ส่วนความหมายจริงถูกยัดไว้ใน `∞` ขนาด 11px สีจาง 60% ที่มุมขวาล่าง —
 * ตัวเล็กที่สุดในหน้าและอยู่ท้ายสายตาที่สุด ทั้งที่มันคือคำตอบว่าใบนี้อยู่ได้นานแค่ไหน
 * ซ้ำร้ายป้ายกลางรางยังเขียน "ไม่มีวันหมดอายุ" อีกที กลายเป็นพูดสองครั้งโดยที่รูปทรงพูดตรงข้าม
 *
 * ใบตลอดชีพจึงไม่มีปลายให้วาด: รางจางหายไปทางขวา ป้ายย้ายจากกลางรางไปเป็นปลายขวาคู่กับ `∞`
 * ที่น้ำหนักเท่าวันที่ — ทั้งบล็อกอ่านครั้งเดียวจบว่า "เริ่ม 2026-08-21 แล้วไม่จบ"
 */
export function TermRail({ startDate, endDate, label, labelMuted, className }: TermRailProps) {
  const noExpiry = endDate === null;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-2">
        <TermEnd set={!!startDate} />
        {noExpiry ? (
          // ไม่มีปลาย จึงไม่วาดปลาย — เส้นจางหายไปแทนที่จะไปชนจุดสีเทาที่แปลว่า "ยังไม่กำหนด"
          // จางเฉพาะช่วงท้าย ไม่ใช่จางทั้งเส้น — `--border` จางอยู่แล้ว การไล่จาก 0%
          // ทำให้เหลือเส้นจริงแค่หนึ่งในสามแรกแล้วดูเหมือนเรนเดอร์พัง ไม่ใช่เหมือนราง
          <span className="from-border h-px flex-1 bg-linear-to-r from-65% to-transparent" />
        ) : (
          <>
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
            <TermEnd set={!!endDate} />
          </>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums whitespace-nowrap">
        <span className={cn(!startDate && 'text-muted-foreground/60')}>{startDate || '—'}</span>
        {noExpiry ? (
          // น้ำหนักเท่าวันที่ฝั่งซ้าย ไม่ใช่บรรทัดรอง — นี่คือคำตอบ ไม่ใช่เชิงอรรถ
          <span className="text-foreground flex items-baseline gap-1.5 font-sans">
            <span className="text-sm leading-none">∞</span>
            {label}
          </span>
        ) : (
          <span className={cn(!endDate && 'text-muted-foreground/60')}>{endDate || '—'}</span>
        )}
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
