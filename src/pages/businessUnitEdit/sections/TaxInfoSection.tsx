import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import type { SectionFieldProps } from '../types';

const TaxInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, onChange }) => (
  <CollapsibleSection title="Tax Information" description="Tax and branch registration details" forceOpen>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="tax_no">Tax No.</Label>
        {editing ? (
          <Input
            type="text"
            id="tax_no"
            name="tax_no"
            value={formData.tax_no}
            onChange={onChange}
            placeholder="Tax number"
          />
        ) : (
          <ReadOnlyText value={formData.tax_no} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="branch_no">Branch No.</Label>
        {editing ? (
          <Input
            type="text"
            id="branch_no"
            name="branch_no"
            value={formData.branch_no}
            onChange={onChange}
            placeholder="Branch number"
          />
        ) : (
          <ReadOnlyText value={formData.branch_no} />
        )}
      </div>
    </div>
  </CollapsibleSection>
);

export default TaxInfoSection;
