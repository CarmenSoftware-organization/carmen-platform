import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useI18n } from '../../hooks/useI18n';
import { describeCron, nextRuns } from '../../utils/cronExpression';

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  error?: string;
}

/**
 * ช่องกรอก cron expression พร้อมคำอ่านและเวลารันสามรอบถัดไป
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

  return (
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
            {t('cronjob.schedule.localTimezoneCaption', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
          </p>
        </>
      )}
    </div>
  );
}
