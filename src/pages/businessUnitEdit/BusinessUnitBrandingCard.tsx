import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { BrandingImageUpload } from '../../components/BrandingImageUpload';

interface BusinessUnitBrandingCardProps {
  logoUrl: string;
  avatarUrl: string;
  editing: boolean;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
}

const BusinessUnitBrandingCard: React.FC<BusinessUnitBrandingCardProps> = ({ logoUrl, avatarUrl, editing, onUploadLogo, onUploadAvatar }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Branding</CardTitle>
      <CardDescription>Logo and avatar shown across the platform</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <BrandingImageUpload
        label="Logo"
        value={logoUrl}
        disabled={!editing}
        shape="rect"
        onUpload={onUploadLogo}
      />
      <BrandingImageUpload
        label="Avatar"
        value={avatarUrl}
        disabled={!editing}
        shape="square"
        onUpload={onUploadAvatar}
      />
    </CardContent>
  </Card>
);

export default BusinessUnitBrandingCard;
