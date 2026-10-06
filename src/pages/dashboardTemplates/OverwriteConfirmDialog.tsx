import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';

const CONFIRM_CODE = 'OVERWRITE';
// เหมือน NewsManagement — ตัวโค้ดต้องเป็น <span> จึงแยกประโยคด้วย marker
const CONFIRM_CODE_MARKER = '@@CODE@@';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customizedCount: number;
  selectedCount: number;
  onConfirm: () => void;
}

export default function OverwriteConfirmDialog({ open, onOpenChange, customizedCount, selectedCount, onConfirm }: Props) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  useEffect(() => { if (open) setInput(''); }, [open]);

  const [before, after = ''] = t('pages.dashboardTemplates.typeToConfirm', { code: CONFIRM_CODE_MARKER }).split(CONFIRM_CODE_MARKER);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('pages.dashboardTemplates.overwriteTitle')}
          </DialogTitle>
          <DialogDescription>
            {customizedCount > 0 ? t('pages.dashboardTemplates.overwriteDescription', { count: customizedCount }) : t('pages.dashboardTemplates.modeOverwrite')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="dt-overwrite-confirm">
            {before}<span className="font-mono font-semibold text-destructive">{CONFIRM_CODE}</span>{after}
          </Label>
          <Input
            id="dt-overwrite-confirm"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="destructive" size="sm" disabled={input !== CONFIRM_CODE} onClick={onConfirm}>
            {t('pages.dashboardTemplates.deployButton', { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
