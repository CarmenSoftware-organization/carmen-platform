import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Copy } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../../types';
import type { BusinessUnitFormData, DefaultCurrency } from './types';
import { BU_ALIAS_MAX } from './types';
import { InlineField, type InlineOption } from './InlineField';
import { ReadOnlyText, Group } from './shared';
import CalculationSettingsSection from './sections/CalculationSettingsSection';
import NumberFormatsSection from './sections/NumberFormatsSection';
import ConfigurationSection from './sections/ConfigurationSection';
import DatabaseConnectionSection from './sections/DatabaseConnectionSection';
import BusinessUnitTabs, { type BuTab, type BuTabId } from './BusinessUnitTabs';

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
  // Tab state is owned by the page, not by this component: Save has to be able to jump to
  // the tab holding a failed field, and the page is what runs the validation.
  tabs: BuTab[];
  activeTab: BuTabId;
  onTabChange: (tab: BuTabId) => void;
  brandingSlot?: React.ReactNode;
  advancedExtraSlot?: React.ReactNode;
  usersSlot?: React.ReactNode;
  licensesSlot?: React.ReactNode;
}

export default function BusinessUnitDocument(props: BusinessUnitDocumentProps) {
  const { t } = useI18n();
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
    tabs,
    activeTab,
    onTabChange,
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
                {f.code.slice(0, 8).toUpperCase() || t('pages.businessUnits.logoFallback')}
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
                <Badge variant={f.is_active ? 'success' : 'secondary'}>
                  {f.is_active ? t('common.status.active') : t('common.status.inactive')}
                </Badge>
              </button>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={f.is_hq}
                onClick={() => onToggle('is_hq', !f.is_hq)}
                className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
              >
                <Badge variant={f.is_hq ? 'default' : 'secondary'}>{t('common.label.hq')}</Badge>
              </button>
            </div>
          </div>
        </div>

        {/* Tab strip sits inside the hero card: it switches the body below, and reading it as
            part of the identity block makes that ownership obvious. */}
        <div className="border-t px-2 sm:px-4">
          <BusinessUnitTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
        </div>
      </Card>

      {activeTab === 'general' && (
        <>
          <Card className="overflow-hidden p-0 [&>div:first-child]:border-t-0">
            {/* `code` and `cluster_id` (with `name`, in the header) are the three fields
                validateRequired() enforces — they are the only ones marked required. */}
            <Group label={t('pages.businessUnits.detailsGroup')}>
              {inline('code', t('common.field.code'), { mono: true, validate: true, required: true, maxLength: 20 })}
              {inline('alias_name', t('common.field.alias'), { validate: true, maxLength: BU_ALIAS_MAX })}
              {inline('cluster_id', t('common.label.cluster'), { type: 'select', options: clusterOptions, required: true })}
              {/* Read-only since Task 3.5 — this used to be a typed-in ceiling; it is now a sum of
                  this BU's dated license rows, edited only in the User Licenses card. Not an
                  InlineField: there is nothing here to click into edit mode. */}
              <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[150px_1fr] sm:items-start sm:gap-3">
                <span className="text-muted-foreground pt-2 text-xs">{t('pages.businessUnits.maxUsersLabel')}</span>
                <div className="min-w-0">
                  <ReadOnlyText value={`${activeSeats}`} />
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {activeLicenseCount === 1
                      ? t('pages.businessUnits.maxUsersFromLicenseOne', { count: activeLicenseCount })
                      : t('pages.businessUnits.maxUsersFromLicenseMany', { count: activeLicenseCount })}
                  </p>
                </div>
              </div>
              {inline('description', t('common.field.description'), { type: 'textarea', maxLength: 500 })}
            </Group>
          </Card>

          <CalculationSettingsSection
            {...sectionField}
            defaultCurrency={defaultCurrency}
            getCalculationMethodLabel={getCalculationMethodLabel}
            currencies={currencies}
            currenciesLoading={currenciesLoading}
            currenciesFailed={currenciesFailed}
          />
          {brandingSlot}
        </>
      )}

      {activeTab === 'location' && (
        <Card className="overflow-hidden p-0 [&>div:first-child]:border-t-0">
          {/* Hotel first, company second: the company block copies from it, so the source has
              to be the one already read. Phone and email belong to the hotel — they used to
              sit in a "Contact" group of their own between the two addresses. */}
          <Group label={t('common.section.hotel')}>
            {inline('hotel_name', t('pages.businessUnits.hotelNameLabel'), { maxLength: 100 })}
            {inline('hotel_address_line1', t('pages.businessUnits.addressLine1Label'))}
            {inline('hotel_address_line2', t('pages.businessUnits.addressLine2Label'))}
            {inline('hotel_sub_district', t('pages.businessUnits.subDistrictLabel'))}
            {inline('hotel_district', t('pages.businessUnits.districtLabel'))}
            {inline('hotel_city', t('pages.businessUnits.cityLabel'))}
            {inline('hotel_province', t('pages.businessUnits.provinceLabel'))}
            {inline('hotel_postal_code', t('pages.businessUnits.postalCodeLabel'), { mono: true })}
            {inline('hotel_country', t('pages.businessUnits.countryLabel'))}
            {inline('hotel_latitude', t('pages.businessUnits.latitudeLabel'), { mono: true })}
            {inline('hotel_longitude', t('pages.businessUnits.longitudeLabel'), { mono: true })}
            {inline('hotel_tel', t('pages.businessUnits.phoneLabel'), { mono: true })}
            {inline('hotel_email', t('common.field.email'), { type: 'email' })}
          </Group>

          <Group
            label={t('common.section.company')}
            action={
              canEdit && (
                <Button type="button" variant="ghost" size="sm" onClick={onCopyHotelAddress}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t('pages.businessUnits.copyFromHotelAddress')}
                </Button>
              )
            }
          >
            {inline('company_name', t('common.field.company'), { maxLength: 100 })}
            {inline('company_tel', t('pages.businessUnits.companyPhoneLabel'), { mono: true })}
            {inline('company_email', t('pages.businessUnits.companyEmailLabel'), { type: 'email' })}
            {inline('company_address_line1', t('pages.businessUnits.companyAddressLine1Label'))}
            {inline('company_address_line2', t('pages.businessUnits.companyAddressLine2Label'))}
            {inline('company_sub_district', t('pages.businessUnits.companySubDistrictLabel'))}
            {inline('company_district', t('pages.businessUnits.companyDistrictLabel'))}
            {inline('company_city', t('pages.businessUnits.companyCityLabel'))}
            {inline('company_province', t('pages.businessUnits.companyProvinceLabel'))}
            {inline('company_postal_code', t('pages.businessUnits.companyPostalCodeLabel'), { mono: true })}
            {inline('company_country', t('pages.businessUnits.companyCountryLabel'))}
            {inline('company_latitude', t('pages.businessUnits.companyLatitudeLabel'), { mono: true })}
            {inline('company_longitude', t('pages.businessUnits.companyLongitudeLabel'), { mono: true })}
          </Group>

          <Group label={t('pages.businessUnits.taxGroup')}>
            {inline('tax_no', t('pages.businessUnits.taxIdLabel'), { mono: true })}
            {inline('branch_no', t('pages.businessUnits.branchLabel'), { mono: true })}
          </Group>
        </Card>
      )}

      {activeTab === 'formats' && (
        <>
          <Card className="overflow-hidden p-0 [&>div:first-child]:border-t-0">
            <Group label={t('pages.businessUnits.dateAndTimeGroup')}>
              {inline('timezone', t('pages.businessUnits.timezoneLabel'))}
              {inline('date_format', t('pages.businessUnits.dateFormatLabel'), { mono: true })}
              {inline('date_time_format', t('pages.businessUnits.dateTimeFormatLabel'), { mono: true })}
              {inline('time_format', t('pages.businessUnits.timeFormatLabel'), { mono: true })}
              {inline('long_time_format', t('pages.businessUnits.longTimeFormatLabel'), { mono: true })}
              {inline('short_time_format', t('pages.businessUnits.shortTimeFormatLabel'), { mono: true })}
            </Group>
          </Card>
          <NumberFormatsSection {...sectionField} />
        </>
      )}

      {activeTab === 'technical' && (
        <>
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
        </>
      )}

      {activeTab === 'users' && (
        <>
          {usersSlot}
          {licensesSlot}
        </>
      )}
    </div>
  );
}
