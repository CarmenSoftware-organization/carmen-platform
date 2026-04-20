import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '../../lib/utils';

export interface ChipInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

function parseChips(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function joinChips(chips: string[]): string {
  return chips.join(',');
}

export const ChipInput: React.FC<ChipInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  id,
  name,
  className,
}) => {
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chips = React.useMemo(() => parseChips(value), [value]);

  const commit = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (chips.includes(next)) {
      setDraft('');
      return;
    }
    onChange(joinChips([...chips, next]));
    setDraft('');
  };

  const removeAt = (index: number) => {
    const next = chips.filter((_, i) => i !== index);
    onChange(joinChips(next));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === 'Backspace' && !draft && chips.length > 0) {
      e.preventDefault();
      removeAt(chips.length - 1);
    }
  };

  if (disabled) {
    if (chips.length === 0) {
      return (
        <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center text-muted-foreground">
          -
        </div>
      );
    }
    return (
      <div className="flex min-h-9 w-full flex-wrap gap-1.5 rounded-md border border-input bg-muted/50 px-2 py-1.5">
        {chips.map((chip, i) => (
          <Badge key={`${chip}-${i}`} variant="secondary" className="text-xs">
            {chip}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip, i) => (
        <Badge
          key={`${chip}-${i}`}
          variant="secondary"
          className="gap-1 pl-2 pr-1 py-0.5 text-xs"
        >
          {chip}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
            className="ml-0.5 rounded hover:text-destructive"
            aria-label={`Remove ${chip}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        placeholder={chips.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
};

export default ChipInput;
