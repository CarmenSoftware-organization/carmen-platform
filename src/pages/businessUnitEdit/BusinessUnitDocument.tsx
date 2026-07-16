import { useState } from 'react';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../../types';
import type { BusinessUnitFormData, DefaultCurrency } from './types';
import { InlineField, type InlineOption } from './InlineField';
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
  // simple-field commits (edit-in-place)
  onCommit: (name: string, value: string) => void;
  onToggle: (name: string, value: boolean) => void;
  onValidate: (name: string, value: string) => void;
  // event-based handlers for the reused complex sections
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
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

function HeroName({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place
        autoFocus
        aria-label="Business unit name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="border-primary bg-background text-foreground w-full max-w-sm rounded-md border px-2 py-0.5 text-xl font-bold tracking-tight outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="hover:bg-primary/5 -mx-1.5 rounded px-1.5 text-left text-xl font-bold tracking-tight disabled:hover:bg-transparent sm:text-2xl"
    >
      {value.trim() || '(unnamed business unit)'}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t p-4 sm:px-6 sm:py-5">
      <div className="text-muted-foreground mb-1 text-[10.5px] font-bold uppercase tracking-[0.13em]">{label}</div>
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
    onCommit,
    onToggle,
    onValidate,
    onChange,
    onBlur,
    onFocus,
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
  } = props;

  const sectionField = { formData: f, editing: true, fieldErrors, onChange, onBlur, onFocus };
  const clusterOptions: InlineOption[] = clusters.map((c) => ({ value: c.id, label: c.name }));

  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: { type?: 'text' | 'number' | 'email' | 'textarea' | 'select'; options?: InlineOption[]; mono?: boolean; validate?: boolean },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      options={opts?.options}
      mono={opts?.mono}
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
              <div className="from-primary to-info grid h-11 w-16 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white">
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
            <HeroName value={f.name} disabled={!canEdit} onCommit={(v) => onCommit('name', v)} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {f.code && (
                <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">{f.code}</span>
              )}
              {clusterName && clusterName !== '-' && <span className="text-foreground/80">{clusterName}</span>}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onToggle('is_active', !f.is_active)}
                className="hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs disabled:hover:bg-transparent"
              >
                <span className={cn('size-2 rounded-full', f.is_active ? 'bg-success' : 'bg-muted-foreground/50')} />
                {f.is_active ? 'Active' : 'Inactive'}
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onToggle('is_hq', !f.is_hq)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  f.is_hq ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                HQ
              </button>
            </div>
          </div>
        </div>

        {/* inline fact groups */}
        <Group label="Details">
          {inline('code', 'Code', { mono: true, validate: true })}
          {inline('alias_name', 'Alias', { validate: true })}
          {inline('cluster_id', 'Cluster', { type: 'select', options: clusterOptions })}
          {inline('max_license_users', 'Max users', { type: 'number', mono: true, validate: true })}
          {inline('description', 'Description', { type: 'textarea' })}
        </Group>

        <Group label="Location">
          {inline('hotel_name', 'Hotel name')}
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

        <Group label="Company">
          {inline('company_name', 'Company')}
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
        onDbFieldChange={onDbFieldChange}
        onDbExtraChange={onDbExtraChange}
        onAddDbExtraRow={onAddDbExtraRow}
        onRemoveDbExtraRow={onRemoveDbExtraRow}
      />
      {advancedExtraSlot}
      {usersSlot}
    </div>
  );
}
