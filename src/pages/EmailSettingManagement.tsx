import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmailSettingCard } from './emailSettings/EmailSettingCard';
import { EmailRoutingCard } from './emailSettings/EmailRoutingCard';
import emailSettingService from '../services/emailSettingService';
import { buildRoutingMap, laneOf } from './emailSettings/routingLanes';
import { useAuth } from '../context/AuthContext';
import { useEmailRouting } from '../hooks/useEmailRouting';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { EmailSetting } from '../types';
import { useI18n } from '../hooks/useI18n';

/**
 * หัวข้อของ section หนึ่งบล็อก — หน้านี้มีสอง section ที่เป็น peer กัน (สายอีเมล กับโปรไฟล์
 * ผู้ส่ง) จึงต้องประกาศตัวด้วยน้ำหนักเดียวกัน
 *
 * เดิม "Sender profiles" เป็น label เล็กจาง (14px จาง) ส่วนสายอีเมลไม่มีหัวข้อ section เลย
 * มีแต่หัวการ์ด (16px เข้ม) ผลคือลำดับชั้นกลับหัวสองชั้น: ตัวที่อยู่สูงกว่าในโครงสร้างดูเบา
 * กว่าตัวที่ต่ำกว่า และลำดับ heading ในเอกสารเป็น H1 → H3 → H2 → H3 ซึ่งข้ามชั้น
 * ตอนนี้ทั้งคู่เป็น H2 หน้าตาเดียวกัน แล้วหัวการ์ดค่อยเป็น H3 ที่เบากว่าตามลำดับจริง
 */
const SectionHeading: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
    </div>
    {action}
  </div>
);

