import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
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
import { ExpiryThresholdsCard } from './platformConfig/ExpiryThresholdsCard';
import { PlatformMigrationConfigCard } from './platformConfig/PlatformMigrationConfigCard';
import platformConfigService from '../services/platformConfigService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import { normalizeAudit, latestActor } from '../utils/audit';
import type {
  LicenseConfig,
  NotificationEmailConfig,
  PlatformConfig,
  PlatformMigrationConfig,
} from '../types';
import { useI18n } from '../hooks/useI18n';

/** การ์ดหนึ่งใบในหน้านี้ — ไม่ใช่คีย์ของ config เพราะคีย์ `invitation` มีสองการ์ด */
type CardId =
  | 'invitation'
  | 'invitation_limits'
  | 'signup'
  | 'email_verification'
  | 'password_reset'
  | 'notification_email'
  | 'license'
  | 'expiry_thresholds'
  | 'platform_migration';

/**
 * หัวข้อกลุ่ม — ป้ายตัวพิมพ์ใหญ่เล็ก ๆ พร้อมเส้นลากยาว ชุดเดียวกับหัวกลุ่มใน sidebar
 *
 * ของเดิมเป็น `text-sm font-semibold text-muted-foreground` ซึ่ง "เบากว่า" ชื่อการ์ดที่มัน
 * ครอบอยู่ ลำดับชั้นจึงกลับหัว แบบนี้หัวกลุ่มเป็นคนละระดับกับชื่อการ์ดชัดเจน ไม่แข่งกัน
 */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-3">
    <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
    <span className="h-px flex-1 bg-border" />
  </div>
);

/** หนึ่งช่องในแถบสถานะบนสุด — ป้ายกำกับ + สถานะจริงที่บันทึกไว้ */
const StatusItem: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    {children}
  </div>
);

