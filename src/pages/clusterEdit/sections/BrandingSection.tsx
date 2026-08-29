import { BrandingImageUpload } from '../../../components/BrandingImageUpload';
import { BrandMark } from '../../../components/BrandMark';
import { useI18n } from '../../../hooks/useI18n';

export interface BrandingSectionProps {
  logoUrl: string;
  avatarUrl: string;
  canEdit: boolean;
  /** Cluster name — initials source for the avatar when no image is set. */
  name?: string;
  /** Cluster code — preferred over the name for initials. */
  code?: string;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
}

export function BrandingSection({ logoUrl, avatarUrl, canEdit, name, code, onUploadLogo, onUploadAvatar }: BrandingSectionProps) {
  const { t } = useI18n();
  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        {/* A logo has no stand-in, so its absence stays visible as a dashed frame. The avatar
         *  does have one — initials — so it renders as a finished mark, not as a gap. */}
        {logoUrl ? (
          <img src={logoUrl} alt={t('pages.clusters.logo')} className="h-16 w-24 rounded-md border object-contain" />
        ) : (
          <div className="text-muted-foreground grid h-16 w-24 place-items-center rounded-md border border-dashed text-xs">{t('pages.clusters.noLogo')}</div>
        )}
        <BrandMark
          size="lg"
          shape="circle"
          src={avatarUrl || undefined}
          name={name}
          code={code}
          className="h-16 w-16 text-lg"
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BrandingImageUpload label={t('pages.clusters.logo')} value={logoUrl} shape="rect" onUpload={onUploadLogo} />
      <BrandingImageUpload
        label={t('common.field.avatar')}
        value={avatarUrl}
        shape="square"
        fallbackName={name}
        fallbackCode={code}
        onUpload={onUploadAvatar}
      />
    </div>
  );
}
