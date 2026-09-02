import React, { useEffect, useState } from 'react';
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
import { RoutingPanel } from './RoutingPanel';
import type { RoutingMap } from './routingLanes';
import type { EmailRoutingConfig, EmailSetting } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface EmailRoutingCardProps {
  profiles: EmailSetting[];
  routing: EmailRoutingConfig | null;
  map: RoutingMap;
  loading: boolean;
  loadError: string;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (next: EmailRoutingConfig) => void | Promise<void>;
}

/** ค่าที่ใช้ในดรอปดาวน์แทน "ไม่ระบุ" — Select ของ Radix ใช้ค่าว่างเป็น value ไม่ได้ */
const USE_DEFAULT = '__default__';

/**
 * แผงสายอีเมล — โหมดอ่านคือผัง `RoutingPanel` โหมดแก้คือดรอปดาวน์รายเส้นทาง
 *
 * สองโหมดตอบคนละคำถามโดยตั้งใจ ตอนอ่านผู้ดูแลถามว่า "ตอนนี้อะไรออกจากปากไหน" ซึ่งอ่านจากฝั่ง
 * โปรไฟล์ได้ตรงกว่า ตอนแก้ผู้ดูแลถามว่า "เส้นทางนี้ควรไปที่ไหน" ซึ่งต้องเรียงตามเส้นทาง เดิมหน้า
 * นี้ใช้รูปเดียวกันทั้งสองโหมด ผลคือโหมดอ่านกลายเป็นฟอร์มที่กดไม่ได้ 6 ช่อง
 *
 * mapping ที่บันทึกไว้มาจากหน้าแม่ (`useEmailRouting`) ไม่ใช่ยิงเองที่นี่ เพราะการ์ดโปรไฟล์
 * ต้องอ่านชุดเดียวกัน — ดูเหตุผลเต็มในหัวไฟล์ของ hook
 *
 * เส้นทางที่เลือก "ใช้ค่าเริ่มต้น" จะไม่ถูกบันทึกเป็นคีย์เลย backend จึงตกไปใช้ `default`
 * ซึ่งแปลว่าเส้นทางที่เพิ่มใหม่ในอนาคตส่งได้ทันทีโดยไม่ต้องมาตั้งค่าก่อน
 */
export const EmailRoutingCard: React.FC<EmailRoutingCardProps> = ({
  profiles,
  routing,
  map,
  loading,
  loadError,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const liveProfiles = profiles.filter((p) => p.is_active !== false);

  // ตั้ง draft ใหม่ทุกครั้งที่เข้าโหมดแก้ ไม่ใช่ครั้งเดียวตอนโหลดเสร็จ — ระหว่างที่การ์ดยังคาอยู่
  // หน้าอาจ refetch mapping จากการบันทึกที่อื่น ถ้าไม่ reseed ผู้ดูแลจะแก้ทับค่าที่เห็นไม่ตรงกับ
  // ผังด้านบน guard `isEditing` กันไม่ให้ effect ไปล้างสิ่งที่กำลังพิมพ์อยู่กลางคัน
  useEffect(() => {
    if (!isEditing || !routing) return;
    setDraft({
      default: routing.default ?? '',
      ...Object.fromEntries(
        EMAIL_FLOWS.map((f) => [f.value, routing[f.value] ?? USE_DEFAULT]),
      ),
    });
    setError('');
    // routing ตั้งใจไม่อยู่ใน deps: ต้อง seed จาก snapshot ตอนเข้าโหมดแก้เท่านั้น ถ้าใส่เข้าไป
    // การบันทึกของตัวเองจะย้อนกลับมาล้าง draft ระหว่างที่ยังเปิดฟอร์มค้างอยู่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const handleSave = async () => {
    if (!draft.default) {
      setError(t('pages.emailSettings.defaultRequired'));
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
      toast.success(t('pages.emailSettings.routingSavedToast'));
      await onSaved(payload);
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
    <Card role="region" aria-label={t('pages.emailSettings.routingTitle')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{t('pages.emailSettings.routingTitle')}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('pages.emailSettings.routingDescription')}
          </p>
        </div>
        {canManage && !isEditing && !loading && !loadError && (
          <Button variant="outline" size="sm" onClick={onRequestEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('pages.emailSettings.editRouting')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">{t('common.busy.loading')}</p>
        ) : loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : isEditing ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="routing-default">{t('common.label.default')}</Label>
              <Select
                value={draft.default}
                onValueChange={(v) => setDraft((prev) => ({ ...prev, default: v }))}
              >
                <SelectTrigger id="routing-default">
                  <SelectValue placeholder={t('pages.emailSettings.chooseProfile')} />
                </SelectTrigger>
                <SelectContent>
                  {liveProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {t('pages.emailSettings.defaultAppliesNote')}
              </p>
            </div>

            {EMAIL_FLOWS.map((flow) => (
              <div key={flow.value} className="space-y-2">
                <Label htmlFor={`routing-${flow.value}`}>{flow.label}</Label>
                <Select
                  value={draft[flow.value] ?? USE_DEFAULT}
                  onValueChange={(v) => setDraft((prev) => ({ ...prev, [flow.value]: v }))}
                >
                  <SelectTrigger id={`routing-${flow.value}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={USE_DEFAULT}>
                      {t('pages.emailSettings.useDefault')}
                    </SelectItem>
                    {liveProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">{t(flow.descriptionKey)}</p>
              </div>
            ))}

            {error && <p className="text-destructive text-xs">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
              </Button>
              <Button variant="outline" onClick={onCancelEdit} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <RoutingPanel map={map} />
        )}
      </CardContent>
    </Card>
  );
};
