import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, AddrField } from '../shared';
import type { SectionFieldProps } from '../types';

const CompanyInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Company Information" description="Company contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company_name">Company Name</Label>
        {editing ? (
          <Input type="text" id="company_name" name="company_name" value={formData.company_name} onChange={onChange} placeholder="Company name" />
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
              {fieldErrors.company_tel && <p className="text-xs text-destructive">{fieldErrors.company_tel}</p>}
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
              {fieldErrors.company_email && <p className="text-xs text-destructive">{fieldErrors.company_email}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.company_email} />
          )}
        </div>
      </div>
      <AddrField id="company_address_line1" label="Address Line 1" placeholder="Address line 1" value={formData.company_address_line1} editing={editing} onChange={onChange} />
      <AddrField id="company_address_line2" label="Address Line 2" placeholder="Address line 2" value={formData.company_address_line2} editing={editing} onChange={onChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AddrField id="company_sub_district" label="Sub-district" placeholder="Sub-district" value={formData.company_sub_district} editing={editing} onChange={onChange} />
        <AddrField id="company_district" label="District" placeholder="District" value={formData.company_district} editing={editing} onChange={onChange} />
        <AddrField id="company_city" label="City" placeholder="City" value={formData.company_city} editing={editing} onChange={onChange} />
        <AddrField id="company_province" label="Province" placeholder="Province" value={formData.company_province} editing={editing} onChange={onChange} />
        <AddrField id="company_postal_code" label="Postal Code" placeholder="Postal code" value={formData.company_postal_code} editing={editing} onChange={onChange} />
        <AddrField id="company_country" label="Country" placeholder="Country" value={formData.company_country} editing={editing} onChange={onChange} />
        <AddrField id="company_latitude" label="Latitude" placeholder="Latitude" value={formData.company_latitude} editing={editing} onChange={onChange} />
        <AddrField id="company_longitude" label="Longitude" placeholder="Longitude" value={formData.company_longitude} editing={editing} onChange={onChange} />
      </div>
    </div>
  </CollapsibleSection>
);

export default CompanyInfoSection;
