import React, { useEffect, useMemo, useState } from 'react';
import businessUnitService from '../services/businessUnitService';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { devLog } from '../utils/errorParser';
import { Search, X } from 'lucide-react';
import type { BusinessUnit } from '../types';

interface BusinessUnitMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export const BusinessUnitMultiSelect: React.FC<BusinessUnitMultiSelectProps> = ({ value, onChange, disabled }) => {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: -1 });
        const items = (data as { data?: BusinessUnit[] }).data || data;
        const list: BusinessUnit[] = Array.isArray(items) ? items : [];
        const sorted = [...list].sort((a, b) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()),
        );
        if (active) setBusinessUnits(sorted);
      } catch (err) {
        devLog('Failed to load business units:', err);
        if (active) setError('Failed to load business units');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedBus = useMemo(
    () => businessUnits.filter((bu) => value.includes(bu.id)),
    [businessUnits, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businessUnits;
    return businessUnits.filter(
      (bu) => (bu.name || '').toLowerCase().includes(q) || (bu.code || '').toLowerCase().includes(q),
    );
  }, [businessUnits, search]);

  const toggle = (buId: string) => {
    if (value.includes(buId)) onChange(value.filter((v) => v !== buId));
    else onChange([...value, buId]);
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selectedBus.length === 0 ? (
          <span className="text-xs text-muted-foreground">No business units selected</span>
        ) : (
          selectedBus.map((bu) => (
            <Badge key={bu.id} variant="secondary" className="text-xs gap-1 pr-1">
              {bu.code} - {bu.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(bu.id)}
                  className="ml-0.5 hover:text-foreground"
                  aria-label={`Remove ${bu.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>

      {!disabled && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search business units..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search business units"
            />
          </div>
          <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No business units found.</p>
            ) : (
              filtered.map((bu) => (
                <label key={bu.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.includes(bu.id)}
                    onChange={() => toggle(bu.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{bu.code} - {bu.name}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
