import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import subscriptionService from '../services/subscriptionService';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { JsonViewer } from '../components/ui/json-viewer';
import { Save, X, Loader2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import Can from '../components/Can';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError, parseApiError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useAuth } from '../context/AuthContext';
import { ClusterEditNav, type NavItem } from './clusterEdit/ClusterEditNav';
import { SubscriptionInfoCard, type SubscriptionFormData } from './subscriptionEdit/SubscriptionInfoCard';
import { SeatsCard } from './subscriptionEdit/SeatsCard';
import type { BusinessUnit, Cluster, SubscriptionBu, SubscriptionDetail } from '../types';

const isDev = process.env.NODE_ENV === 'development';

// ISO 8601 Z <-> the plain 'YYYY-MM-DD' an <input type="date"> wants.
//
// start_date/end_date are calendar dates (a contract's boundaries), not instants with a
// meaningful time-of-day — so this deliberately does NOT route through a local `Date` object
// the way display-only timestamp formatting elsewhere does. Doing that here would round-trip
// through the browser's local midnight, which is a genuine bug in any timezone ahead of UTC:
// in Bangkok (UTC+7), `new Date('2026-01-01T00:00:00').toISOString()` is
// '2025-12-31T17:00:00.000Z' — a full calendar day off from what the user picked. Slicing the
// UTC ISO string directly (and re-appending literal UTC midnight) is timezone-independent and
// exactly reversible.
const toYmd = (v?: string): string => (v ? (/^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? '') : '');
const fromYmd = (ymd: string): string => (ymd ? `${ymd}T00:00:00.000Z` : '');

// Every BU of the subscription's cluster, for Task B4's feature picker — bounded pagination,
// never `perpage: -1` (BusinessUnitEdit.tsx:168 / ClusterEdit.tsx:178 are the trap this repo
// already decided against). perpage:100 up to 10 pages is far beyond any real cluster's BU
// count; hitting the cap is a signal something is wrong, not a size this cluster should reach.
const CLUSTER_BU_PAGE_SIZE = 100;
const CLUSTER_BU_MAX_PAGES = 10;

async function fetchAllClusterBus(clusterId: string): Promise<BusinessUnit[]> {
  const advance = JSON.stringify({ where: { cluster_id: clusterId } });
  const all: BusinessUnit[] = [];
  for (let page = 1; page <= CLUSTER_BU_MAX_PAGES; page++) {
    const res = await businessUnitService.getAll({ page, perpage: CLUSTER_BU_PAGE_SIZE, advance });
    const items = res.data ?? [];
    all.push(...items);
    const total = res.paginate?.total;
    if (items.length === 0) break;
    if (total != null && all.length >= total) break;
    if (page === CLUSTER_BU_MAX_PAGES && (total == null || all.length < total)) {
      devLog('fetchAllClusterBus: hit the page cap without reaching paginate.total', {
        clusterId, loaded: all.length, total,
      });
    }
  }
  return all;
}

// 409-not-a-version-conflict on this endpoint is always the unique(cluster_id,
// subscription_number) constraint (phase-b-backend-contract.md §4/§6) — there is no other
// 409 case on create or update.
const isDuplicateSubscriptionNumber = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 409 && !isVersionConflict(err);

const emptyFormData: SubscriptionFormData = {
  cluster_id: '',
  subscription_number: '',
  start_date: '',
  end_date: '',
  status: 'active',
};

const SubscriptionEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('subscription.manage');

  const [formData, setFormData] = useState<SubscriptionFormData>(() => ({
    ...emptyFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  }));
  const [savedFormData, setSavedFormData] = useState<SubscriptionFormData>(formData);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  // B4 (FeatureMatrixCard) reads/writes these; this task only prepares the state + layout.
  const [bus, setBus] = useState<SubscriptionBu[]>([]);
  const [savedBus, setSavedBus] = useState<SubscriptionBu[]>([]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);

  const [clusterBus, setClusterBus] = useState<BusinessUnit[]>([]);
  const [clusterBusLoading, setClusterBusLoading] = useState(false);

  const hasChanges = !isNew && (
    JSON.stringify(formData) !== JSON.stringify(savedFormData) ||
    JSON.stringify(bus) !== JSON.stringify(savedBus)
  );
  useUnsavedChanges(hasChanges);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      setLoading(true);
      setNotFound(false);
      const raw = await subscriptionService.getById(id!);
      setRawResponse(raw);
      const data = (raw?.data || raw) as SubscriptionDetail | undefined;
      if (!data?.id) {
        setNotFound(true);
        return;
      }
      setDetail(data);
      setDocVersion(getDocVersion(data));
      const loaded: SubscriptionFormData = {
        cluster_id: data.cluster_id,
        subscription_number: data.subscription_number,
        start_date: toYmd(data.start_date),
        end_date: toYmd(data.end_date),
        status: data.status,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setBus(data.bus ?? []);
      setSavedBus(data.bus ?? []);
      setFieldErrors({});
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError('Failed to load subscription: ' + getErrorDetail(err));
      }
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { void load(); }, [load]);

  // Cluster picker — only needed to create a subscription. An existing one shows its
  // cluster read-only from `detail`, so there is nothing to fetch here for that case.
  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    setClustersLoading(true);
    clusterService.getAll({ perpage: 200, sort: 'name:asc' })
      .then((res) => { if (!cancelled) setClusters(res.data ?? []); })
      .catch((err) => { if (!cancelled) devLog('Failed to load clusters:', err); })
      .finally(() => { if (!cancelled) setClustersLoading(false); });
    return () => { cancelled = true; };
  }, [isNew]);

  // BU roster for the subscription's cluster — feeds Task B4's picker in both modes (a
  // cluster picked while creating, or the cluster an existing subscription already belongs
  // to). Refetches whenever the selected cluster changes.
  useEffect(() => {
    const clusterId = formData.cluster_id;
    if (!clusterId) { setClusterBus([]); return; }
    let cancelled = false;
    setClusterBusLoading(true);
    fetchAllClusterBus(clusterId)
      .then((rows) => { if (!cancelled) setClusterBus(rows); })
      .catch((err) => { if (!cancelled) devLog('Failed to load cluster business units:', err); })
      .finally(() => { if (!cancelled) setClusterBusLoading(false); });
    return () => { cancelled = true; };
  }, [formData.cluster_id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setBus(savedBus);
    setFieldErrors({});
    setError('');
  };

  // Cross-field rule (end_date after start_date) can't live in validateField, which only
  // ever sees one field at a time — checked here, at submit, per the corrections.
  const validateBeforeSubmit = (): boolean => {
    const next: Record<string, string> = {};
    if (isNew && !formData.cluster_id) next.cluster_id = 'Cluster is required';
    const numberErr = validateField('subscription_number', formData.subscription_number, {
      required: true, label: 'Subscription number',
    });
    if (numberErr) next.subscription_number = numberErr;
    const startErr = validateField('start_date', formData.start_date, {
      required: true, label: 'Start date',
    });
    if (startErr) next.start_date = startErr;
    const endErr = validateField('end_date', formData.end_date, {
      required: true, label: 'End date',
    });
    if (endErr) next.end_date = endErr;
    if (!next.start_date && !next.end_date && formData.start_date && formData.end_date) {
      if (new Date(formData.end_date).getTime() <= new Date(formData.start_date).getTime()) {
        next.end_date = 'End date must be after start date';
      }
    }
    setFieldErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!validateBeforeSubmit()) return;
    setSaving(true);
    setError('');
    try {
      // Built field-by-field, never `...formData` — create only accepts these five keys
      // (phase-b-backend-contract.md §4); formData has no extra keys today, but a loose
      // service signature (Partial<Subscription>) would happily let one slip through later.
      const payload = {
        cluster_id: formData.cluster_id,
        subscription_number: formData.subscription_number,
        start_date: fromYmd(formData.start_date),
        end_date: fromYmd(formData.end_date),
        status: formData.status,
      };
      const result = await subscriptionService.create(payload);
      const created = (result?.data || result) as { id?: string } | undefined;
      toast.success('Subscription created successfully');
      if (created?.id) {
        navigate(`/subscriptions/${created.id}/edit`, { replace: true });
      } else {
        navigate('/subscriptions');
      }
    } catch (err: unknown) {
      if (isDuplicateSubscriptionNumber(err)) {
        setFieldErrors((prev) => ({ ...prev, subscription_number: parseApiError(err).message }));
      } else {
        setError('Failed to create subscription: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit || isNew) return;
    if (!validateBeforeSubmit()) return;
    if (docVersion == null) {
      setError('Missing doc_version for this record — reload the page and try again.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        doc_version: docVersion,
        subscription_number: formData.subscription_number,
        start_date: fromYmd(formData.start_date),
        end_date: fromYmd(formData.end_date),
        status: formData.status,
      };
      await subscriptionService.update(id!, payload);
      toast.success('Changes saved successfully');
      await load();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await load();
      } else if (isNotFoundError(err)) {
        setNotFound(true);
      } else if (isDuplicateSubscriptionNumber(err)) {
        setFieldErrors((prev) => ({ ...prev, subscription_number: parseApiError(err).message }));
      } else {
        setError('Failed to save subscription: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  useGlobalShortcuts({
    onSave: () => { if (!isNew && canEdit && hasChanges && !saving) void handleSave(); },
    onCancel: () => { if (!isNew && hasChanges) handleCancelEdit(); },
  });

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading subscription">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/subscriptions" title="Subscription" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="Subscription not found"
                description="This subscription doesn't exist, or it may have been deleted. Check the link, or pick one from the subscription list."
                action={
                  <Button size="sm" onClick={() => navigate('/subscriptions')}>
                    Back to subscriptions
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const navItems: NavItem[] = [
    { id: 'info', label: 'ข้อมูลสัญญา' },
    { id: 'bu-features', label: 'สิทธิ์ตาม BU', count: bus.length },
    { id: 'seats', label: 'ที่นั่ง' },
    ...(isDev ? [{ id: 'debug', label: 'Debug' }] : []),
  ];

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <>
            <PageHeader backTo="/subscriptions" title="Add Subscription" subtitle="Create a new subscription for a cluster" />
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <SubscriptionInfoCard
                formData={formData}
                fieldErrors={fieldErrors}
                editing={canEdit}
                isNew
                clusters={clusters}
                clustersLoading={clustersLoading}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
              />
              <div className="flex gap-3">
                <Can permission="subscription.manage">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? 'Creating...' : 'Create Subscription'}
                  </Button>
                </Can>
                <Button type="button" size="sm" variant="outline" onClick={() => navigate('/subscriptions')}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <PageHeader
              backTo="/subscriptions"
              title={formData.subscription_number || '(unnamed subscription)'}
              subtitle={detail ? `Cluster: ${detail.cluster_name} (${detail.cluster_code})` : undefined}
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}

            <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-6 pb-24">
              <ClusterEditNav items={navItems} />
              <div className="space-y-6">
                <section id="info" className="scroll-mt-20">
                  <SubscriptionInfoCard
                    formData={formData}
                    fieldErrors={fieldErrors}
                    editing={canEdit}
                    isNew={false}
                    clusterLabel={detail ? `${detail.cluster_name} (${detail.cluster_code})` : ''}
                    state={detail?.state}
                    clusters={clusters}
                    clustersLoading={clustersLoading}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                  />
                </section>

                <section id="bu-features" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle>สิทธิ์ตาม BU</CardTitle>
                      <CardDescription>Per-BU feature entitlements</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Task B4 mounts <FeatureMatrixCard bus={bus} clusterBus={clusterBus}
                          onChange={setBus} readOnly={!canEdit} /> here. State + the BU roster
                          for this cluster (clusterBusLoading tracks its fetch) are wired and
                          ready; this task only reserves the layout slot. */}
                      <p className="text-sm text-muted-foreground">
                        {clusterBusLoading ? 'Loading business units…' : 'Coming soon.'}
                      </p>
                    </CardContent>
                  </Card>
                </section>

                <section id="seats" className="scroll-mt-20">
                  {detail && <SeatsCard seat={detail.seat} bus={detail.bus} />}
                </section>

                {isDev && (
                  <section id="debug" className="scroll-mt-20">
                    <Card>
                      <CardHeader>
                        <CardTitle>Debug</CardTitle>
                        <CardDescription>{`GET /api-system/platform/subscriptions/${id}`}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <JsonViewer data={rawResponse} />
                      </CardContent>
                    </Card>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {!isNew && hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background md:left-16 lg:left-60">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
              <span>Unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Can permission="subscription.manage">
                <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Can>
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <DevDebugSheet
          title="Subscription Debug"
          fabClassName={hasChanges ? 'bottom-20' : undefined}
          tabs={[
            { key: 'subscription', label: 'Subscription', data: rawResponse, endpoint: `GET /api-system/platform/subscriptions/${id}` },
            { key: 'clusterBus', label: 'Cluster BUs', data: clusterBus, endpoint: '/api-system/business-units' },
          ]}
        />
      )}
    </Layout>
  );
};

export default SubscriptionEdit;
