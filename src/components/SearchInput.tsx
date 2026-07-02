import { forwardRef } from 'react';
import { Input } from './ui/input';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export const SearchInput = forwardRef<HTMLInputElement, {
  value: string;
  onValueChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}>(function SearchInput({ value, onValueChange, onClear, placeholder = 'Search…', className }, ref) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pl-9 pr-9', value ? 'border-ring' : '')}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => (onClear ? onClear() : onValueChange(''))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
