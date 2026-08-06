import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

/**
 * Two-character identity token. The code wins over the name because a code is already the short
 * form people scan a list for ("ACME"); a name still has to be abbreviated to get there.
 */
export const brandInitials = (name?: string, code?: string): string => {
  const fromCode = (code ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (fromCode) return fromCode.slice(0, 2).toUpperCase();
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
};

export type BrandMarkSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<BrandMarkSize, { box: string; text: string; radius: string }> = {
  xs: { box: 'h-6 w-6', text: 'text-[10px]', radius: 'rounded-md' },   // table rows
  sm: { box: 'h-8 w-8', text: 'text-sm', radius: 'rounded-lg' },       // mobile header
  md: { box: 'h-9 w-9', text: 'text-base', radius: 'rounded-xl' },     // sidebar brand
  lg: { box: 'h-20 w-20', text: 'text-xl', radius: 'rounded-xl' },     // branding card
};

interface BrandMarkProps {
  /** Entity name — an initials source only; never rendered as text. */
  name?: string;
  /** Entity code — the preferred initials source. */
  code?: string;
  /** Presigned branding image. A missing, expired, or broken URL falls back to the initials. */
  src?: string;
  size?: BrandMarkSize;
  shape?: 'square' | 'circle';
  /** `primary` is reserved for the application's own mark; entities use `muted`. */
  tone?: 'primary' | 'muted';
  className?: string;
}

/**
 * The identity token for a cluster, a business unit, or the application itself.
 *
 * Its image-less state is deliberately *not* a placeholder: initials are a real and permanent
 * identity, so a mark with nothing uploaded still looks finished rather than broken. Only the
 * upload slot is allowed to look unfilled — see the dashed logo frame in `BrandingImageUpload`.
 */
export const BrandMark = ({
  name,
  code,
  src,
  size = 'xs',
  shape = 'square',
  tone = 'muted',
  className,
}: BrandMarkProps) => {
  const { box, text, radius: squareRadius } = SIZES[size];
  const radius = shape === 'circle' ? 'rounded-full' : squareRadius;

  return (
    <Avatar
      className={cn('shrink-0', box, radius, tone === 'muted' && 'border border-border', className)}
    >
      {/* Decorative: every placement sits next to the name it stands for, so announcing it
       *  again would only duplicate. Radix swaps in the fallback when the URL fails to load,
       *  which is what keeps an expired presigned link from rendering a broken image. */}
      {src && <AvatarImage src={src} alt="" className={cn('object-cover', radius)} />}
      <AvatarFallback
        className={cn(
          'font-semibold tracking-tight',
          radius,
          text,
          tone === 'primary'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {brandInitials(name, code)}
      </AvatarFallback>
    </Avatar>
  );
};

export default BrandMark;
