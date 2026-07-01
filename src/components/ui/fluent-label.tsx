import React from 'react';
import { Label as FluentLabel, type LabelProps as FluentLabelProps } from '@fluentui/react-components';

type LabelProps = FluentLabelProps

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, ...props }, ref) => (
    <FluentLabel ref={ref} className={className} {...props}>
      {children}
    </FluentLabel>
  )
);
Label.displayName = 'Label';

export { Label };
export type { LabelProps };
