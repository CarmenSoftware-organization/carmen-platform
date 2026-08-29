import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { CollapsibleSection, selectClassName } from '../shared';
import { useI18n } from '../../../hooks/useI18n';
import type { BusinessUnitConfig } from '../../../types';
import type { SectionFieldProps } from '../types';

interface ConfigurationSectionProps extends SectionFieldProps {
  onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
  onAddConfigRow: () => void;
  onRemoveConfigRow: (index: number) => void;
}

const ConfigurationSection: React.FC<ConfigurationSectionProps> = ({ formData, editing, onConfigChange, onAddConfigRow, onRemoveConfigRow }) => {
  const { t } = useI18n();
  return (
  <CollapsibleSection title={t('common.section.configuration')} description={t('pages.businessUnits.configDescription')} forceOpen>
    <div className="space-y-4">
      {editing ? (
        <>
          {formData.config.map((item, index) => (
            <div key={index} className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end border-b pb-4 sm:border-0 sm:pb-0">
              <div className="space-y-2">
                <Label>{t('common.field.required', { label: t('pages.businessUnits.configKeyLabel') })}</Label>
                <Input
                  type="text"
                  value={item.key}
                  onChange={(e) => onConfigChange(index, 'key', e.target.value)}
                  placeholder={t('pages.businessUnits.configKeyPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.field.required', { label: t('pages.businessUnits.configLabelField') })}</Label>
                <Input
                  type="text"
                  value={item.label}
                  onChange={(e) => onConfigChange(index, 'label', e.target.value)}
                  placeholder={t('pages.businessUnits.configLabelPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('pages.businessUnits.configDataTypeLabel')}</Label>
                <select
                  value={item.datatype || ''}
                  onChange={(e) => onConfigChange(index, 'datatype', e.target.value)}
                  className={selectClassName}
                >
                  <option value="">{t('pages.businessUnits.configSelectType')}</option>
                  <option value="string">{t('pages.businessUnits.datatypeString')}</option>
                  <option value="number">{t('pages.businessUnits.datatypeNumber')}</option>
                  <option value="boolean">{t('pages.businessUnits.datatypeBoolean')}</option>
                  <option value="date">{t('pages.businessUnits.datatypeDate')}</option>
                  <option value="enum">{t('pages.businessUnits.datatypeEnum')}</option>
                  <option value="json">{t('pages.businessUnits.datatypeJson')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('pages.businessUnits.configValueLabel')}</Label>
                <Input
                  type="text"
                  value={typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '')}
                  onChange={(e) => onConfigChange(index, 'value', e.target.value)}
                  placeholder={t('pages.businessUnits.configValuePlaceholder')}
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveConfigRow(index)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={onAddConfigRow}>
            <Plus className="mr-2 h-4 w-4" />
            {t('pages.businessUnits.addConfigEntry')}
          </Button>
        </>
      ) : (
        <>
          {formData.config.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pages.businessUnits.noConfigEntries')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('pages.businessUnits.configKeyLabel')}</TableHead>
                    <TableHead>{t('pages.businessUnits.configLabelField')}</TableHead>
                    <TableHead>{t('common.field.type')}</TableHead>
                    <TableHead>{t('pages.businessUnits.configValueLabel')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.config.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.key || '-'}</TableCell>
                      <TableCell>{item.label || '-'}</TableCell>
                      <TableCell>{item.datatype || '-'}</TableCell>
                      <TableCell>{typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '-')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  </CollapsibleSection>
  );
};

export default ConfigurationSection;
