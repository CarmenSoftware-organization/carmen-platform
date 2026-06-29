import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, ReadOnlyTextarea } from '../shared';
import type { SectionFieldProps } from '../types';

const CompanyInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Company Information" description="Company contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company_name">Company Name</Label>
        {editing ? (
          <Input
            type="text"
            id="company_name"
            name="company_name"
            value={formData.company_name}
            onChange={onChange}
            placeholder="Company name"
          />
        ) : (
          <ReadOnlyText value={formData.company_name} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_tel">Telephone</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="company_tel"
                name="company_tel"
                value={formData.company_tel}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Company telephone"
                className={fieldErrors.company_tel ? 'border-destructive' : ''}
              />
              {fieldErrors.company_tel && (
                <p className="text-xs text-destructive">{fieldErrors.company_tel}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={formData.company_tel} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_email">Email</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="company_email"
                name="company_email"
                value={formData.company_email}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Company email"
                className={fieldErrors.company_email ? 'border-destructive' : ''}
              />
              {fieldErrors.company_email && (
                <p className="text-xs text-destructive">{fieldErrors.company_email}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={formData.company_email} />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="company_address">Address</Label>
        {editing ? (
          <textarea
            id="company_address"
            name="company_address"
            value={formData.company_address}
            onChange={onChange}
            rows={3}
            placeholder="Company address"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <ReadOnlyTextarea value={formData.company_address} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="company_zip_code">Zip Code</Label>
        {editing ? (
          <Input
            type="text"
            id="company_zip_code"
            name="company_zip_code"
            value={formData.company_zip_code}
            onChange={onChange}
            placeholder="Company zip code"
          />
        ) : (
          <ReadOnlyText value={formData.company_zip_code} />
        )}
      </div>
    </div>
  </CollapsibleSection>
);

export default CompanyInfoSection;
