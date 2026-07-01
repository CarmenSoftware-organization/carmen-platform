import React from 'react';
import { Textarea as FluentTextarea, type TextareaProps as FluentTextareaProps } from '@fluentui/react-textarea';

type TextareaProps = FluentTextareaProps

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <FluentTextarea ref={ref} className={className} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