const PlatformConfigManagement: React.FC = () => {
  const { hasPermission, isSuperAdmin } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission('platform_config.manage');
  // คีย์ `license` มีด่านที่สองฝั่ง backend (`platform_configs.controller.ts` → `mayWriteKey`)
  // ต้องมี `license.manage` เพิ่มจึงจะเขียนได้ ไม่ gate ตรงนี้ = ปุ่ม Edit ที่ Save แล้ว 403 เสมอ
  const canManageLicense = canManage && hasPermission('license.manage');
  // คีย์ `platform_migration` มีด่านที่สองเหมือนกัน แต่ไม่รับสิทธิ์ใด ๆ แทน — ต้องเป็น super-admin
  // (`platform_configs.controller.ts` → `writeKeyDenial`) เพราะสิ่งที่สวิตช์นี้เปิดคือ endpoint
  // ที่บังคับ super-admin อยู่แล้ว ผู้ถือ platform_config.manage เปิดประตูที่ตัวเองเดินผ่านไม่ได้
  const canManagePlatformMigration = canManage && isSuperAdmin;

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
  const expiryThresholds = configs.find((c) => c.key === 'expiry_thresholds') ?? null;
  const platformMigration = configs.find((c) => c.key === 'platform_migration') ?? null;

  // ที่มาเดียวของ audit ต่อ config — การ์ดแต่ละใบไม่รู้จัก normalizeAudit เอง (อยู่นอกขอบเขต
  // ของ task นี้) ตัว key เดิมของแต่ละการ์ดก็อ่านผ่านค่าเหล่านี้ด้วย แทนฟิลด์แบนตรง ๆ
  const invitationAudit = normalizeAudit(invitation);
  const signupAudit = normalizeAudit(signup);
  const emailVerificationAudit = normalizeAudit(emailVerification);
  const passwordResetAudit = normalizeAudit(passwordReset);
  const notificationEmailAudit = normalizeAudit(notificationEmail);
  const licenseAudit = normalizeAudit(license);
  const expiryThresholdsAudit = normalizeAudit(expiryThresholds);
  const platformMigrationAudit = normalizeAudit(platformMigration);
  // ค่ากริยา+actor ล่าสุดต่อการ์ด สำหรับแถบท้ายการ์ด — คำนวณแยกจาก *Audit ด้านบน
  // ที่ยังต้องใช้เดิมสำหรับ remount key
  const invitationLatest = latestActor(invitation);
  const signupLatest = latestActor(signup);
  const emailVerificationLatest = latestActor(emailVerification);
  const passwordResetLatest = latestActor(passwordReset);
  const notificationEmailLatest = latestActor(notificationEmail);
  const licenseLatest = latestActor(license);
  const expiryThresholdsLatest = latestActor(expiryThresholds);
  const platformMigrationLatest = latestActor(platformMigration);

  /** แถบ audit ท้ายการ์ด — รูปแบบเดียวกันทุกใบ และอยู่ *ใน* การ์ดที่มันอธิบาย */
  const auditFooter = (latest: ReturnType<typeof latestActor>) => (
    <AuditMeta
      variant="compact"
      verbKey={latest?.verbKey}
      actor={latest?.actor}
      className="text-xs text-muted-foreground"
    />
  );

  // สถานะเปิด/ปิดสามตัวที่ "ปิดอยู่เงียบ ๆ" ได้ — อ่านด้วยกฎเดียวกับการ์ดของมันเอง
  // (`=== true` ไม่ใช่ truthy ทั้งสามตัว เพื่อให้ตรงกับผู้อ่านฝั่ง backend ของแต่ละตัว)
  const enforcementOn =
    ((license?.value ?? {}) as Partial<LicenseConfig>).enforcement_enabled === true;
  const notificationOn =
    ((notificationEmail?.value ?? {}) as Partial<NotificationEmailConfig>).enabled === true;
  const migrationApiOn =
    ((platformMigration?.value ?? {}) as Partial<PlatformMigrationConfig>).api_enabled === true;

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
            <Skeleton className="h-12 w-full" />
            {[4, 4].map((cards, section) => (
              <div key={section} className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <div className="grid gap-4 lg:grid-cols-2">
                  {Array.from({ length: cards }).map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/*
              สวิตช์ที่ปิดอยู่แล้วไม่มีอะไรเตือน — ของเดิมต้องเลื่อนลงสามจอถึงจะรู้ว่า
              enforcement เปิดอยู่ไหม อีเมลแจ้งเตือนส่งอยู่ไหม และ API migration เปิดค้างไว้ไหม
              ตัวเลขอายุลิงก์ไม่อยู่ในแถบนี้ เพราะมันไม่ใช่สถานะ อ่านจากการ์ดตรง ๆ ได้อยู่แล้ว
            */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border bg-card px-4 py-3">
              <StatusItem label={t('pages.platformConfig.licenseTitle')}>
                <Badge variant={enforcementOn ? 'success' : 'secondary'}>
                  {enforcementOn
                    ? t('pages.platformConfig.enforced')
                    : t('pages.platformConfig.shadowMode')}
                </Badge>
              </StatusItem>
              <StatusItem label={t('pages.platformConfig.notificationTitle')}>
                <Badge variant={notificationOn ? 'success' : 'secondary'}>
                  {notificationOn ? t('pages.platformConfig.on') : t('pages.platformConfig.off')}
                </Badge>
              </StatusItem>
              <StatusItem label={t('pages.platformConfig.migrationTitle')}>
                <Badge variant={migrationApiOn ? 'success' : 'secondary'}>
                  {migrationApiOn
                    ? t('pages.platformConfig.migrationApiOn')
                    : t('pages.platformConfig.migrationApiOff')}
                </Badge>
              </StatusItem>
            </div>

            <div className="space-y-3">
              <SectionHeading>{t('pages.platformConfig.sectionEmailLinks')}</SectionHeading>
              <div className="grid gap-4 lg:grid-cols-2">
                <InvitationConfigCard
                  // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                  key={`invitation-${invitationAudit.updated?.at ?? invitationAudit.created?.at ?? 'default'}`}
                  config={invitation}
                  canManage={canManage}
                  isEditing={editingCard === 'invitation'}
                  onRequestEdit={() => setEditingCard('invitation')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(invitationLatest)}
                />
                <SignupConfigCard
                  key={`signup-${signupAudit.updated?.at ?? signupAudit.created?.at ?? 'default'}`}
                  config={signup}
                  canManage={canManage}
                  isEditing={editingCard === 'signup'}
                  onRequestEdit={() => setEditingCard('signup')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(signupLatest)}
                />
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
                  footer={auditFooter(emailVerificationLatest)}
                />
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
                  footer={auditFooter(passwordResetLatest)}
                />
              </div>
            </div>

            {/*
              สามกลุ่มที่เหลือมีกลุ่มละการ์ดเดียว — ของเดิมให้แต่ละกลุ่มเป็น grid 2 คอลัมน์
              ของตัวเอง จึงเหลือครึ่งขวาว่างสามท่อนซ้อนกัน วางทั้งสามกลุ่มลงในกริดเดียวแทน
              เหลือช่องว่างช่องเดียวที่มุมล่างขวา ซึ่งเป็นท้ายหน้าอยู่แล้ว
            */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <SectionHeading>{t('pages.platformConfig.sectionInvitationLimits')}</SectionHeading>
                <InvitationLimitsCard
                  key={`invitation-limits-${invitationAudit.updated?.at ?? invitationAudit.created?.at ?? 'default'}`}
                  config={invitation}
                  canManage={canManage}
                  isEditing={editingCard === 'invitation_limits'}
                  onRequestEdit={() => setEditingCard('invitation_limits')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(invitationLatest)}
                />
              </div>

              <div className="space-y-3">
                <SectionHeading>{t('pages.platformConfig.sectionNotifications')}</SectionHeading>
                <NotificationEmailConfigCard
                  key={`notification_email-${notificationEmailAudit.updated?.at ?? notificationEmailAudit.created?.at ?? 'default'}`}
                  config={notificationEmail}
                  canManage={canManage}
                  isEditing={editingCard === 'notification_email'}
                  onRequestEdit={() => setEditingCard('notification_email')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(notificationEmailLatest)}
                />
              </div>

              <div className="space-y-3">
                <SectionHeading>{t('pages.platformConfig.sectionLicensing')}</SectionHeading>
                <LicenseEnforcementCard
                  key={`license-${licenseAudit.updated?.at ?? licenseAudit.created?.at ?? 'default'}`}
                  config={license}
                  canManage={canManageLicense}
                  isEditing={editingCard === 'license'}
                  onRequestEdit={() => setEditingCard('license')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(licenseLatest)}
                />
                {/* gate ด้วย canManage เฉย ๆ ไม่ใช่ canManageLicense เหมือนการ์ดข้างบน — คีย์
                    expiry_thresholds ไม่มีด่าน mayWriteKey ฝั่ง backend การลอกมาจะซ่อนปุ่ม Edit
                    จากผู้ที่มีสิทธิ์เขียนจริง */}
                <ExpiryThresholdsCard
                  key={`expiry_thresholds-${expiryThresholdsAudit.updated?.at ?? expiryThresholdsAudit.created?.at ?? 'default'}`}
                  config={expiryThresholds}
                  canManage={canManage}
                  isEditing={editingCard === 'expiry_thresholds'}
                  onRequestEdit={() => setEditingCard('expiry_thresholds')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(expiryThresholdsLatest)}
                />
              </div>

              <div className="space-y-3">
                <SectionHeading>{t('pages.platformConfig.sectionPlatformMigration')}</SectionHeading>
                <PlatformMigrationConfigCard
                  key={`platform_migration-${platformMigrationAudit.updated?.at ?? platformMigrationAudit.created?.at ?? 'default'}`}
                  config={platformMigration}
                  canManage={canManagePlatformMigration}
                  isEditing={editingCard === 'platform_migration'}
                  onRequestEdit={() => setEditingCard('platform_migration')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(platformMigrationLatest)}
                />
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
