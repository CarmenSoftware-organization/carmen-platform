import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import { useI18n } from '../../../hooks/useI18n';
import type { TFunction } from '../../../i18n/types';
import type { SectionFieldProps, DefaultCurrency } from '../types';
import type { TenantCurrency } from '../../../types';

interface CalculationSettingsSectionProps extends SectionFieldProps {
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
  currencies?: TenantCurrency[] | null;
  currenciesLoading?: boolean;
  currenciesFailed?: boolean;
  /**
   * Default Currency is set from the tenant's currency catalog, a platform-managed list
   * this component fetches through `currencies`/`currenciesLoading`/`currenciesFailed`. A
   * cluster administrator has no reach into that catalog (no endpoint scoped to a cluster
   * admin's session exposes it), so the cluster-admin business-unit page never loads those
   * props and cannot offer a working editable control here — showing one would present a
   * field that silently can't do anything useful. The read-only "Default Currency" detail
   * card below is unaffected by this flag; it renders from `defaultCurrency`, which the
   * cluster-admin page does load directly off the business-unit record. Defaults to true
   * so every existing call site is unchanged.
   */
  showCurrencyField?: boolean;
  /**
   * Calculation method drives inventory costing math that is already in effect for a
   * business unit — changing it after the fact is a platform-level decision, not a
   * cluster-admin one, so the cluster-admin page opts to always show it read-only
   * regardless of its own `editing` state. Combined with `editing` (see below) rather than
   * replacing it, so this flag only ever narrows what platform admins already get; it can
   * never widen it. Defaults to true so every existing call site is unchanged.
   */
  canEditCalculationMethod?: boolean;
}

const currencyLabel = (c: TenantCurrency, t: TFunction) =>
  `${c.code} - ${c.name}${c.is_active === false ? t('pages.businessUnits.inactiveSuffix') : ''}`;

const CalculationSettingsSection: React.FC<CalculationSettingsSectionProps> = ({
  formData,
  editing,
  onChange,
  defaultCurrency,
  getCalculationMethodLabel,
  currencies,
  currenciesLoading = false,
  currenciesFailed = false,
  showCurrencyField = true,
  canEditCalculationMethod = true,
}) => {
  const { t } = useI18n();
  const useDropdown = editing && !currenciesFailed && Array.isArray(currencies);
  const currentId = formData.default_currency_id;
  // Preserve a saved id that isn't in the fetched list so the value never drops.
  const currentInList = !currentId || (currencies ?? []).some((c) => c.id === currentId);
  const currentLabel =
    defaultCurrency && defaultCurrency.id === currentId
      ? `${defaultCurrency.code} - ${defaultCurrency.name}`
      : currentId;

  const renderCurrencyField = () => {
    if (editing && currenciesLoading) {
      return (
        <select id="default_currency_id" name="default_currency_id" className={selectClassName} disabled>
          <option>{t('pages.businessUnits.loadingCurrencies')}</option>
        </select>
      );
    }
    if (useDropdown) {
      return (
        <select
          id="default_currency_id"
          name="default_currency_id"
          value={currentId}
          onChange={onChange}
          className={selectClassName}
        >
          <option value="">{t('pages.businessUnits.selectCurrencyOption')}</option>
          {currentId && !currentInList && <option value={currentId}>{currentLabel}</option>}
          {(currencies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {currencyLabel(c, t)}
            </option>
          ))}
        </select>
      );
    }
    if (editing) {
      return (
        <Input
          type="text"
          id="default_currency_id"
          name="default_currency_id"
          value={currentId}
          onChange={onChange}
          placeholder={t('pages.businessUnits.defaultCurrencyIdPlaceholder')}
        />
      );
    }
    return <ReadOnlyText value={currentId} />;
  };

  return (
    <CollapsibleSection title={t('pages.businessUnits.calculationSettingsTitle')} description={t('pages.businessUnits.calculationSettingsDescription')} forceOpen>
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="calculation_method">{t('pages.businessUnits.calculationMethodLabel')}</Label>
            {editing && canEditCalculationMethod ? (
              <select
                id="calculation_method"
                name="calculation_method"
                value={formData.calculation_method}
                onChange={onChange}
                className={selectClassName}
              >
                <option value="">{t('pages.businessUnits.selectMethodOption')}</option>
                <option value="average">{t('common.option.average')}</option>
                <option value="fifo">{t('common.option.fifo')}</option>
              </select>
            ) : (
              <ReadOnlyText value={getCalculationMethodLabel(formData.calculation_method)} />
            )}
          </div>
          {showCurrencyField && (
            <div className="space-y-2">
              <Label htmlFor="default_currency_id">{t('pages.businessUnits.defaultCurrencyIdLabel')}</Label>
              {renderCurrencyField()}
            </div>
          )}
        </div>
        {!editing && defaultCurrency && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('common.field.defaultCurrency')}</span>
              <Badge variant={defaultCurrency.is_active ? 'success' : 'secondary'} className="text-xs">
                {defaultCurrency.is_active ? t('common.status.active') : t('common.status.inactive')}
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('common.field.code')}</span>
                <div className="text-sm font-medium">{defaultCurrency.code || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('common.field.name')}</span>
                <div className="text-sm">{defaultCurrency.name || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('pages.businessUnits.symbolLabel')}</span>
                <div className="text-sm">{defaultCurrency.symbol || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('pages.businessUnits.decimalPlacesLabel')}</span>
                <div className="text-sm">{defaultCurrency.decimal_places ?? '-'}</div>
              </div>
            </div>
            {defaultCurrency.description && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('common.field.description')}</span>
                <div className="text-sm">{defaultCurrency.description}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default CalculationSettingsSection;
