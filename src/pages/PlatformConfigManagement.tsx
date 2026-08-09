import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { InvitationConfigCard } from './platformConfig/InvitationConfigCard';
import { InvitationLimitsCard } from './platformConfig/InvitationLimitsCard';
import { SignupConfigCard } from './platformConfig/SignupConfigCard';
import { LinkConfigCard } from './platformConfig/LinkConfigCard';
import { NotificationEmailConfigCard } from './platformConfig/NotificationEmailConfigCard';
import platformConfigService from '../services/platformConfigService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { PlatformConfig } from '../types';

/** การ์ดหนึ่งใบในหน้านี้ — ไม่ใช่คีย์ของ config เพราะคีย์ `invitation` มีสองการ์ด */
type CardId =
  | 'invitation'
  | 'invitation_limits'
  | 'signup'
  | 'email_verification'
  | 'password_reset'
  | 'notification_email';

const PlatformConfigManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('platform_config.manage');

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

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Platform Config"
          subtitle="ค่าตั้งระดับ platform ที่แก้ได้โดยไม่ต้อง deploy ใหม่"
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
              { heading: 'Email links & lifetimes', cards: 4 },
              { heading: 'Invitation limits', cards: 1 },
              { heading: 'Notifications', cards: 1 },
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
                Email links &amp; lifetimes
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <InvitationConfigCard
                  // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                  key={`invitation-${invitation?.updated_at ?? 'default'}`}
                  config={invitation}
                  canManage={canManage}
                  isEditing={editingCard === 'invitation'}
                  onRequestEdit={() => setEditingCard('invitation')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
                <SignupConfigCard
                  // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                  key={`signup-${signup?.updated_at ?? 'default'}`}
                  config={signup}
                  canManage={canManage}
                  isEditing={editingCard === 'signup'}
                  onRequestEdit={() => setEditingCard('signup')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
                <LinkConfigCard
                  key={`email_verification-${emailVerification?.updated_at ?? 'default'}`}
                  configKey="email_verification"
                  title="Email Verification"
                  description="ลิงก์ยืนยันอีเมลของเส้นทางเดิม (บัญชีที่สร้างก่อนกลับลำดับ และผู้ดูแลสร้างให้)"
                  urlExample="https://inventory.carmen.io/verify-email"
                  defaults={{ base_url: 'http://localhost:3000/verify-email', expiry_hours: 24 }}
                  config={emailVerification}
                  canManage={canManage}
                  isEditing={editingCard === 'email_verification'}
                  onRequestEdit={() => setEditingCard('email_verification')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
                <LinkConfigCard
                  key={`password_reset-${passwordReset?.updated_at ?? 'default'}`}
                  configKey="password_reset"
                  title="Password Reset"
                  description="ลิงก์ตั้งรหัสผ่านใหม่และอายุของลิงก์"
                  urlExample="https://inventory.carmen.io/reset-password"
                  defaults={{ base_url: 'http://localhost:3000', expiry_hours: 24 }}
                  config={passwordReset}
                  canManage={canManage}
                  isEditing={editingCard === 'password_reset'}
                  onRequestEdit={() => setEditingCard('password_reset')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Invitation limits</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <InvitationLimitsCard
                  // remount เมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
                  key={`invitation-limits-${invitation?.updated_at ?? 'default'}`}
                  config={invitation}
                  canManage={canManage}
                  isEditing={editingCard === 'invitation_limits'}
                  onRequestEdit={() => setEditingCard('invitation_limits')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Notifications</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <NotificationEmailConfigCard
                  key={`notification_email-${notificationEmail?.updated_at ?? 'default'}`}
                  config={notificationEmail}
                  canManage={canManage}
                  isEditing={editingCard === 'notification_email'}
                  onRequestEdit={() => setEditingCard('notification_email')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
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
