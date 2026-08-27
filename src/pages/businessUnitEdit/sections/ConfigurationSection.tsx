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
import type { BusinessUnitConfig } from '../../../types';
import type { SectionFieldProps } from '../types';

interface ConfigurationSectionProps extends SectionFieldProps {
  onConfigChange: (index: number, field: keyof BusinessUnitConfig, value: string) => void;
  onAddConfigRow: () => void;
  onRemoveConfigRow: (index: number) => void;
}

const ConfigurationSection: React.FC<ConfigurationSectionProps> = ({ formData, editing, onConfigChange, onAddConfigRow, onRemoveConfigRow }) => (
  <CollapsibleSection title="Configuration" description="Key-value configuration entries" forceOpen>
    <div className="space-y-4">
      {editing ? (
        <>
          {formData.config.map((item, index) => (
            <div key={index} className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end border-b pb-4 sm:border-0 sm:pb-0">
              <div className="space-y-2">
                <Label>Key *</Label>
                <Input
                  type="text"
                  value={item.key}
                  onChange={(e) => onConfigChange(index, 'key', e.target.value)}
                  placeholder="Config key"
                />
              </div>
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input
                  type="text"
                  value={item.label}
                  onChange={(e) => onConfigChange(index, 'label', e.target.value)}
                  placeholder="Config label"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Type</Label>
                <select
                  value={item.datatype || ''}
                  onChange={(e) => onConfigChange(index, 'datatype', e.target.value)}
                  className={selectClassName}
                >
                  <option value="">Select type</option>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="enum">Enum</option>
                  <option value="json">JSON</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="text"
                  value={typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '')}
                  onChange={(e) => onConfigChange(index, 'value', e.target.value)}
                  placeholder="Config value"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveConfigRow(index)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={onAddConfigRow}>
            <Plus className="mr-2 h-4 w-4" />
            Add Config Entry
          </Button>
        </>
      ) : (
        <>
          {formData.config.length === 0 ? (
            <p className="text-sm text-muted-foreground">No configuration entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
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

export default ConfigurationSection;
