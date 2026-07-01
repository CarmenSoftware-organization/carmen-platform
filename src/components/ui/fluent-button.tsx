import React from 'react';
import { Button as FluentButton, type ButtonProps as FluentButtonProps } from '@fluentui/react-components';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantMap: Record<ButtonVariant, FluentButtonProps['appearance']> = {
  default: 'primary',
  destructive: 'primary',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'transparent',
  link: 'transparent',
};

const sizeMap: Record<ButtonSize, FluentButtonProps['size']> = {
  default: 'medium',
  sm: 'small',
  lg: 'large',
  icon: 'medium',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, asChild: _asChild, type, ...props }, ref) => {
    return (
      <FluentButton
        ref={ref}
        appearance={variantMap[variant]}
        size={sizeMap[size]}
        className={className}
        type={type}
        {...props}
      >
        {children}
      </FluentButton>
    );
  }
);
Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
