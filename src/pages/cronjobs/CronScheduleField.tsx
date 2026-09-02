import { useMemo } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { describeCron, nextRuns } from '../../utils/cronExpression';
import {
  buildCron,
  parseCron,
  withMode,
  EVERY_N_MINUTE_CHOICES,
  type CronMode,
  type CronScheduleState,
} from '../../utils/cronSchedule';

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  error?: string;
}

const MODES: CronMode[] = ['everyNMinutes', 'hourly', 'daily', 'weekly', 'monthly', 'custom'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const CRON_FIELD_KEYS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

/** Select ตัวเลขล้วน — ค่าที่ Radix ส่งกลับเป็น string เสมอ แปลงให้ผู้เรียกครั้งเดียวตรงนี้ */
function NumberSelect({
  value,
  onChange,
  options,
  format = String,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  options: number[];
  format?: (n: number) => string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="h-9 w-[4.5rem]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {format(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * ช่องกำหนดเวลาของงานตามเวลา — ตัวสร้าง cron แบบเลือกจากรูปแบบ คู่กับช่อง expression ดิบ
 *
 * cron string เป็นแหล่งความจริงเดียว: ทุกครั้งที่เรนเดอร์เรา `parseCron(value)` ใหม่แล้วให้
 * ตัวเลือกสะท้อนผลนั้น ไม่มี state คู่ขนานของโหมดเก็บไว้เลย ผู้ใช้จึงพิมพ์ที่ช่อง expression
 * แล้วเห็นตัวเลือกขยับตาม และกลับกันได้ โดยไม่มีทางที่สองฝั่งจะไม่ตรงกัน expression ที่ตัวเลือก
 * สร้างไม่ได้ (ช่วง `1-5`, เดือนเจาะจง) จะตกลงโหมด "กำหนดเอง" ซึ่งคืนช่องพิมพ์ 5 ช่องให้แทน
 * — ไม่ใช่ error เพราะ expression พวกนั้นถูกต้องดี เพียงแต่แทนด้วยตัวเลือกสำเร็จรูปไม่ได้
 *
 * `describeCron` คืน `''` เมื่อช่องยังว่าง/พิมพ์ช่องว่างล้วน และคืน `null` เฉพาะ expression ที่
 * พิมพ์แล้วแต่ผิดรูปเท่านั้น (Task 6 fix round) — ต้องตรวจ `sentence === null` เป็นสัญญาณ
 * validate โดยตรง ห้ามใช้ `!sentence` เพราะจะรวมสองเคสเข้าด้วยกันและขึ้น "invalid expression"
 * ใต้ช่องที่ผู้ใช้ยังไม่ได้แตะเลย
 *
 * โปรเจกต์นี้ไม่มี `useTranslation()` — อ่านภาษาปัจจุบันผ่าน `useI18n().lang` เหมือนทุกหน้า
 * (ดู src/components/LanguageToggle.tsx)
 */
export default function CronScheduleField({ value, onChange, readOnly, error }: Props) {
  const { t, lang } = useI18n();
  const sentence = describeCron(value, lang === 'th' ? 'th' : 'en');
  const upcoming = nextRuns(value, 3);

  const state = useMemo(() => parseCron(value), [value]);
  const emit = (next: CronScheduleState) => onChange(buildCron(next));

  const hourOptions = useMemo(() => range(24), []);
  const minuteOptions = useMemo(() => range(60), []);
  const dayOptions = useMemo(() => range(31, 1), []);

  /** ติ๊กวันในสัปดาห์ — กันติ๊กออกจนเหลือศูนย์วัน เพราะช่อง dow ว่างทำให้ expression ใช้ไม่ได้ */
  const toggleWeekday = (day: number) => {
    const on = state.weekdays.includes(day);
    if (on && state.weekdays.length === 1) return;
    emit({
      ...state,
      weekdays: on ? state.weekdays.filter((d) => d !== day) : [...state.weekdays, day],
    });
  };

  const setField = (index: number, next: string) => {
    const fields = [...state.fields] as CronScheduleState['fields'];
    fields[index] = next;
    onChange(fields.join(' '));
  };

  const timeControls = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t('cronjob.schedule.atTime')}</span>
      <NumberSelect
        value={state.hour}
        onChange={(hour) => emit({ ...state, hour })}
        options={hourOptions}
        format={pad2}
        disabled={readOnly}
        ariaLabel={t('cronjob.schedule.cronField.hour')}
      />
      <span className="text-muted-foreground">:</span>
      <NumberSelect
        value={state.minute}
        onChange={(minute) => emit({ ...state, minute })}
        options={minuteOptions}
        format={pad2}
        disabled={readOnly}
        ariaLabel={t('cronjob.schedule.cronField.minute')}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cron_mode">{t('cronjob.schedule.mode')}</Label>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Select
            value={state.mode}
            onValueChange={(mode) => emit(withMode(state, mode as CronMode))}
            disabled={readOnly}
          >
            <SelectTrigger id="cron_mode" className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`cronjob.schedule.modeOption.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {state.mode === 'everyNMinutes' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('cronjob.schedule.every')}</span>
              <NumberSelect
                value={state.everyN}
                onChange={(everyN) => emit({ ...state, everyN })}
                options={EVERY_N_MINUTE_CHOICES}
                disabled={readOnly}
                ariaLabel={t('cronjob.schedule.every')}
              />
              <span className="text-sm text-muted-foreground">
                {t('cronjob.schedule.minutesUnit')}
              </span>
            </div>
          )}

          {state.mode === 'hourly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('cronjob.schedule.atMinute')}</span>
              <NumberSelect
                value={state.minute}
                onChange={(minute) => emit({ ...state, minute })}
                options={minuteOptions}
                format={pad2}
                disabled={readOnly}
                ariaLabel={t('cronjob.schedule.cronField.minute')}
              />
            </div>
          )}

          {state.mode === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t('cronjob.schedule.onDayOfMonth')}
              </span>
              <NumberSelect
                value={state.dayOfMonth}
                onChange={(dayOfMonth) => emit({ ...state, dayOfMonth })}
                options={dayOptions}
                disabled={readOnly}
                ariaLabel={t('cronjob.schedule.cronField.dayOfMonth')}
              />
            </div>
          )}

          {(state.mode === 'daily' || state.mode === 'weekly' || state.mode === 'monthly') &&
            timeControls}
        </div>

        {state.mode === 'weekly' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <span className="text-sm text-muted-foreground">{t('cronjob.schedule.onWeekdays')}</span>
            {/* ปุ่มเจ็ดวันกว้างเท่ากันทุกปุ่มด้วย min-w — ตัวย่อไทยยาวไม่เท่ากัน ('จ' กับ 'พฤ')
                ถ้าปล่อยให้กว้างตามข้อความ ตำแหน่งปุ่มจะขยับทุกครั้งที่สลับภาษา */}
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_KEYS.map((key, day) => {
                const on = state.weekdays.includes(day);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={on}
                    onClick={() => toggleWeekday(day)}
                    title={t(`common.weekday.${key}`)}
                    className={cn(
                      'h-9 min-w-[2.5rem] rounded-md border px-1.5 text-xs font-medium transition-colors',
                      'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
                      'disabled:pointer-events-none disabled:opacity-50',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {t(`common.weekdayShort.${key}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {state.mode === 'custom' && (
          <div className="space-y-1 pt-1">
            <div className="grid grid-cols-5 gap-2 sm:max-w-lg">
              {CRON_FIELD_KEYS.map((key, index) => (
                <div key={key} className="space-y-1">
                  <Input
                    className="h-9 px-2 text-center font-mono"
                    aria-label={t(`cronjob.schedule.cronField.${key}`)}
                    disabled={readOnly}
                    value={state.fields[index]}
                    onChange={(e) => setField(index, e.target.value)}
                  />
                  <p className="truncate text-center text-[11px] text-muted-foreground">
                    {t(`cronjob.schedule.cronField.${key}`)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('cronjob.schedule.customHint')}</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cron_expression">{t('cronjob.field.cronExpression')}</Label>
        <Input
          id="cron_expression"
          className="font-mono"
          placeholder="0 2 * * *"
          disabled={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && sentence === null && (
          <p className="text-xs text-destructive">{t('cronjob.validation.invalidCron')}</p>
        )}
        {sentence && <p className="text-sm text-muted-foreground">{sentence}</p>}
        {upcoming.length > 0 && (
          <>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {upcoming.map((d) => (
                <li key={d.toISOString()}>{d.toLocaleString()}</li>
              ))}
            </ul>
            {/* I7 fix: this preview is computed in the browser's timezone, but the scheduler
                runs in a server-resolved one — we cannot know that zone from here, so this
                caption is honest about which timezone the numbers above are in rather than
                silently presenting them as the same fact as the server's own next-run time. */}
            <p className="text-[11px] text-muted-foreground">
              {t('cronjob.schedule.localTimezoneCaption', {
                zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
