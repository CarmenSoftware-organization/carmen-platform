import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { TabStrip, type TabStripItem } from '../components/TabStrip';
import { useI18n } from '../hooks/useI18n';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import GroupCatalogPanel from './licenseCatalog/GroupCatalogPanel';
import FeatureCatalogPanel from './licenseCatalog/FeatureCatalogPanel';

export type LicenseCatalogTab = 'bundles' | 'features';

/**
 * แต่ละ tab ยังคงเป็น **เส้นทางของตัวเอง** ไม่ใช่ state ในหน่วยความจำ
 *
 * นั่นคือสิ่งที่ทำให้ลิงก์เดิมทุกอันยังใช้ได้โดยไม่ต้องมี redirect — รวมลิงก์ที่เปิดแท็บใหม่
 * จาก `licenses/subscriptionEdit/GroupSelectionCard.tsx` — และทำให้ `Breadcrumbs` ซึ่งอ่าน
 * segment ของ URL ยังบอกได้ว่าคนอยู่ตรงไหน ผลพลอยได้ที่สำคัญกว่าคือ **ด่านสิทธิ์ไม่ต้องเขียนใหม่**:
 * สองเส้นทางถือ `requiredPermission` + `feature` ของตัวเองใน `App.tsx` เหมือนก่อนรวมหน้าทุกประการ
 */
const TAB_PATH: Record<LicenseCatalogTab, string> = {
  bundles: '/license-feature-groups',
  features: '/license-features',
};

/**
 * เงื่อนไขที่ทำให้ tab หนึ่ง "ไปไม่ถึง" — ต้องตรงกับด่านใน `PrivateRoute` ทุกข้อ
 * ไม่มีสิทธิ์ → ที่นั่นตอบ `<Forbidden />` · flag ไม่ใช่ `active` → ตอบ `<NotFound />`/`<ComingSoon />`
 * ทั้งสามกรณีคือทางตัน การวาด tab ที่พาไปหาทางตันแย่กว่าไม่วาดมันเลย
 */
const TAB_GATE: Record<LicenseCatalogTab, { permission: string; feature: string }> = {
  bundles: { permission: 'license_feature_group.read', feature: 'license_feature_groups' },
  features: { permission: 'license_feature.read', feature: 'license_features' },
};

const TAB_ORDER: LicenseCatalogTab[] = ['bundles', 'features'];

/**
 * แค็ตตาล็อก license — ชุดที่ขาย (`bundles`) กับวัตถุดิบที่ประกอบเป็นชุด (`features`)
 *
 * สองอย่างนี้เคยเป็นคนละหน้า ทั้งที่อ่านแยกกันไม่ได้จริง: แถบสัดส่วนในตาราง Bundles ใช้
 * **ขนาดแค็ตตาล็อกเป็นตัวหาร** คนอ่านจึงต้องรู้ว่าแค็ตตาล็อกมีกี่คีย์ก่อนถึงจะแปลแถบนั้นออก
 * ตัวเลขนั้นเคยอยู่คนละเมนู
 *
 * หัวหน้าถือชื่อ **คงที่ทั้งสอง tab** โดยเจตนา — ชื่อที่เปลี่ยนตาม tab จะทำให้การรวมอ่านไม่ออก
 * ว่าเป็นที่เดียวกัน ส่วน subtitle เปลี่ยนได้เพราะมันอธิบาย tab ไม่ใช่ตั้งชื่อสถานที่
 *
 * ปุ่ม action ทั้งหมดอยู่ในแถบเครื่องมือของ panel ไม่ใช่บนหัว: ปุ่ม primary ที่สลับตัวเอง
 * ตาม tab อ่านสะดุดในงานที่ผู้ดูแลทำซ้ำทุกวัน
 */
const LicenseCatalog: React.FC<{ tab: LicenseCatalogTab }> = ({ tab }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { flagOf } = useFeatureFlags();

  /*
   * ไม่ต้องรอ `flagsReady` ที่นี่ — `PrivateRoute` ของเส้นทางนี้กั้นไว้แล้วก่อนจะ mount ลูก
   * (`feature` ถูกส่งให้ทั้งสองเส้นทาง) การเช็คซ้ำจะได้แค่ตัวโหลดที่ไม่มีวันโผล่
   */
  const tabs = useMemo<TabStripItem<LicenseCatalogTab>[]>(
    () =>
      TAB_ORDER.filter((id) => {
        const gate = TAB_GATE[id];
        return hasPermission(gate.permission) && flagOf(gate.feature) === 'active';
      }).map((id) => ({
        id,
        label: t(
          id === 'bundles'
            ? 'pages.licenseCatalog.tabBundles'
            : 'pages.licenseCatalog.tabFeatures',
        ),
      })),
    [hasPermission, flagOf, t],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.licenseCatalog.title')}
          subtitle={t(
            tab === 'bundles'
              ? 'pages.licenseFeatureGroups.subtitle'
              : 'pages.licenseFeatures.subtitle',
          )}
        />

        {/* แถบที่มีปุ่มเดียวคือเสียงรบกวน — ผู้ที่เข้าถึงได้ tab เดียวเห็นแค่เนื้อหา
            ไม่ต้องเห็นตัวเลือกที่เลือกไม่ได้ */}
        {tabs.length > 1 && (
          <TabStrip tabs={tabs} value={tab} onChange={(next) => navigate(TAB_PATH[next])} />
        )}

        {/* สลับ tab คือเปลี่ยนเส้นทาง = remount panel · ยอมให้ดึงข้อมูลใหม่ ดีกว่าแบก cache
            ที่ไม่มีใครขอ ทั้งสอง panel ดึงครั้งเดียวจบและมีเพดานเชิงโครงสร้างอยู่แล้ว */}
        {tab === 'bundles' ? <GroupCatalogPanel /> : <FeatureCatalogPanel />}
      </div>
    </Layout>
  );
};

export default LicenseCatalog;
