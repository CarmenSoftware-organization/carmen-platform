import { useState } from 'react';
import { AddrField } from '../../businessUnitEdit/shared';
import { formatAddress } from './formatAddress';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';
import { useI18n } from '../../../hooks/useI18n';

interface AddressBlockProps {
  /** เลือกชุดฟิลด์: hotel_* หรือ company_* */
  prefix: 'hotel' | 'company';
  formData: BusinessUnitFormData;
  disabled?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

/**
 * ที่อยู่ 10 ช่องยุบเป็นข้อความบล็อกเดียวในโหมดอ่าน คลิกจึงกางเป็นช่องกรอกเดิม
 *
 * 20 ใน 42 กล่องเทาของหน้าเดิมคือฟิลด์ที่อยู่ (hotel 10 + company 10) นี่คือตัวลด
 * ความยาวที่ใหญ่ที่สุดของการรื้อครั้งนี้ — ดู spec §7
 */
export function AddressBlock({ prefix, formData, disabled = false, onChange }: AddressBlockProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const f = (suffix: string) => `${prefix}_${suffix}` as keyof BusinessUnitFormData;
  const v = (suffix: string) => String(formData[f(suffix)] ?? '');

  const lines = formatAddress({
    address_line1: v('address_line1'),
    address_line2: v('address_line2'),
    sub_district: v('sub_district'),
    district: v('district'),
    city: v('city'),
    province: v('province'),
    postal_code: v('postal_code'),
    country: v('country'),
  });

  const lat = v('latitude');
  const lon = v('longitude');

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="hover:bg-primary/5 -mx-2 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default disabled:hover:bg-transparent"
        >
          {lines.length > 0 ? (
            lines.map((line, idx) => <span key={idx} className="block">{line}</span>)
          ) : (
            <span className="text-muted-foreground italic">{t('pages.clusterAdmin.setAddressPlaceholder')}</span>
          )}
        </button>
        {(lat || lon) && (
          <div className="text-muted-foreground flex items-baseline gap-2 px-2 text-xs">
            <span className="text-sm">{t('pages.clusterAdmin.coordinatesLabel')}</span>
            <span className="font-mono">{lat || '—'}, {lon || '—'}</span>
          </div>
        )}
      </div>
    );
  }

  const field = (suffix: string, label: string) => (
    <AddrField
      id={String(f(suffix))}
      label={label}
      placeholder={label}
      value={v(suffix)}
      editing={!disabled}
      onChange={onChange}
    />
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('address_line1', t('pages.clusterAdmin.addressLine1Label'))}
        {field('address_line2', t('pages.clusterAdmin.addressLine2Label'))}
        {field('sub_district', t('pages.clusterAdmin.subDistrictLabel'))}
        {field('district', t('pages.clusterAdmin.districtLabel'))}
        {field('city', t('pages.clusterAdmin.cityLabel'))}
        {field('province', t('pages.clusterAdmin.provinceLabel'))}
        {field('postal_code', t('pages.clusterAdmin.postalCodeLabel'))}
        {field('country', t('pages.clusterAdmin.countryLabel'))}
        {field('latitude', t('pages.clusterAdmin.latitudeLabel'))}
        {field('longitude', t('pages.clusterAdmin.longitudeLabel'))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground text-xs underline"
      >
        {t('pages.clusterAdmin.doneButton')}
      </button>
    </div>
  );
}
