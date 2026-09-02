import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, X } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import platformConfigService from '../../services/platformConfigService';
import { EMAIL_FLOWS } from '../../constants/emailFlows';
import { parseApiError } from '../../utils/errorParser';
import { RoutingPanel } from './RoutingPanel';
import type { RoutingEditContext } from './RoutingPanel';
import { buildRoutingMap } from './routingLanes';
import type { RoutingMap } from './routingLanes';
import type { EmailFlow, EmailRoutingConfig, EmailSetting } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface EmailRoutingCardProps {
  profiles: EmailSetting[];
  routing: EmailRoutingConfig | null;
  map: RoutingMap;
  loading: boolean;
  loadError: string;
  isEditing: boolean;
  /** false เมื่อหน้ามี dialog ของตัวเองทับอยู่ — ดูเหตุผลตรงที่เรียก useGlobalShortcuts */
  shortcutsEnabled?: boolean;
  onCancelEdit: () => void;
  onSaved: (next: EmailRoutingConfig) => void | Promise<void>;
}

/**
 * ลายนิ้วมือของ mapping สำหรับเทียบว่ามีอะไรเปลี่ยนจริงไหม
 *
 * เทียบ `JSON.stringify` ของ object ตรง ๆ ไม่ได้ เพราะ draft สร้างคีย์ด้วยการ `delete` และเพิ่ม
 * กลับ ลำดับคีย์จึงต่างจาก snapshot ที่ backend ส่งมา ทั้งที่ค่าเท่ากันทุกตัว — dirty check ที่
 * ผิดพลาดแบบนี้จะเด้ง "ทิ้งการแก้ไข?" ใส่ผู้ดูแลที่ไม่ได้แก้อะไรเลย แล้วเขาจะเลิกอ่านกล่องนั้น
 */
const fingerprint = (r: EmailRoutingConfig): string =>
  JSON.stringify([r.default ?? '', ...EMAIL_FLOWS.map((f) => r[f.value] ?? '')]);

