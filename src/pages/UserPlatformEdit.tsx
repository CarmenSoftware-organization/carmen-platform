import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import userService from "../services/userService";
import userRoleService from "../services/userRoleService";
import roleService from "../services/roleService";
import clusterService from "../services/clusterService";
import { getErrorDetail, parseApiError } from "../utils/errorParser";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
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
    if (!selectedRoleId) { toast.error("Select a role"); return; }
    if (scopeType === "cluster" && !scopeClusterId) { toast.error("Select a cluster"); return; }
    setAddingRole(true);
    try {
      const scope: Scope = scopeType === "cluster"
        ? { type: "cluster", cluster_id: scopeClusterId }
        : { type: "platform" };
      await userRoleService.add(userId!, { role_id: selectedRoleId, scope });
      toast.success("Role assigned");
      setShowAddRole(false);
      setSelectedRoleId("");
      setScopeType("platform");
      setScopeClusterId("");
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


  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/platform/user-platform"
          title={userName || "User"}
          subtitle={userEmail || "Manage roles and scope"}
        />

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
                        <Badge variant="outline" className="text-[10px]">{scopeBadge}</Badge>
                      </div>
                      <Can permission="user_platform.manage">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRoleAssignment(assignment)}
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
                    <Label>Role</Label>
                    <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className={selectClassName}>
                      <option value="">Select role…</option>
                      {roleOptions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <select
                      value={scopeType}
                      onChange={(e) => { setScopeType(e.target.value as "platform" | "cluster"); setScopeClusterId(""); }}
                      className={selectClassName}
                    >
                      <option value="platform">Platform</option>
                      <option value="cluster">Specific cluster</option>
                    </select>
                  </div>
                  {scopeType === "cluster" && (
                    <div className="space-y-2">
                      <Label>Cluster</Label>
                      <select value={scopeClusterId} onChange={(e) => setScopeClusterId(e.target.value)} className={selectClassName}>
                        <option value="">Select cluster…</option>
                        {clusterOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddRole} disabled={addingRole}>
                      {addingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      {addingRole ? "Adding…" : "Add"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowAddRole(false); setSelectedRoleId(""); setScopeType("platform"); setScopeClusterId(""); }}
                    >
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
