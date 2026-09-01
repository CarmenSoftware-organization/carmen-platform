import { Play } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PlatformSeedOp } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface OpRowProps {
  op: PlatformSeedOp;
  label: string;
  desc: string;
  /** ปิดปุ่มเพราะมี op อื่นวิ่งอยู่ หรือหน้าอยู่ในสถานะอ่านสถานะไม่ได้ */
  disabled: boolean;
  onRun: () => void;
}

/**
 * หนึ่งแถวของ op ในการ์ด Seeds หรือ Checks
 *
 * `missing` ปิดปุ่มตั้งแต่แรกแทนที่จะปล่อยให้กดแล้วได้ 422 — ธงนี้มาจาก backend ที่ตรวจไฟล์จริง
 * ใน image ไม่ใช่การเดาจากฝั่งหน้าเว็บ
 */
export function OpRow({ op, label, desc, disabled, onRun }: OpRowProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {op.missing && (
            <Badge variant="secondary">{t('pages.platformMigration.opMissing')}</Badge>
          )}
          {op.readonly && (
            <Badge variant="success">{t('pages.platformMigration.opReadonly')}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{desc}</p>
        <p className="text-muted-foreground/70 mt-0.5 font-mono text-[10px] break-all sm:text-xs">
          {op.script}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={disabled || op.missing}
        onClick={onRun}
      >
        <Play className="mr-2 h-4 w-4" />
        {t('pages.platformMigration.opRun')}
      </Button>
    </div>
  );
}

export default OpRow;
