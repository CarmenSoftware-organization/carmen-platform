import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, AddrField } from '../shared';
import type { SectionFieldProps } from '../types';

const HotelInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Hotel Information" description="Hotel contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="hotel_name">Hotel Name</Label>
        {editing ? (
          <Input type="text" id="hotel_name" name="hotel_name" value={formData.hotel_name} onChange={onChange} placeholder="Hotel name" />
        ) : (
          <ReadOnlyText value={formData.hotel_name} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hotel_tel">Telephone</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="hotel_tel"
                name="hotel_tel"
                value={formData.hotel_tel}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Hotel telephone"
                className={fieldErrors.hotel_tel ? 'border-destructive' : ''}
              />
              {fieldErrors.hotel_tel && <p className="text-xs text-destructive">{fieldErrors.hotel_tel}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.hotel_tel} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="hotel_email">Email</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="hotel_email"
                name="hotel_email"
                value={formData.hotel_email}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Hotel email"
                className={fieldErrors.hotel_email ? 'border-destructive' : ''}
              />
              {fieldErrors.hotel_email && <p className="text-xs text-destructive">{fieldErrors.hotel_email}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.hotel_email} />
          )}
        </div>
      </div>
      <AddrField id="hotel_address_line1" label="Address Line 1" placeholder="Address line 1" value={formData.hotel_address_line1} editing={editing} onChange={onChange} />
      <AddrField id="hotel_address_line2" label="Address Line 2" placeholder="Address line 2" value={formData.hotel_address_line2} editing={editing} onChange={onChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AddrField id="hotel_sub_district" label="Sub-district" placeholder="Sub-district" value={formData.hotel_sub_district} editing={editing} onChange={onChange} />
        <AddrField id="hotel_district" label="District" placeholder="District" value={formData.hotel_district} editing={editing} onChange={onChange} />
        <AddrField id="hotel_city" label="City" placeholder="City" value={formData.hotel_city} editing={editing} onChange={onChange} />
        <AddrField id="hotel_province" label="Province" placeholder="Province" value={formData.hotel_province} editing={editing} onChange={onChange} />
        <AddrField id="hotel_postal_code" label="Postal Code" placeholder="Postal code" value={formData.hotel_postal_code} editing={editing} onChange={onChange} />
        <AddrField id="hotel_country" label="Country" placeholder="Country" value={formData.hotel_country} editing={editing} onChange={onChange} />
        <AddrField id="hotel_latitude" label="Latitude" placeholder="Latitude" value={formData.hotel_latitude} editing={editing} onChange={onChange} />
        <AddrField id="hotel_longitude" label="Longitude" placeholder="Longitude" value={formData.hotel_longitude} editing={editing} onChange={onChange} />
      </div>
    </div>
  </CollapsibleSection>
);

export default HotelInfoSection;
