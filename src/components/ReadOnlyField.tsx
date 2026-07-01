import { cn } from '../lib/utils';

export function ReadOnlyField({ value, className }: { value?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center', className)}>
      {value || '-'}
    </div>
  );
}
