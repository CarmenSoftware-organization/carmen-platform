import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plus, Pencil, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import printTemplateMappingService, {
  type PrintTemplateMapping,
  type DocumentType,
} from '../services/printTemplateMappingService';
import { getErrorDetail } from '../utils/errorParser';

const PrintTemplateMappingManagement: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PrintTemplateMapping[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [filterDocType, setFilterDocType] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = async (docType?: string, activeFlag?: boolean) => {
    try {
      setLoading(true);
      const res = await printTemplateMappingService.getAll({
        document_type: docType || undefined,
        active_only: activeFlag,
      });
      setRows(res.data || []);
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
        setDocTypes(dt.document_types || []);
      } catch (err) {
        toast.error('Failed to load document types: ' + getErrorDetail(err));
      }
    })();
  }, []);

  useEffect(() => {
    fetchAll(filterDocType, activeOnly);
  }, [filterDocType, activeOnly]);

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete mapping "${label}"? This cannot be undone (soft delete).`)) return;
    try {
      setDeletingId(id);
      await printTemplateMappingService.delete(id);
      toast.success('Mapping deleted');
      await fetchAll(filterDocType, activeOnly);
    } catch (err) {
      toast.error('Failed to delete: ' + getErrorDetail(err));
    } finally {
      setDeletingId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PrintTemplateMapping[]>();
    for (const r of rows) {
      const key = r.document_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const docTypeLabel = (code: string) =>
    docTypes.find((d) => d.code === code)?.label || code;

  return (
    <Layout>
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Print Template Mapping
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Map document types (PR/PO/SR/GRN/...) to the FastReport templates used for printing.
              </p>
            </div>
            <Button onClick={() => navigate('/print-template-mapping/new')}>
              <Plus className="mr-2 h-4 w-4" />
              New Mapping
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Document Type:</span>
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  value={filterDocType}
                  onChange={(e) => setFilterDocType(e.target.value)}
                >
                  <option value="">All</option>
                  {docTypes.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Active only
              </label>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No mappings yet. Click <span className="font-medium">New Mapping</span> to create one.
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([docType, items]) => (
                  <div key={docType} className="rounded-lg border">
                    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                      <Badge variant="default">{docType}</Badge>
                      <span className="text-sm font-medium">{docTypeLabel(docType)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({items.length} mapping{items.length === 1 ? '' : 's'})
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Template</th>
                          <th className="text-left px-4 py-2 font-medium">Display Label</th>
                          <th className="text-center px-4 py-2 font-medium w-16">Default</th>
                          <th className="text-center px-4 py-2 font-medium w-16">Order</th>
                          <th className="text-center px-4 py-2 font-medium w-16">Active</th>
                          <th className="px-4 py-2 w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.id} className="border-t hover:bg-muted/30">
                            <td className="px-4 py-2">
                              <div className="font-medium">{r.template_name || '-'}</div>
                              {r.template_group && (
                                <div className="text-xs text-muted-foreground">
                                  {r.template_group}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {r.display_label || '-'}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {r.is_default ? (
                                <Badge variant="default" className="text-[10px]">Default</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center font-mono text-xs">
                              {r.display_order}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-[10px]">
                                {r.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => navigate(`/print-template-mapping/${r.id}/edit`)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-destructive"
                                onClick={() =>
                                  handleDelete(
                                    r.id,
                                    `${r.document_type} → ${r.template_name || r.report_template_id}`,
                                  )
                                }
                                disabled={deletingId === r.id}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PrintTemplateMappingManagement;
