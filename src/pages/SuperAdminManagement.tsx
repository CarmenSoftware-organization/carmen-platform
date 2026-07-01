import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import superAdminService from '../services/superAdminService';
import userService from '../services/userService';
import { parseApiError } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { ShieldAlert, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import type { User } from '../types';

interface SuperAdminRow {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
}

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Descend through nested `{ data: ... }` envelopes until the array is found.
// The super-admins endpoint nests deeper than the usual one-level convention.
const extractArray = <T,>(body: unknown): T[] => {
  let cur: unknown = body;
  while (cur && !Array.isArray(cur) && typeof cur === 'object' && 'data' in (cur as Record<string, unknown>)) {
    cur = (cur as Record<string, unknown>).data;
  }
  return Array.isArray(cur) ? (cur as T[]) : [];
};

const SuperAdminManagement: React.FC = () => {
  const [rows, setRows] = useState<SuperAdminRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [saData, usersData] = await Promise.all([
        superAdminService.list(),
        userService.getAll({ perpage: 200, sort: 'created_at:desc' }),
      ]);
      setRows(extractArray<SuperAdminRow>(saData));
      setRawResponse(saData);

      const userItems: User[] = (usersData.data || usersData) as User[];
      setUsers(Array.isArray(userItems) ? userItems : []);

      setError('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error('Failed to load super admins', { description: parsed.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build a map of user_id -> display label for resolving names
  const userMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of users) {
      const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
      const fullName = parts.join(' ');
      m[u.id] = fullName || u.email || u.name || u.id;
    }
    return m;
  }, [users]);

  // Users not already super-admins
  const superAdminUserIds = React.useMemo(
    () => new Set(rows.map((r) => r.user_id)),
    [rows],
  );
  const availableUsers = React.useMemo(
    () => users.filter((u) => !superAdminUserIds.has(u.id)),
    [users, superAdminUserIds],
  );

  const resolveUser = (user_id: string): string => userMap[user_id] || user_id;

  const handleAdd = async () => {
    if (!selectedUserId) return;
    try {
      setAdding(true);
      await superAdminService.add(selectedUserId);
      toast.success('Super admin added successfully');
      setSelectedUserId('');
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to add super admin', { description: parsed.message });
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeId) return;
    try {
      await superAdminService.remove(removeId);
      toast.success('Super admin removed successfully');
      setRemoveId(null);
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to remove super admin', { description: parsed.message });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title="Super Admins"
          subtitle="Platform users who bypass all permission checks"
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Add Super Admin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Super Admin</CardTitle>
            <CardDescription>
              Grant a platform user full super-admin privileges (bypasses all permission checks).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={loading || adding}
                className="flex h-9 w-full sm:flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Select user to add as super admin"
              >
                <option value="">Select a user...</option>
                {availableUsers.map((u) => {
                  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
                  const fullName = parts.join(' ');
                  const label = fullName ? `${fullName} (${u.email || u.id})` : (u.email || u.name || u.id);
                  return (
                    <option key={u.id} value={u.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <Button
                onClick={handleAdd}
                disabled={adding || !selectedUserId}
                className="shrink-0"
              >
                {adding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {adding ? 'Adding...' : (
                  <>
                    <span className="hidden sm:inline">Add Super Admin</span>
                    <span className="sm:hidden">Add</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Super Admins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Current Super Admins
              {rows.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {rows.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                Loading...
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="No super admins"
                description="No platform users have super-admin privileges yet. Add one above."
              />
            ) : (
              <div className="divide-y divide-border">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{resolveUser(row.user_id)}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{row.user_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Added: {fmt(row.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={row.is_active !== false ? 'success' : 'secondary'}>
                        {row.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => setRemoveId(row.id)}
                        aria-label={`Remove ${resolveUser(row.user_id)} as super admin`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title="Remove Super Admin"
        description="Are you sure you want to remove this user's super-admin privileges? They will no longer bypass permission checks."
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={handleConfirmRemove}
      />

      <DevDebugSheet title="API Response" endpoint="GET /api-system/platform/super-admins" data={rawResponse} />
    </Layout>
  );
};

export default SuperAdminManagement;
