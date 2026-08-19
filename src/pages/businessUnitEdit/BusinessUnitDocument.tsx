import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Copy } from 'lucide-react';
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../../types';
import type { BusinessUnitFormData, DefaultCurrency } from './types';
import { InlineField, type InlineOption } from './InlineField';
import { ReadOnlyText } from './shared';
import CalculationSettingsSection from './sections/CalculationSettingsSection';
import NumberFormatsSection from './sections/NumberFormatsSection';
import ConfigurationSection from './sections/ConfigurationSection';
import DatabaseConnectionSection from './sections/DatabaseConnectionSection';

interface BusinessUnitDocumentProps {
  formData: BusinessUnitFormData;
  fieldErrors: Record<string, string>;
  clusterName: string;
  logoUrl?: string;
  avatarUrl?: string;
  clusters: Cluster[];
  defaultCurrency: DefaultCurrency | null;
  currencies?: TenantCurrency[] | null;
  currenciesLoading?: boolean;
  currenciesFailed?: boolean;
  getCalculationMethodLabel: (method: string) => string;
  canEdit: boolean;
  // Read-only "Max users" display — computed from the User Licenses card's own license
  // rows (sumActiveLicenses / active count), not form state. There is no editable control
  // for this number any more; it is edited only via the licenses card below.
  activeSeats: number;
  activeLicenseCount: number;
  // simple-field commits (edit-in-place)
  onCommit: (name: string, value: string) => void;
  onToggle: (name: string, value: boolean) => void;
  onValidate: (name: string, value: string) => void;
  onCopyHotelAddress: () => void;
  // event-based handlers for the reused complex sections
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
  onAddConfigRow: () => void;
  onRemoveConfigRow: (index: number) => void;
  onPoolChange: (field: 'database_pool_id' | 'db_schema', value: string) => void;
  brandingSlot?: React.ReactNode;
  advancedExtraSlot?: React.ReactNode;
  usersSlot?: React.ReactNode;
  licensesSlot?: React.ReactNode;
}

