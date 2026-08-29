import React, { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  customRange, presetRange, rangeSpanDays, todayInTz, ymdInTz,
  ANALYTICS_TZ, MAX_RANGE_DAYS, RANGE_PRESET_DAY_VALUES, getRangePresets, type DateRange,
} from '../../utils/analyticsRange';
import { useI18n } from '../../hooks/useI18n';
import type { Lang } from '../../i18n/types';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * อธิบายช่วงที่กำลังใช้อยู่เป็นข้อความ — ขอบบนเป็น exclusive จึงถอยหนึ่งวันก่อนแสดง
 * ทำหน้าที่สองอย่าง: บอกผู้ใช้ว่ากำลังดูช่วงไหนจริง ๆ (preset ไม่ได้บอก) และเป็นที่ที่ prop
 * `value` ถูกใช้ ทำให้ component เป็น controlled จริงไม่ใช่แค่รับค่ามาทิ้ง
 *
 * รับ `lang` เพิ่มเข้ามา (i18n phase-2 slice 5.5 Task 5c) — เดิม hardcode locale 'th-TH' ไว้
 * ตัวเดียว ทำให้ผู้ใช้ที่สลับเป็นอังกฤษยังเห็นชื่อเดือนย่อเป็นภาษาไทย ('ส.ค.') ปนอยู่ในข้อความ
 * "Viewing ..." ที่ควรเป็นอังกฤษล้วน
 */
function describeRange(range: DateRange, lang: Lang): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: ANALYTICS_TZ,
  };
  const start = new Date(range.from);
  const lastDay = new Date(new Date(range.to).getTime() - 1);
  // 'th-TH' เพียว ๆ จะให้ปี พ.ศ. (ปฏิทินพุทธเป็นค่าเริ่มต้นของ locale นี้) ซึ่งขัดกับที่อื่นทั้งแอป
  // ที่แสดง ค.ศ. — บังคับปฏิทินเกรกอเรียนด้วย -u-ca-gregory เมื่อภาษาปัจจุบันเป็นไทย
  // 'en-GB' ให้ลำดับวัน-เดือน-ปีแบบเดียวกันไม่มีจุลภาค และปฏิทินเกรกอเรียนเป็นค่าเริ่มต้นอยู่แล้ว
  const locale = lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB';
  const f = new Intl.DateTimeFormat(locale, opts);
  return `${f.format(start)} – ${f.format(lastDay)}`;
}

/** หา preset ที่ตรงกับ range ที่ให้มา เทียบกับ 7/30/90 วันล่าสุด — ถ้าไม่ตรงเลยถือว่าเป็นกำหนดเอง */
function presetOf(range: DateRange): string {
  const match = RANGE_PRESET_DAY_VALUES.find((days) => {
    const candidate = presetRange(Number(days));
    return candidate.from === range.from && candidate.to === range.to;
  });
  return match ?? 'custom';
}

/**
 * แปลง range เป็นคู่ 'YYYY-MM-DD' สำหรับ prefill ช่องกำหนดเอง
 * ขอบบนของ range เป็น exclusive จึงถอยหนึ่งมิลลิวินาทีก่อนแปลง เพื่อให้ toYmd
 * เป็นวันสุดท้ายที่ถูกรวมจริง ไม่ใช่วันถัดไป
 */
function ymdPairOf(range: DateRange): { fromYmd: string; toYmd: string } {
  return {
    fromYmd: ymdInTz(range.from),
    toYmd: ymdInTz(new Date(new Date(range.to).getTime() - 1).toISOString()),
  };
}

