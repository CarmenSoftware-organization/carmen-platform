import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

interface PasswordFieldProps {
  /** true เมื่อโปรไฟล์ที่บันทึกไว้มีรหัสผ่านอยู่ */
  hasStoredPassword: boolean;
  /** true เมื่อกำลังสร้างโปรไฟล์ใหม่ — ไม่มีสถานะ idle ให้กลับไป */
  isNew: boolean;
  /**
   * ค่าที่จะส่งไป backend: string = ตั้งค่าใหม่, undefined = ไม่เปลี่ยน
   * จงใจไม่รองรับ null/'' เพื่อให้ "ล้างรหัสผ่านโดยอุบัติเหตุ" เป็นสิ่งที่พิมพ์ไม่ออก
   */
  onChange: (value: string | undefined) => void;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  hasStoredPassword,
  isNew,
  onChange,
}) => {
  const [editing, setEditing] = useState(isNew);
  const [value, setValue] = useState('');

  const startEditing = () => {
    setEditing(true);
    setValue('');
    onChange(undefined);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue('');
    onChange(undefined);
  };

  const handleInput = (next: string) => {
    setValue(next);
    onChange(next === '' ? undefined : next);
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <Label>SMTP password</Label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {hasStoredPassword ? 'ตั้งรหัสผ่านไว้แล้ว' : 'ไม่ได้ตั้งรหัสผ่าน'}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            {hasStoredPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
          </Button>
        </div>
        {!hasStoredPassword && (
          <p className="text-xs text-muted-foreground">
            โปรไฟล์นี้ส่งเมลโดยไม่ยืนยันตัวตนกับเซิร์ฟเวอร์ SMTP
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="smtp_password">SMTP password</Label>
      <div className="flex items-center gap-3">
        <Input
          id="smtp_password"
          type="password"
          autoComplete="new-password"
          aria-label="SMTP password"
          value={value}
          onChange={(e) => handleInput(e.target.value)}
        />
        {!isNew && (
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
            ยกเลิก
          </Button>
        )}
      </div>
      {!isNew && <p className="text-xs text-muted-foreground">ปล่อยว่าง = ไม่เปลี่ยนรหัสผ่านเดิม</p>}
      <p className="text-xs text-muted-foreground">
        หน้านี้ลบรหัสผ่านออกจากโปรไฟล์ที่มีอยู่ไม่ได้ — ถ้าจะย้ายไปใช้ relay ที่ไม่ต้องยืนยันตัวตน
        ให้ยกเลิกการตั้งค่าแล้วสร้างใหม่
      </p>
    </div>
  );
};
