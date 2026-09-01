import { useMemo } from 'react';
import { cn } from '../../lib/utils';

export interface CoverageInterval {
  /** ms since epoch */
  start: number;
  /** ms since epoch */
  end: number;
  /** ใบที่หมดอายุแล้ว/ถูกแทนที่ — วาดจาง ไม่ใช่สีคุ้มครอง */
  dim?: boolean;
}

export interface LicenseCoverageBarProps {
  intervals: CoverageInterval[];
  /** ขอบซ้าย/ขวาของแกน (ms) — **ต้องเป็นค่าเดียวกันทุกแถวในตารางเดียวกัน** ไม่งั้นเทียบกันไม่ได้ */
  windowStart: number;
  windowEnd: number;
  now: number;
  /** ข้อความ title สำหรับผู้ใช้เมาส์ + screen reader — ผู้เรียกประกอบเองเพราะรู้บริบท */
  label: string;
  className?: string;
}

const pct = (v: number, a: number, b: number) => ((v - a) / (b - a)) * 100;

/**
 * แกนเวลาแนวนอนหนึ่งเส้นต่อหนึ่งเจ้าของใบ — ทึบ = คุ้มครอง · ว่าง = ช่องโหว่ · เส้นตั้ง = วันนี้
 *
 * เหตุผลที่มีอยู่: ใบอนุญาตคือ **ช่วงเวลา** แต่ตารางวันที่เริ่ม/วันที่จบซ่อนสิ่งที่สำคัญที่สุดของ
 * ช่วงเวลาไว้ — ช่องว่างระหว่างใบ และการซ้อนทับ ผู้อ่านต้องลบวันที่ในหัวทีละคู่ถึงจะเห็น
 * (คนละอย่างกับคอลัมน์ `coverage` ของ `PurchaseLicenseTable` ซึ่งเป็นข้อความ `start – end` เฉย ๆ)
 *
 * เป็น div ซ้อน div ล้วน ไม่มี chart library (กฎข้อ 6 ของ repo: ห้ามเพิ่ม dependency เพื่อลูกเล่น)
 * `windowStart`/`windowEnd` มาจากผู้เรียกโดยตั้งใจ ไม่คำนวณเองจาก `intervals` — ถ้าแต่ละแถวย่อ/ขยาย
 * แกนตามข้อมูลของตัวเอง แถบสองแถบที่ยาวเท่ากันจะหมายถึงคนละช่วงเวลา ซึ่งแย่กว่าไม่มีแถบเลย
 */
export function LicenseCoverageBar({
  intervals, windowStart, windowEnd, now, label, className,
}: LicenseCoverageBarProps) {
  const segments = useMemo(() => intervals
    .map((iv) => ({
      left: Math.max(0, pct(iv.start, windowStart, windowEnd)),
      right: Math.min(100, pct(iv.end, windowStart, windowEnd)),
      dim: iv.dim,
    }))
    .filter((s) => s.right > 0 && s.left < 100),
  [intervals, windowStart, windowEnd]);

  // ใบที่ยืดพ้นขอบขวา (รวมใบ perpetual ปี 2099) ถูก clip ที่ 100% — ถ้าไม่บอกว่ามันเลยออกไป
  // แถบจะอ่านเหมือนใบที่จบพอดีที่ขอบแกน ซึ่งเป็นคนละความหมายกันคนละเรื่อง
  const overflowsRight = intervals.some((iv) => iv.end > windowEnd);
  const nowPct = pct(now, windowStart, windowEnd);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="relative w-full min-w-[80px]">
        <div
          // รางใช้ `foreground/10` ไม่ใช่ `bg-muted` — แถบนี้ถูกวางบนแถวหัวกลุ่มที่พื้นเป็น
          // `bg-muted` อยู่แล้ว รางสีเดียวกับพื้นทำให้ "ช่วงที่ไม่มีความคุ้มครอง" หายไปทั้งหมด
          // ซึ่งเป็นครึ่งหนึ่งของข้อมูลที่แถบนี้มีอยู่
          className="bg-foreground/10 relative h-2 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={label}
          title={label}
        >
          {segments.map((s, i) => (
            <div
              key={i}
              className={cn('absolute inset-y-0 rounded-full', s.dim ? 'bg-muted-foreground/25' : 'bg-success')}
              style={{ left: `${s.left}%`, width: `${Math.max(s.right - s.left, 1.5)}%` }}
            />
          ))}
        </div>
        {/* หมุดวันนี้อยู่ **นอก** รางโดยตั้งใจ: รางมี `overflow-hidden` เพื่อ clip ช่วงที่ล้นขอบ
            หมุดที่อยู่ข้างในจึงสูงได้แค่เท่าราง (8px) และกลืนหายไปกับสีเขียวจนอ่านเป็นรอยต่อ
            ระหว่าง segment แทนที่จะเป็น "วันนี้" — ต้องยื่นพ้นรางทั้งบนและล่างถึงจะอ่านออก */}
        {nowPct >= 0 && nowPct <= 100 && (
          <div
            aria-hidden
            className="bg-foreground absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${nowPct}%` }}
          />
        )}
      </div>
      {/* ตัวยึดพื้นที่คงที่ — ใช้ invisible ไม่ใช่ถอดออก เพื่อให้ความกว้างของแถบทุกแถวเท่ากันเป๊ะ
          ไม่ว่าจะมีใบที่เลยขอบหรือไม่ (ถ้าความกว้างต่างกัน แกนเวลาก็เทียบข้ามแถวไม่ได้อีก) */}
      <span
        aria-hidden
        className={cn('text-muted-foreground text-[10px] leading-none', overflowsRight ? 'visible' : 'invisible')}
      >
        ›
      </span>
    </div>
  );
}
