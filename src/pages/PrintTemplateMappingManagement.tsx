import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Can from '../components/Can';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { ListEmptyState } from '../components/ListEmptyState';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Plus, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import printTemplateMappingService, {
  type PrintTemplateMapping,
  type DocumentType,
} from '../services/printTemplateMappingService';
import { getErrorDetail } from '../utils/errorParser';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { HIT_SLOP_44 } from '../lib/hitSlop';

// Sentinel for the Select's "All document types" option — Radix Select rejects
// an empty-string item value, so `filterDocType` (which uses '' for "no filter")
// is translated to/from this token at the Select boundary only.
const ALL_DOC_TYPES = '__all__';

const MappingSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-label="Loading print template mappings">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 2 }).map((__, j) => (
            <div key={j} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-[2]" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const PrintTemplateMappingManagement: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PrintTemplateMapping[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [filterDocType, setFilterDocType] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const fetchAll = async (docType?: string, activeFlag?: boolean) => {
    try {
      setLoading(true);
      const res = await printTemplateMappingService.getAll({
        document_type: docType || undefined,
        active_only: activeFlag,
      });
      setRawResponse(res);
      // Unwrap any chain of `.data` keys until we hit an array (backend may
      // wrap as response.data, response.data.data, or response.data.data.data).
      let cur: unknown = res;
      for (let i = 0; i < 5 && cur; i++) {
        if (Array.isArray(cur)) break;
        cur = (cur as { data?: unknown }).data;
      }
      setRows(Array.isArray(cur) ? (cur as PrintTemplateMapping[]) : []);
      setError('');
    } catch (err) {
      setError('Failed to load print mappings: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const dt = await printTemplateMappingService.listDocumentTypes();
        setDocTypes(Array.isArray(dt?.document_types) ? dt.document_types : []);
      } catch (err) {
        toast.error('Failed to load document types: ' + getErrorDetail(err));
      }
    })();
  }, []);

  useEffect(() => {
    fetchAll(filterDocType, activeOnly);
  }, [filterDocType, activeOnly]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await printTemplateMappingService.delete(deleteTarget.id);
      toast.success('Mapping deleted');
      setDeleteTarget(null);
      await fetchAll(filterDocType, activeOnly);
    } catch (err) {
      toast.error('Failed to delete: ' + getErrorDetail(err));
    }
  };

  // A document type with zero matching rows still gets a group in the output —
  // its header renders with an explicit "no templates mapped" line rather than
  // silently vanishing (A5 contract edge case). When a specific document type is
  // selected, that's the only group shown (mirrors what the backend already
  // filtered); otherwise every known document type gets a slot.
  const grouped = useMemo(() => {
    const map = new Map<string, PrintTemplateMapping[]>();
    for (const r of rows) {
      const key = r.document_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const universe = filterDocType ? [filterDocType] : docTypes.map((d) => d.code);
    for (const code of universe) {
      if (!map.has(code)) map.set(code, []);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, docTypes, filterDocType]);

  const docTypeLabel = (code: string) =>
    docTypes.find((d) => d.code === code)?.label || code;

  const activeFilterCount = (filterDocType ? 1 : 0) + (activeOnly ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0;

  const addMappingAction = (
    <Can permission="print_template_mapping.create">
      <Button size="sm" onClick={() => navigate('/print-template-mapping/new')}>
        <Plus className="mr-2 h-4 w-4" />
        New Mapping
      </Button>
    </Can>
  );

  return (
    <Layout>
      <div className="space-y-4">
        <PageHeader
          title="Print Template Mapping"
          subtitle="Map document types (PR/PO/SR/GRN/...) to the FastReport templates used for printing."
          actions={
            <Can permission="print_template_mapping.create">
              <Button onClick={() => navigate('/print-template-mapping/new')}>
                <Plus className="mr-2 h-4 w-4" />
                New Mapping
              </Button>
            </Can>
          }
        />

        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="document-type-filter" className="text-xs font-medium">
              Document Type
            </Label>
            <Select
              value={filterDocType || ALL_DOC_TYPES}
              onValueChange={(v) => setFilterDocType(v === ALL_DOC_TYPES ? '' : v)}
            >
              <SelectTrigger id="document-type-filter" className="h-8 w-[220px] text-xs" aria-label="Filter by document type">
                <SelectValue placeholder="All document types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DOC_TYPES}>All document types</SelectItem>
                {docTypes.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {d.code} — {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            Active only
          </label>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {!error && loading && rows.length === 0 ? (
          <MappingSkeleton />
        ) : !error && grouped.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <ListEmptyState
                searchTerm=""
                activeFilterCount={activeFilterCount}
                icon={Printer}
                emptyTitle="No document types configured"
                emptyDescription="No print document types are available yet. Once document types exist, mappings can be created here."
                addAction={addMappingAction}
              />
            </CardContent>
          </Card>
        ) : !error ? (
          <div className="relative space-y-4">
            {loading && (
              <div
                className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg"
                role="status"
                aria-label="Refreshing print template mappings"
              >
                <div className="text-sm text-muted-foreground">Refreshing…</div>
              </div>
            )}
            {grouped.map(([docType, items]) => (
              <Card key={docType} className="gap-0 p-0">
                <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 border-b bg-muted/30 px-4 py-2">
                  <Badge variant="default">{docType}</Badge>
                  <CardTitle className="text-sm font-semibold">{docTypeLabel(docType)}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    ({items.length} mapping{items.length === 1 ? '' : 's'})
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  {items.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      {hasAnyFilter ? 'No templates match the current filter.' : 'No templates mapped yet.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Template</th>
                            <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Display Label</th>
                            <th className="text-center px-4 py-2 font-medium w-16 whitespace-nowrap">Default</th>
                            <th className="text-center px-4 py-2 font-medium w-16 whitespace-nowrap">Order</th>
                            <th className="text-center px-4 py-2 font-medium w-16 whitespace-nowrap">Active</th>
                            <th className="px-4 py-2 w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((r) => (
                            <tr
                              key={r.id}
                              className="border-t hover:bg-muted/30 cursor-pointer"
                              onClick={() => navigate(`/print-template-mapping/${r.id}/edit`)}
                            >
                              <td className="px-4 py-2 whitespace-nowrap">
                                <Link
                                  to={`/print-template-mapping/${r.id}/edit`}
                                  className="font-medium text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {r.template_name || '-'}
                                </Link>
                                {r.template_group && (
                                  <div className="text-xs text-muted-foreground">
                                    {r.template_group}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                                {r.display_label || '-'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {r.is_default ? (
                                  <Badge variant="default" className="text-xs">Default</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center font-mono text-xs">
                                {r.display_order}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-xs">
                                  {r.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <Can permission="print_template_mapping.delete">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Delete mapping ${r.template_name || r.report_template_id}`}
                                    className={`h-7 w-7 text-destructive hover:text-destructive ${HIT_SLOP_44}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget({
                                        id: r.id,
                                        label: `${r.document_type} → ${r.template_name || r.report_template_id}`,
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </Can>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Print Template Mapping"
        description={`Delete mapping "${deleteTarget?.label ?? ''}"? This cannot be undone (soft delete).`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      <DevDebugSheet
        title="Debug — Raw API Response"
        endpoint="GET /api-system/print-template-mappings"
        data={rawResponse}
      />
    </Layout>
  );
};

export default PrintTemplateMappingManagement;
