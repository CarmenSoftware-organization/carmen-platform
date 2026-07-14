import React from 'react';
import BasicInfoSection from './sections/BasicInfoSection';
import HotelInfoSection from './sections/HotelInfoSection';
import CompanyInfoSection from './sections/CompanyInfoSection';
import TaxInfoSection from './sections/TaxInfoSection';
import DateTimeFormatsSection from './sections/DateTimeFormatsSection';
import NumberFormatsSection from './sections/NumberFormatsSection';
import CalculationSettingsSection from './sections/CalculationSettingsSection';
import ConfigurationSection from './sections/ConfigurationSection';
import DatabaseConnectionSection from './sections/DatabaseConnectionSection';
import type { Cluster, BusinessUnitConfig } from '../../types';
import type { SectionFieldProps, DefaultCurrency } from './types';

interface BusinessUnitFormFieldsProps extends SectionFieldProps {
  clusters: Cluster[];
  getClusterName: (clusterId: string) => string;
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
  onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
  onAddConfigRow: () => void;
  onRemoveConfigRow: (index: number) => void;
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
  brandingSlot?: React.ReactNode;
  advancedExtraSlot?: React.ReactNode;
  usersSlot?: React.ReactNode;
}

// scroll-mt keeps an anchored section clear of the sticky mobile nav on jump.
const sectionClass = 'scroll-mt-24 space-y-4';

const BusinessUnitFormFields: React.FC<BusinessUnitFormFieldsProps> = ({
  formData,
  editing,
  fieldErrors,
  onChange,
  onBlur,
  onFocus,
  clusters,
  getClusterName,
  defaultCurrency,
  getCalculationMethodLabel,
  onConfigChange,
  onAddConfigRow,
  onRemoveConfigRow,
  onDbFieldChange,
  onDbExtraChange,
  onAddDbExtraRow,
  onRemoveDbExtraRow,
  brandingSlot,
  advancedExtraSlot,
  usersSlot,
}) => {
  const field = { formData, editing, fieldErrors, onChange, onBlur, onFocus };
  return (
    <div className="min-w-0 space-y-6">
      <section id="general" className={sectionClass}>
        <BasicInfoSection {...field} clusters={clusters} getClusterName={getClusterName} />
        <CalculationSettingsSection
          {...field}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
        />
      </section>

      <section id="address" className={sectionClass}>
        <div className="grid gap-4 lg:grid-cols-2">
          <HotelInfoSection {...field} />
          <CompanyInfoSection {...field} />
        </div>
        <TaxInfoSection {...field} />
      </section>

      <section id="localization" className={sectionClass}>
        <div className="grid gap-4 lg:grid-cols-2">
          <DateTimeFormatsSection {...field} />
          <NumberFormatsSection {...field} />
        </div>
      </section>

      {brandingSlot && (
        <section id="branding" className={sectionClass}>
          {brandingSlot}
        </section>
      )}

      <section id="advanced" className={sectionClass}>
        <ConfigurationSection
          {...field}
          onConfigChange={onConfigChange}
          onAddConfigRow={onAddConfigRow}
          onRemoveConfigRow={onRemoveConfigRow}
        />
        <DatabaseConnectionSection
          {...field}
          onDbFieldChange={onDbFieldChange}
          onDbExtraChange={onDbExtraChange}
          onAddDbExtraRow={onAddDbExtraRow}
          onRemoveDbExtraRow={onRemoveDbExtraRow}
        />
        {advancedExtraSlot}
      </section>

      {usersSlot && (
        <section id="users" className={sectionClass}>
          {usersSlot}
        </section>
      )}
    </div>
  );
};

export default BusinessUnitFormFields;
