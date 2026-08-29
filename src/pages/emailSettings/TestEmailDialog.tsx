import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import emailSettingService from '../../services/emailSettingService';
import { parseApiError } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

interface TestEmailDialogProps {
  open: boolean;
  settingId: string;
  /**
   * ตัวตนของผู้เรียก — อาจเป็น username ไม่ใช่อีเมล เพราะ AuthContext ตั้ง
   * user.email จาก credentials.username จึง prefill เฉพาะเมื่อมี '@'
   */
  defaultTo: string;
  onOpenChange: (open: boolean) => void;
}

// เก็บ TKey ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้
const REASON_MESSAGE: Record<string, TKey> = {
  'smtp-error': 'pages.emailSettings.reasonSmtpError',
  'decrypt-failed':
    'pages.emailSettings.reasonDecryptFailed',
  'lookup-failed': 'pages.emailSettings.reasonLookupFailed',
  'no-config': 'pages.emailSettings.reasonNoConfig',
};

export const TestEmailDialog: React.FC<TestEmailDialogProps> = ({
  open,
  settingId,
  defaultTo,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const [to, setTo] = useState(defaultTo.includes('@') ? defaultTo : '');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await emailSettingService.sendTest(settingId, to);
      if (result.sent) {
        const target = to.trim() || t('pages.emailSettings.yourEmail');
        toast.success(t('pages.emailSettings.testSentToast', { target }));
        onOpenChange(false);
        return;
      }
      toast.error(
        REASON_MESSAGE[result.reason ?? '']
          ? t(REASON_MESSAGE[result.reason ?? ''])
          : t('pages.emailSettings.testFailedToast'),
      );
    } catch (err: unknown) {
      toast.error(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pages.emailSettings.testEmailTitle')}</DialogTitle>
          <DialogDescription>
            {t('pages.emailSettings.testEmailDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test_to">{t('pages.emailSettings.recipient')}</Label>
          <Input
            id="test_to"
            aria-label={t('pages.emailSettings.recipient')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('pages.emailSettings.recipientPlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t('pages.emailSettings.sendTestEmail')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
