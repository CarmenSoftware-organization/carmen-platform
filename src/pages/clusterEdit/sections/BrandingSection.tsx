import { BrandingImageUpload } from '../../../components/BrandingImageUpload';

export interface BrandingSectionProps {
  logoUrl: string;
  avatarUrl: string;
  canEdit: boolean;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
}

export function BrandingSection({ logoUrl, avatarUrl, canEdit, onUploadLogo, onUploadAvatar }: BrandingSectionProps) {
  if (!canEdit) {
    return (
      <div className="flex flex-wrap gap-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-16 w-24 rounded-md border object-cover" />
        ) : (
          <div className="text-muted-foreground grid h-16 w-24 place-items-center rounded-md border text-xs">No logo</div>
        )}
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-md border object-cover" />
        ) : (
          <div className="text-muted-foreground grid h-16 w-16 place-items-center rounded-md border text-xs">No avatar</div>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BrandingImageUpload label="Logo" value={logoUrl} shape="rect" onUpload={onUploadLogo} />
      <BrandingImageUpload label="Avatar" value={avatarUrl} shape="square" onUpload={onUploadAvatar} />
    </div>
  );
}
