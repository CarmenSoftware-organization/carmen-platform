import React from 'react';
import { Skeleton, SkeletonItem, type SkeletonProps as FluentSkeletonProps } from '@fluentui/react-components';

interface SkeletonProps extends FluentSkeletonProps {
  className?: string;
}

const SkeletonComponent = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, children, ...props }, ref) => (
    <Skeleton ref={ref} className={className} {...props}>
      {children}
    </Skeleton>
  )
);
SkeletonComponent.displayName = 'Skeleton';

const SkeletonItemComponent = SkeletonItem;

export { SkeletonComponent as Skeleton, SkeletonItemComponent as SkeletonItem };
