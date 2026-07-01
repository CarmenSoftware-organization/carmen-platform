import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import permissionService from '../services/permissionService';
import { parseApiError } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, ShieldCheck, Loader2, Code, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import type { PermissionCatalogItem } from '../types';

const PermissionCatalog: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0"
              onClick={() => navigate('/platform/roles')}
              aria-label="Back to Roles"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Permission Catalog</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Read-only reference of all platform permissions
              </p>
            </div>
          </div>
        </div>

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
                        <Badge variant="outline" className="w-fit text-[10px] sm:text-xs font-mono">
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

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !!rawResponse && (
        <Sheet open={debugOpen} onOpenChange={setDebugOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" size="medium" className="w-full overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/platform/permissions
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default PermissionCatalog;
