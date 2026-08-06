import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserOption } from '../types';

interface UserPickerProps {
  value: UserOption | null;
  onChange: (next: UserOption | null) => void;
  /** Users that must not be selectable (e.g. already granted the thing being granted). */
  disabledIds?: Set<string>;
  /** Label shown beside a disabled result explaining why it cannot be picked. */
  disabledLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

/**
 * Single-user typeahead. Search runs server-side through `useUserSearch`, so it
 * reaches every user rather than a preloaded page of them.
 *
 * Search failures surface inside the dropdown only — never as a toast, which
 * would fire repeatedly while someone is still typing.
 */
export const UserPicker: React.FC<UserPickerProps> = ({
  value,
  onChange,
  disabledIds,
  disabledLabel = 'Unavailable',
  placeholder = 'Search users by name or email',
  disabled = false,
  error = false,
  id,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error: searchError } = useUserSearch(
    query,
    open && !disabled,
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectUser = (u: UserOption) => {
    onChange(u);
    setQuery('');
    setOpen(false);
  };

  const clearSelection = () => {
    onChange(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      // Close the dropdown without letting the event reach a surrounding Dialog,
      // which would otherwise close the whole dialog on the same keystroke.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-sm',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50',
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{value.name}</span>
          {value.email && (
            <span className="truncate text-xs text-muted-foreground">{value.email}</span>
          )}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 rounded hover:text-destructive"
            aria-label={`Clear selected user ${value.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          'flex min-h-9 w-full items-center gap-1 rounded-md border bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50 cursor-not-allowed',
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && searchError && (
            <div className="px-3 py-4 text-sm text-destructive">{searchError}</div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {query ? `No users match "${query}"` : 'Type to search users'}
            </div>
          )}
          {!loading && !searchError && results.length > 0 && (
            <ul className="py-1">
              {results.map((u) => {
                const isDisabled = disabledIds?.has(u.id) ?? false;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => selectUser(u)}
                      disabled={isDisabled}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                        isDisabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{u.name}</span>
                        {u.email && (
                          <span className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        )}
                      </span>
                      {isDisabled && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {disabledLabel}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default UserPicker;
