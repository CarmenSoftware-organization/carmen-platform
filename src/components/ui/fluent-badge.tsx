import React from 'react';
import { Badge as FluentBadge } from '@fluentui/react-components';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantMap = {
  default: { appearance: 'filled' as const, color: 'brand' as const },
  secondary: { appearance: 'tint' as const, color: 'informative' as const },
  destructive: { appearance: 'filled' as const, color: 'danger' as const },
  outline: { appearance: 'outline' as const, color: 'brand' as const },
  success: { appearance: 'filled' as const, color: 'success' as const },
} as const;

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const { appearance, color } = variantMap[variant ?? 'default'];
    return (
      <FluentBadge
        ref={ref}
        {...props}
        appearance={appearance}
        color={color}
        className={className}
      >
        {children}
      </FluentBadge>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
export type { BadgeProps };
