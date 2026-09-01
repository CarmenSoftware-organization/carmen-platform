import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { lineTone } from '../../utils/logLineTone';
import { useI18n } from '../../hooks/useI18n';

interface RunConsoleProps {
  /** ชื่อ op ที่แปลแล้ว — null เมื่อยังไม่เคยรันอะไรในรอบนี้ คอมโพเนนต์จะไม่เรนเดอร์อะไรเลย */
  opLabel: string | null;
  lines: string[];
  running: boolean;
  result: { success: boolean; exit_code: number } | null;
}

/**
 * คอนโซล log ของหน้า platform migrations
 *
 * เขียนแยกจาก DeployConsole ของหน้า tenant migration โดยเจตนา ตัวนั้นรับ prop เป็น BatchProgress
 * ซึ่งเป็น type ของหน้านั้น และเรียกคีย์ i18n ของหน้านั้นตรง ๆ การใช้ซ้ำต้องบิดความหมายทั้งสองฝั่ง
 * สิ่งที่ใช้ร่วมกันได้จริงคือ lineTone() ซึ่งย้ายไป utils แล้ว
 *
 * ไม่มีแถบความคืบหน้า เพราะสคริปต์เหล่านี้ไม่รายงานจำนวนงานทั้งหมดออกมา การเดาเปอร์เซ็นต์
 * จะเป็นตัวเลขที่แต่งขึ้น
 */
export function RunConsole({ opLabel, lines, running, result }: RunConsoleProps) {
  const { t } = useI18n();
  if (!opLabel) return null;

  return (
    <div className="overflow-hidden rounded-xl border shadow-xs">
      <div className="bg-card flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          {running ? (
            <Loader2 className="text-warning size-3.5 shrink-0 animate-spin" />
          ) : result?.success ? (
            <CheckCircle2 className="text-success size-3.5 shrink-0" />
          ) : (
            <XCircle className="text-destructive size-3.5 shrink-0" />
          )}
          <span className="truncate">{opLabel}</span>
        </div>
        {!running && result && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
            exit {result.exit_code}
          </span>
        )}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={t('pages.platformMigration.consoleAria')}
        className="max-h-56 overflow-auto bg-[hsl(222_44%_7%)] px-4 py-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 && (
          <div className="text-slate-500">{t('pages.platformMigration.consoleWaiting')}</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`break-all ${lineTone(line)}`}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RunConsole;
