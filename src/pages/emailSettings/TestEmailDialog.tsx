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

const REASON_MESSAGE: Record<string, string> = {
  'smtp-error': 'เชื่อมต่อ SMTP ไม่สำเร็จ — ตรวจ host, port, TLS และรหัสผ่าน',
  'decrypt-failed':
    'ถอดรหัสรหัสผ่านไม่ได้ — SECRET_ENCRYPTION_KEY ของเซิร์ฟเวอร์ไม่ตรงกัน ต้องให้ทีมระบบตรวจ',
  'lookup-failed': 'อ่านโปรไฟล์จากฐานข้อมูลไม่ได้',
  'no-config': 'ไม่พบการตั้งค่า SMTP สำหรับโปรไฟล์นี้',
};

export const TestEmailDialog: React.FC<TestEmailDialogProps> = ({
  open,
  settingId,
  defaultTo,
  onOpenChange,
}) => {
  const [to, setTo] = useState(defaultTo.includes('@') ? defaultTo : '');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await emailSettingService.sendTest(settingId, to);
      if (result.sent) {
        const target = to.trim() || 'อีเมลของคุณ';
        toast.success(`ส่งไปที่ ${target} แล้ว — ตรวจกล่องขาเข้าและ spam`);
        onOpenChange(false);
        return;
      }
      toast.error(REASON_MESSAGE[result.reason ?? ''] ?? 'ส่งเมลทดสอบไม่สำเร็จ');
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
          <DialogTitle>ส่งเมลทดสอบ</DialogTitle>
          <DialogDescription>
            ส่งข้อความทดสอบผ่านโปรไฟล์ที่บันทึกไว้ เพื่อยืนยันว่าค่า SMTP ใช้งานได้จริง
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test_to">ผู้รับ</Label>
          <Input
            id="test_to"
            aria-label="ผู้รับ"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="เว้นว่าง = ส่งไปที่อีเมลของคุณ"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            ยกเลิก
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            ส่งเมลทดสอบ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
