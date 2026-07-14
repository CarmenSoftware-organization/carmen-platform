import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import type { SectionFieldProps, DefaultCurrency } from '../types';
import type { TenantCurrency } from '../../../types';

interface CalculationSettingsSectionProps extends SectionFieldProps {
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
  currencies?: TenantCurrency[] | null;
  currenciesLoading?: boolean;
  currenciesFailed?: boolean;
}

const currencyLabel = (c: TenantCurrency) =>
  `${c.code} — ${c.name}${c.is_active === false ? ' (inactive)' : ''}`;

const CalculationSettingsSection: React.FC<CalculationSettingsSectionProps> = ({
  formData,
  editing,
  onChange,
  defaultCurrency,
  getCalculationMethodLabel,
  currencies,
  currenciesLoading = false,
  currenciesFailed = false,
}) => {
  const useDropdown = editing && !currenciesFailed && Array.isArray(currencies);
  const currentId = formData.default_currency_id;
  // Preserve a saved id that isn't in the fetched list so the value never drops.
  const currentInList = !currentId || (currencies ?? []).some((c) => c.id === currentId);
  const currentLabel =
    defaultCurrency && defaultCurrency.id === currentId
      ? `${defaultCurrency.code} — ${defaultCurrency.name}`
      : currentId;

  const renderCurrencyField = () => {
    if (editing && currenciesLoading) {
      return (
        <select id="default_currency_id" name="default_currency_id" className={selectClassName} disabled>
          <option>Loading currencies…</option>
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
          <option value="">Select currency</option>
          {currentId && !currentInList && <option value={currentId}>{currentLabel}</option>}
          {(currencies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {currencyLabel(c)}
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
          placeholder="Default currency ID"
        />
      );
    }
    return <ReadOnlyText value={currentId} />;
  };

  return (
    <CollapsibleSection title="Calculation Settings" description="Calculation method and currency configuration" forceOpen>
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="calculation_method">Calculation Method</Label>
            {editing ? (
              <select
                id="calculation_method"
                name="calculation_method"
                value={formData.calculation_method}
                onChange={onChange}
                className={selectClassName}
              >
                <option value="">Select method</option>
                <option value="average">Average</option>
                <option value="fifo">FIFO</option>
              </select>
            ) : (
              <ReadOnlyText value={getCalculationMethodLabel(formData.calculation_method)} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_currency_id">Default Currency ID</Label>
            {renderCurrencyField()}
          </div>
        </div>
        {!editing && defaultCurrency && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Default Currency</span>
              <Badge variant={defaultCurrency.is_active ? 'success' : 'secondary'} className="text-xs">
                {defaultCurrency.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Code</span>
                <div className="text-sm font-medium">{defaultCurrency.code || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Name</span>
                <div className="text-sm">{defaultCurrency.name || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Symbol</span>
                <div className="text-sm">{defaultCurrency.symbol || '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Decimal Places</span>
                <div className="text-sm">{defaultCurrency.decimal_places ?? '-'}</div>
              </div>
            </div>
            {defaultCurrency.description && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Description</span>
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
