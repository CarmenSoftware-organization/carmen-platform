import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import { useI18n } from '../../../hooks/useI18n';
import type { SectionFieldProps } from '../types';
import {
  previewNumberFormat,
  previewPerPage,
  type FormatPreview,
} from './numberFormatPreview';

/**
 * One JSON blob field plus a live rendering of what it produces. The preview is the point
 * of this section: the input holds `{"locales":"th-TH","minimumIntegerDigits":2}`, which
 * tells the reader nothing about the number a tenant will actually see, and a typo in it
 * used to save without a word.
 */
const FormatField: React.FC<{
  id: string;
  label: string;
  value: string;
  placeholder: string;
  editing: boolean;
  preview: FormatPreview;
  onChange: SectionFieldProps['onChange'];
}> = ({ id, label, value, placeholder, editing, preview, onChange }) => {
  const { t } = useI18n();
  const invalid = preview.kind === 'invalid';
  // A formatted sample says which number produced it; a bare setting (page size) does not.
  const caption =
    preview.kind === 'ok' && preview.of !== undefined
      ? t('pages.businessUnits.formatPreviewSample', { sample: String(preview.of) })
      : t('pages.businessUnits.formatPreviewPerPage');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {editing ? (
        <Input
          type="text"
          id={id}
          name={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={`${id}-preview`}
          className={invalid ? 'border-destructive font-mono text-xs' : 'font-mono text-xs'}
        />
      ) : (
        <ReadOnlyText value={value} className="font-mono text-xs" />
      )}
      <p
        id={`${id}-preview`}
        className={invalid ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        // Announce a format that went from valid to broken while the field is being typed in.
        aria-live="polite"
      >
        {preview.kind === 'ok' && (
          <>
            {caption} <span className="text-foreground font-mono tabular-nums">{preview.text}</span>
          </>
        )}
        {preview.kind === 'empty' && t('pages.businessUnits.formatPreviewEmpty')}
        {invalid &&
          (preview.reason === 'json'
            ? t('pages.businessUnits.formatPreviewInvalidJson')
            : t('pages.businessUnits.formatPreviewInvalidOptions'))}
      </p>
    </div>
  );
};

const NumberFormatsSection: React.FC<SectionFieldProps> = ({ formData, editing, onChange }) => {
  const { t } = useI18n();
  return (
    <CollapsibleSection
      title={t('pages.businessUnits.numberFormatsTitle')}
      description={t('pages.businessUnits.numberFormatsDescription')}
      forceOpen
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormatField
          id="perpage_format"
          label={t('pages.businessUnits.perPageFormatLabel')}
          value={formData.perpage_format}
          placeholder='{"default":10}'
          editing={editing}
          preview={previewPerPage(formData.perpage_format)}
          onChange={onChange}
        />
        {(
          [
            ['amount_format', t('pages.businessUnits.amountFormatLabel'), formData.amount_format],
            ['quantity_format', t('pages.businessUnits.quantityFormatLabel'), formData.quantity_format],
            ['recipe_format', t('pages.businessUnits.recipeFormatLabel'), formData.recipe_format],
          ] as const
        ).map(([id, label, value]) => (
          <FormatField
            key={id}
            id={id}
            label={label}
            value={value}
            placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
            editing={editing}
            preview={previewNumberFormat(value)}
            onChange={onChange}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
};

export default NumberFormatsSection;
