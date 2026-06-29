import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, ReadOnlyTextarea } from '../shared';
import type { SectionFieldProps } from '../types';

const HotelInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Hotel Information" description="Hotel contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="hotel_name">Hotel Name</Label>
        {editing ? (
          <Input
            type="text"
            id="hotel_name"
            name="hotel_name"
            value={formData.hotel_name}
            onChange={onChange}
            placeholder="Hotel name"
          />
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
              {fieldErrors.hotel_tel && (
                <p className="text-xs text-destructive">{fieldErrors.hotel_tel}</p>
              )}
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
              {fieldErrors.hotel_email && (
                <p className="text-xs text-destructive">{fieldErrors.hotel_email}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={formData.hotel_email} />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="hotel_address">Address</Label>
        {editing ? (
          <textarea
            id="hotel_address"
            name="hotel_address"
            value={formData.hotel_address}
            onChange={onChange}
            rows={3}
            placeholder="Hotel address"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <ReadOnlyTextarea value={formData.hotel_address} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="hotel_zip_code">Zip Code</Label>
        {editing ? (
          <Input
            type="text"
            id="hotel_zip_code"
            name="hotel_zip_code"
            value={formData.hotel_zip_code}
            onChange={onChange}
            placeholder="Hotel zip code"
          />
        ) : (
          <ReadOnlyText value={formData.hotel_zip_code} />
        )}
      </div>
    </div>
  </CollapsibleSection>
);

export default HotelInfoSection;
