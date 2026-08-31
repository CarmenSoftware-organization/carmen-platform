import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Hammer, LayoutDashboard } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { useBackOrFallback } from '../hooks/useBackOrFallback';
import { useI18n } from '../hooks/useI18n';

/**
 * หน้าที่แสดงแทนฟีเจอร์ซึ่งอยู่ในสถานะ `inactive` — วาดในตำแหน่งเดิมโดยไม่เปลี่ยน URL ด้วยเหตุผล
 * เดียวกับ Forbidden: ถ้า redirect ปุ่ม "ย้อนกลับ" จะเด้งกลับเข้าด่านแล้ววนอยู่อย่างนั้น
 * Rendered in place, never redirected, for the same reason Forbidden is.
 *
 * ไม่มีรหัส HTTP เพราะไม่ได้มาจากการปฏิเสธของเซิร์ฟเวอร์ — เซิร์ฟเวอร์ยังให้ผ่านทุกอย่าง สิ่งที่
 * ปฏิเสธคือหน้าจอเอง StatusPage บังคับให้ส่ง `code` จึงใช้เครื่องหมายเว้นแทนเลขสถานะ
 * No status code: the server refused nothing — the UI did.
 */
const ComingSoon: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = useBackOrFallback('/dashboard');

  return (
    <Layout hideBreadcrumbs>
      <StatusPage
        icon={Hammer}
        tone="neutral"
        code="—"
        title={t('pages.comingSoon.title')}
        description={t('pages.comingSoon.description')}
        actions={
          <>
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('pages.statusPage.goBack')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t('pages.statusPage.goToDashboard')}
            </Button>
          </>
        }
      />
    </Layout>
  );
};

export default ComingSoon;
