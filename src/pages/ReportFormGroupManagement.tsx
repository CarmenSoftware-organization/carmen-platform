import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { FORM_REPORT_GROUPS } from '../constants/reportGroups';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import Can from '../components/Can';
import { GroupCard } from './reportFormGroups/GroupCard';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

interface GroupView {
  code: string;
  rows: ReportTemplate[];
}

interface PendingDefault {
  code: string;
  target: ReportTemplate;
  current: ReportTemplate | null;
}

const NONE_CODE = '(none)';

const ReportFormGroupManagement: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('report_template.update');
  const canCreate = hasPermission('report_template.create');

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [pendingDefault, setPendingDefault] = useState<PendingDefault | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const response: any = await reportTemplateService.getAll({
        perpage: -1,
        sort: 'name:asc',
        advance: JSON.stringify({ where: { template_type: 'form', deleted_at: null } }),
      });
      setRawResponse(response);
      const inner = response.data?.data ?? response.data ?? response;
      const items = Array.isArray(inner) ? inner : (inner?.data ?? []);
      setTemplates(Array.isArray(items) ? items : []);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load form templates: ' + getErrorDetail(err));
      devLog('Error fetching form templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const groups = useMemo<GroupView[]>(() => {
    const q = search.trim().toLowerCase();
    const rowVisible = (code: string, t: ReportTemplate) => {
      if (activeOnly && !t.is_active) return false;
      if (!q) return true;
      return code.toLowerCase().includes(q) || (t.name ?? '').toLowerCase().includes(q);
    };
    const sortRows = (rows: ReportTemplate[]) =>
      [...rows].sort((a, b) => {
        if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });

    const byGroup = new Map<string, ReportTemplate[]>();
    for (const t of templates) {
      const code = t.report_group || NONE_CODE;
      const bucket = byGroup.get(code);
      if (bucket) bucket.push(t);
      else byGroup.set(code, [t]);
    }

    const fixedCodes = FORM_REPORT_GROUPS as readonly string[];
    const build = (code: string): GroupView => ({
      code,
      rows: sortRows((byGroup.get(code) ?? []).filter((t) => rowVisible(code, t))),
    });

    // Fixed 12 always render when there is no query; under a query, keep only
    // groups whose code matches or that still have matching rows.
    const fixed = fixedCodes
      .map((c) => build(c))
      .filter((g) => (!q ? true : g.code.toLowerCase().includes(q) || g.rows.length > 0));

    // Legacy groups exist only because they hold data; show them when they have
    // at least one visible row.
    const legacy = Array.from(byGroup.keys())
      .filter((c) => !fixedCodes.includes(c))
      .sort((a, b) => a.localeCompare(b))
      .map((c) => build(c))
      .filter((g) => g.rows.length > 0);

    return [...fixed, ...legacy];
  }, [templates, search, activeOnly]);

  const requestDefault = (target: ReportTemplate) => {
    const code = target.report_group || NONE_CODE;
    const current =
      templates.find(
        (t) => (t.report_group || NONE_CODE) === code && t.is_default && t.id !== target.id,
      ) ?? null;
    setPendingDefault({ code, target, current });
  };

  const confirmDefault = async () => {
    if (!pendingDefault) return;
    const { code, target, current } = pendingDefault;
    setBusyGroup(code);
    try {
      await reportTemplateService.setGroupDefault({
        current: current ? { id: current.id, doc_version: getDocVersion(current) } : null,
        target: { id: target.id, doc_version: getDocVersion(target) },
      });
      toast.success(`Set "${target.name}" as default for ${code}`);
      setPendingDefault(null);
      await fetchAll();
    } catch (err: unknown) {
      if (isVersionConflict(err)) notifyVersionConflict();
      else toast.error('Failed to set default: ' + getErrorDetail(err));
      setPendingDefault(null);
      await fetchAll();
    } finally {
      setBusyGroup(null);
    }
  };

  const toggleActive = async (t: ReportTemplate) => {
    const code = t.report_group || NONE_CODE;
    const version = getDocVersion(t);
    setBusyGroup(code);
    try {
      await reportTemplateService.update(t.id, {
        is_active: !t.is_active,
        ...(version != null ? { doc_version: version } : {}),
      });
      toast.success(t.is_active ? `Deactivated "${t.name}"` : `Activated "${t.name}"`);
      await fetchAll();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchAll();
      } else {
        toast.error('Failed to update: ' + getErrorDetail(err));
      }
    } finally {
      setBusyGroup(null);
    }
  };

  const handleAdd = (code?: string) => {
    navigate('/report-templates/new', {
      state: { template_type: 'form', ...(code && code !== NONE_CODE ? { report_group: code } : {}) },
    });
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Form Groups"
          subtitle="Manage the default form template for each report group"
          actions={
            <Can permission="report_template.create">
              <Button size="sm" onClick={() => handleAdd()}>
                <Plus className="mr-2 h-4 w-4" />
                New Form Template
              </Button>
            </Can>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group code or template name…"
                className="pl-9"
                aria-label="Search form groups"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active only
            </label>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No groups match your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <GroupCard
                key={g.code}
                code={g.code}
                templates={g.rows}
                canWrite={canWrite}
                canCreate={canCreate}
                busy={busyGroup === g.code}
                onRequestDefault={requestDefault}
                onToggleActive={toggleActive}
                onAdd={handleAdd}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDefault}
        onOpenChange={(v) => {
          if (!v) setPendingDefault(null);
        }}
        title="Set default form template"
        description={
          pendingDefault
            ? `Set "${pendingDefault.target.name}" as the default for ${pendingDefault.code}?` +
              (pendingDefault.current ? ` Replaces "${pendingDefault.current.name}".` : '')
            : ''
        }
        confirmText="Set default"
        onConfirm={confirmDefault}
      />

      <DevDebugSheet title="Form Groups — raw" data={rawResponse} />
    </Layout>
  );
};

export default ReportFormGroupManagement;
