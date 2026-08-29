import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { BrandingImageUpload } from '../../components/BrandingImageUpload';
import { useI18n } from '../../hooks/useI18n';

interface BusinessUnitBrandingCardProps {
  logoUrl: string;
  avatarUrl: string;
  editing: boolean;
  /** Business-unit name — initials source for the avatar when no image is set. */
  name?: string;
  /** Business-unit code — preferred over the name for initials. */
  code?: string;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
}

const BusinessUnitBrandingCard: React.FC<BusinessUnitBrandingCardProps> = ({ logoUrl, avatarUrl, editing, name, code, onUploadLogo, onUploadAvatar }) => {
  const { t } = useI18n();
  return (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{t('common.section.branding')}</CardTitle>
      <CardDescription>{t('pages.businessUnits.brandingDescription')}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <BrandingImageUpload
        label={t('pages.businessUnits.logoLabel')}
        value={logoUrl}
        disabled={!editing}
        shape="rect"
        onUpload={onUploadLogo}
      />
      <BrandingImageUpload
        label={t('common.field.avatar')}
        value={avatarUrl}
        disabled={!editing}
        shape="square"
        fallbackName={name}
        fallbackCode={code}
        onUpload={onUploadAvatar}
      />
    </CardContent>
  </Card>
  );
};

export default BusinessUnitBrandingCard;
