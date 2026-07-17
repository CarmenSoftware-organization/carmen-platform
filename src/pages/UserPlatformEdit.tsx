import React, { useState, useEffect, useCallback } from "react";
import { useGlobalShortcuts } from "../components/KeyboardShortcuts";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import userService from "../services/userService";
import userRoleService from "../services/userRoleService";
import roleService from "../services/roleService";
import clusterService from "../services/clusterService";
import { getErrorDetail, parseApiError } from "../utils/errorParser";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { DevDebugSheet } from "../components/ui/dev-debug-sheet";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import Can from "../components/Can";
import { ShieldCheck, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserRoleAssignment, Scope } from "../types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const UserPlatformEdit: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);

  const [showAddRole, setShowAddRole] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [scopeType, setScopeType] = useState<"platform" | "cluster">("platform");
  const [scopeClusterId, setScopeClusterId] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [deleteRoleAssignment, setDeleteRoleAssignment] = useState<UserRoleAssignment | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The add-role mini-form is ephemeral (no saved baseline) — "dirty" means any
  // field has been touched while the form is open, so it's discarded silently
  // (e.g. tab close) without a warning.
  const hasChanges = showAddRole && (selectedRoleId !== "" || scopeType !== "platform" || scopeClusterId !== "");
  useUnsavedChanges(hasChanges);

  const handleCancelAddRole = useCallback(() => {
    setShowAddRole(false);
    setSelectedRoleId("");
    setScopeType("platform");
    setScopeClusterId("");
    setFieldErrors({});
  }, []);

  useGlobalShortcuts({
    onSave: () => { if (showAddRole && !addingRole) handleAddRole(); },
    onCancel: () => { if (showAddRole) handleCancelAddRole(); },
  });

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const res = await userService.getById(userId);
      const user = res.data || res;
      setRawResponse(res);
      const info = user.user_info || {};
      const first = user.firstname || info.firstname || "";
      const last = user.lastname || info.lastname || "";
      setUserName(`${first} ${last}`.trim() || user.username || userId);
      setUserEmail(user.email || info.email || user.username || "");
      try { setRoleAssignments(await userRoleService.list(userId)); } catch { /* non-fatal */ }
      try {
        const r = await roleService.getAll({ perpage: 200, sort: "name:asc" });
        const items = r.data || r;
        setRoleOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: "name:asc" });
        const items = c.data || c;
        setClusterOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setError("Failed to load user: " + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAddRole = async () => {
    if (!selectedRoleId) {
      setFieldErrors((prev) => ({ ...prev, role_id: "Role is required" }));
      toast.error("Select a role");
      return;
    }
    if (scopeType === "cluster" && !scopeClusterId) {
      setFieldErrors((prev) => ({ ...prev, cluster_id: "Cluster is required" }));
      toast.error("Select a cluster");
      return;
    }
    setAddingRole(true);
    try {
      const scope: Scope = scopeType === "cluster"
        ? { type: "cluster", cluster_id: scopeClusterId }
        : { type: "platform" };
      await userRoleService.add(userId!, { role_id: selectedRoleId, scope });
      toast.success("Role assigned");
      handleCancelAddRole();
      setRoleAssignments(await userRoleService.list(userId!));
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setAddingRole(false);
    }
  };

  const handleRemoveRole = async () => {
    if (!deleteRoleAssignment) return;
    try {
      await userRoleService.remove(userId!, deleteRoleAssignment.id);
      toast.success("Role removed");
      setRoleAssignments(await userRoleService.list(userId!));
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setDeleteRoleAssignment(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading user roles">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>

          {/* Roles & Scope card skeleton */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48 mt-1" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/platform/user-platform"
          title={userName || "User"}
          subtitle={userEmail || "Manage roles and scope"}
        />

        {error && (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Roles &amp; Scope
                </CardTitle>
                <CardDescription>Platform roles assigned to this user</CardDescription>
              </div>
              <Can permission="user_platform.manage">
                <Button variant="outline" size="sm" onClick={() => setShowAddRole(true)} disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Role
                </Button>
              </Can>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles assigned.</p>
            ) : (
              <div className="space-y-2">
                {roleAssignments.map((assignment) => {
                  const scopeBadge = assignment.scope.type === "cluster"
                    ? (clusterOptions.find(c => c.id === (assignment.scope as { type: "cluster"; cluster_id: string }).cluster_id)?.name
                        || (assignment.scope as { type: "cluster"; cluster_id: string }).cluster_id)
                    : "Platform";
                  return (
                    <div key={assignment.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{assignment.role_name || assignment.role_id}</span>
                        <Badge variant="outline" className="text-xs">{scopeBadge}</Badge>
                      </div>
                      <Can permission="user_platform.manage">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRoleAssignment(assignment)}
                          aria-label={`Remove ${assignment.role_name || "role"}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </Can>
                    </div>
                  );
                })}
              </div>
            )}

            <Can permission="user_platform.manage">
              {showAddRole && (
                <div className="rounded-md border p-3 space-y-3 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="role_id">Role *</Label>
                    <select
                      id="role_id"
                      value={selectedRoleId}
                      onChange={(e) => { setSelectedRoleId(e.target.value); setFieldErrors((prev) => ({ ...prev, role_id: "" })); }}
                      onBlur={() => setFieldErrors((prev) => ({ ...prev, role_id: selectedRoleId ? "" : "Role is required" }))}
                      className={`${selectClassName} ${fieldErrors.role_id ? "border-destructive" : ""}`}
                    >
                      <option value="">Select role…</option>
                      {roleOptions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                    {fieldErrors.role_id && <p className="text-xs text-destructive">{fieldErrors.role_id}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scope_type">Scope</Label>
                    <select
                      id="scope_type"
                      value={scopeType}
                      onChange={(e) => {
                        setScopeType(e.target.value as "platform" | "cluster");
                        setScopeClusterId("");
                        setFieldErrors((prev) => ({ ...prev, cluster_id: "" }));
                      }}
                      className={selectClassName}
                    >
                      <option value="platform">Platform</option>
                      <option value="cluster">Specific cluster</option>
                    </select>
                  </div>
                  {scopeType === "cluster" && (
                    <div className="space-y-2">
                      <Label htmlFor="cluster_id">Cluster *</Label>
                      <select
                        id="cluster_id"
                        value={scopeClusterId}
                        onChange={(e) => { setScopeClusterId(e.target.value); setFieldErrors((prev) => ({ ...prev, cluster_id: "" })); }}
                        onBlur={() => setFieldErrors((prev) => ({ ...prev, cluster_id: scopeClusterId ? "" : "Cluster is required" }))}
                        className={`${selectClassName} ${fieldErrors.cluster_id ? "border-destructive" : ""}`}
                      >
                        <option value="">Select cluster…</option>
                        {clusterOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                      {fieldErrors.cluster_id && <p className="text-xs text-destructive">{fieldErrors.cluster_id}</p>}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddRole} disabled={addingRole}>
                      {addingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      {addingRole ? "Adding…" : "Add"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelAddRole}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Can>

            <ConfirmDialog
              open={!!deleteRoleAssignment}
              onOpenChange={(open) => { if (!open) setDeleteRoleAssignment(null); }}
              title="Remove role"
              description={`Are you sure you want to remove the role "${deleteRoleAssignment?.role_name || deleteRoleAssignment?.role_id}" from this user?`}
              confirmText="Remove"
              confirmVariant="destructive"
              onConfirm={handleRemoveRole}
            />
          </CardContent>
        </Card>

        <DevDebugSheet title="Debug" endpoint="Raw API responses" data={{ user: rawResponse, roleAssignments }} />
      </div>
    </Layout>
  );
};

export default UserPlatformEdit;
