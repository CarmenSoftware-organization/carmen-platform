import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import platformConfigService from '../../services/platformConfigService';
import { EMAIL_FLOWS } from '../../constants/emailFlows';
import { parseApiError } from '../../utils/errorParser';
import type { EmailRoutingConfig, EmailSetting } from '../../types';

interface EmailRoutingCardProps {
  profiles: EmailSetting[];
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

/** ค่าที่ใช้ในดรอปดาวน์แทน "ไม่ระบุ" — Select ของ Radix ใช้ค่าว่างเป็น value ไม่ได้ */
const USE_DEFAULT = '__default__';

/**
 * การ์ดจับคู่ "เส้นทางอีเมล → โปรไฟล์ผู้ส่ง"
 *
 * โปรไฟล์เป็นรายการหลักที่ตั้งชื่อได้ (การ์ดด้านล่าง) ส่วนการ์ดนี้ตอบคำถามเดียวว่าเส้นทางไหน
 * ส่งด้วยโปรไฟล์ตัวใด เก็บเป็น id ไม่ใช่ชื่อ ผู้ดูแลจึงเปลี่ยนชื่อโปรไฟล์ได้โดย mapping ไม่ขาด
 *
 * เส้นทางที่เลือก "ใช้ค่าเริ่มต้น" จะไม่ถูกบันทึกเป็นคีย์เลย backend จึงตกไปใช้ `default`
 * ซึ่งแปลว่าเส้นทางที่เพิ่มใหม่ในอนาคตส่งได้ทันทีโดยไม่ต้องมาตั้งค่าก่อน
 */
export const EmailRoutingCard: React.FC<EmailRoutingCardProps> = ({
  profiles,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [routing, setRouting] = useState<EmailRoutingConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const liveProfiles = profiles.filter((p) => p.is_active !== false);

  React.useEffect(() => {
    let cancelled = false;
    platformConfigService
      .getByKey('email_routing')
      .then((row) => {
        if (cancelled) return;
        const value = (row?.value ?? {}) as unknown as EmailRoutingConfig;
        setRouting(value);
        setDraft({
          default: value.default ?? '',
          ...Object.fromEntries(
            EMAIL_FLOWS.map((f) => [f.value, value[f.value] ?? USE_DEFAULT]),
          ),
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(parseApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = (id: string | undefined): string =>
    profiles.find((p) => p.id === id)?.name ?? '—';

  const handleSave = async () => {
    if (!draft.default) {
      setError('ต้องเลือกโปรไฟล์เริ่มต้น');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload: EmailRoutingConfig = { default: draft.default };
      for (const flow of EMAIL_FLOWS) {
        const chosen = draft[flow.value];
        // ไม่บันทึกคีย์ของเส้นทางที่เลือก "ใช้ค่าเริ่มต้น" — ปล่อยให้ backend ตกไปใช้ default เอง
        if (chosen && chosen !== USE_DEFAULT) payload[flow.value] = chosen;
      }
      await platformConfigService.update('email_routing', payload);
      setRouting(payload);
      toast.success('บันทึกการจับคู่อีเมลแล้ว');
      await onSaved();
      onCancelEdit();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Email routing</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            เส้นทางไหนส่งด้วยโปรไฟล์ผู้ส่งตัวใด
          </p>
        </div>
        {canManage && !isEditing && !loading && (
          <Button variant="outline" size="sm" onClick={onRequestEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit routing
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="routing-default">Default</Label>
              {isEditing ? (
                <Select
                  value={draft.default}
                  onValueChange={(v) => setDraft((prev) => ({ ...prev, default: v }))}
                >
                  <SelectTrigger id="routing-default">
                    <SelectValue placeholder="เลือกโปรไฟล์" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                  {nameOf(routing?.default)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                ใช้กับทุกเส้นทางที่ไม่ได้เลือกไว้เป็นการเฉพาะ รวมถึงเส้นทางที่เพิ่มใหม่ในอนาคต
              </p>
            </div>

            {EMAIL_FLOWS.map((flow) => (
              <div key={flow.value} className="space-y-2">
                <Label htmlFor={`routing-${flow.value}`}>{flow.label}</Label>
                {isEditing ? (
                  <Select
                    value={draft[flow.value] ?? USE_DEFAULT}
                    onValueChange={(v) => setDraft((prev) => ({ ...prev, [flow.value]: v }))}
                  >
                    <SelectTrigger id={`routing-${flow.value}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={USE_DEFAULT}>ใช้ค่าเริ่มต้น</SelectItem>
                      {liveProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                    {routing?.[flow.value] ? nameOf(routing[flow.value]) : 'ใช้ค่าเริ่มต้น'}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{flow.description}</p>
              </div>
            ))}

            {error && <p className="text-xs text-destructive">{error}</p>}

            {isEditing && (
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={onCancelEdit} disabled={saving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
