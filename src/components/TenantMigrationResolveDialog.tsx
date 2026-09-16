import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import tenantMigrationService from '../services/tenantMigrationService';
import { handleMigrationError, MIGRATION_NAME_RE } from '../utils/migrationError';
import { useI18n } from '../hooks/useI18n';
import type { TenantMigrationResolveAction } from '../types';

interface TenantMigrationResolveDialogProps {
  /** BU ที่จะแก้สถานะ — null คือปิดกล่อง */
  bu: { id: string; code: string; name: string } | null;
  /** ชื่อ migration ที่แกะได้จาก error ล่าสุด ใช้เติมช่องให้ล่วงหน้า ไม่มีก็ให้พิมพ์เอง */
  defaultMigrationName?: string;
  onOpenChange: (open: boolean) => void;
  /** เรียกหลัง resolve สำเร็จ — ผู้เรียกต้องถามสถานะใหม่เอง ไม่งั้นจอค้างสถานะเดิม */
  onResolved: () => void | Promise<void>;
  /** เหตุผลที่ห้ามกด (ไม่ใช่ super-admin ฯลฯ) — มีค่าเมื่อไหร่ปุ่มยืนยันดับ */
  disabledReason?: string | null;
}

/**
 * กล่องแก้ migration ที่ค้างสถานะของ BU หนึ่ง (`prisma migrate resolve`)
 *
 * ใช้ร่วมกันสองที่: ตารางในหน้า /tenant-migrations และการ์ดในแท็บ Technical ของหน้าแก้ไข BU
 * ทั้งสองที่ยิง endpoint เดียวกันและต้องเตือนเรื่องเดียวกัน จึงไม่ควรมีสองสำเนา
 *
 * ค่าเริ่มต้นของ action คือ 'rolled-back' โดยตั้งใจ — เป็นฝั่งที่ปลอดภัยกว่า เพราะ 'applied'
 * บอกระบบว่า SQL ของ migration นั้นรันไปแล้วทั้งที่อาจไม่ได้รัน ทำให้ migration ถัดไป
 * ต่อยอดจากสคีมาที่ไม่มีอยู่จริง
 */
export const TenantMigrationResolveDialog = ({
  bu,
  defaultMigrationName,
  onOpenChange,
  onResolved,
  disabledReason = null,
}: TenantMigrationResolveDialogProps) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [action, setAction] = useState<TenantMigrationResolveAction>('rolled-back');
  const [resolving, setResolving] = useState(false);

  // ตั้งค่าใหม่ทุกครั้งที่กล่องเปิดกับ BU ตัวใหม่ — ไม่ใช้ `key` ที่ผู้เรียกเพราะ Dialog
  // ของ Radix ต้องคงอยู่ข้ามการปิดเพื่อเล่นอนิเมชันปิดให้จบ
  useEffect(() => {
    if (!bu) return;
    setName(defaultMigrationName ?? '');
    setAction('rolled-back');
  }, [bu, defaultMigrationName]);

  const trimmed = name.trim();
  const nameValid = MIGRATION_NAME_RE.test(trimmed);

  const handleResolve = async () => {
    if (!bu || !nameValid || disabledReason) return;
    setResolving(true);
    try {
      await tenantMigrationService.resolve(bu.id, trimmed, action);
      toast.success(t('pages.tenantMigration.resolveSuccess', { name: trimmed, code: bu.code }));
      onOpenChange(false);
      await onResolved();
    } catch (err) {
      handleMigrationError(err, t);
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog
      open={bu !== null}
      onOpenChange={(open) => { if (!open && !resolving) onOpenChange(false); }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pages.tenantMigration.resolveTitle')}</DialogTitle>
          <DialogDescription>
            {bu ? t('pages.tenantMigration.resolveFor', { name: bu.name, code: bu.code }) : ''}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t('pages.tenantMigration.resolveDescription')}
        </p>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tenant-resolve-name">
              {t('pages.tenantMigration.migrationNameLabel')}
            </Label>
            <Input
              id="tenant-resolve-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('pages.tenantMigration.migrationNamePlaceholder')}
              className="font-mono text-xs"
              disabled={resolving}
            />
            {trimmed !== '' && !nameValid && (
              <p className="text-xs text-destructive" role="alert">
                {t('pages.tenantMigration.migrationNameInvalid')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-resolve-action">
              {t('pages.tenantMigration.actionLabel')}
            </Label>
            <Select
              value={action}
              onValueChange={(v) => setAction(v as TenantMigrationResolveAction)}
              disabled={resolving}
            >
              <SelectTrigger id="tenant-resolve-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rolled-back">{t('pages.tenantMigration.actionRolledBack')}</SelectItem>
                <SelectItem value="applied">{t('pages.tenantMigration.actionApplied')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          {/* type="button" สำคัญ: การ์ดที่ใช้กล่องนี้อยู่ในหน้าแก้ไข BU ซึ่งมี <form> ครอบ */}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={resolving}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleResolve}
            disabled={resolving || !nameValid || !!disabledReason}
          >
            {resolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('pages.tenantMigration.resolveButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TenantMigrationResolveDialog;
