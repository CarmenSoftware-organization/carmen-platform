import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Loader2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  /**
   * Optional icon shown in a rounded box beside the title/description, matching
   * carmen-inventory-frontend-react's own logout-confirmation dialog. Omitted by every other
   * caller of this shared component — adding it here (rather than a one-off custom dialog)
   * keeps the "always use ConfirmDialog for a destructive action" rule intact.
   */
  icon?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  confirmVariant = 'default',
  onConfirm,
  icon,
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {icon ? (
            <div className="flex items-start gap-3">
              <div className="bg-muted text-destructive flex size-9 shrink-0 items-center justify-center rounded-lg">
                {icon}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <DialogTitle className="text-base">{title}</DialogTitle>
                <DialogDescription className="mt-1">{description}</DialogDescription>
              </div>
            </div>
          ) : (
            <>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelText ?? t('common.cancel')}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
