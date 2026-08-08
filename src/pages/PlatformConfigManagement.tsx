import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { InvitationConfigCard } from './platformConfig/InvitationConfigCard';
import { SignupConfigCard } from './platformConfig/SignupConfigCard';
import { LinkConfigCard } from './platformConfig/LinkConfigCard';
import platformConfigService from '../services/platformConfigService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { PlatformConfig } from '../types';

const PlatformConfigManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('platform_config.manage');

  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // การ์ดถือ form state เอง หน้าเพจจึงตรวจความสกปรกไม่ได้โดยไม่ผูกกับการ์ด
  // การกันไว้ที่ "มีการ์ดเปิดแก้อยู่" คือฝั่งที่ปลอดภัยกว่าของ trade-off นี้
  useUnsavedChanges(editingKey !== null);

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
    setEditingKey(null);
    await fetchAll();
  };

  const invitation = configs.find((c) => c.key === 'invitation') ?? null;
  const signup = configs.find((c) => c.key === 'signup') ?? null;
  const emailVerification = configs.find((c) => c.key === 'email_verification') ?? null;
  const passwordReset = configs.find((c) => c.key === 'password_reset') ?? null;

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
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <InvitationConfigCard
              // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
              key={`invitation-${invitation?.updated_at ?? 'default'}`}
              config={invitation}
              canManage={canManage}
              isEditing={editingKey === 'invitation'}
              onRequestEdit={() => setEditingKey('invitation')}
              onCancelEdit={() => setEditingKey(null)}
              onSaved={handleSaved}
            />
            <SignupConfigCard
              // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
              key={`signup-${signup?.updated_at ?? 'default'}`}
              config={signup}
              canManage={canManage}
              isEditing={editingKey === 'signup'}
              onRequestEdit={() => setEditingKey('signup')}
              onCancelEdit={() => setEditingKey(null)}
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
              isEditing={editingKey === 'email_verification'}
              onRequestEdit={() => setEditingKey('email_verification')}
              onCancelEdit={() => setEditingKey(null)}
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
              isEditing={editingKey === 'password_reset'}
              onRequestEdit={() => setEditingKey('password_reset')}
              onCancelEdit={() => setEditingKey(null)}
              onSaved={handleSaved}
            />
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
