import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { ReadOnlyField } from '../../components/ReadOnlyField';
import type { Cluster, SubscriptionState, SubscriptionStatus } from '../../types';

export interface SubscriptionFormData {
  cluster_id: string;
  subscription_number: string;
  /** 'YYYY-MM-DD' — the raw <input type="date"> value, converted to/from ISO Z at the page level. */
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'inactive', 'expired'];

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

export interface SubscriptionInfoCardProps {
  formData: SubscriptionFormData;
  fieldErrors: Record<string, string>;
  /** false ⇒ every field renders its read-only mode (no separate Edit toggle on this page). */
  editing: boolean;
  isNew: boolean;
  /** Read-only display for the cluster field on an existing subscription (`"name (code)"`). */
  clusterLabel?: string;
  /** Backend-computed display state (list/detail `state`) — undefined until an existing
   * subscription has loaded. Never recompute this from status/end_date on the frontend. */
  state?: SubscriptionState;
  /** Candidate clusters for the picker — only rendered when `isNew`. */
  clusters: Cluster[];
  clustersLoading?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Contract details — subscription number, period, status. Every field renders two modes
 * (edit control + `ReadOnlyField`) per CLAUDE.md's Form Field Pattern, gated on `editing`
 * (== `subscription.manage`), not a page-level Edit toggle.
 *
 * Cluster is the one exception: it is only ever editable when `isNew` — an existing
 * subscription's cluster is fixed, regardless of permission.
 */
export function SubscriptionInfoCard({
  formData,
  fieldErrors,
  editing,
  isNew,
  clusterLabel,
  state,
  clusters,
  clustersLoading,
  onChange,
  onBlur,
  onFocus,
}: SubscriptionInfoCardProps) {
  const clusterEditable = editing && isNew;
  const selectedCluster = clusters.find((c) => c.id === formData.cluster_id);
  // A cluster the caller pre-selected (e.g. ?cluster_id=… from Cluster Edit) may not be in
  // `clusters` yet while the picker list is still loading — synthesize a placeholder option
  // so <select value=…> doesn't silently fall back to the first real option instead.
  const missingCurrentClusterId =
    !selectedCluster && formData.cluster_id ? formData.cluster_id : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ข้อมูลสัญญา</CardTitle>
        <CardDescription>Contract identity, period, and status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cluster_id">Cluster{clusterEditable && ' *'}</Label>
            {clusterEditable ? (
              <>
                <select
                  id="cluster_id"
                  name="cluster_id"
                  value={formData.cluster_id}
                  onChange={onChange}
                  className={selectClassName}
                >
                  <option value="">Select a cluster</option>
                  {missingCurrentClusterId && (
                    <option value={missingCurrentClusterId}>
                      {clustersLoading ? 'Loading…' : missingCurrentClusterId}
                    </option>
                  )}
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.cluster_id && (
                  <p className="text-destructive text-xs">{fieldErrors.cluster_id}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={clusterLabel} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subscription_number">Subscription Number{editing && ' *'}</Label>
            {editing ? (
              <>
                <Input
                  id="subscription_number"
                  name="subscription_number"
                  value={formData.subscription_number}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  placeholder="SUB-2026-001"
                  className={fieldErrors.subscription_number ? 'border-destructive' : ''}
                />
                {fieldErrors.subscription_number && (
                  <p className="text-destructive text-xs">{fieldErrors.subscription_number}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={formData.subscription_number} className="font-mono" />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date{editing && ' *'}</Label>
            {editing ? (
              <>
                <Input
                  type="date"
                  id="start_date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.start_date ? 'border-destructive' : ''}
                />
                {fieldErrors.start_date && (
                  <p className="text-destructive text-xs">{fieldErrors.start_date}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={formData.start_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date">End Date{editing && ' *'}</Label>
            {editing ? (
              <>
                <Input
                  type="date"
                  id="end_date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.end_date ? 'border-destructive' : ''}
                />
                {fieldErrors.end_date && (
                  <p className="text-destructive text-xs">{fieldErrors.end_date}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={formData.end_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            {editing ? (
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={onChange}
                className={selectClassName}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            ) : (
              <div>
                <Badge variant={formData.status === 'active' ? 'success' : 'secondary'} className="capitalize">
                  {formData.status}
                </Badge>
              </div>
            )}
            {/* status is the raw DB value; state is what backend computed from status + end_date.
                Always show both so "status=active but already expired" is visible at a glance —
                never recompute state on the frontend (swagger: use the field as-is). */}
            {!isNew && state && (
              <p className="text-xs text-muted-foreground">
                Effective state:{' '}
                <Badge variant={state === 'active' ? 'success' : 'secondary'} className="ml-1 capitalize">
                  {state}
                </Badge>
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