/**
 * แผงสายอีเมล — ผังเดียวกันทั้งโหมดอ่านและโหมดแก้
 *
 * เดิมโหมดแก้สลับผังทั้งใบเป็นดรอปดาวน์ 6 ช่อง ซึ่งคือรูปที่ผังนี้ตั้งใจแทนที่ตั้งแต่ต้น ผลคือ
 * ผู้ดูแลกดแก้เพราะเห็นคำเตือนบนผัง แล้วคำเตือนนั้นหายไปพร้อมกับผังในจังหวะเดียวกัน ตอนนี้
 * โหมดแก้เปลี่ยนแค่สิ่งที่จับต้องได้: chip กดเปลี่ยนปลายทางได้ หัวเลนมีปุ่มตั้งค่าเริ่มต้น
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
  isEditing,
  shortcutsEnabled = true,
  onCancelEdit,
  onSaved,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EmailRoutingConfig>({ default: '' });
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  // ตั้ง draft ใหม่ทุกครั้งที่เข้าโหมดแก้ ไม่ใช่ครั้งเดียวตอนโหลดเสร็จ — ระหว่างที่การ์ดยังคาอยู่
  // หน้าอาจ refetch mapping จากการบันทึกที่อื่น ถ้าไม่ reseed ผู้ดูแลจะแก้ทับค่าที่เห็นไม่ตรงกับ
  // ผังด้านบน guard `isEditing` กันไม่ให้ effect ไปล้างสิ่งที่กำลังแก้อยู่กลางคัน
  useEffect(() => {
    if (!isEditing || !routing) return;
    const seed: EmailRoutingConfig = { ...routing, default: routing.default ?? '' };
    setDraft(seed);
    setBaseline(fingerprint(seed));
    setError('');
    // routing ตั้งใจไม่อยู่ใน deps: ต้อง seed จาก snapshot ตอนเข้าโหมดแก้เท่านั้น ถ้าใส่เข้าไป
    // การบันทึกของตัวเองจะย้อนกลับมาล้าง draft ระหว่างที่ยังเปิดฟอร์มค้างอยู่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // ผังของ "สิ่งที่กำลังจะบันทึก" — buildRoutingMap รับ mapping รูปเดียวกับที่ backend เก็บอยู่แล้ว
  // ป้อน draft เข้าไปจึงได้ผังของอนาคตฟรี ๆ โดยไม่ต้องมีตรรกะสำรองสำหรับโหมดแก้
  const draftMap = useMemo(() => buildRoutingMap(draft, profiles), [draft, profiles]);

  const moveFlow = (flow: EmailFlow, profileId: string | null) => {
    setDraft((prev) => {
      const next = { ...prev };
      // null = ตกทอด: ลบคีย์ทิ้งไปเลย ไม่ใช่เขียน id ของ default ลงไป เส้นทางจะได้ตามค่าเริ่มต้น
      // ไปเรื่อย ๆ แม้ผู้ดูแลเปลี่ยน default ทีหลัง ซึ่งเป็นพฤติกรรมที่ผังสื่อด้วย chip เส้นประ
      if (profileId === null) delete next[flow];
      else next[flow] = profileId;
      return next;
    });
  };

  const setDefault = (profileId: string) => {
    setDraft((prev) => ({ ...prev, default: profileId }));
  };

  const editContext: RoutingEditContext = {
    profiles,
    defaultProfileName: profiles.find((p) => p.id === draft.default)?.name ?? '',
    onMoveFlow: moveFlow,
    onSetDefault: setDefault,
  };

  const dirty = isEditing && fingerprint(draft) !== baseline;

  const handleSave = async () => {
    if (!draft.default) {
      setError(t('pages.emailSettings.defaultRequired'));
      return;
    }
    try {
      setSaving(true);
      setError('');
      // draft คือ payload อยู่แล้ว: เส้นทางที่ตกทอดถูก delete ออกไปตั้งแต่ตอนกดเลือกในเมนู
      const payload: EmailRoutingConfig = { ...draft };
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

  const handleCancel = () => {
    // ทิ้งของที่แก้ไว้ต้องถามก่อนเสมอ — หน้านี้ถามอยู่แล้วตอนสลับไปแก้การ์ดอื่น การกด Cancel
    // แล้วหายเงียบจึงเป็นความไม่สม่ำเสมอที่ผู้ดูแลเรียนรู้ไม่ได้ว่าเมื่อไหร่งานจะปลอดภัย
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    onCancelEdit();
  };

  // Ctrl/⌘+S และ Escape ผูกที่การ์ดที่กำลังแก้ ไม่ใช่ที่หน้า — หน้ารับประกันว่ามีการ์ดเดียว
  // ที่ isEditing ได้ในเวลาหนึ่ง ๆ ปิดคีย์ลัดเมื่อมี dialog ทับอยู่ (ทั้ง confirm ของหน้าและของ
  // การ์ดใบนี้เอง) เพราะ useGlobalShortcuts ฟังที่ window — Escape จะทะลุไปสั่ง cancel พร้อมกับ
  // ปิด dialog ทำลาย draft ที่ dialog นั้นมีไว้ปกป้องพอดี
  useGlobalShortcuts(
    isEditing && shortcutsEnabled && !confirmCancel
      ? { onSave: () => void handleSave(), onCancel: handleCancel }
      : {},
  );

  return (
    // ชื่อและคำอธิบายของ section ย้ายไปอยู่ที่หน้าแล้ว (SectionHeading) พร้อมปุ่มแก้ไข —
    // การ์ดใบนี้เป็น section เดียวเทียบเท่า "Sender profiles" ไม่ใช่การ์ดใบหนึ่งในนั้น การมี
    // หัวการ์ดเป็นของตัวเองทำให้มันกลายเป็น H3 ที่ไม่มี H2 ครอบ อ่านแล้วอยู่คนละชั้นกับเพื่อน
    // aria-label ยังอยู่: หัวข้ออยู่นอกกรอบแล้ว ถ้าไม่มี label ภูมิภาคนี้จะไม่มีชื่อเรียก
    <Card role="region" aria-label={t('pages.emailSettings.routingTitle')}>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">{t('common.busy.loading')}</p>
        ) : loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : isEditing ? (
          <>
            <RoutingPanel map={draftMap} edit={editContext} />

            {error && <p className="text-destructive text-xs">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <RoutingPanel map={map} />
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('pages.emailSettings.discardTitle')}
        description={t('pages.emailSettings.discardRoutingDescription')}
        confirmText={t('pages.emailSettings.discardAction')}
        confirmVariant="destructive"
        onConfirm={() => {
          setConfirmCancel(false);
          onCancelEdit();
        }}
      />
    </Card>
  );
};