function Group({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t p-4 sm:px-6 sm:py-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.13em]">{label}</div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function BusinessUnitDocument(props: BusinessUnitDocumentProps) {
  const {
    formData: f,
    fieldErrors,
    clusterName,
    logoUrl,
    avatarUrl,
    clusters,
    defaultCurrency,
    currencies,
    currenciesLoading,
    currenciesFailed,
    getCalculationMethodLabel,
    canEdit,
    activeSeats,
    activeLicenseCount,
    onCommit,
    onToggle,
    onValidate,
    onCopyHotelAddress,
    onChange,
    onBlur,
    onFocus,
    onConfigChange,
    onAddConfigRow,
    onRemoveConfigRow,
    onPoolChange,
    brandingSlot,
    advancedExtraSlot,
    usersSlot,
    licensesSlot,
  } = props;

  // `canEdit` is the one source of write access on this page. Each section already
  // renders a read-only branch when `editing` is false, so gating here disables
  // every control they own (DB credentials, calculation method, config rows).
  const sectionField = { formData: f, editing: canEdit, fieldErrors, onChange, onBlur, onFocus };
  const clusterOptions: InlineOption[] = clusters.map((c) => ({ value: c.id, label: c.name }));

  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: {
      type?: 'text' | 'number' | 'email' | 'textarea' | 'select';
      options?: InlineOption[];
      mono?: boolean;
      validate?: boolean;
      required?: boolean;
      maxLength?: number;
    },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      options={opts?.options}
      mono={opts?.mono}
      required={opts?.required}
      maxLength={opts?.maxLength}
      error={fieldErrors[name]}
      disabled={!canEdit}
      onCommit={onCommit}
      onValidate={opts?.validate ? onValidate : undefined}
    />
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        {/* hero */}
        <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
          <div className="flex shrink-0 gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-11 w-16 rounded-lg border object-cover" />
            ) : (
              <div className="from-primary to-info grid h-11 w-16 place-items-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white">
                {f.code.slice(0, 8).toUpperCase() || 'BU'}
              </div>
            )}
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-11 rounded-lg border object-cover" />
            ) : (
              <div className="bg-primary/90 grid size-11 place-items-center rounded-lg text-lg font-bold text-white">
                {(f.name || f.code || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {f.code && (
                <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">{f.code}</span>
              )}
              {clusterName && clusterName !== '-' && <span className="text-foreground/80">{clusterName}</span>}
              {/* Status toggles: the Badge carries the status semantics, the button
                  carries the affordance. Hit area reaches 44px via padding on the
                  wrapping button, without growing the badge itself. */}
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={f.is_active}
                onClick={() => onToggle('is_active', !f.is_active)}
                className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
              >
                <Badge variant={f.is_active ? 'success' : 'secondary'}>{f.is_active ? 'Active' : 'Inactive'}</Badge>
              </button>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={f.is_hq}
                onClick={() => onToggle('is_hq', !f.is_hq)}
                className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
              >
                <Badge variant={f.is_hq ? 'default' : 'secondary'}>HQ</Badge>
              </button>
            </div>
          </div>
        </div>

        {/* inline fact groups */}
        {/* `code` and `cluster_id` (with `name`, in the header) are the three fields
            validateRequired() enforces — they are the only ones marked required. */}
        <Group label="Details">
          {inline('code', 'Code', { mono: true, validate: true, required: true, maxLength: 20 })}
          {inline('alias_name', 'Alias', { validate: true, maxLength: 3 })}
          {inline('cluster_id', 'Cluster', { type: 'select', options: clusterOptions, required: true })}
          {/* Read-only since Task 3.5 — this used to be a typed-in ceiling; it is now a sum of
              this BU's dated license rows, edited only in the User Licenses card below. Not an
              InlineField: there is nothing here to click into edit mode. */}
          <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[150px_1fr] sm:items-start sm:gap-3">
            <span className="text-muted-foreground pt-2 text-xs">Max users</span>
            <div className="min-w-0">
              <ReadOnlyText value={`${activeSeats}`} />
              <p className="text-muted-foreground mt-1 text-[11px]">
                จาก {activeLicenseCount} ใบที่ใช้ได้ · แก้ที่การ์ด User Licenses
              </p>
            </div>
          </div>
          {inline('description', 'Description', { type: 'textarea', maxLength: 500 })}
        </Group>

        <Group label="Location">
          {inline('hotel_name', 'Hotel name', { maxLength: 100 })}
          {inline('hotel_address_line1', 'Address line 1')}
          {inline('hotel_address_line2', 'Address line 2')}
          {inline('hotel_sub_district', 'Sub-district')}
          {inline('hotel_district', 'District')}
          {inline('hotel_city', 'City')}
          {inline('hotel_province', 'Province')}
          {inline('hotel_postal_code', 'Postal code', { mono: true })}
          {inline('hotel_country', 'Country')}
          {inline('hotel_latitude', 'Latitude', { mono: true })}
          {inline('hotel_longitude', 'Longitude', { mono: true })}
        </Group>

        <Group label="Contact">
          {inline('hotel_tel', 'Phone', { mono: true })}
          {inline('hotel_email', 'Email', { type: 'email' })}
        </Group>

        <Group
          label="Company"
          action={
            canEdit && (
              <Button type="button" variant="ghost" size="sm" onClick={onCopyHotelAddress}>
                <Copy className="mr-2 h-4 w-4" />
                Copy from hotel address
              </Button>
            )
          }
        >
          {inline('company_name', 'Company', { maxLength: 100 })}
          {inline('company_tel', 'Company phone', { mono: true })}
          {inline('company_email', 'Company email', { type: 'email' })}
          {inline('company_address_line1', 'Company address line 1')}
          {inline('company_address_line2', 'Company address line 2')}
          {inline('company_sub_district', 'Company sub-district')}
          {inline('company_district', 'Company district')}
          {inline('company_city', 'Company city')}
          {inline('company_province', 'Company province')}
          {inline('company_postal_code', 'Company postal code', { mono: true })}
          {inline('company_country', 'Company country')}
          {inline('company_latitude', 'Company latitude', { mono: true })}
          {inline('company_longitude', 'Company longitude', { mono: true })}
        </Group>

        <Group label="Tax">
          {inline('tax_no', 'Tax ID', { mono: true })}
          {inline('branch_no', 'Branch', { mono: true })}
        </Group>

        <Group label="Date & time">
          {inline('timezone', 'Timezone')}
          {inline('date_format', 'Date format', { mono: true })}
          {inline('date_time_format', 'Date-time format', { mono: true })}
          {inline('time_format', 'Time format', { mono: true })}
          {inline('long_time_format', 'Long time format', { mono: true })}
          {inline('short_time_format', 'Short time format', { mono: true })}
        </Group>
      </Card>

      {/* complex sections — always editable, in the same scroll */}
      <CalculationSettingsSection
        {...sectionField}
        defaultCurrency={defaultCurrency}
        getCalculationMethodLabel={getCalculationMethodLabel}
        currencies={currencies}
        currenciesLoading={currenciesLoading}
        currenciesFailed={currenciesFailed}
      />
      <NumberFormatsSection {...sectionField} />
      {brandingSlot}
      <ConfigurationSection
        {...sectionField}
        onConfigChange={onConfigChange}
        onAddConfigRow={onAddConfigRow}
        onRemoveConfigRow={onRemoveConfigRow}
      />
      <DatabaseConnectionSection
        {...sectionField}
        onPoolChange={onPoolChange}
      />
      {advancedExtraSlot}
      {usersSlot}
      {licensesSlot}
    </div>
  );
}
