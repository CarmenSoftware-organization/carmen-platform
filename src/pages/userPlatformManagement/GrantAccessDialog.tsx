import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { UserPicker } from '../../components/UserPicker';
import userPlatformService from '../../services/userPlatformService';
import roleService from '../../services/roleService';
import clusterService from '../../services/clusterService';
import { parseApiError } from '../../utils/errorParser';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { UserOption, PlatformUserScope } from '../../types';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful grant so the page can refetch. */
  onGranted: () => void;
}

export const GrantAccessDialog: React.FC<GrantAccessDialogProps> = ({
  open, onOpenChange, onGranted,
}) => {
  const [user, setUser] = useState<UserOption | null>(null);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState<'platform' | 'cluster'>('platform');
  const [clusterId, setClusterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflictRoleIds, setConflictRoleIds] = useState<string[]>([]);

  // A ref, not state: Radix's DismissableLayer invokes onEscapeKeyDown through a callback
  // that does not reliably see this component's latest render, so a state value read
  // inside that closure can be stale. `.current` is dereferenced live at call time.
  const pickerOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Reset the Escape guard on open, not only on close: the dialog is controlled, so
    // closing it from code never fires Radix's onOpenChange, and a stale `true` here
    // would make a reopened dialog ignore Escape entirely.
    pickerOpenRef.current = false;
    setUser(null);
    setSelectedRoleIds([]);
    setScopeType('platform');
    setClusterId('');
    setConflictRoleIds([]);
    (async () => {
      try {
        const r = await roleService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = r.data || r;
        setRoleOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* the dialog still works with an empty list; the toast on submit explains */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: 'name:asc' });
        const items = c.data || c;
        setClusterOptions(
          (Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({
            id: x.id, name: x.name,
          })),
        );
      } catch { /* same */ }
    })();
  }, [open]);

  const toggleRole = (id: string) => {
    setConflictRoleIds([]);
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('Select a user'); return; }
    if (selectedRoleIds.length === 0) { toast.error('Select at least one role'); return; }
    if (scopeType === 'cluster' && !clusterId) { toast.error('Select a cluster'); return; }

    setSaving(true);
    setConflictRoleIds([]);
    try {
      const scope: PlatformUserScope =
        scopeType === 'cluster' ? { type: 'cluster', cluster_id: clusterId } : { type: 'platform' };
      await userPlatformService.assignBulk(user.id, { role_ids: selectedRoleIds, scope });
      toast.success('Access granted');
      onOpenChange(false);
      pickerOpenRef.current = false;
      onGranted();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      // Nothing was written, so the dialog stays open with what was typed intact.
      const named = roleOptions
        .filter((r) => message.includes(r.name))
        .map((r) => r.id);
      setConflictRoleIds(named);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => { if (pickerOpenRef.current) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Grant platform access</DialogTitle>
          <DialogDescription>
            Assign platform roles to a user. Every role in this request gets the same scope.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant_user">User</Label>
            <UserPicker
              id="grant_user"
              ariaLabel="User to grant access to"
              value={user}
              onChange={setUser}
              onDropdownOpenChange={(o) => { pickerOpenRef.current = o; }}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {roleOptions.length === 0 ? (
                <p className="text-muted-foreground p-2 text-sm">No platform roles available.</p>
              ) : roleOptions.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className={conflictRoleIds.includes(role.id) ? 'text-destructive' : ''}>
                    {role.name}
                  </span>
                  {conflictRoleIds.includes(role.id) && (
                    <span className="text-destructive text-xs">Already granted</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant_scope">Scope</Label>
            <select
              id="grant_scope"
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as 'platform' | 'cluster');
                setClusterId('');
                setConflictRoleIds([]);
              }}
              disabled={saving}
              className={selectClassName}
            >
              <option value="platform">Platform-wide</option>
              <option value="cluster">A specific cluster</option>
            </select>
          </div>

          {scopeType === 'cluster' && (
            <div className="space-y-2">
              <Label htmlFor="grant_cluster">Cluster</Label>
              <select
                id="grant_cluster"
                value={clusterId}
                onChange={(e) => { setClusterId(e.target.value); setConflictRoleIds([]); }}
                disabled={saving}
                className={selectClassName}
              >
                <option value="">Select cluster…</option>
                {clusterOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <ShieldCheck className="mr-2 h-4 w-4" />}
            {saving ? 'Granting…' : 'Grant access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
