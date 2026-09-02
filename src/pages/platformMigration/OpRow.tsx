import { Play } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PlatformSeedOp } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface OpRowProps {
  op: PlatformSeedOp;
  label: string;
  desc: string;
  /** การ์ดที่แถวนี้อยู่ — ตัดสินน้ำหนักของปุ่มและป้ายไหนคือ "ผิดจากที่คาด" */
  tone: 'seed' | 'check';
  /** ปิดปุ่มเพราะมี op อื่นวิ่งอยู่ หรือหน้าอยู่ในสถานะอ่านสถานะไม่ได้ */
  disabled: boolean;
  /** กดแล้วจะมีกล่องถามค่าก่อน ไม่ใช่เริ่มรันทันที — ปุ่มต้องบอกด้วยจุดไข่ปลา */
  needsInput?: boolean;
  onRun: () => void;
}

/**
 * หนึ่งแถวของ op ในการ์ด Seeds หรือ Checks
 *
 * `missing` ปิดปุ่มตั้งแต่แรกแทนที่จะปล่อยให้กดแล้วได้ 422 — ธงนี้มาจาก backend ที่ตรวจไฟล์จริง
 * ใน image ไม่ใช่การเดาจากฝั่งหน้าเว็บ
 *
 * ป้ายอ่าน/เขียนติดเฉพาะแถวที่ "ผิดจากที่การ์ดบอก" — การ์ด Seeds ประกาศไว้แล้วว่าทั้งใบเขียนจริง
 * การ์ด Checks ประกาศว่าทั้งใบอ่านอย่างเดียว ติดป้ายทุกแถวเท่ากับพูดซ้ำสิบสามครั้งจนไม่มีใครอ่าน
 * ส่วนตัวที่หลุดกรอบต้องสะดุดตา ถ้าวันหนึ่ง backend ใส่ op ที่เขียนจริงลงกลุ่ม check มันจะติดป้าย
 * เตือนเองโดยไม่ต้องแก้ไฟล์นี้
 */
export function OpRow({ op, label, desc, tone, disabled, needsInput, onRun }: OpRowProps) {
  const { t } = useI18n();
  const offTone = tone === 'seed' ? op.readonly === true : op.readonly !== true;
  return (
    <div className="flex flex-col gap-1.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {op.missing && (
            <Badge variant="secondary">{t('pages.platformMigration.opMissing')}</Badge>
          )}
          {offTone && (
            <Badge variant={op.readonly ? 'secondary' : 'warning'}>
              {op.readonly
                ? t('pages.platformMigration.opReadonly')
                : t('pages.platformMigration.opWrites')}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {desc}
          <span className="text-muted-foreground/60 ml-2 font-mono text-[10px] break-all sm:text-[11px]">
            {op.script}
          </span>
        </p>
      </div>
      {/* น้ำหนักของปุ่มตามความเสี่ยงของการกด: seed มีขอบ check เป็น ghost — สิบสามปุ่มที่เขียนว่า
          "Run" เหมือนกันหมดไม่ได้บอกอะไรเลย สองน้ำหนักบอกว่ากดแล้วมีอะไรเปลี่ยนหรือไม่ */}
      <Button
        variant={tone === 'seed' ? 'outline' : 'ghost'}
        size="sm"
        className="shrink-0 self-start sm:self-auto"
        disabled={disabled || op.missing}
        onClick={onRun}
      >
        <Play className="mr-2 h-4 w-4" />
        {needsInput ? t('pages.platformMigration.opRunWithInput') : t('pages.platformMigration.opRun')}
      </Button>
    </div>
  );
}

export default OpRow;
