import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import { useI18n } from '../../../hooks/useI18n';
import type { SectionFieldProps } from '../types';

const NumberFormatsSection: React.FC<SectionFieldProps> = ({ formData, editing, onChange }) => {
  const { t } = useI18n();
  return (
  <CollapsibleSection title={t('pages.businessUnits.numberFormatsTitle')} description={t('pages.businessUnits.numberFormatsDescription')} forceOpen>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="perpage_format">{t('pages.businessUnits.perPageFormatLabel')}</Label>
        {editing ? (
          <Input
            type="text"
            id="perpage_format"
            name="perpage_format"
            value={formData.perpage_format}
            onChange={onChange}
            placeholder='{"default":10}'
          />
        ) : (
          <ReadOnlyText value={formData.perpage_format} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount_format">{t('pages.businessUnits.amountFormatLabel')}</Label>
        {editing ? (
          <Input
            type="text"
            id="amount_format"
            name="amount_format"
            value={formData.amount_format}
            onChange={onChange}
            placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
          />
        ) : (
          <ReadOnlyText value={formData.amount_format} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="quantity_format">{t('pages.businessUnits.quantityFormatLabel')}</Label>
        {editing ? (
          <Input
            type="text"
            id="quantity_format"
            name="quantity_format"
            value={formData.quantity_format}
            onChange={onChange}
            placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
          />
        ) : (
          <ReadOnlyText value={formData.quantity_format} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="recipe_format">{t('pages.businessUnits.recipeFormatLabel')}</Label>
        {editing ? (
          <Input
            type="text"
            id="recipe_format"
            name="recipe_format"
            value={formData.recipe_format}
            onChange={onChange}
            placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
          />
        ) : (
          <ReadOnlyText value={formData.recipe_format} />
        )}
      </div>
    </div>
  </CollapsibleSection>
  );
};

export default NumberFormatsSection;
