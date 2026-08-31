import { cn } from '../lib/utils';

/**
 * The application's own logo — a static asset, unlike `BrandMark`, which renders whatever
 * identity a cluster or business unit has uploaded.
 *
 * Both theme variants ship in the DOM and one is hidden with `dark:hidden` / `hidden dark:block`
 * rather than picked in JS: `tailwind.config.js` runs class-based dark mode, so the correct file
 * is already the visible one on first paint and the logo never flips after hydration.
 *
 * The four source files carry an opaque background of their own (the lockups are drawn on white
 * and black, the marks on blue and black), so the mark variant is clipped to a radius here —
 * without it the square edge reads as a foreign tile against a rounded shell.
 */
interface ProductLogoProps {
  /**
   * `lockup` is the horizontal mark + wordmark (~3.4:1) and already contains the word CARMEN,
   * so callers must not pair it with a product-name heading. `mark` is the 1:1 knot, for slots
   * too narrow for the lockup — the collapsed sidebar.
   */
  variant?: 'lockup' | 'mark';
  className?: string;
}

const SOURCES = {
  lockup: { light: '/logo_light.svg', dark: '/logo_dark.svg' },
  mark: { light: '/logo_mark_light.svg', dark: '/logo_mark_dark.svg' },
} as const;

export const ProductLogo = ({ variant = 'lockup', className }: ProductLogoProps) => {
  const src = SOURCES[variant];
  const shape = variant === 'mark' ? 'rounded-xl object-cover' : 'w-auto';

  return (
    <>
      <img
        src={src.light}
        alt="Carmen"
        className={cn('shrink-0 dark:hidden', shape, className)}
      />
      <img
        src={src.dark}
        alt=""
        aria-hidden
        className={cn('hidden shrink-0 dark:block', shape, className)}
      />
    </>
  );
};

export default ProductLogo;
