import React from 'react';
import { Button } from '../../components/ui/button';
import { Save, X, Loader2 } from 'lucide-react';
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
  formRef: React.RefObject<HTMLFormElement | null>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  isNew: boolean;
  onCancel: () => void;
}

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
  formRef,
  onSubmit,
  saving,
  isNew,
  onCancel,
}) => (
  <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
    {/* Section 1: Basic Information */}
    <BasicInfoSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      clusters={clusters}
      getClusterName={getClusterName}
    />

    {/* Section 2: Hotel Information */}
    <HotelInfoSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />

    {/* Section 3: Company Information */}
    <CompanyInfoSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />

    {/* Section 4: Tax Information */}
    <TaxInfoSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />

    {/* Section 5: Date/Time Formats */}
    <DateTimeFormatsSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />

    {/* Section 6: Number Formats */}
    <NumberFormatsSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />

    {/* Section 7: Calculation Settings */}
    <CalculationSettingsSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      defaultCurrency={defaultCurrency}
      getCalculationMethodLabel={getCalculationMethodLabel}
    />

    {/* Section 8: Configuration */}
    <ConfigurationSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onConfigChange={onConfigChange}
      onAddConfigRow={onAddConfigRow}
      onRemoveConfigRow={onRemoveConfigRow}
    />

    {/* Section 9: Database Connection */}
    <DatabaseConnectionSection
      formData={formData}
      editing={editing}
      fieldErrors={fieldErrors}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onDbFieldChange={onDbFieldChange}
      onDbExtraChange={onDbExtraChange}
      onAddDbExtraRow={onAddDbExtraRow}
      onRemoveDbExtraRow={onRemoveDbExtraRow}
    />

    {/* Submit Buttons */}
    {editing && (
      <div className="flex gap-3 pt-2 lg:col-span-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving...' : isNew ? 'Create Business Unit' : 'Save Changes'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    )}
  </form>
);

export default BusinessUnitFormFields;