/**
 * ตัวเลือกช่วงวันสำหรับหน้า analytics — preset สี่แบบ + โหมดกำหนดเอง
 *
 * โหมดกำหนดเองจะไม่เรียก onChange จนกว่าจะกรอกครบสองช่องและช่วงไม่เกินเพดาน
 * เพื่อไม่ให้ยิง request ที่ backend ตอบ 400 อยู่แล้ว
 *
 * **คืนค่าเป็น fragment ไม่ใช่ div เดียว** — ตัวมันเองไม่มีกล่องครอบ ทุกกลุ่มจึงเป็น flex item
 * ของแถวตัวกรองที่หน้าเรียกใช้โดยตรง (ทั้งสองหน้าเป็น `flex flex-wrap items-end gap-3`)
 * ถ้าห่อไว้ในกล่องเดียวแบบเดิม กล่องนั้นจะสูงถึงบรรทัดคำอธิบายด้านล่าง พอ `items-end`
 * จัดชิดขอบล่าง Select ในกล่องจะลอยสูงกว่า control อื่น ๆ ในแถวเดียวกันราวความสูงของ
 * คำอธิบาย — คำอธิบายจึงถูกดันไปบรรทัดของตัวเองด้วย `order-last basis-full` แทน
 * (`order-last` จำเป็น เพราะถ้าไม่มี `basis-full` จะตัดแถวตรงกลาง ดัน control ที่อยู่หลัง
 * component นี้ตกไปอีกบรรทัด)
 *
 * preset / fromYmd / toYmd เริ่มต้นจาก `value` เสมอ (lazy init) ไม่ใช่ค่าคงที่ตายตัว —
 * หน้าที่ seed ค่าเริ่มต้นจาก query param (เช่นตอน drill-down จาก /analytics มายัง
 * /activity-events) จะได้แสดงตัวเลือกที่ตรงกับ filter จริงตั้งแต่ render แรก แทนที่จะ
 * ค้างที่ preset เริ่มต้นทั้งที่ filter ที่ใช้จริงไม่ตรงกัน — จงใจไม่ใช้ useEffect ผูกกับ
 * `value` เพราะ parent จะอัปเดต value กลับมาจาก onChange ของ component นี้เอง การ sync
 * ซ้ำจะไปเขียนทับค่าที่ผู้ใช้กำลังพิมพ์ค้างอยู่ในโหมดกำหนดเอง
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<string>(() => presetOf(value));
  const [fromYmd, setFromYmd] = useState<string>(() => ymdPairOf(value).fromYmd);
  const [toYmd, setToYmd] = useState<string>(() => ymdPairOf(value).toYmd);
  const [error, setError] = useState('');

  const handlePreset = (next: string) => {
    setPreset(next);
    setError('');
    if (next === 'custom') {
      const pair = ymdPairOf(value);
      setFromYmd(pair.fromYmd);
      setToYmd(pair.toYmd);
      return;
    }
    const range = presetRange(Number(next));
    const pair = ymdPairOf(range);
    setFromYmd(pair.fromYmd);
    setToYmd(pair.toYmd);
    onChange(range);
  };

  const handleCustom = (nextFrom: string, nextTo: string) => {
    setFromYmd(nextFrom);
    setToYmd(nextTo);
    if (!nextFrom || !nextTo) { setError(''); return; }
    if (nextTo < nextFrom) { setError(t('components.dateRangeFilter.endBeforeStart')); return; }

    const range = customRange(nextFrom, nextTo);
    if (rangeSpanDays(range) > MAX_RANGE_DAYS) {
      setError(t('components.dateRangeFilter.maxRangeDays', { max: MAX_RANGE_DAYS }));
      return;
    }
    setError('');
    onChange(range);
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="range-preset">{t('components.dateRangeFilter.dateRangeLabel')}</Label>
        <Select value={preset} onValueChange={handlePreset}>
          <SelectTrigger id="range-preset" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getRangePresets(t).map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === 'custom' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="range-from">{t('components.dateRangeFilter.fromLabel')}</Label>
            <Input
              id="range-from" type="date" max={todayInTz()} value={fromYmd}
              onChange={(e) => handleCustom(e.target.value, toYmd)}
              className={error ? 'border-destructive' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="range-to">{t('components.dateRangeFilter.toLabel')}</Label>
            <Input
              id="range-to" type="date" max={todayInTz()} value={toYmd}
              onChange={(e) => handleCustom(fromYmd, e.target.value)}
              className={error ? 'border-destructive' : ''}
            />
          </div>
        </>
      )}

      <p
        className={`order-last basis-full text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}
        aria-live="polite"
      >
        {error || t('components.dateRangeFilter.viewingRange', { range: describeRange(value, lang) })}
      </p>
    </>
  );
};
