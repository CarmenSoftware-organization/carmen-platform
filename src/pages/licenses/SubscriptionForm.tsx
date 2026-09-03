import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import { IssuedSubscriptionPlate } from './subscriptionEdit/IssuedSubscriptionPlate';
import { SubscriptionInfoCard, type SubscriptionFormData } from './subscriptionEdit/SubscriptionInfoCard';
import { GroupSelectionCard } from './subscriptionEdit/GroupSelectionCard';
import { SubscriptionCreateForm } from './subscriptionCreate/SubscriptionCreateForm';
import { SubscriptionDraftPlate } from './subscriptionCreate/SubscriptionDraftPlate';
import { todayYmd } from './subscriptionCreate/subscriptionTerm';
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

// The one rule on this form that no single field can check: it needs both dates at once, so it
// can live neither in `validateField` (which only ever sees one) nor on a blur handler. Kept as a
// module-level function so the live check and the submit gate produce the *same* string — two
// wordings of one mistake would render as two messages under one field.
const endDateOrderError = (
  start: string,
  end: string,
  t: ReturnType<typeof useI18n>['t'],
): string =>
  start && end && new Date(end).getTime() <= new Date(start).getTime()
    ? t('pages.subscriptions.endDateAfterStart')
    : '';

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
  // เกณฑ์ "ใกล้หมดอายุ" มาจากหน้าตั้งค่า (#227) ไม่ใช่ค่าคงที่ 30 ในโค้ด — แผ่นที่ระบายสีด้วยเลข
  // ของตัวเองจะขัดกับป้ายในตารางที่มาจากสัญญาใบเดียวกัน
  const { thresholds } = useExpiryThresholds();

  const [formData, setFormData] = useState<SubscriptionFormData>(() => ({
    ...emptyFormData,
    cluster_id: searchParams.get('cluster_id') || '',
    // เปิดมาจากหน้า Business Unit — ปุ่ม "New subscription" ในการ์ด User Licenses ส่ง BU ที่ผู้ใช้
    // เปิดอยู่มาให้ ไม่ต้องมาไล่เลือกซ้ำจาก roster ทั้งคลัสเตอร์ ค่านี้เป็นเพียงค่าตั้งต้นของ picker:
    // ถ้า BU ไม่ได้อยู่ในคลัสเตอร์ที่ส่งมาคู่กัน `<select>` จะไม่มี option ตรงกันและกลับไปเป็นค่าว่าง
    // เอง — ตรงกับด่านบังคับกรอกตอนกด Create อยู่แล้ว
    business_unit_id: id ? '' : (searchParams.get('business_unit_id') || ''),
    // A new contract starts today unless it is told otherwise — that is what nearly every one of
    // them does, and it is also what unlocks the month-end row, which has nothing to measure from
    // until a start exists. On an existing subscription this is overwritten by `load()` before
    // anything renders it, but it is still gated: seeding a date into a record that has its own
    // would be a value the page invented.
    start_date: id ? '' : todayYmd(),
  }));
  const [savedFormData, setSavedFormData] = useState<SubscriptionFormData>(formData);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  // สิทธิ์ของสัญญา — หนึ่งใบผูก BU เดียว
  //
  // `featureKeys` เป็นผลลัพธ์ที่ backend คำนวณให้ ไม่ใช่สิ่งที่หน้านี้แก้อีกแล้ว: การขายเลือกเป็น
  // "กลุ่ม" ส่วนรายการ feature ใช้แสดงว่าสรุปแล้วลูกค้าได้อะไร และใช้เตือนเมื่อใบยังไม่ถูกย้าย
  // เข้าระบบกลุ่ม (มี feature แต่ไม่มีกลุ่ม) ซึ่งเกิดได้ระหว่างเฟสย้ายข้อมูล
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [savedGroupIds, setSavedGroupIds] = useState<string[]>([]);

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

  // Ctrl/⌘+S on the create branch submits the form itself rather than calling a save path — the
  // shortcut used to check `hasChanges`, which is `!isNew && …` and therefore never true while
  // creating, so the page silently had no save shortcut at all (rule 14).
  const formRef = useRef<HTMLFormElement>(null);

  const { start_date: startDate, end_date: endDate } = formData;

  // What the draft plate draws. Both resolve out of lists that are still loading on first paint,
  // so both are legitimately `undefined` for a moment — the plate renders that as "not picked yet",
  // which is also the truthful answer before anything is picked.
  const draftCluster = clusters.find((c) => c.id === formData.cluster_id);
  const draftBu = clusterBus.find((b) => b.id === formData.business_unit_id);

  const hasChanges = !isNew && (
    JSON.stringify(formData) !== JSON.stringify(savedFormData) ||
    JSON.stringify([...groupIds].sort()) !== JSON.stringify([...savedGroupIds].sort())
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
      // `group_ids` เป็น optional เพราะใบที่ยังไม่ถูก backfill ไม่มีค่านี้ — ต้องถอยเป็น [] ไม่ใช่ crash
      setGroupIds(data.bu?.group_ids ?? []);
      setSavedGroupIds(data.bu?.group_ids ?? []);
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

  // BU roster ของคลัสเตอร์ที่เลือก — ป้อน picker ของ **หน้าสร้าง** เท่านั้น สัญญาที่มีอยู่แล้ว
  // ย้าย BU ไม่ได้ และตั้งแต่ตัวตนย้ายขึ้น `IssuedSubscriptionPlate` ก็ไม่มีอะไรบนหน้าแก้ไขที่ใช้
  // รายชื่อนี้อีก — ไล่ยิงได้ถึง 10 หน้าเพื่อไม่ให้ใครอ่านคือค่าเปล่า ๆ ทุกครั้งที่เปิดหน้า
  useEffect(() => {
    const clusterId = formData.cluster_id;
    if (!isNew || !clusterId) { setClusterBus([]); return; }
    let cancelled = false;
    setClusterBusLoading(true);
    fetchAllClusterBus(clusterId)
      .then((rows) => { if (!cancelled) setClusterBus(rows); })
      .catch((err) => { if (!cancelled) devLog('Failed to load cluster business units:', err); })
      .finally(() => { if (!cancelled) setClusterBusLoading(false); });
    return () => { cancelled = true; };
  }, [formData.cluster_id, isNew]);

  // The end-must-follow-start rule, checked while the dates are being picked rather than only
  // once Create is pressed. It writes into the same `fieldErrors.end_date` slot the submit gate
  // uses, so the message can never appear twice; and it only ever clears *its own* message, so a
  // "required" error or a per-field message from the backend is not wiped by a keystroke.
  useEffect(() => {
    const msg = endDateOrderError(startDate, endDate, t);
    setFieldErrors((prev) => {
      if (msg) return prev.end_date === msg ? prev : { ...prev, end_date: msg };
      return prev.end_date && prev.end_date === t('pages.subscriptions.endDateAfterStart')
        ? { ...prev, end_date: '' }
        : prev;
    });
  }, [startDate, endDate, t]);

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

  // The month-end row writes only the end date. It is gated on a start date already being set —
  // "the end of October" is not a term until there is a beginning to measure it from — so unlike a
  // "1 year" button there is nothing sensible for it to infer about where the contract starts.
  const handleTermEnd = (nextEndDate: string) => {
    setFormData((prev) => ({ ...prev, end_date: nextEndDate }));
    setFieldErrors((prev) => ({ ...prev, end_date: '' }));
    setError('');
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setGroupIds(savedGroupIds);
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
    if (!next.start_date && !next.end_date) {
      const orderErr = endDateOrderError(formData.start_date, formData.end_date, t);
      if (orderErr) next.end_date = orderErr;
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
      toast.success(t('toast.created', { entity: t('entity.subscription.sentence') }));
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
    const groupsChanged =
      JSON.stringify([...groupIds].sort()) !== JSON.stringify([...savedGroupIds].sort());
    setSaving(true);
    setError('');
    try {
      // Two independent endpoints share one doc_version — PATCH bumps it, so a subsequent
      // PUT .../groups in the same save must carry the bumped value, not the one this page
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
      if (groupsChanged) {
        // Replace semantics — ส่งชุดกลุ่มที่ต้องการทั้งหมด ไม่ใช่ diff · ไม่มี BU ใน payload
        // เพราะสัญญาผูก BU เดียวที่กำหนดตอนสร้างและเปลี่ยนที่นี่ไม่ได้
        await subscriptionService.setGroups(id!, groupIds, currentDocVersion);
      }
      toast.success(t('toast.saved'));
      await load();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
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
    onSave: () => {
      // Create has no `hasChanges` to gate on — `hasChanges` is `!isNew && …`, so the old
      // condition made Ctrl/⌘+S a no-op on this branch. Submitting the form itself (rather than
      // calling a handler directly) keeps every path through the same validation.
      if (isNew) {
        if (canEdit && !saving) formRef.current?.requestSubmit();
        return;
      }
      if (canEdit && hasChanges && !saving) void handleSave();
    },
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
          <PageHeader backTo="/licenses" title={t('entity.subscription.title')} />
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

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <>
            {/* The heading stays here, unlike `/clusters/new` where the draft plate carries it:
             *  a draft cluster owns its name as you type it, but a subscription is identified by
             *  a number only the server can issue, so there is no name for a plate to hold. */}
            <PageHeader
              backTo="/licenses"
              title={t('pages.subscriptions.addSubscription')}
              subtitle={t('pages.subscriptions.createSubtitle')}
            />

            {/* Two columns from `lg` up, form first. The plate is a picture of the contract being
             *  typed, so it has to stay visible *while* it is typed — beside the form it is in
             *  view for every field, and it fills the width this page was leaving blank. Below
             *  `lg` it stacks in DOM order, plate first. */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              {/* A sticky element needs a parent taller than itself or it never moves, and the
               *  grid item stretches to the row height — so the sticky wrapper goes inside it,
               *  not on it. top-20 = the 64px desktop header plus a 16px gap. */}
              <div className="lg:order-2">
                <div className="lg:sticky lg:top-20">
                  <SubscriptionDraftPlate
                    cluster={draftCluster}
                    bu={draftBu}
                    startDate={startDate}
                    endDate={endDate}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-4 sm:space-y-6 lg:order-1">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
                )}
                <SubscriptionCreateForm
                  formData={formData}
                  fieldErrors={fieldErrors}
                  saving={saving}
                  clusters={clusters}
                  clustersLoading={clustersLoading}
                  clustersError={clustersError}
                  clusterBus={clusterBus}
                  clusterBusLoading={clusterBusLoading}
                  formRef={formRef}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  onFocus={handleFocus}
                  onTermEnd={handleTermEnd}
                  onSubmit={handleCreateSubmit}
                  onCancel={() => navigate('/licenses')}
                />
              </div>
            </div>
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

            {/* ตัวตนของสัญญาทั้งชุด (คลัสเตอร์ · หน่วยธุรกิจ) กับช่วงเวลา ย้ายมาอยู่บนแผ่นเดียว
             *  ที่วาดสิ่งเหล่านั้นเป็นสิ่งที่มันเป็น แทนที่จะเป็นกล่องมีขอบซึ่งอ่านว่าแก้ได้ทั้งที่แก้ไม่ได้ */}
            {detail && (
              <IssuedSubscriptionPlate
                startDate={formData.start_date}
                endDate={formData.end_date}
                status={formData.status}
                state={detail.state}
                thresholdDays={thresholds.subscription_days}
                bu={
                  detail.bu
                    ? { id: detail.bu.business_unit_id, code: detail.bu.bu_code, name: detail.bu.bu_name }
                    : null
                }
                cluster={{ id: detail.cluster_id, code: detail.cluster_code, name: detail.cluster_name }}
              />
            )}

            {/* แถบนำทางซ้ายถูกถอดออก: สองรายการบนหน้าที่จบในจอเดียวคือ 200px ที่ไม่ได้ซื้ออะไรเลย
             *  และมันบีบเนื้อหาให้แคบกว่าที่หน้ามีจริง — หน้าแก้ไขใบอนุญาต (#230) ก็ไม่มีเช่นกัน */}
            <div className="space-y-4 pb-24 sm:space-y-6">
              <SubscriptionInfoCard
                formData={formData}
                fieldErrors={fieldErrors}
                editing={canEdit}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
              />

              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.subscriptions.purchasedGroups')}</CardTitle>
                  <CardDescription>
                    {detail?.bu
                      ? t('pages.subscriptions.groupEntitlementsForBu', { code: detail.bu.bu_code })
                      : t('pages.subscriptions.featureEntitlementsGeneric')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GroupSelectionCard
                    groupIds={groupIds}
                    onChange={setGroupIds}
                    readOnly={!canEdit}
                    currentFeatureKeys={featureKeys}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      {!isNew && hasChanges && (
        <div className="unsaved-bar fixed bottom-0 left-0 right-0 z-40 md:left-16 lg:left-60">
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
          ]}
        />
      )}
    </Layout>
  );
};

export default SubscriptionForm;
