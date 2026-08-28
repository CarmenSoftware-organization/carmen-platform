import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

interface BroadcastFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusFilter: string[];
  onStatusFilter: (status: string) => void;
  scopeFilter: string[];
  onScopeFilter: (scope: string) => void;
  showDeleted: boolean;
  onShowDeletedToggle: () => void;
  onClearAll: () => void;
  activeFilterCount: number;
}

export const BroadcastFilters: React.FC<BroadcastFiltersProps> = ({
  open,
  onOpenChange,
  statusFilter,
  onStatusFilter,
  scopeFilter,
  onScopeFilter,
  showDeleted,
  onShowDeletedToggle,
  onClearAll,
  activeFilterCount,
}) => {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle>{t('common.label.filters')}</SheetTitle>
          <SheetDescription>{t('pages.broadcasts.filterDescription')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 px-1">
          <div className="space-y-3">
            <span className="text-sm font-medium">{t('common.status.label')}</span>
            <div className="flex flex-wrap gap-1">
              {['active', 'scheduled', 'expired'].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter.includes(s) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => onStatusFilter(s)}
                >
                  {t(`common.status.${s}` as TKey) || s}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <span className="text-sm font-medium">{t('common.field.scope')}</span>
            <div className="flex flex-wrap gap-1">
              <Button
                variant={scopeFilter.includes('system') ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => onScopeFilter('system')}
              >
                {t('theme.system')}
              </Button>
              <Button
                variant={scopeFilter.includes('business_unit') ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => onScopeFilter('business_unit')}
              >
                {t('entity.businessUnit.title')}
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <span className="text-sm font-medium">{t('common.status.deleted')}</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showDeleted"
                checked={showDeleted}
                onChange={onShowDeletedToggle}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="showDeleted" className="text-sm text-muted-foreground cursor-pointer">
                {t('pages.broadcasts.showDeletedLabel')}
              </Label>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" className="w-full" onClick={onClearAll}>
              {t('common.action.clearAllFilters')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
