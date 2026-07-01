import React from 'react';
import { Avatar as FluentAvatar, type AvatarProps as FluentAvatarProps } from '@fluentui/react-components';
import { cn } from '../../lib/utils';

interface AvatarProps extends Omit<FluentAvatarProps, 'name'> {
  name?: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, name, children, ...props }, ref) => (
    <FluentAvatar ref={ref} name={name} className={cn('inline-flex items-center justify-center', className)} {...props}>
      {children}
    </FluentAvatar>
  )
);
Avatar.displayName = 'Avatar';

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, alt = '', ...props }, ref) => (
    <img
      ref={ref}
      alt={alt}
      className={cn('aspect-square h-full w-full', className)}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)} {...props}>
      {children}
    </span>
  )
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
export type { AvatarProps };
