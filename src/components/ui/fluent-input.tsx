import React from 'react';
import { Input as FluentInput, type InputProps as FluentInputProps } from '@fluentui/react-components';

interface InputProps extends Omit<FluentInputProps, 'size'> {
  size?: 'default' | 'sm' | 'lg';
}

const sizeMap: Record<NonNullable<InputProps['size']>, FluentInputProps['size']> = {
  default: 'medium',
  sm: 'small',
  lg: 'large',
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <FluentInput
      ref={ref}
      size={sizeMap[size]}
      className={className}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
export type { InputProps };
