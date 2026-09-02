import React, { useEffect, useMemo, useState } from 'react';
import businessUnitService from '../services/businessUnitService';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { devLog } from '../utils/errorParser';
import { Search, X } from 'lucide-react';
import type { BusinessUnit } from '../types';
import { useI18n } from '../hooks/useI18n';

interface BusinessUnitMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /**
   * Which BU field `value`/`onChange` key by. Defaults to `'id'` — the genuine foreign key
   * used by every existing caller (e.g. NewsEdit.tsx's `business_unit_ids`). Pass `'code'`
   * only when the consumer's field is actually a BU *code* (e.g. cronjob job_config's
   * `bu_codes`, which a backend resolves by code, not id) — the component already loads
   * both `id` and `code` on every row, so this only changes which one `value` is compared
   * and written against.
   */
  keyBy?: 'id' | 'code';
}

export const BusinessUnitMultiSelect: React.FC<BusinessUnitMultiSelectProps> = ({
  value, onChange, disabled, keyBy = 'id',
}) => {
  const { t } = useI18n();
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
        const items = data.data || data;
        const list: BusinessUnit[] = Array.isArray(items) ? items : [];
        const sorted = [...list].sort((a, b) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()),
        );
        if (active) setBusinessUnits(sorted);
      } catch (err) {
        devLog('Failed to load business units:', err);
        if (active) setError(t('common.state.failedToLoadBusinessUnits'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBus = useMemo(
    () => businessUnits.filter((bu) => value.includes(keyBy === 'code' ? bu.code : bu.id)),
    [businessUnits, value, keyBy],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businessUnits;
    return businessUnits.filter(
      (bu) => (bu.name || '').toLowerCase().includes(q) || (bu.code || '').toLowerCase().includes(q),
    );
  }, [businessUnits, search]);

  const toggle = (bu: BusinessUnit) => {
    if (disabled) return;
    const key = keyBy === 'code' ? bu.code : bu.id;
    if (value.includes(key)) onChange(value.filter((v) => v !== key));
    else onChange([...value, key]);
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selectedBus.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t('components.businessUnitMultiSelect.noneSelected')}</span>
        ) : (
          selectedBus.map((bu) => (
            <Badge key={bu.id} variant="secondary" className="text-xs gap-1 pr-1">
              {bu.code} - {bu.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(bu)}
                  className="ml-0.5 hover:text-foreground"
                  aria-label={t('common.action.removeAria', { name: bu.name })}
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
              placeholder={t('common.state.searchBusinessUnits')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label={t('common.state.searchBusinessUnitsAria')}
            />
          </div>
          <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('common.state.noBusinessUnitsFound')}</p>
            ) : (
              filtered.map((bu) => (
                <label key={bu.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.includes(keyBy === 'code' ? bu.code : bu.id)}
                    onChange={() => toggle(bu)}
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
