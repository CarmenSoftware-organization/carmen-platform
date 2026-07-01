import React from 'react';
import { Textarea as FluentTextarea, type TextareaProps as FluentTextareaProps } from '@fluentui/react-textarea';

interface TextareaProps extends FluentTextareaProps {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <FluentTextarea ref={ref} className={className} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
