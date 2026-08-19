import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Save, X, Loader2, Copy } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import businessUnitService from '../../services/businessUnitService';
import { validateField } from '../../utils/validation';
import { getErrorDetail, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { cn } from '../../lib/utils';
import { ReadOnlyText, ReadOnlyTextarea, Group, CollapsibleSection } from '../businessUnitEdit/shared';
import { initialFormData, type BusinessUnitFormData, type DefaultCurrency } from '../businessUnitEdit/types';
import { HeroName } from '../businessUnitEdit/HeroName';
import CalculationSettingsSection from '../businessUnitEdit/sections/CalculationSettingsSection';
import NumberFormatsSection from '../businessUnitEdit/sections/NumberFormatsSection';
import ConfigurationSection from '../businessUnitEdit/sections/ConfigurationSection';
import { ClusterBuDocument } from './businessUnitForm/ClusterBuDocument';
import { AddressBlock } from './businessUnitForm/AddressBlock';
import { SeatMeter } from './businessUnitForm/SeatMeter';
import BusinessUnitBrandingCard from '../businessUnitEdit/BusinessUnitBrandingCard';
import { useBusinessUnitUsers } from '../businessUnitEdit/useBusinessUnitUsers';
import { useBusinessUnitLicenses } from '../businessUnitEdit/useBusinessUnitLicenses';
import BusinessUnitUsersCard from '../businessUnitEdit/BusinessUnitUsersCard';
import BusinessUnitLicensesCard from '../businessUnitEdit/BusinessUnitLicensesCard';
import type { BusinessUnitConfig } from '../../types';

// Text-valued fields eligible for the generic edit/read-only field renderer below.
// Booleans (is_hq/is_active), arrays (config), and the fields this narrowed
// page never exposes (cluster_id comes from the URL only; code is a system identifier this
// view no longer surfaces — it still loads from the API and still ships in the save payload,
// see fetchBusinessUnit/buildPayload below, it just never renders) are excluded so the
// compiler — not just convention — stops any of them from being wired into a text input here.
type TextFieldName = Exclude<
  keyof BusinessUnitFormData,
  'is_hq' | 'is_active' | 'config' | 'cluster_id' | 'code'
  | 'database_pool_id' | 'db_schema' | 'database_pool_name'
>;

/**
 * ฟิลด์ที่ API ไม่ยอมให้ล้างค่า — ตรวจกับ BusinessUnitUpdateDto บน swagger 2026-08-19:
 *   name, alias_name → minLength: 3   ·   hotel_email, company_email → format: email
 * ส่ง '' ไปจะได้ 400 ไม่ใช่การล้างค่า จึงต้องกันที่ UI ไม่ใช่ปล่อยให้ผู้ใช้ไปเจอ error
 * จาก backend การที่ API ล้าง alias/email ไม่ได้เป็นช่องว่างฝั่ง backend ที่ยังไม่แก้
 */
const NOT_CLEARABLE: Partial<Record<keyof BusinessUnitFormData, string>> = {
  name: 'Name is required',
  alias_name: 'Alias cannot be cleared — it must be at least 3 characters',
  hotel_email: 'Hotel email cannot be cleared',
  company_email: 'Company email cannot be cleared',
};

/**
 * A cluster administrator's reach into one business unit — a narrowed Edit-only page (see
 * ClusterProfile.tsx for the canonical orchestration this mirrors, and BusinessUnitEdit.tsx +
 * businessUnitEdit/sections/ for the full platform-admin form this is scoped down from).
 * There is no create path here: `buId` is always present (the route only matches
 * `/cluster-admin/:clusterId/business-units/:buId/edit`), and creating a BU consumes
 * `max_license_bu`, which is a platform decision — see the 2026-08-05 cluster-admin-layout
 * spec's B5 and the 2026-08-06 addendum removing BU create from this view.
 *
 * One thing is still deliberately absent:
 * - The database-pool section: pools are a platform-wide resource and the backend gates any
 *   write that touches `database_pool_id`/`db_schema` on a platform role (not on cluster
 *   membership), so this view neither reads nor writes them.
 *
 * Licensing is read-only here too, consistent with the cluster page: the User Licenses card
 * below is passed `readOnly` and no write callbacks, so seats can be read on this view and
 * changed only on the platform Business Unit page. That used to rest on the card's internal
 * `<Can permission="subscription.manage">` alone, which held for a cluster admin but not for a
 * platform admin opening this same route — they hold the permission and got the full write
 * surface on a view that is scoped not to have one. (There used to be a single
 * `max_license_users` column on the BU row covering this same decision — Task 6.1 dropped it
 * now that `tb_business_unit_license` fully replaces it.)
 *
 * The BU-users card lives here now. It was deliberately excluded when this page was written,
 * before seat enforcement existed: membership was purely an access question and the Users page
 * owned it. Seats changed that — an over-quota cluster is blocked from writing until someone
 * deactivates users, and that someone is the cluster admin, who cannot reach the platform
 * Business Unit page. Cluster membership (tb_cluster_user) is still managed on the Users page;
 * this card manages BU membership (tb_user_tb_business_unit), which is what seats count.
 * การ์ดผู้ใช้ของ BU ย้ายมาอยู่ที่นี่แล้ว เดิมถูกกันออกโดยตั้งใจตอนที่ยังไม่มีการบังคับที่นั่ง
 * แต่ตอนนี้ cluster ที่เกินโควตาจะเขียนอะไรไม่ได้จนกว่าจะมีคนปิดผู้ใช้ และคนนั้นคือ cluster admin
 * ซึ่งเข้าหน้า Business Unit ของ platform ไม่ได้ cluster membership (tb_cluster_user) ยังจัดการที่
 * หน้า Users เหมือนเดิม การ์ดนี้จัดการ BU membership (tb_user_tb_business_unit) ซึ่งเป็นตัวที่ seat นับ
 */
const BusinessUnitForm: React.FC = () => {
  const { clusterId, buId } = useParams<{ clusterId: string; buId: string }>();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<BusinessUnitFormData>({ ...initialFormData, cluster_id: clusterId ?? '' });
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({ ...initialFormData, cluster_id: clusterId ?? '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<DefaultCurrency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  // Cluster-wide seat pool for this BU's cluster — { used, cap } from the BU detail response
  // (Task 4b.1's `cluster_seat`). Optional and undefined until a deployed backend sends it.
  const [clusterSeat, setClusterSeat] = useState<{ used: number; cap: number } | undefined>(undefined);

  const users = useBusinessUnitUsers(buId, formData.cluster_id, false);
  const licenses = useBusinessUnitLicenses(buId);

  // สิทธิ์เท่าเดิมเป๊ะ: ใครเข้า route ได้ก็แก้ได้ (route คุมด้วย ClusterAdminRoute)
  // การเปลี่ยนขอบเขตสิทธิ์เป็นงานคนละชิ้นที่ต้องมีสเปกของตัวเอง — spec §5.3
  const canEdit = !accessLost;

  // นับเป็นราย key ไม่ใช่ JSON.stringify ทั้งก้อน เพราะแถบ Save ต้องบอกได้ว่า *กี่* ช่อง
  const changedKeys = (Object.keys(formData) as (keyof BusinessUnitFormData)[]).filter(
    (k) => JSON.stringify(formData[k]) !== JSON.stringify(savedFormData[k]),
  );
  const hasChanges = changedKeys.length > 0;
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (!saving && hasChanges) void handleSave(); },
    onCancel: () => { if (hasChanges) handleCancel(); },
  });

  useEffect(() => {
    fetchBusinessUnit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buId]);

  const toJsonString = (val: unknown, fallback: string): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val) || fallback;
  };

  const fetchBusinessUnit = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await businessUnitService.getById(buId!);
      setRawResponse(data);
      const bu = data.data || data;
      // A stale bookmark or hand-edited URL can name the wrong cluster for this BU
      // (/cluster-admin/<A>/business-units/<B's BU>/edit). Every piece of chrome — sidebar,
      // ClusterSwitcher label, breadcrumbs — keys off the URL's :clusterId, not the loaded
      // record, so leaving the URL as-is renders this BU under the wrong cluster's shell.
      // Correct the URL in place; the rest of this function still runs so the page has data
      // to show immediately instead of sitting on a stale loading state.
      if (bu.cluster_id && bu.cluster_id !== clusterId) {
        navigate(`/cluster-admin/${bu.cluster_id}/business-units/${buId}/edit`, { replace: true });
      }
      const defaultFormat = '{"locales":"th-TH","minimumIntegerDigits":2}';
      const loaded: BusinessUnitFormData = {
        ...initialFormData,
        cluster_id: bu.cluster_id || clusterId || '',
        code: bu.code || '',
        name: bu.name || '',
        alias_name: bu.alias_name || '',
        description: bu.description || '',
        is_hq: bu.is_hq ?? false,
        is_active: bu.is_active ?? true,
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address_line1: bu.hotel_address_line1 || '',
        hotel_address_line2: bu.hotel_address_line2 || '',
        hotel_sub_district: bu.hotel_sub_district || '',
        hotel_district: bu.hotel_district || '',
        hotel_city: bu.hotel_city || '',
        hotel_province: bu.hotel_province || '',
        hotel_postal_code: bu.hotel_postal_code || '',
        hotel_country: bu.hotel_country || '',
        hotel_latitude: bu.hotel_latitude || '',
        hotel_longitude: bu.hotel_longitude || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address_line1: bu.company_address_line1 || '',
        company_address_line2: bu.company_address_line2 || '',
        company_sub_district: bu.company_sub_district || '',
        company_district: bu.company_district || '',
        company_city: bu.company_city || '',
        company_province: bu.company_province || '',
        company_postal_code: bu.company_postal_code || '',
        company_country: bu.company_country || '',
        company_latitude: bu.company_latitude || '',
        company_longitude: bu.company_longitude || '',
        tax_no: bu.tax_no || '',
        branch_no: bu.branch_no || '',
        date_format: bu.date_format || '',
        date_time_format: bu.date_time_format || '',
        time_format: bu.time_format || '',
        long_time_format: bu.long_time_format || '',
        short_time_format: bu.short_time_format || '',
        timezone: bu.timezone || '',
        perpage_format: toJsonString(bu.perpage_format, defaultFormat),
        amount_format: toJsonString(bu.amount_format, defaultFormat),
        quantity_format: toJsonString(bu.quantity_format, defaultFormat),
        recipe_format: toJsonString(bu.recipe_format, defaultFormat),
        calculation_method: bu.calculation_method || '',
        default_currency_id: bu.default_currency_id || '',
        config: Array.isArray(bu.config) ? bu.config : [],
        // The pool fields (database_pool_id, db_schema, database_pool_name) are intentionally
        // left at their initialFormData defaults — this page never reads or writes any of them.
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(bu));
      setLogoUrl(bu.logo?.url || '');
      setAvatarUrl(bu.avatar?.url || '');
      setDefaultCurrency(bu.default_currency || null);
      users.setBuUsers(Array.isArray(bu.users) ? bu.users : []);
      setClusterSeat(
        bu.cluster_seat && typeof bu.cluster_seat.used === 'number' && typeof bu.cluster_seat.cap === 'number'
          ? { used: bu.cluster_seat.used, cap: bu.cluster_seat.cap }
          : undefined,
      );
      setAccessLost(false);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open. Same guard
      // as BusinessUnitList.tsx / ClusterUsers.tsx.
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setError('');
        setAccessLost(true);
        return;
      }
      setError('Failed to load business unit: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    const res = await businessUnitService.uploadLogo(buId!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await businessUnitService.uploadAvatar(buId!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  // commit ลง formData เท่านั้น การบันทึกยังเป็น PUT ครั้งเดียวตอนกด Save
  // (ท่าเดียวกับ BusinessUnitEdit.tsx:111-121 ของหน้า platform)
  const handleInlineCommit = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    setError('');
  };
  const handleInlineToggle = (name: string, value: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };
  const handleInlineValidate = (name: string, value: string) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleConfigChange = (index: number, field: keyof BusinessUnitConfig, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.config];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, config: updated };
    });
  };

  const addConfigRow = () => {
    setFormData((prev) => ({ ...prev, config: [...prev.config, { key: '', label: '', datatype: '', value: '' }] }));
  };

  const removeConfigRow = (index: number) => {
    setFormData((prev) => ({ ...prev, config: prev.config.filter((_, i) => i !== index) }));
  };

  // One-way copy: hotel address -> company address, same as the platform page.
  const copyHotelAddressToCompany = () => {
    setFormData((prev) => ({
      ...prev,
      company_address_line1: prev.hotel_address_line1,
      company_address_line2: prev.hotel_address_line2,
      company_sub_district: prev.hotel_sub_district,
      company_district: prev.hotel_district,
      company_city: prev.hotel_city,
      company_province: prev.hotel_province,
      company_postal_code: prev.hotel_postal_code,
      company_country: prev.hotel_country,
      company_latitude: prev.hotel_latitude,
      company_longitude: prev.hotel_longitude,
    }));
    toast.success('Copied hotel address to company address');
  };

  const getCalculationMethodLabel = (method: string): string => {
    switch (method) {
      case 'average': return 'Average';
      case 'fifo': return 'FIFO';
      default: return '-';
    }
  };

  // Discard edits, restoring the last-fetched values.
  const handleCancel = () => {
    setFormData(savedFormData);
    setFieldErrors({});
    setError('');
  };

  // Backend requires code + name; cluster_id is guaranteed by the route guard, not a
  // form field, so it needs no client-side check here.
  //
  // The code check below is kept even though this page no longer renders a Code field —
  // formData.code is populated only from the API response now, never by a user, so in
  // practice this branch is unreachable today. It stays as a defensive guard rather than
  // being deleted: buildPayload() below drops any '' value from the save payload, so a
  // blank code (a malformed load, or a future change to fetchBusinessUnit) would otherwise
  // omit a backend-required field from update() silently and surface as an opaque 400
  // instead of this page's normal inline-validation toast.
  const validateRequired = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.code.trim()) errs.code = 'Code is required';
    else errs.code = validateField('code', formData.code);
    if (!formData.name.trim()) errs.name = 'Name is required';
    // ล้างค่าฟิลด์กลุ่มนี้ = 400 จาก backend จับที่นี่ก่อนยิง
    for (const [key, message] of Object.entries(NOT_CLEARABLE) as [keyof BusinessUnitFormData, string][]) {
      const before = String(savedFormData[key] ?? '');
      const after = String(formData[key] ?? '');
      if (before !== '' && after.trim() === '') errs[key] = message;
    }
    const active = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    if (Object.keys(active).length > 0) {
      toast.error('Please fix the highlighted fields', { description: Object.values(active).join(', ') });
      return false;
    }
    return true;
  };

  // cluster_id and the three database pool fields (database_pool_id, db_schema,
  // database_pool_name) are never sent to the backend: cluster_id is immutable on update (the
  // record's cluster is fixed), and the pool fields are platform-only concerns gated on
  // platform roles — this page does not expose them.
  const buildPayload = (
    data: BusinessUnitFormData,
    changed: (keyof BusinessUnitFormData)[],
  ): Record<string, unknown> => {
    const tryParseJson = (val: string): unknown => {
      if (!val) return undefined;
      try { return JSON.parse(val); } catch { return val; }
    };

    const changedSet = new Set<string>(changed as string[]);
    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (
        key === 'cluster_id' ||
        key === 'database_pool_id' ||
        key === 'db_schema' ||
        key === 'database_pool_name'
      ) continue;
      if (typeof val === 'boolean') {
        payload[key] = val;
      } else if (val !== '' && val !== undefined && val !== null) {
        payload[key] = val;
      } else if (val === '' && changedSet.has(key)) {
        // ผู้ใช้ลบค่าออกเอง → ส่ง '' เพื่อล้างจริง (DTO ไม่มีฟิลด์ไหน nullable, null จึงไม่ใช่คำตอบ)
        // ฟิลด์ที่ล้างไม่ได้ถูก validateRequired ดักไปแล้วก่อนถึงตรงนี้
        payload[key] = '';
      }
    }

    for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
      if (data[key]) payload[key] = tryParseJson(data[key]);
    }

    const validConfig = data.config.filter((c) => c.key && c.label);
    if (validConfig.length > 0) payload.config = validConfig;
    else delete payload.config;

    return payload;
  };

  const handleSave = async () => {
    if (!validateRequired()) return;
    setSaving(true);
    try {
      const payload = buildPayload(formData, changedKeys);
      await businessUnitService.update(buId!, {
        ...payload,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      toast.success('Changes saved successfully');
      await fetchBusinessUnit();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchBusinessUnit();
      } else {
        const { message, fields } = parseApiError(err);
        toast.error('Failed to update business unit', { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSaving(false);
    }
  };

  const sectionField = { formData, editing: canEdit, fieldErrors, onChange: handleChange, onBlur: handleBlur, onFocus: handleFocus };

  // preview ของกลุ่มที่ยุบ — หัวข้อเปล่า ๆ บังคับให้คลิกเพื่อรู้ว่าข้างในว่างหรือมีของ
  // ซึ่งทำลายงาน "ดูว่า BU นี้ตั้งค่าไว้ยังไง" ที่การยุบกลุ่มมีไว้เพื่อไม่ให้บัง
  const billingPreview =
    [formData.company_name, formData.tax_no && `TAX ${formData.tax_no}`]
      .filter(Boolean).join(' · ') || 'Not set';

  const settingsPreview =
    [
      formData.timezone,
      formData.config.length > 0
        ? `${formData.config.length} config ${formData.config.length === 1 ? 'entry' : 'entries'}`
        : '',
    ].filter(Boolean).join(' · ') || 'Defaults';

  // Generic edit/read-only renderer for the plain text fields (Form Field Pattern).
  const textField = (
    name: TextFieldName,
    label: string,
    opts?: { type?: 'text' | 'email'; mono?: boolean; required?: boolean; textarea?: boolean },
  ) => {
    const value = formData[name];
    const err = fieldErrors[name];
    return (
      <div className="space-y-2">
        <Label htmlFor={name}>
          {label}
          {opts?.required && canEdit && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {canEdit ? (
          opts?.textarea ? (
            <Textarea
              id={name}
              name={name}
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              rows={3}
              className={err ? 'border-destructive' : ''}
            />
          ) : (
            <Input
              type={opts?.type ?? 'text'}
              id={name}
              name={name}
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              className={cn(err && 'border-destructive', opts?.mono && 'font-mono')}
            />
          )
        ) : opts?.textarea ? (
          <ReadOnlyTextarea value={value} />
        ) : (
          <ReadOnlyText value={value} />
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

  if (loading) {
    return (
      <ClusterAdminLayout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading business unit">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </ClusterAdminLayout>
    );
  }

  return (
    <ClusterAdminLayout>
      <div className="space-y-4 sm:space-y-6 pb-20">
        <PageHeader
          backTo={`/cluster-admin/${clusterId}/business-units`}
          title={
            <HeroName
              value={formData.name}
              disabled={!canEdit}
              onCommit={(v) => handleInlineCommit('name', v)}
            />
          }
          subtitle="Manage this business unit's details"
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        {!error && (accessLost ? <ClusterAccessLost /> : (
          <>
        <ClusterBuDocument
          formData={formData}
          fieldErrors={fieldErrors}
          logoUrl={logoUrl}
          avatarUrl={avatarUrl}
          canEdit={canEdit}
          onCommit={handleInlineCommit}
          onToggle={handleInlineToggle}
          onValidate={handleInlineValidate}
          onChange={handleChange}
          brandingSlot={
            <BusinessUnitBrandingCard
              logoUrl={logoUrl}
              avatarUrl={avatarUrl}
              editing={canEdit}
              name={formData.name}
              code={formData.code}
              onUploadLogo={handleUploadLogo}
              onUploadAvatar={handleUploadAvatar}
            />
          }
          seatsSlot={
            <Card className="overflow-hidden p-0">
              <Group label="People & seats">
                {clusterSeat && (
                  <div className="mb-4">
                    <SeatMeter used={clusterSeat.used} cap={clusterSeat.cap} licensed={licenses.activeSeats} />
                  </div>
                )}
                <BusinessUnitUsersCard users={users} canEdit={canEdit} />
                {/* Read-only here by design, and enforced rather than assumed. The card's own
                    <Can permission="subscription.manage"> is a check on the *viewer*, not on the
                    page: a platform admin who holds that permission can open this cluster-admin
                    route and used to get the full add/edit/delete surface on a view that is
                    supposed to be a statement of entitlement, not a place to change one.
                    `readOnly` answers the page-level question instead, so the answer no longer
                    depends on who is looking. Deliberately still not a `canEdit` prop — see the
                    note above the card component for why the two differ. No write callbacks are
                    wired at all, so there is no reachable path from this page to
                    businessUnitLicenseService. Licensing is changed on the platform Business
                    Unit page. */}
                <BusinessUnitLicensesCard
                  licenses={licenses.licenses}
                  loading={licenses.loading}
                  saving={licenses.saving}
                  readOnly
                />
              </Group>
            </Card>
          }
          collapsedSlot={
            <>
              <CollapsibleSection title="Billing entity" description={billingPreview}>
                <div className="space-y-4">
                  <div className="flex justify-end">
                    {canEdit && (
                      <Button type="button" variant="ghost" size="sm" onClick={copyHotelAddressToCompany}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy from hotel address
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {textField('company_name', 'Company name')}
                    {textField('company_tel', 'Phone', { mono: true })}
                    {textField('company_email', 'Email', { type: 'email' })}
                    {textField('tax_no', 'Tax ID', { mono: true })}
                    {textField('branch_no', 'Branch', { mono: true })}
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1 text-sm">Address</div>
                    <AddressBlock prefix="company" formData={formData} disabled={!canEdit} onChange={handleChange} />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="System settings" description={settingsPreview}>
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {textField('timezone', 'Timezone')}
                    {textField('date_format', 'Date format', { mono: true })}
                    {textField('date_time_format', 'Date-time format', { mono: true })}
                    {textField('time_format', 'Time format', { mono: true })}
                    {textField('long_time_format', 'Long time format', { mono: true })}
                    {textField('short_time_format', 'Short time format', { mono: true })}
                  </div>
                  <CalculationSettingsSection
                    {...sectionField}
                    defaultCurrency={defaultCurrency}
                    getCalculationMethodLabel={getCalculationMethodLabel}
                    showCurrencyField={false}
                    canEditCalculationMethod={false}
                  />
                  <NumberFormatsSection {...sectionField} />
                  <ConfigurationSection
                    {...sectionField}
                    onConfigChange={handleConfigChange}
                    onAddConfigRow={addConfigRow}
                    onRemoveConfigRow={removeConfigRow}
                  />
                </div>
              </CollapsibleSection>
            </>
          }
        />
          </>
        ))}

        {hasChanges && (
          <div className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 md:left-16 lg:left-60">
            <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
              <span className="text-muted-foreground mr-auto text-sm" role="status">
                {changedKeys.length} unsaved {changedKeys.length === 1 ? 'change' : 'changes'}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <DevDebugSheet
        title="Business Unit Debug"
        tabs={[
          { key: 'bu', label: 'Business Unit', data: rawResponse, endpoint: `GET /api-system/business-units/${buId}` },
        ]}
      />
    </ClusterAdminLayout>
  );
};

export default BusinessUnitForm;
