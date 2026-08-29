import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { AuditMeta } from '../components/AuditMeta';
import { InvitationConfigCard } from './platformConfig/InvitationConfigCard';
import { InvitationLimitsCard } from './platformConfig/InvitationLimitsCard';
import { SignupConfigCard } from './platformConfig/SignupConfigCard';
import { LinkConfigCard } from './platformConfig/LinkConfigCard';
import { NotificationEmailConfigCard } from './platformConfig/NotificationEmailConfigCard';
import { LicenseEnforcementCard } from './platformConfig/LicenseEnforcementCard';
import platformConfigService from '../services/platformConfigService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import { normalizeAudit, latestActor } from '../utils/audit';
import type { PlatformConfig } from '../types';
import { useI18n } from '../hooks/useI18n';

/** การ์ดหนึ่งใบในหน้านี้ — ไม่ใช่คีย์ของ config เพราะคีย์ `invitation` มีสองการ์ด */
type CardId =
  | 'invitation'
  | 'invitation_limits'
  | 'signup'
  | 'email_verification'
  | 'password_reset'
  | 'notification_email'
  | 'license';

const PlatformConfigManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission('platform_config.manage');
  // คีย์ `license` มีด่านที่สองฝั่ง backend (`platform_configs.controller.ts` → `mayWriteKey`)
  // ต้องมี `license.manage` เพิ่มจึงจะเขียนได้ ไม่ gate ตรงนี้ = ปุ่ม Edit ที่ Save แล้ว 403 เสมอ
  const canManageLicense = canManage && hasPermission('license.manage');

  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCard, setEditingCard] = useState<CardId | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // การ์ดถือ form state เอง หน้าเพจจึงตรวจความสกปรกไม่ได้โดยไม่ผูกกับการ์ด
  // การกันไว้ที่ "มีการ์ดเปิดแก้อยู่" คือฝั่งที่ปลอดภัยกว่าของ trade-off นี้
  useUnsavedChanges(editingCard !== null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await platformConfigService.getAll();
      setConfigs(response.data ?? []);
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

  const handleSaved = async () => {
    setEditingCard(null);
    await fetchAll();
  };

  const invitation = configs.find((c) => c.key === 'invitation') ?? null;
  const signup = configs.find((c) => c.key === 'signup') ?? null;
  const emailVerification = configs.find((c) => c.key === 'email_verification') ?? null;
  const passwordReset = configs.find((c) => c.key === 'password_reset') ?? null;
  const notificationEmail = configs.find((c) => c.key === 'notification_email') ?? null;
  const license = configs.find((c) => c.key === 'license') ?? null;

  // ที่มาเดียวของ audit ต่อ config — การ์ดแต่ละใบไม่รู้จัก normalizeAudit เอง (อยู่นอกขอบเขต
  // ของ task นี้) ตัว key เดิมของแต่ละการ์ดก็อ่านผ่านค่าเหล่านี้ด้วย แทนฟิลด์แบนตรง ๆ
  const invitationAudit = normalizeAudit(invitation);
  const signupAudit = normalizeAudit(signup);
  const emailVerificationAudit = normalizeAudit(emailVerification);
  const passwordResetAudit = normalizeAudit(passwordReset);
  const notificationEmailAudit = normalizeAudit(notificationEmail);
  const licenseAudit = normalizeAudit(license);
  // ค่ากริยา+actor ล่าสุดต่อการ์ด สำหรับแสดงในแถบ compact (I2) — คำนวณแยกจาก *Audit ด้านบน
  // ที่ยังต้องใช้เดิมสำหรับ remount key
  const invitationLatest = latestActor(invitation);
  const signupLatest = latestActor(signup);
  const emailVerificationLatest = latestActor(emailVerification);
  const passwordResetLatest = latestActor(passwordReset);
  const licenseLatest = latestActor(license);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.platformConfig.title')}
          subtitle={t('pages.platformConfig.subtitle')}
        />

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-6">
            {[
              { heading: t('pages.platformConfig.sectionEmailLinks'), cards: 4 },
              { heading: t('pages.platformConfig.sectionInvitationLimits'), cards: 1 },
              { heading: t('pages.platformConfig.sectionNotifications'), cards: 1 },
              { heading: t('pages.platformConfig.sectionLicensing'), cards: 1 },
            ].map((section) => (
              <div key={section.heading} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">{section.heading}</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {Array.from({ length: section.cards }).map((_, i) => (
                    <Skeleton key={i} className="h-56 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t('pages.platformConfig.sectionEmailLinks')}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1">
                  <InvitationConfigCard
                    // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                    key={`invitation-${invitationAudit.updated?.at ?? invitationAudit.created?.at ?? 'default'}`}
                    config={invitation}
                    canManage={canManage}
                    isEditing={editingCard === 'invitation'}
                    onRequestEdit={() => setEditingCard('invitation')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={invitationLatest?.verbKey}
                    actor={invitationLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <SignupConfigCard
                    // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                    key={`signup-${signupAudit.updated?.at ?? signupAudit.created?.at ?? 'default'}`}
                    config={signup}
                    canManage={canManage}
                    isEditing={editingCard === 'signup'}
                    onRequestEdit={() => setEditingCard('signup')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={signupLatest?.verbKey}
                    actor={signupLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <LinkConfigCard
                    key={`email_verification-${emailVerificationAudit.updated?.at ?? emailVerificationAudit.created?.at ?? 'default'}`}
                    configKey="email_verification"
                    title={t('pages.platformConfig.emailVerificationTitle')}
                    description={t('pages.platformConfig.emailVerificationDescription')}
                    urlExample="https://inventory.carmen.io/verify-email"
                    defaults={{ base_url: 'http://localhost:3000/verify-email', expiry_hours: 24 }}
                    config={emailVerification}
                    canManage={canManage}
                    isEditing={editingCard === 'email_verification'}
                    onRequestEdit={() => setEditingCard('email_verification')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={emailVerificationLatest?.verbKey}
                    actor={emailVerificationLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <LinkConfigCard
                    key={`password_reset-${passwordResetAudit.updated?.at ?? passwordResetAudit.created?.at ?? 'default'}`}
                    configKey="password_reset"
                    title={t('pages.platformConfig.passwordResetTitle')}
                    description={t('pages.platformConfig.passwordResetDescription')}
                    urlExample="https://inventory.carmen.io/reset-password"
                    defaults={{ base_url: 'http://localhost:3000', expiry_hours: 24 }}
                    config={passwordReset}
                    canManage={canManage}
                    isEditing={editingCard === 'password_reset'}
                    onRequestEdit={() => setEditingCard('password_reset')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={passwordResetLatest?.verbKey}
                    actor={passwordResetLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.platformConfig.sectionInvitationLimits')}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1">
                  <InvitationLimitsCard
                    // remount เมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                    key={`invitation-limits-${invitationAudit.updated?.at ?? invitationAudit.created?.at ?? 'default'}`}
                    config={invitation}
                    canManage={canManage}
                    isEditing={editingCard === 'invitation_limits'}
                    onRequestEdit={() => setEditingCard('invitation_limits')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={invitationLatest?.verbKey}
                    actor={invitationLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.platformConfig.sectionNotifications')}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <NotificationEmailConfigCard
                  // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา —
                  // การ์ดนี้วาด AuditMeta compact ของตัวเองอยู่แล้ว (Task 8) จึงไม่เติมซ้ำที่นี่
                  key={`notification_email-${notificationEmailAudit.updated?.at ?? notificationEmailAudit.created?.at ?? 'default'}`}
                  config={notificationEmail}
                  canManage={canManage}
                  isEditing={editingCard === 'notification_email'}
                  onRequestEdit={() => setEditingCard('notification_email')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.platformConfig.sectionLicensing')}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1">
                  <LicenseEnforcementCard
                    key={`license-${licenseAudit.updated?.at ?? licenseAudit.created?.at ?? 'default'}`}
                    config={license}
                    canManage={canManageLicense}
                    isEditing={editingCard === 'license'}
                    onRequestEdit={() => setEditingCard('license')}
                    onCancelEdit={() => setEditingCard(null)}
                    onSaved={handleSaved}
                  />
                  <AuditMeta
                    variant="compact"
                    verbKey={licenseLatest?.verbKey}
                    actor={licenseLatest?.actor}
                    className="text-muted-foreground px-1 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <DevDebugSheet
        title="Platform Config — raw"
        endpoint="/api-system/platform/configs"
        data={rawResponse}
      />
    </Layout>
  );
};

export default PlatformConfigManagement;
