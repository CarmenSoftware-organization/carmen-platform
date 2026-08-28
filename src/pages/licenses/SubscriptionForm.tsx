import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import subscriptionService from '../../services/subscriptionService';
import businessUnitService from '../../services/businessUnitService';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import { Save, X, Loader2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/ui/skeleton';
import Can from '../../components/Can';
import { validateField } from '../../utils/validation';
import { getErrorDetail, devLog, isNotFoundError, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAllClusters } from '../../hooks/useAllClusters';
import { fetchAllPages } from '../../utils/fetchAllPages';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../hooks/useI18n';
import { ClusterEditNav, type NavItem } from '../clusterEdit/ClusterEditNav';
import { SubscriptionInfoCard, type SubscriptionFormData } from './subscriptionEdit/SubscriptionInfoCard';
import { SeatsCard } from './subscriptionEdit/SeatsCard';
import { FeatureSelectionCard } from './subscriptionEdit/FeatureSelectionCard';
import type { BusinessUnit, SubscriptionDetail } from '../../types';

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
// The loop itself (and the cap warning) lives in `fetchAllPages`, shared with the cluster
// picker's `useAllClusters` — review M7: those two were paginated differently in this one file.
const CLUSTER_BU_PAGE_SIZE = 100;
const CLUSTER_BU_MAX_PAGES = 10;

function fetchAllClusterBus(clusterId: string): Promise<BusinessUnit[]> {
  const advance = JSON.stringify({ where: { cluster_id: clusterId } });
  return fetchAllPages<BusinessUnit>(
    (page, perpage) => businessUnitService.getAll({ page, perpage, advance }),
    {
      pageSize: CLUSTER_BU_PAGE_SIZE,
      maxPages: CLUSTER_BU_MAX_PAGES,
      label: 'fetchAllClusterBus',
      context: { clusterId },
    },
  );
}

const emptyFormData: SubscriptionFormData = {
  cluster_id: '',
  business_unit_id: '',
  subscription_number: '',
  start_date: '',
  end_date: '',
  status: 'active',
};

const SubscriptionForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('subscription.manage');
  const { t } = useI18n();

  const [formData, setFormData] = useState<SubscriptionFormData>(() => ({
    ...emptyFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  }));
  const [savedFormData, setSavedFormData] = useState<SubscriptionFormData>(formData);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  // สิทธิ์ของสัญญา — หนึ่งใบผูก BU เดียว จึงเป็น array ของ feature key ตรง ๆ ไม่ใช่ราย BU
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);
  const [savedFeatureKeys, setSavedFeatureKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // Cluster picker — only needed to create a subscription. An existing one shows its cluster
  // read-only from `detail`, so nothing is fetched for that case (`enabled = isNew`).
  const { clusters, loading: clustersLoading, error: clustersError } = useAllClusters(isNew);

  const [clusterBus, setClusterBus] = useState<BusinessUnit[]>([]);
  const [clusterBusLoading, setClusterBusLoading] = useState(false);

  const hasChanges = !isNew && (
    JSON.stringify(formData) !== JSON.stringify(savedFormData) ||
    JSON.stringify(featureKeys) !== JSON.stringify(savedFeatureKeys)
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
        business_unit_id: data.bu?.business_unit_id ?? '',
        subscription_number: data.subscription_number,
        start_date: toYmd(data.start_date),
        end_date: toYmd(data.end_date),
        status: data.status,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setFeatureKeys(data.bu?.feature_keys ?? []);
      setSavedFeatureKeys(data.bu?.feature_keys ?? []);
      setFieldErrors({});
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError(t('pages.subscriptions.loadFailedDetail') + getErrorDetail(err, t));
      }
    } finally {
      setLoading(false);
    }
  }, [id, isNew, t]);

  useEffect(() => { void load(); }, [load]);

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
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value, undefined, t) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setFeatureKeys(savedFeatureKeys);
    setFieldErrors({});
    setError('');
  };

  // Cross-field rule (end_date after start_date) can't live in validateField, which only
  // ever sees one field at a time — checked here, at submit, per the corrections.
  const validateBeforeSubmit = (): boolean => {
    const next: Record<string, string> = {};
    if (isNew && !formData.cluster_id) {
      next.cluster_id = t('common.validation.selectRequired', { label: t('common.label.cluster') });
    }
    // BU บังคับเฉพาะตอนสร้าง — ใบที่มีอยู่แล้วเปลี่ยน BU ไม่ได้ ค่านี้จึงมาจาก detail เสมอ และ
    // ใบเก่าที่ข้อมูลผิดรูป (ไม่มี BU) ต้องยังบันทึกสิทธิ์/วันที่ได้ ไม่ใช่ถูกล็อกด้วย validation
    if (isNew && !formData.business_unit_id) {
      next.business_unit_id = t('common.validation.selectRequired', { label: t('entity.businessUnit.sentence') });
    }
    const startErr = validateField('start_date', formData.start_date, {
      required: true, label: t('common.validation.startDate'),
    }, t);
    if (startErr) next.start_date = startErr;
    const endErr = validateField('end_date', formData.end_date, {
      required: true, label: t('common.validation.endDate'),
    }, t);
    if (endErr) next.end_date = endErr;
    if (!next.start_date && !next.end_date && formData.start_date && formData.end_date) {
      if (new Date(formData.end_date).getTime() <= new Date(formData.start_date).getTime()) {
        next.end_date = t('pages.subscriptions.endDateAfterStart');
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
      // Built field-by-field, never `...formData` — create accepts exactly these five keys.
      // `subscription_number` is NOT among them: the server issues it (`SUB-YYMM-####`), and
      // formData carries it only to display an existing contract's number.
      const payload = {
        cluster_id: formData.cluster_id,
        business_unit_id: formData.business_unit_id,
        start_date: fromYmd(formData.start_date),
        end_date: fromYmd(formData.end_date),
        status: formData.status,
      };
      const result = await subscriptionService.create(payload);
      const created = (result?.data || result) as { id?: string } | undefined;
      toast.success(t('toast.created', { entity: t('pages.subscriptions.subscription') }));
      if (created?.id) {
        navigate(`/licenses/subscriptions/${created.id}/edit`, { replace: true });
      } else {
        navigate('/licenses');
      }
    } catch (err: unknown) {
      // 400 จาก backend เป็นได้สองอย่าง: BU ไม่อยู่ใน cluster ที่เลือก หรือช่วงวันไม่ถูกต้อง —
      // `parseApiError` แยกให้เป็นราย field เมื่อ backend ส่งมา ที่เหลือขึ้นเป็น banner
      const { fields } = parseApiError(err, t);
      if (fields && Object.keys(fields).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...fields }));
      } else {
        setError(t('pages.subscriptions.createFailedPrefix') + getErrorDetail(err, t));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit || isNew) return;
    if (!validateBeforeSubmit()) return;
    if (docVersion == null) {
      setError(t('pages.subscriptions.missingDocVersion'));
      return;
    }
    const infoChanged = JSON.stringify(formData) !== JSON.stringify(savedFormData);
    const featuresChanged = JSON.stringify(featureKeys) !== JSON.stringify(savedFeatureKeys);
    setSaving(true);
    setError('');
    try {
      // Two independent endpoints share one doc_version — PATCH bumps it, so a subsequent
      // PUT .../features in the same save must carry the bumped value, not the one this page
      // loaded with, or it 409s against itself.
      let currentDocVersion = docVersion;
      if (infoChanged) {
        const payload = {
          doc_version: currentDocVersion,
          start_date: fromYmd(formData.start_date),
          end_date: fromYmd(formData.end_date),
          status: formData.status,
        };
        const result = await subscriptionService.update(id!, payload);
        const updated = (result?.data || result) as SubscriptionDetail | undefined;
        const nextVersion = getDocVersion(updated);
        if (nextVersion != null) {
          currentDocVersion = nextVersion;
          setDocVersion(nextVersion);
        }
      }
      if (featuresChanged) {
        // Replace semantics — the full desired key set, not a diff. ไม่มี BU ใน payload:
        // สัญญาผูก BU เดียวที่กำหนดตอนสร้างและเปลี่ยนที่นี่ไม่ได้
        await subscriptionService.setFeatures(id!, featureKeys, currentDocVersion);
      }
      toast.success(t('toast.saved'));
      await load();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await load();
      } else if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError(t('pages.subscriptions.saveFailedPrefix') + getErrorDetail(err, t));
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
        <div className="space-y-4 sm:space-y-6" role="status" aria-label={t('pages.subscriptions.loadingAria')}>
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
          <PageHeader backTo="/licenses" title={t('pages.subscriptions.subscription')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.subscriptions.notFoundTitle')}
                description={t('pages.subscriptions.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/licenses')}>
                    {t('pages.subscriptions.backToSubscriptions')}
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
    { id: 'info', label: t('pages.subscriptions.detailsTitle') },
    { id: 'features', label: t('pages.subscriptions.purchasedModules'), count: featureKeys.length },
    { id: 'seats', label: t('pages.subscriptions.seats') },
  ];

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <>
            <PageHeader
              backTo="/licenses"
              title={t('pages.subscriptions.addSubscription')}
              subtitle={t('pages.subscriptions.createSubtitle')}
            />
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
                clustersError={clustersError}
                clusterBus={clusterBus}
                clusterBusLoading={clusterBusLoading}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
              />
              <div className="flex gap-3">
                <Can permission="subscription.manage">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? t('common.busy.creating') : t('pages.subscriptions.createSubscription')}
                  </Button>
                </Can>
                <Button type="button" size="sm" variant="outline" onClick={() => navigate('/licenses')}>
                  <X className="mr-2 h-4 w-4" />
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <PageHeader
              backTo="/licenses"
              title={formData.subscription_number || t('pages.subscriptions.unnamedSubscription')}
              subtitle={
                detail
                  ? t('pages.subscriptions.clusterSubtitle', { name: detail.cluster_name, code: detail.cluster_code })
                  : undefined
              }
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
                    buLabel={detail?.bu ? `${detail.bu.bu_code} - ${detail.bu.bu_name}` : ''}
                    state={detail?.state}
                    clusters={clusters}
                    clustersLoading={clustersLoading}
                    clusterBus={clusterBus}
                    clusterBusLoading={clusterBusLoading}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                  />
                </section>

                <section id="features" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('pages.subscriptions.purchasedModules')}</CardTitle>
                      <CardDescription>
                        {detail?.bu
                          ? t('pages.subscriptions.featureEntitlementsForBu', { code: detail.bu.bu_code })
                          : t('pages.subscriptions.featureEntitlementsGeneric')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FeatureSelectionCard
                        featureKeys={featureKeys}
                        buName={detail?.bu?.bu_name ?? null}
                        onChange={setFeatureKeys}
                        readOnly={!canEdit}
                      />
                    </CardContent>
                  </Card>
                </section>

                <section id="seats" className="scroll-mt-20">
                  {detail && <SeatsCard seat={detail.seat} bu={detail.bu} />}
                </section>
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
              <span>{t('common.state.unsavedChanges')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Can permission="subscription.manage">
                <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
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

export default SubscriptionForm;
