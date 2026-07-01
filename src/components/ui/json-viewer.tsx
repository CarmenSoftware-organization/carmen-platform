import { cn } from '../../lib/utils';

export function JsonViewer({ data, className }: { data: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        'text-xs bg-muted text-foreground p-3 sm:p-4 rounded-md overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)] font-mono',
        className,
      )}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
