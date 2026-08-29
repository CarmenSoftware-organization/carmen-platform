import React from 'react';
import { Link } from 'react-router-dom';
import type { ReportTemplate } from '../../services/reportTemplateService';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { EmptyState } from '../../components/EmptyState';
import { AuditMeta } from '../../components/AuditMeta';
import { latestActor } from '../../utils/audit';
import { Plus, Pencil, MoreHorizontal, FileText, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';

export interface GroupCardProps {
  code: string;
  /** Already filtered (search/active) and sorted (default first, then name). */
  templates: ReportTemplate[];
  canWrite: boolean;
  canCreate: boolean;
  busy: boolean;
  onRequestDefault: (target: ReportTemplate) => void;
  onToggleActive: (t: ReportTemplate) => void;
  onAdd: (code: string) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  code,
  templates,
  canWrite,
  canCreate,
  busy,
  onRequestDefault,
  onToggleActive,
  onAdd,
}) => {
  const { t: tr } = useI18n();
  const hasDefault = templates.some((t) => t.is_default);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Badge variant="outline" className="font-mono">{code}</Badge>
          <span className="text-xs font-normal text-muted-foreground">
            {templates.length === 1
              ? tr('pages.reportFormGroups.templateCount', { count: templates.length })
              : tr('pages.reportFormGroups.templatesCount', { count: templates.length })}
          </span>
        </CardTitle>
        {canCreate && (
          <Button variant="outline" size="sm" onClick={() => onAdd(code)}>
            <Plus className="mr-2 h-4 w-4" />
            {tr('common.action.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={tr('pages.reportFormGroups.noTemplatesTitle')}
            description={tr('pages.reportFormGroups.noTemplatesDescription', { code })}
          />
        ) : (
          <div className="space-y-1">
            {!hasDefault && (
              <div
                role="status"
                className="mb-2 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                {tr('pages.reportFormGroups.noDefaultSet')}
              </div>
            )}
            {templates.map((t) => {
              const disableRadio = !canWrite || !t.is_active || busy;
              const lockDeactivate = t.is_default && t.is_active;
              const latest = latestActor(t);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <label
                    className="flex items-center"
                    title={!t.is_active ? tr('pages.reportFormGroups.activateFirstTitle') : undefined}
                  >
                    <input
                      type="radio"
                      name={`default-${code}`}
                      className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      checked={!!t.is_default}
                      disabled={disableRadio}
                      onChange={() => onRequestDefault(t)}
                      aria-label={tr('pages.reportFormGroups.setAsDefaultAria', { name: t.name, code })}
                    />
                  </label>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <AuditMeta
                      variant="compact"
                      verbKey={latest?.verbKey}
                      actor={latest?.actor}
                      className="text-muted-foreground text-[11px]"
                    />
                  </div>

                  <Badge variant={t.is_active ? 'success' : 'secondary'}>
                    {t.is_active ? tr('common.status.active') : tr('common.status.inactive')}
                  </Badge>
                  <Badge variant={t.is_standard ? 'default' : 'outline'}>
                    {t.is_standard ? tr('pages.reportFormGroups.standard') : tr('common.option.custom')}
                  </Badge>

                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/report-templates/${t.id}/edit`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {tr('common.action.edit')}
                    </Link>
                  </Button>

                  {canWrite && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tr('common.action.rowActions', { name: t.name })}
                          disabled={busy}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={lockDeactivate}
                          onClick={() => onToggleActive(t)}
                        >
                          {t.is_active
                            ? tr('pages.reportFormGroups.deactivate')
                            : tr('pages.reportFormGroups.activate')}
                          {lockDeactivate ? tr('pages.reportFormGroups.defaultSuffix') : ''}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
