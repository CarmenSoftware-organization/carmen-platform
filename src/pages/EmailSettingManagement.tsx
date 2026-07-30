import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmailSettingCard } from './emailSettings/EmailSettingCard';
import { EMAIL_SENDER_PURPOSES } from '../constants/emailSenderPurposes';
import emailSettingService from '../services/emailSettingService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { EmailSenderPurpose, EmailSetting } from '../types';

const EmailSettingManagement: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('email_setting.manage');

  const [settings, setSettings] = useState<EmailSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPurpose, setEditingPurpose] = useState<EmailSenderPurpose | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<EmailSenderPurpose | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

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

  const requestEdit = (purpose: EmailSenderPurpose) => {
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
  const handleSaved = async (purpose: EmailSenderPurpose, opts?: { keepEditing?: boolean }) => {
    if (!opts?.keepEditing && editingPurpose === purpose) setEditingPurpose(null);
    await fetchAll();
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Email Settings"
          subtitle="โปรไฟล์ผู้ส่งอีเมลระดับ platform — ที่อยู่ผู้ส่งและค่า SMTP ที่ระบบใช้ส่งเมลออก"
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
          <div className="grid gap-4 lg:grid-cols-2">
            {EMAIL_SENDER_PURPOSES.map((meta) => {
              const setting = settings.find((s) => s.purpose === meta.value) ?? null;
              return (
              <EmailSettingCard
                // Keying on doc_version remounts the card whenever the stored row
                // changes, which is exactly what the 409 path needs: the form resets
                // to the freshly-fetched values while the page keeps it in edit mode.
                key={`${meta.value}-${setting?.doc_version ?? 'new'}`}
                purpose={meta.value}
                label={meta.label}
                description={meta.description}
                inUse={meta.inUse}
                setting={setting}
                canManage={canManage}
                isEditing={editingPurpose === meta.value}
                shortcutsEnabled={pendingSwitch === null}
                callerIdentity={user?.email ?? ''}
                onRequestEdit={() => requestEdit(meta.value)}
                onCancelEdit={() => setEditingPurpose(null)}
                onSaved={(opts) => handleSaved(meta.value, opts)}
              />
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
        title="ทิ้งการแก้ไขที่ยังไม่บันทึก?"
        description="คุณกำลังแก้โปรไฟล์อื่นอยู่ ถ้าไปต่อ การแก้ไขที่ยังไม่บันทึกจะหายไป"
        confirmText="ทิ้งการแก้ไข"
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
