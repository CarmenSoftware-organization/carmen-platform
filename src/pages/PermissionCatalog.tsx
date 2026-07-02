import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import permissionService from '../services/permissionService';
import { parseApiError } from '../utils/errorParser';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import type { PermissionCatalogItem } from '../types';

const PermissionCatalog: React.FC = () => {
  const [items, setItems] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const catalog = await permissionService.getCatalog();
        setRawResponse(catalog);
        setItems(catalog);
        setError('');
      } catch (err: unknown) {
        const parsed = parseApiError(err);
        setError(parsed.message);
        toast.error('Failed to load permissions', { description: parsed.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Group items by resource, preserving catalog order. Avoid [...Set] spread
  // (tsconfig targets ES5/2015 without downlevelIteration).
  const groups = useMemo<Array<[string, PermissionCatalogItem[]]>>(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const p of items) {
      const existing = map.get(p.resource);
      if (existing) {
        existing.push(p);
      } else {
        map.set(p.resource, [p]);
      }
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title="Permission Catalog"
          subtitle="Read-only reference of all platform permissions"
          backTo="/platform/roles"
        />

        {/* Error */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title="No permissions"
            description="No platform permissions are defined in the catalog yet."
          />
        )}

        {/* Permission cards grouped by resource */}
        {!loading && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([resource, perms]) => (
              <Card key={resource}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base capitalize">{resource}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {perms.map((p) => (
                      <li key={p.key} className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="w-fit text-xs font-mono">
                          <code>{p.key}</code>
                        </Badge>
                        {p.description && (
                          <span className="text-sm text-muted-foreground pl-1">
                            {p.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/permissions" data={rawResponse} />
    </Layout>
  );
};

export default PermissionCatalog;
