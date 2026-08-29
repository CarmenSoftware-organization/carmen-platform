import { ChevronRight, Copy } from 'lucide-react';
import { BrandingImageUpload } from '../../../components/BrandingImageUpload';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { TabStrip } from '../../../components/TabStrip';
import { InlineField, Group } from '../../businessUnitEdit/shared';
import { AddressBlock } from './AddressBlock';
import type { ClusterBuTab, ClusterBuTabId } from './ClusterBuTabs';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';
import { BU_ALIAS_MAX } from '../../businessUnitEdit/types';
import { useI18n } from '../../../hooks/useI18n';

/** หนึ่งบรรทัดของรายการข้ามไป tab อื่น: ชื่อ tab + ค่าที่ตั้งไว้จริง */
export interface TabSummary {
  id: ClusterBuTabId;
  label: string;
  value: string;
}

export interface ClusterBuDocumentProps {
  formData: BusinessUnitFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  onCommit: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  /** hotel address → company address ทางเดียว เหมือนหน้า platform */
  onCopyHotelAddress: () => void;
  tabs: ClusterBuTab[];
  activeTab: ClusterBuTabId;
  onTabChange: (tab: ClusterBuTabId) => void;
  /** สรุปของอีก 4 tab ที่แสดงใน Overview */
  summaries: TabSummary[];
  logoUrl: string;
  avatarUrl: string;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
  /** ตารางผู้ใช้ + สรุปใบอนุญาต (tab People) */
  peopleSlot?: React.ReactNode;
  /** timezone, รูปแบบตัวเลข/วันที่, config (tab Configuration) */
  configurationSlot?: React.ReactNode;
}

/**
 * รายการข้ามไป tab อื่นพร้อมค่าที่ตั้งไว้ — หัวข้อเปล่า ๆ บังคับให้คลิกทีละ tab
 * เพื่อรู้ว่าข้างในว่างหรือมีของ ซึ่งทำลายงาน "ดูว่า BU นี้ตั้งค่าไว้ยังไง"
 */
function TabJumpList({ summaries, onJump }: { summaries: TabSummary[]; onJump: (id: ClusterBuTabId) => void }) {
  const { t } = useI18n();
  return (
    <Card className="p-0">
      <Group label={t('pages.clusterAdmin.elsewhere')}>
        <ul className="-mx-2">
          {summaries.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onJump(s.id)}
                className="hover:bg-primary/5 focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left focus-visible:ring-1 focus-visible:outline-hidden"
              >
                <span className="w-20 shrink-0 text-sm font-medium">{s.label}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{s.value}</span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </Group>
    </Card>
  );
}

/**
 * เอกสารของ BU หนึ่งใบ แบ่งเป็น 5 tab แทนการ์ด 6 ใบเรียงลงมา
 *
 * เดิมหน้านี้เป็นสกอลล์เดียวยาว 2,250px โดยตารางผู้ใช้ 10 แถวกินไปเกินครึ่ง ดันที่อยู่โรงแรม
 * บิล และการตั้งค่าไปท้ายสุด — ทั้งที่ทั้งสามอย่างไม่เกี่ยวกับผู้ใช้เลย การแบ่ง tab ตรงนี้
 * ใช้ชุด tab ของ cluster admin เอง (ดู ClusterBuTabs.tsx) ไม่ใช่ชุดของหน้า platform
 *
 * แผ่นป้ายด้านบน (BuPropertyPlate) อยู่นอก tab จึงเห็นชื่อ สถานะ และที่นั่งได้ตลอด
 */
export function ClusterBuDocument({
  formData: f, fieldErrors, canEdit, onCommit, onValidate, onChange, onCopyHotelAddress,
  logoUrl, avatarUrl, onUploadLogo, onUploadAvatar,
  tabs, activeTab, onTabChange, summaries, peopleSlot, configurationSlot,
}: ClusterBuDocumentProps) {
  const { t } = useI18n();

  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: { type?: 'text' | 'email' | 'textarea'; mono?: boolean; validate?: boolean; maxLength?: number },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      mono={opts?.mono}
      maxLength={opts?.maxLength}
      error={fieldErrors[name]}
      disabled={!canEdit}
      onCommit={onCommit}
      onValidate={opts?.validate ? onValidate : undefined}
    />
  );

  const address = (prefix: 'hotel' | 'company') => (
    <div className="mt-2">
      <div className="text-muted-foreground mb-1 px-2 text-sm">{t('pages.clusterAdmin.addressLabel')}</div>
      <AddressBlock prefix={prefix} formData={f} disabled={!canEdit} onChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-4">
      <TabStrip tabs={tabs} value={activeTab} onChange={onTabChange} />

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <Card className="p-0">
            <Group label={t('common.section.identity')}>
              {inline('alias_name', t('common.field.alias'), { mono: true, validate: true, maxLength: BU_ALIAS_MAX })}
              {inline('description', t('common.field.description'), { type: 'textarea' })}
            </Group>
            {/* ป้ายกลุ่มแบบเดียวกับที่เหลือของหน้า แทน BusinessUnitBrandingCard ซึ่งใช้หัวการ์ด
                คนละแบบ (CardTitle + CardDescription) — การ์ดนั้นยังเป็นของหน้า platform ต่อไป */}
            <Group label={t('common.section.branding')}>
              <div className="flex flex-col gap-6 pt-1 sm:flex-row sm:gap-10">
                <BrandingImageUpload
                  label={t('pages.clusterAdmin.logoLabel')}
                  value={logoUrl}
                  disabled={!canEdit}
                  shape="rect"
                  onUpload={onUploadLogo}
                />
                <BrandingImageUpload
                  label={t('common.field.avatar')}
                  value={avatarUrl}
                  disabled={!canEdit}
                  shape="square"
                  fallbackName={f.name}
                  fallbackCode={f.code}
                  onUpload={onUploadAvatar}
                />
              </div>
            </Group>
          </Card>
          <TabJumpList summaries={summaries} onJump={onTabChange} />
        </div>
      )}

      {activeTab === 'people' && peopleSlot}

      {activeTab === 'hotel' && (
        <Card className="p-0">
          <Group label={t('common.section.hotel')}>
            {inline('hotel_name', t('pages.clusterAdmin.hotelNameLabel'))}
            {inline('hotel_tel', t('pages.clusterAdmin.phoneLabel'), { mono: true, validate: true })}
            {inline('hotel_email', t('common.field.email'), { type: 'email', validate: true })}
            {address('hotel')}
          </Group>
        </Card>
      )}

      {activeTab === 'company' && (
        <Card className="p-0">
          <Group
            label={t('common.section.company')}
            action={
              canEdit && (
                <Button type="button" variant="ghost" size="sm" onClick={onCopyHotelAddress}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t('pages.clusterAdmin.copyFromHotelAddress')}
                </Button>
              )
            }
          >
            {inline('company_name', t('pages.clusterAdmin.companyNameLabel'))}
            {inline('company_tel', t('pages.clusterAdmin.phoneLabel'), { mono: true, validate: true })}
            {inline('company_email', t('common.field.email'), { type: 'email', validate: true })}
            {inline('tax_no', t('pages.clusterAdmin.taxIdLabel'), { mono: true })}
            {inline('branch_no', t('pages.clusterAdmin.branchLabel'), { mono: true })}
            {address('company')}
          </Group>
        </Card>
      )}

      {activeTab === 'configuration' && configurationSlot}
    </div>
  );
}
