import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
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
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import { AuditMeta } from '../components/AuditMeta';
import { latestActor } from '../utils/audit';
import type { EmailSetting } from '../types';
import { useI18n } from '../hooks/useI18n';

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
            <EmailRoutingCard
              profiles={settings}
              canManage={canManage}
              isEditing={editingPurpose === 'routing'}
              onRequestEdit={() => requestEdit('routing')}
              onCancelEdit={() => setEditingPurpose(null)}
              onSaved={() => handleSaved('routing')}
            />

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.emailSettings.senderProfiles')}</h2>
              {canManage && !addingProfile && (
                <Button variant="outline" size="sm" onClick={() => { setAddingProfile(true); requestEdit('new'); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pages.emailSettings.addProfile')}
                </Button>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {addingProfile && (
                <EmailSettingCard
                  key="new"
                  profileKey="new"
                  label={t('pages.emailSettings.newProfileLabel')}
                  description={t('pages.emailSettings.newProfileDescription')}
                  setting={null}
                  canManage={canManage}
                  isEditing={editingPurpose === 'new'}
                  shortcutsEnabled={pendingSwitch === null}
                  callerIdentity={user?.email ?? ''}
                  onRequestEdit={() => requestEdit('new')}
                  onCancelEdit={() => { setEditingPurpose(null); setAddingProfile(false); }}
                  onSaved={() => { setAddingProfile(false); void handleSaved('new'); }}
                />
              )}
              {settings.map((setting) => {
                const latest = latestActor(setting);
                return (
                // Keying on doc_version remounts the card whenever the stored row
                // changes, which is exactly what the 409 path needs: the form resets
                // to the freshly-fetched values while the page keeps it in edit mode.
                // Wrapped in a div (EmailSettingCard itself is a self-contained Card
                // from a file outside this task's scope) so the compact audit line can
                // sit just below the card without touching EmailSettingCard.tsx.
                <div key={`${setting.id}-${setting.doc_version ?? 'new'}`} className="space-y-1.5">
                  <EmailSettingCard
                    profileKey={setting.id}
                    label={setting.name}
                    description={setting.note ?? t('pages.emailSettings.defaultProfileNote')}
                    setting={setting}
                    canManage={canManage}
                    isEditing={editingPurpose === setting.id}
                    shortcutsEnabled={pendingSwitch === null}
                    callerIdentity={user?.email ?? ''}
                    onRequestEdit={() => requestEdit(setting.id)}
                    onCancelEdit={() => setEditingPurpose(null)}
                    onSaved={(opts) => handleSaved(setting.id, opts)}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={latest?.verbKey}
                    actor={latest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
                );
              })}
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
