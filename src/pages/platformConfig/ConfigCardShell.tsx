import React from 'react';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

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
  /** ฟิลด์ของการ์ดนั้น — shell ไม่รู้จักและไม่ยุ่งกับ form state */
  children: React.ReactNode;
}

/**
 * เปลือกของการ์ดใน Platform Config — header, ปุ่ม Edit และแถบ Save/Cancel
 *
 * ตั้งใจไม่ถือ form state: `formData` / `fieldErrors` / `validate` / การเรียก service
 * ยังอยู่ในการ์ดแต่ละใบ เพราะหน้านี้ไม่มี test รองรับ การดึง logic ออกมาด้วยจะเปลี่ยน
 * พฤติกรรมของการ์ดที่ทำงานอยู่ 4 ชุดพร้อมกันโดยไม่มีอะไรจับ regression
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
  children,
}) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div className="min-w-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {canManage && !isEditing && (
        <Button variant="outline" size="sm" onClick={onRequestEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      )}
    </CardHeader>
    <CardContent className="space-y-4">
      {children}

      {isEditing && (
        <div className="flex gap-3 pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
);

/** ช่องอ่านอย่างเดียวของฟอร์ม config — เดิมประกาศซ้ำในทุกการ์ด */
export const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);
