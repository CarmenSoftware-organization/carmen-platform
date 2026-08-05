import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clusterAdminService from '../services/clusterAdminService';
import clusterService from '../services/clusterService';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import type { AdminCluster } from '../types';

interface ClusterSwitcherProps {
  currentClusterId: string;
}

/**
 * Header control for moving between administered clusters. Navigates rather than setting state:
 * the cluster identity lives in the URL, so switching is a route change and nothing else.
 */
const ClusterSwitcher = ({ currentClusterId }: ClusterSwitcherProps) => {
  const { adminScope } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState<AdminCluster[] | null>(null);
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  const local = useMemo(() => adminScope?.clusters ?? [], [adminScope?.clusters]);
  const current = local.find((c) => c.id === currentClusterId);

  // Reset the query each time the dialog opens, so a stale term/remote result from a previous
  // session doesn't flash before the debounce below re-resolves it.
  useEffect(() => {
    if (open) setTerm('');
  }, [open]);

  // Super admins hold only a page of clusters locally, so their search must reach the server.
  useEffect(() => {
    if (!open || !adminScope?.all) return;
    let cancelled = false;
    const t = setTimeout(() => {
      clusterAdminService
        .getMyAdminClusters({ page: 1, perpage: 50, search: term })
        .then((s) => { if (!cancelled) setRemote(s.clusters); })
        .catch(() => { if (!cancelled) setRemote([]); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, term, adminScope?.all]);

  // `local` is only a page, so the cluster currently being administered may not be in it (most
  // likely for a super admin with more than a page's worth of clusters). Resolve its name
  // directly rather than falling back to the generic placeholder while inside it. Skipped
  // entirely when `currentClusterId` is already in `local` — the common case stays request-free.
  useEffect(() => {
    if (!currentClusterId || local.some((c) => c.id === currentClusterId)) {
      setFetchedName(null);
      return;
    }
    let cancelled = false;
    clusterService
      .getById(currentClusterId)
      .then((res) => {
        if (cancelled) return;
        const cluster = res?.data || res;
        setFetchedName(typeof cluster?.name === 'string' ? cluster.name : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedName(null);
      });
    return () => { cancelled = true; };
  }, [currentClusterId, local]);

  const items = useMemo(() => {
    if (adminScope?.all) return remote ?? local;
    const q = term.trim().toLowerCase();
    if (!q) return local;
    return local.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [adminScope?.all, remote, local, term]);

  if (!adminScope || (!adminScope.all && adminScope.clusters.length <= 1)) return null;

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <span className="max-w-[16rem] truncate">{current?.name ?? fetchedName ?? 'Select cluster'}</span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Switch cluster</DialogTitle>
          <DialogDescription className="sr-only">
            Choose which cluster to administer
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- palette pattern: focus the query on open
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search clusters..."
              className="h-11 border-0 focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {items.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No clusters found.</p>
            )}
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/cluster-admin/${c.id}/cluster`);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{c.name}</span>
                <span className="ml-3 shrink-0 font-mono text-xs text-muted-foreground">{c.code}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClusterSwitcher;
