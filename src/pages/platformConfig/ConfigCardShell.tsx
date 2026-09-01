import React from 'react';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { useI18n } from '../../hooks/useI18n';

interface ConfigCardShellProps {
  title: string;
  /** คำอธิบายใต้หัวข้อการ์ด รับ node ได้เพื่อให้ใส่ <code> หรือลิงก์ได้ */
  description: React.ReactNode;
  canManage: boolean;
  isEditing: boolean;
  saving: boolean;
  onRequestEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** เนื้อหาที่ไม่ใช่ฟิลด์ เช่นกล่องคำเตือน — วางใต้รายการฟิลด์ นอกเส้นคั่นของทะเบียน */
  note?: React.ReactNode;
  /** แถบ "ใครแก้เมื่อไหร่" ท้ายการ์ด — audit เป็นของหน้าเพจ การ์ดแค่รับมาวาง */
  footer?: React.ReactNode;
  /** ต้องเป็น <ConfigField> เท่านั้น — โหมดอ่านห่อด้วย <dl> ที่ขีดเส้นคั่นให้ทุกลูก */
  children: React.ReactNode;
}

/**
 * เปลือกของการ์ดใน Platform Config — header, ปุ่มโหมด และรายการฟิลด์
 *
 * ตั้งใจไม่ถือ form state: `formData` / `fieldErrors` / `validate` / การเรียก service
 * ยังอยู่ในการ์ดแต่ละใบ เพราะหน้านี้ไม่มี test รองรับ การดึง logic ออกมาด้วยจะเปลี่ยน
 * พฤติกรรมของการ์ดที่ทำงานอยู่ 6 ชุดพร้อมกันโดยไม่มีอะไรจับ regression
 *
 * ปุ่ม Save/Cancel อยู่ที่ header ตำแหน่งเดียวกับปุ่ม Edit ที่มันแทนที่ — หน้านี้มีการ์ดที่
 * แก้ได้ 6 ใบเรียงกัน การ์ดที่กำลังแก้อยู่จึงต้องแยกออกจากอีก 5 ใบได้ตั้งแต่แถวบนสุด
 * ไม่ใช่ต้องกวาดตาลงไปหาแถบปุ่มที่ก้นการ์ด
 */
export const ConfigCardShell: React.FC<ConfigCardShellProps> = ({
  title,
  description,
  canManage,
  isEditing,
  saving,
  onRequestEdit,
  onSave,
  onCancel,
  note,
  footer,
  children,
}) => {
  const { t } = useI18n();
  return (
    <Card className={isEditing ? 'border-primary/60 shadow-sm' : undefined}>
      {/* `items-start` ทำงานทั้งสองทิศ: แนวตั้งบนมือถือให้ปุ่มกว้างเท่าตัวเองไม่ยืดเต็มแถว
          (ปุ่มเต็มความกว้างอ่านเป็น action ของทั้งหน้า ไม่ใช่ของการ์ด) แนวนอนให้ปุ่มชิดบน */}
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 pb-3 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {isEditing ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              {t('common.cancel')}
            </Button>
          </div>
        ) : canManage ? (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onRequestEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('common.action.edit')}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {isEditing ? (
          <div className="space-y-4">{children}</div>
        ) : (
          // โหมดอ่านคือทะเบียนค่า ไม่ใช่ฟอร์ม — เส้นคั่นบาง ๆ ต่อแถวแทนกรอบกล่องต่อค่า
          // `-my-1` หักช่องว่างแถวแรก/สุดท้ายออก ให้ค่าชิดขอบการ์ดเท่ากับส่วนอื่น
          <dl className="-my-1 divide-y divide-border/60">{children}</dl>
        )}

        {note}

        {footer && <div className="border-t pt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
};

interface ConfigFieldProps {
  label: string;
  /** id ของ control ตอนแก้ — โหมดอ่านไม่มี control จึงไม่ใช้ */
  htmlFor?: string;
  isEditing: boolean;
  /** ค่าที่บันทึกไว้ ใช้เฉพาะโหมดอ่าน */
  value?: React.ReactNode;
  /** ค่าเป็น URL หรือค่าทางเทคนิค — แสดงด้วย font-mono และตัดกลางคำได้ */
  mono?: boolean;
  /** ป้ายสถานะข้างค่า (โหมดอ่าน) หรือข้าง label (โหมดแก้) */
  badge?: React.ReactNode;
  /** คำอธิบายวิธีตั้งค่า — โผล่เฉพาะตอนแก้ ตอนกวาดตาอ่านมันกลบค่าจริงทิ้ง */
  hint?: React.ReactNode;
  error?: string;
  /** control ตอนแก้ */
  children?: React.ReactNode;
}

/**
 * ฟิลด์หนึ่งค่าใน Platform Config — เปลี่ยนรูปตามโหมดของการ์ด
 *
 * โหมดอ่าน: แถว label/ค่า ไม่มีกรอบ ไม่มีคำอธิบาย เพราะงานของหน้านี้เกือบทั้งหมดคือ
 * "ค่าที่ใช้อยู่ตอนนี้คืออะไร" การวาดค่าอ่านอย่างเดียวเป็นกล่องหน้าตาเหมือน `<input>`
 * (ของเดิม) ทำให้ทั้งหน้าดูกดพิมพ์ได้ทั้งที่กดไม่ได้
 *
 * โหมดแก้: label บน / control ล่าง / คำอธิบายใต้สุด — คำอธิบายมีค่าตอนกำลังพิมพ์
 */
export const ConfigField: React.FC<ConfigFieldProps> = ({
  label,
  htmlFor,
  isEditing,
  value,
  mono,
  badge,
  hint,
  error,
  children,
}) => {
  if (!isEditing) {
    return (
      <div className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:items-baseline">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={mono ? 'min-w-0 font-mono text-[13px] break-all' : 'min-w-0 text-sm break-words'}>
            {value === '' || value == null ? <span className="text-muted-foreground">—</span> : value}
          </span>
          {badge}
        </dd>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {badge}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};
