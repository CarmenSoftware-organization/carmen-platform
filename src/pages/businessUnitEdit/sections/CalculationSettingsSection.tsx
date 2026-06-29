import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import type { SectionFieldProps, DefaultCurrency } from '../types';

interface CalculationSettingsSectionProps extends SectionFieldProps {
  defaultCurrency: DefaultCurrency | null;
  getCalculationMethodLabel: (method: string) => string;
}

const CalculationSettingsSection: React.FC<CalculationSettingsSectionProps> = ({ formData, editing, onChange, defaultCurrency, getCalculationMethodLabel }) => (
  <CollapsibleSection title="Calculation Settings" description="Calculation method and currency configuration" forceOpen>
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
          {editing ? (
            <Input
              type="text"
              id="default_currency_id"
              name="default_currency_id"
              value={formData.default_currency_id}
              onChange={onChange}
              placeholder="Default currency ID"
            />
          ) : (
            <ReadOnlyText value={formData.default_currency_id} />
          )}
        </div>
      </div>
      {!editing && defaultCurrency && (
        <div className="rounded-md border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Default Currency</span>
            <Badge variant={defaultCurrency.is_active ? 'success' : 'secondary'} className="text-[10px]">
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

export default CalculationSettingsSection;
