import React from 'react';
import { Skeleton } from './ui/skeleton';

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ columns = 5, rows = 5 }) => (
  <div className="w-full">
    <div className="border-b">
      <div className="flex gap-4 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
    </div>
    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div key={rowIdx} className="flex gap-4 px-4 py-3 border-b last:border-0">
        {Array.from({ length: columns }).map((_, colIdx) => (
          <Skeleton key={colIdx} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);
