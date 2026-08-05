import React, { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  customRange, presetRange, rangeSpanDays, todayInTz,
  ANALYTICS_TZ, MAX_RANGE_DAYS, RANGE_PRESETS, type DateRange,
} from '../../utils/analyticsRange';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * อธิบายช่วงที่กำลังใช้อยู่เป็นข้อความไทย — ขอบบนเป็น exclusive จึงถอยหนึ่งวันก่อนแสดง
 * ทำหน้าที่สองอย่าง: บอกผู้ใช้ว่ากำลังดูช่วงไหนจริง ๆ (preset ไม่ได้บอก) และเป็นที่ที่ prop
 * `value` ถูกใช้ ทำให้ component เป็น controlled จริงไม่ใช่แค่รับค่ามาทิ้ง
 */
function describeRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: ANALYTICS_TZ,
  };
  const start = new Date(range.from);
  const lastDay = new Date(new Date(range.to).getTime() - 1);
  // 'th-TH' เพียว ๆ จะให้ปี พ.ศ. (ปฏิทินพุทธเป็นค่าเริ่มต้นของ locale นี้) ซึ่งขัดกับที่อื่นทั้งแอป
  // ที่แสดง ค.ศ. — บังคับปฏิทินเกรกอเรียนด้วย -u-ca-gregory
  const f = new Intl.DateTimeFormat('th-TH-u-ca-gregory', opts);
  return `${f.format(start)} – ${f.format(lastDay)}`;
}

/**
 * ตัวเลือกช่วงวันสำหรับหน้า analytics — preset สี่แบบ + โหมดกำหนดเอง
 *
 * โหมดกำหนดเองจะไม่เรียก onChange จนกว่าจะกรอกครบสองช่องและช่วงไม่เกินเพดาน
 * เพื่อไม่ให้ยิง request ที่ backend ตอบ 400 อยู่แล้ว
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const [preset, setPreset] = useState<string>('7');
  const [fromYmd, setFromYmd] = useState('');
  const [toYmd, setToYmd] = useState('');
  const [error, setError] = useState('');

  const handlePreset = (next: string) => {
    setPreset(next);
    setError('');
    if (next !== 'custom') onChange(presetRange(Number(next)));
  };

  const handleCustom = (nextFrom: string, nextTo: string) => {
    setFromYmd(nextFrom);
    setToYmd(nextTo);
    if (!nextFrom || !nextTo) { setError(''); return; }
    if (nextTo < nextFrom) { setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return; }

    const range = customRange(nextFrom, nextTo);
    if (rangeSpanDays(range) > MAX_RANGE_DAYS) {
      setError(`เลือกได้สูงสุด ${MAX_RANGE_DAYS} วัน`);
      return;
    }
    setError('');
    onChange(range);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="range-preset">ช่วงวัน</Label>
          <Select value={preset} onValueChange={handlePreset}>
            <SelectTrigger id="range-preset" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preset === 'custom' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="range-from">ตั้งแต่</Label>
              <Input
                id="range-from" type="date" max={todayInTz()} value={fromYmd}
                onChange={(e) => handleCustom(e.target.value, toYmd)}
                className={error ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="range-to">ถึง</Label>
              <Input
                id="range-to" type="date" max={todayInTz()} value={toYmd}
                onChange={(e) => handleCustom(fromYmd, e.target.value)}
                className={error ? 'border-destructive' : ''}
              />
            </div>
          </>
        )}
      </div>
      <p className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
        {error || `กำลังดู ${describeRange(value)}`}
      </p>
    </div>
  );
};
