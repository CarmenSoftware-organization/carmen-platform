import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserOption } from '../types';
import { useI18n } from '../hooks/useI18n';

interface UserMultiSelectProps {
  value: UserOption[];
  onChange: (next: UserOption[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

export const UserMultiSelect: React.FC<UserMultiSelectProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  error = false,
  id,
}) => {
  const { t } = useI18n();
  const effectivePlaceholder = placeholder ?? t('components.userMultiSelect.defaultPlaceholder');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error: searchError } = useUserSearch(query, open);

  const selectedIds = new Set(value.map((u) => u.id));

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

  const addUser = (u: UserOption) => {
    if (selectedIds.has(u.id)) return;
    onChange([...value, u]);
    setQuery('');
    inputRef.current?.focus();
  };

  const removeUser = (idToRemove: string) => {
    onChange(value.filter((u) => u.id !== idToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !query && value.length > 0) {
      e.preventDefault();
      removeUser(value[value.length - 1].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 text-sm shadow-xs focus-within:outline-hidden focus-within:ring-1 focus-within:ring-ring',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50 cursor-not-allowed',
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {value.map((u) => (
          <Badge key={u.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-xs">
            <span className="max-w-[160px] truncate">{u.name}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUser(u.id);
                }}
                className="ml-0.5 rounded hover:text-destructive"
                aria-label={t('common.action.removeAria', { name: u.name })}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        <div className="flex flex-1 min-w-[160px] items-center gap-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            placeholder={value.length === 0 ? effectivePlaceholder : ''}
            className="flex-1 bg-transparent outline-hidden placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('components.userSearch.searchingEllipsis')}
            </div>
          )}
          {!loading && searchError && (
            <div className="px-3 py-4 text-sm text-destructive">{searchError}</div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {query
                ? t('components.userSearch.noMatch', { query })
                : t('components.userSearch.typeToSearch')}
            </div>
          )}
          {!loading && !searchError && results.length > 0 && (
            <ul className="py-1">
              {results.map((u) => {
                const alreadySelected = selectedIds.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addUser(u)}
                      disabled={alreadySelected}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2',
                        alreadySelected && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <span className="flex flex-col min-w-0">
                        <span className="truncate">{u.name}</span>
                        {u.email && (
                          <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                        )}
                      </span>
                      {alreadySelected && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {t('components.userMultiSelect.alreadySelected')}
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

export default UserMultiSelect;