const EmailSettingManagement: React.FC = () => {
  const { t } = useI18n();
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('email_setting.manage');

  const [settings, setSettings] = useState<EmailSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // id ของโปรไฟล์ที่กำลังแก้ · 'new' คือการ์ดโปรไฟล์ใหม่ที่ยังไม่บันทึก · 'routing' คือการ์ด mapping
  const [editingPurpose, setEditingPurpose] = useState<string | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // mapping อยู่ที่หน้า ไม่ใช่ในการ์ด mapping: ทั้งแผงสายด้านบนและป้าย "รับสาย" บนการ์ดโปรไฟล์
  // แต่ละใบต้องอ่านชุดเดียวกัน ไม่งั้นสองที่บนจอเดียวกันพูดคนละเรื่องได้ — ดูหัวไฟล์ของ hook
  const {
    routing,
    loading: routingLoading,
    error: routingError,
    apply: applyRouting,
  } = useEmailRouting();
  const routingMap = useMemo(() => buildRoutingMap(routing, settings), [routing, settings]);

  // Any open editor counts as unsaved work: the card owns the form state, so the
  // page cannot inspect dirtiness without coupling to it. Guarding on "an editor
  // is open" is the conservative side of that trade.
  useUnsavedChanges(editingPurpose !== null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await emailSettingService.getAll();
      setSettings(response.data ?? []);
      // Safe to stash raw in the dev debug sheet: the API always returns smtp_password
      // masked (see EmailSetting doc comment in types/index.ts) — this never leaks a secret.
      if (process.env.NODE_ENV === 'development') setRawResponse(response);
    } catch (err: unknown) {
      setError(getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const requestEdit = (purpose: string) => {
    if (editingPurpose !== null && editingPurpose !== purpose) {
      setPendingSwitch(purpose);
      return;
    }
    setEditingPurpose(purpose);
  };

  // `onSaved` is shared across every card, so it must be told WHICH card fired it.
  // A delete/save on a card that is not the one currently being edited (e.g. Unset
  // on an unrelated profile while another is mid-edit) must never clear editingPurpose —
  // otherwise the open card remounts (see the doc_version key above) and its unsaved
  // typed edit is silently discarded with no confirm prompt. Refetch always happens:
  // a mutation anywhere genuinely changes the data every card reads from.
  const handleSaved = async (purpose: string, opts?: { keepEditing?: boolean }) => {
    if (!opts?.keepEditing && editingPurpose === purpose) setEditingPurpose(null);
    await fetchAll();
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.emailSettings.title')}
          subtitle={t('pages.emailSettings.subtitle')}
        />

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <SectionHeading
                title={t('pages.emailSettings.routingTitle')}
                description={t('pages.emailSettings.routingDescription')}
                action={
                  canManage &&
                  editingPurpose !== 'routing' &&
                  !routingLoading &&
                  !routingError && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => requestEdit('routing')}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('pages.emailSettings.editRouting')}
                    </Button>
                  )
                }
              />
              <EmailRoutingCard
              profiles={settings}
              routing={routing}
              map={routingMap}
              loading={routingLoading}
              loadError={routingError}
              isEditing={editingPurpose === 'routing'}
              shortcutsEnabled={pendingSwitch === null}
              onCancelEdit={() => setEditingPurpose(null)}
              onSaved={(next) => {
                applyRouting(next);
                return handleSaved('routing');
              }}
              />
            </div>

            <SectionHeading
              title={t('pages.emailSettings.senderProfiles')}
              action={
                canManage &&
                !addingProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAddingProfile(true);
                      requestEdit('new');
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('pages.emailSettings.addProfile')}
                  </Button>
                )
              }
            />

            <div className="grid gap-4 lg:grid-cols-2">
              {addingProfile && (
                <EmailSettingCard
                  key="new"
                  profileKey="new"
                  label={t('pages.emailSettings.newProfileLabel')}
                  description={t('pages.emailSettings.newProfileDescription')}
                  setting={null}
                  lane={null}
                  canManage={canManage}
                  isEditing={editingPurpose === 'new'}
                  shortcutsEnabled={pendingSwitch === null}
                  callerIdentity={user?.email ?? ''}
                  onRequestEdit={() => requestEdit('new')}
                  onCancelEdit={() => { setEditingPurpose(null); setAddingProfile(false); }}
                  onSaved={() => { setAddingProfile(false); void handleSaved('new'); }}
                />
              )}
              {settings.map((setting) => (
                // Keying on doc_version remounts the card whenever the stored row
                // changes, which is exactly what the 409 path needs: the form resets
                // to the freshly-fetched values while the page keeps it in edit mode.
                // แถวที่มาเคยอยู่ใต้การ์ดตรงนี้ ตอนนี้ย้ายเข้าไปอยู่ในกรอบการ์ดแล้ว (ดูเหตุผล
                // ที่ท้าย CardContent ของ EmailSettingCard) div ที่เหลือมีไว้เพื่อ min-w-0 อย่างเดียว
                //
                // min-w-0: grid item ได้ `min-width: auto` มาโดยปริยาย จึงกว้างตามเนื้อหาที่ยาว
                // ที่สุดในนั้น (ที่อยู่ผู้ส่ง และแถวป้ายเส้นทาง) แทนที่จะหดตามคอลัมน์ ผลคือทั้งหน้า
                // เลื่อนแนวนอนได้ที่ 390px — วัดได้ 460px ในกริด 348px ก่อนใส่คลาสนี้
                <div
                  key={`${setting.id}-${setting.doc_version ?? 'new'}`}
                  className="min-w-0"
                >
                  <EmailSettingCard
                    profileKey={setting.id}
                    label={setting.name}
                    description={setting.note ?? t('pages.emailSettings.defaultProfileNote')}
                    setting={setting}
                    lane={laneOf(routingMap, setting.id)}
                    canManage={canManage}
                    isEditing={editingPurpose === setting.id}
                    shortcutsEnabled={pendingSwitch === null}
                    callerIdentity={user?.email ?? ''}
                    onRequestEdit={() => requestEdit(setting.id)}
                    onCancelEdit={() => setEditingPurpose(null)}
                    onSaved={(opts) => handleSaved(setting.id, opts)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
        title={t('pages.emailSettings.discardTitle')}
        description={t('pages.emailSettings.discardDescription')}
        confirmText={t('pages.emailSettings.discardAction')}
        confirmVariant="destructive"
        onConfirm={() => {
          setEditingPurpose(pendingSwitch);
          setPendingSwitch(null);
        }}
      />

      <DevDebugSheet
        title="Email Settings — raw"
        endpoint="/api-system/platform/email-settings"
        data={rawResponse}
      />
    </Layout>
  );
};

export default EmailSettingManagement;
