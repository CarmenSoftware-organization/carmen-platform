import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { normalizeAudit } from '../../utils/audit';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ReadOnlyField } from '../../components/ReadOnlyField';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import { Save, X, Loader2, SearchX, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/ui/skeleton';
import Can from '../../components/Can';
import { validateField } from '../../utils/validation';
import { getErrorDetail, isNotFoundError, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../hooks/useI18n';
import { toIsoStartOfDay, toIsoEndOfDay, isPerpetual, fmtDate, PERPETUAL_END_DATE } from './licenseDates';
import { licenseStatus as buLicenseStatus } from '../../utils/buLicense';
import { licenseStatus as clusterLicenseStatus } from '../../utils/clusterLicense';
import type { LicenseKind, LicenseKindConfig } from './licenseKindConfig';
import type {
  BusinessUnitLicense, ClusterLicense, SeatLicenseRow, BuQuotaLicenseRow, BuLicenseStatus, ClusterLicenseStatus,
} from '../../types';
import type { TKey } from '../../i18n/types';

type LicenseRow = SeatLicenseRow | BuQuotaLicenseRow;
type StatusBadgeInfo = { variant: 'success' | 'secondary' | 'destructive'; label: string };

// Pure data (variant), no translation involved — stays a module constant.
const STATUS_VARIANT: Record<BuLicenseStatus | ClusterLicenseStatus, StatusBadgeInfo['variant']> = {
  active: 'success',
  scheduled: 'secondary',
  expired: 'destructive',
};

// Catalog KEYS only (not translated values) — module-scope is fine because nothing here
// calls `t`. Each component below resolves these with its own `useI18n()` call.
const STATUS_LABEL_KEYS: Record<BuLicenseStatus | ClusterLicenseStatus, TKey> = {
  active: 'common.status.active',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};

// licenseKindConfig.ts used to carry `ownerLabel`/`amountLabel`/`newPageTitle` as plain
// English string fields, but neither this file nor PurchaseLicenseTable.tsx ever rendered
// them — both resolve their own per-kind translated value locally instead, via keys Task 1
// already seeded for this exact purpose (buQuota/addBuQuotaLicense/addSeatLicense) plus
// common.field.seats/common.label.cluster/entity.businessUnit.title. The three dead fields
// were deleted from `LicenseKindConfig` in the i18n fix wave (2026-08-28) once this was
// confirmed — these Record maps are the only source of the label now, not the config.
const OWNER_LABEL_KEYS: Record<LicenseKind, TKey> = {
  seat: 'entity.businessUnit.title',
  'bu-quota': 'common.label.cluster',
};
const AMOUNT_LABEL_KEYS: Record<LicenseKind, TKey> = {
  seat: 'common.field.seats',
  'bu-quota': 'pages.licenses.buQuota',
};
const NEW_PAGE_TITLE_KEYS: Record<LicenseKind, TKey> = {
  seat: 'pages.licenses.addSeatLicense',
  'bu-quota': 'pages.licenses.addBuQuotaLicense',
};

/**
 * ฟอร์มกรอกของ "ใบ" หนึ่งใบ — เดิมอยู่ใน `LicenseDraftForm.tsx` ที่ใช้ร่วมกับแถวกรอก inline
 * ของ `SeatSection`/`BuQuotaSection` แต่สองที่นั้นถูกยุบเหลืออ่านอย่างเดียวไปแล้ว (Task 8)
 * ฟอร์มนี้เป็นผู้ใช้รายเดียวที่เหลืออยู่ จึงย้าย type + helper มาไว้ในไฟล์นี้แทนการคงไฟล์แยก
 * ที่มีผู้ใช้แค่รายเดียวไว้
 *
 * ฟิลด์จำนวนชื่อกลาง ๆ ว่า `amount` เพราะสองชนิดเรียกคนละอย่างบนสาย (`licensed_users`
 * กับ `licensed_bus`) — ดู `buildPayload`/`config.amountField` ที่แปลงกลับเป็นชื่อจริง
 */
interface LicenseDraft {
  amount: string;
  start_date: string; // yyyy-mm-dd — ค่าดิบของ <input type="date">
  end_date: string;
  reference_no: string;
  note: string;
}

const emptyDraft = (now: Date): LicenseDraft => ({
  amount: '',
  start_date: fmtDate(now.toISOString()),
  end_date: '',
  reference_no: '',
  note: '',
});

const draftFromLicense = (l: {
  amount: number;
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
}): LicenseDraft => ({
  amount: String(l.amount),
  start_date: fmtDate(l.start_date),
  end_date: fmtDate(l.end_date),
  reference_no: l.reference_no || '',
  note: l.note || '',
});

/**
 * เจ้าของใบ (id ใช้ประกอบ path ของ PATCH/DELETE nested + ป้ายแสดงผล) จากแถวที่ `getByIdPlatform` คืนมา
 *
 * ใบที่นั่งมี `business_unit_id` (จาก `BusinessUnitLicense` ฐาน) ส่วนใบโควตา BU มี `cluster_id` —
 * ชื่อฟิลด์เจ้าของต่างกันไปตามชนิด นี่คือหนึ่งในสองจุดในไฟล์นี้ที่ต้องรู้ความต่างนั้น
 */
function ownerFromRow(kind: LicenseKind, row: LicenseRow): { id: string; label: string } {
  if (kind === 'seat') {
    const r = row as SeatLicenseRow;
    return { id: r.business_unit_id, label: `${r.business_unit_code} - ${r.business_unit_name}` };
  }
  const r = row as BuQuotaLicenseRow;
  return { id: r.cluster_id, label: `${r.cluster_code} - ${r.cluster_name}` };
}

/**
 * คลัสเตอร์ที่เจ้าของใบสังกัด — คู่กับ `ownerFromRow` แต่คืน `null` เมื่อใบชนิดนี้ไม่แยกคลัสเตอร์
 * ออกจากเจ้าของ (ใบโควตา BU: คลัสเตอร์ **คือ** เจ้าของอยู่แล้ว ดู `showCluster` ใน config)
 *
 * ค่ามาจาก detail endpoint ตรง ๆ — `GET /platform/business-unit-licenses/:id` ส่ง
 * `cluster_id`/`cluster_code`/`cluster_name` มาพร้อมแถวอยู่แล้ว จึงไม่ต้องยิง API เพิ่ม
 * และไม่ต้องพึ่ง query param แบบ `?ownerLabel=` (ที่หายไปเมื่อเปิด URL ตรง ๆ)
 */
function clusterFromRow(
  config: LicenseKindConfig,
  row: LicenseRow | null,
): { id: string; label: string } | null {
  if (!config.showCluster || !row) return null;
  const r = row as SeatLicenseRow;
  if (!r.cluster_id) return null;
  return { id: r.cluster_id, label: `${r.cluster_code} - ${r.cluster_name}` };
}

/** สถานะของแถวที่โหลดมา — เรียกฟังก์ชันคนละตัวกันตามชนิด ห้ามคิดสูตรใหม่ที่นี่ (ดูคอมเมนต์ config) */
function statusOfRow(kind: LicenseKind, row: LicenseRow, now: Date): BuLicenseStatus | ClusterLicenseStatus {
  return kind === 'seat'
    ? buLicenseStatus(row as unknown as BusinessUnitLicense, now)
    : clusterLicenseStatus(row as unknown as ClusterLicense, now);
}

interface LicenseFieldsCardProps {
  config: LicenseKindConfig;
  draft: LicenseDraft;
  noExpiry: boolean;
  fieldErrors: Record<string, string>;
  /** false เฉพาะตอนดูอย่างเดียว (ไม่มี `subscription.manage`) — โหมดสร้างเป็น true เสมอ (route คุมสิทธิ์ไว้แล้ว) */
  editing: boolean;
  /** ป้ายที่โชว์เป็นหลัก — ชื่ออ่านง่ายถ้ามี ไม่งั้น fallback เป็น `ownerId` ดิบ */
  ownerText: string;
  /** id ดิบ — โชว์เป็นบรรทัดเล็กใต้ป้ายเสมอที่ `ownerText` ไม่ใช่ id ดิบอยู่แล้ว เผื่อ query param
   *  ที่พาเข้ามาผิด/เพี้ยน ยังเห็น id จริงเทียบกับที่ควรจะเป็นได้ (review Important #2) */
  ownerId: string;
  /** คลัสเตอร์ของเจ้าของ — `null` ตอนสร้าง (ยังไม่มีแถวให้อ่าน) และตลอดไปสำหรับใบโควตา BU */
  cluster: { id: string; label: string } | null;
  /** undefined ตอนสร้าง — ระบบยังไม่ออกเลขให้ */
  licenseNumber?: string;
  isNew: boolean;
  statusBadge: StatusBadgeInfo | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onNoExpiryChange: (checked: boolean) => void;
}

/**
 * การ์ดฟิลด์เดียวที่ใช้ทั้งโหมดสร้างและแก้ไข (ต่างกันแค่ `editing`) — เดิมสองโหมดมี JSX
 * ของฟิลด์ชุดเดียวกันซ้ำกันเกือบทั้งหมด ต่างแค่ input vs ReadOnlyField ตามสิทธิ์ ยุบมาไว้ที่นี่
 * ที่เดียวกันโค้ดซ้ำและกันสองจุดเพี้ยนจากกันโดยไม่ตั้งใจ (เหมือน `SubscriptionInfoCard` แต่เก็บไว้
 * ในไฟล์เดียวกันเพราะ Task 6 สร้างแค่สองไฟล์ตามบรีฟ ไม่แยกไดเรกทอรีย่อยเพิ่ม)
 */
function LicenseFieldsCard({
  config, draft, noExpiry, fieldErrors, editing, ownerText, ownerId, cluster, licenseNumber, isNew, statusBadge,
  onChange, onBlur, onFocus, onNoExpiryChange,
}: LicenseFieldsCardProps) {
  const { t } = useI18n();
  const ownerLabel = t(OWNER_LABEL_KEYS[config.kind]);
  const amountLabel = t(AMOUNT_LABEL_KEYS[config.kind]);
  return (
    <Card className={isNew ? undefined : 'pb-24'}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{t('pages.licenses.licenseDetailsTitle')}</CardTitle>
          {statusBadge && <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>}
        </div>
        <CardDescription>{t('pages.licenses.licenseDetailsDescription', { owner: ownerLabel })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {cluster && (
            <div className="space-y-2">
              <Label>{t('common.label.cluster')}</Label>
              {/* อ่านอย่างเดียวเหมือนเจ้าของ — คลัสเตอร์ถูกกำหนดโดย BU ที่ถือใบนี้ ย้ายจากหน้านี้ไม่ได้ */}
              <ReadOnlyField value={cluster.label} />
              <p className="text-muted-foreground text-xs font-mono">{cluster.id}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{ownerLabel}</Label>
            {/* เจ้าของแก้ไม่ได้ทั้งสองโหมด — ข้อความอ่านอย่างเดียวเสมอ ไม่ใช่ input disabled */}
            <ReadOnlyField value={ownerText} />
            {ownerText !== ownerId && (
              <p className="text-muted-foreground text-xs font-mono">{ownerId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('pages.licenses.licenseNumber')}</Label>
            {/* ระบบออกให้เอง (เหมือน subscription_number) — ไม่มีโหมดแก้ */}
            <ReadOnlyField value={licenseNumber} className="font-mono" />
            {isNew && (
              <p className="text-muted-foreground text-xs">{t('pages.subscriptions.numberAutoAssigned')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">{editing ? t('common.field.required', { label: amountLabel }) : amountLabel}</Label>
            {editing ? (
              <>
                <Input
                  type="number"
                  min={1}
                  id="amount"
                  name="amount"
                  value={draft.amount}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.amount ? 'border-destructive' : ''}
                />
                {fieldErrors.amount && <p className="text-destructive text-xs">{fieldErrors.amount}</p>}
              </>
            ) : (
              <ReadOnlyField value={draft.amount} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">
              {editing ? t('common.field.required', { label: t('common.field.startDate') }) : t('common.field.startDate')}
            </Label>
            {editing ? (
              <>
                <Input
                  type="date"
                  id="start_date"
                  name="start_date"
                  value={draft.start_date}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.start_date ? 'border-destructive' : ''}
                />
                {fieldErrors.start_date && <p className="text-destructive text-xs">{fieldErrors.start_date}</p>}
              </>
            ) : (
              <ReadOnlyField value={draft.start_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date">
              {editing && !noExpiry
                ? t('common.field.required', { label: t('common.field.endDate') })
                : t('common.field.endDate')}
            </Label>
            {editing ? (
              <>
                {config.showNoExpiry && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={noExpiry}
                      onChange={(e) => onNoExpiryChange(e.target.checked)}
                      aria-label={t('common.state.noExpiry')}
                      className="h-4 w-4 rounded border-input"
                    />
                    {t('common.state.noExpiry')}
                  </label>
                )}
                {!noExpiry && (
                  <>
                    <Input
                      type="date"
                      id="end_date"
                      name="end_date"
                      value={draft.end_date}
                      onChange={onChange}
                      onBlur={onBlur}
                      onFocus={onFocus}
                      className={fieldErrors.end_date ? 'border-destructive' : ''}
                    />
                    {fieldErrors.end_date && <p className="text-destructive text-xs">{fieldErrors.end_date}</p>}
                  </>
                )}
              </>
            ) : (
              <ReadOnlyField value={noExpiry ? t('common.state.noExpiry') : draft.end_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_no">{t('pages.licenses.referenceNoLabel')}</Label>
            {editing ? (
              <Input id="reference_no" name="reference_no" value={draft.reference_no} onChange={onChange} />
            ) : (
              <ReadOnlyField value={draft.reference_no} />
            )}
          </div>

          {config.showNote && (
            <div className="space-y-2">
              <Label htmlFor="note">{t('common.field.note')}</Label>
              {editing ? (
                <Input id="note" name="note" value={draft.note} onChange={onChange} />
              ) : (
                <ReadOnlyField value={draft.note} />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface LicensePurchaseFormProps {
  config: LicenseKindConfig;
  mode: 'create' | 'edit';
}

/**
 * ฟอร์มเต็มหน้าของ "ใบ" หนึ่งใบ — ใช้ร่วมทั้งใบที่นั่งของ BU และใบโควตา BU ของ cluster
 * ทุกอย่างที่ต่างกันมาจาก `config` (`licenseKindConfig.ts`) ตัวฟอร์มเองไม่ตัดสินใจตามชนิด
 * นอกจากจุดที่ระบุไว้ชัดเจน (owner id/label ใน `ownerFromRow`, สูตรสถานะใน `statusOfRow`)
 *
 * โครงตาม `SubscriptionForm.tsx`: `docVersion` แยก state, `useUnsavedChanges`,
 * `useGlobalShortcuts` (⌘S/Escape), `<Can permission="subscription.manage">` คลุมปุ่มบันทึก,
 * `DevDebugSheet` เฉพาะ dev, และ 404/409 แยกจาก error ทั่วไปตามสัญญาเดิม
 */
const LicensePurchaseForm: React.FC<LicensePurchaseFormProps> = ({ config, mode }) => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = mode === 'create';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('subscription.manage');
  const { t } = useI18n();
  // Title-Case owner-type label ('Business Unit' / 'Cluster') — NOT the same thing as the
  // `ownerLabel` state below (the owner ENTITY's own display name, e.g. 'T02 - Some BU').
  // `.toLowerCase()` reproduces `config.ownerLabel.toLowerCase()`'s old output exactly: it's
  // a no-op on the Thai translation (Thai has no case) and a real lowercase on the English
  // one, matching the byte-identity requirement for both languages.
  const ownerTypeLabel = t(OWNER_LABEL_KEYS[config.kind]);
  const ownerTypeLabelLower = ownerTypeLabel.toLowerCase();

  // โหมดสร้าง: เจ้าของมาจาก query param เท่านั้น (ไม่มี picker ในฟอร์มนี้) — ลิงก์ที่พาเข้ามาต้อง
  // รู้เจ้าของอยู่แล้วเสมอ (ปุ่ม Add license ใน SeatSection/BuQuotaSection ผูกกับ BU/cluster หนึ่งตัว)
  const prefilledOwner = searchParams.get(config.ownerParam) ?? '';
  // `?ownerLabel=` เป็น query param เดียวกันทุก kind (ไม่ผ่าน config) — ผู้เรียกส่งชื่ออ่านง่ายมาด้วย
  // เป็นทางเลือก ถ้าไม่ส่งมาฟอร์มยัง fallback ไปโชว์ ownerId ดิบได้ (ดู ownerText ด้านล่าง) ไม่ต้องยิง
  // API เพิ่มมาแปลงจาก id เป็นชื่อ (review Important #2 — ทางเลือกที่ถูกที่สุด ไม่ผูก kind)
  const prefilledOwnerLabel = searchParams.get('ownerLabel') ?? '';
  const ownerMissing = isNew && !prefilledOwner;

  const [ownerId, setOwnerId] = useState<string>(isNew ? prefilledOwner : '');
  const [ownerLabel, setOwnerLabel] = useState(isNew ? prefilledOwnerLabel : '');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [detail, setDetail] = useState<LicenseRow | null>(null);

  const [draft, setDraft] = useState<LicenseDraft>(() => emptyDraft(new Date()));
  const [savedDraft, setSavedDraft] = useState<LicenseDraft>(draft);
  const [noExpiry, setNoExpiry] = useState(false);
  const [savedNoExpiry, setSavedNoExpiry] = useState(false);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const hasChanges = !isNew && (
    JSON.stringify(draft) !== JSON.stringify(savedDraft) || noExpiry !== savedNoExpiry
  );
  useUnsavedChanges(hasChanges);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      setLoading(true);
      setNotFound(false);
      const raw = await config.service.getByIdPlatform(id!);
      setRawResponse(raw);
      const data = ((raw as { data?: LicenseRow })?.data || raw) as LicenseRow | undefined;
      if (!data?.id) {
        setNotFound(true);
        return;
      }
      setDetail(data);
      const owner = ownerFromRow(config.kind, data);
      setOwnerId(owner.id);
      setOwnerLabel(owner.label);
      setLicenseNumber(data.license_number);
      setDocVersion(getDocVersion(data));

      const amount = Number((data as unknown as Record<string, unknown>)[config.amountField]);
      // `config.showNoExpiry &&` เป็นส่วนบังคับ ไม่ใช่แค่กันเหนียว — ใบที่นั่ง (showNoExpiry: false)
      // ไม่มีสวิตช์ "No expiry" ในฟอร์มเลย ถ้าคำนวณ perpetual จาก isPerpetual() เฉย ๆ โดยไม่เช็ค
      // config ก่อน ใบที่นั่งที่บังเอิญมี end_date เป็น 2099 (เช่นจาก migration) จะเข้าโหมด perpetual
      // ทั้งที่ไม่มีทางออกจากโหมดนั้นได้ (ไม่มีช่อง end_date ให้กรอกเลย) แล้วทุกครั้งที่ Save
      // buildPayload() จะปักหมุด end_date กลับเป็น 2099 ซ้ำเงียบ ๆ (review Important #1)
      const perpetual = config.showNoExpiry && isPerpetual(data.end_date);
      // ใบเดิมไม่มีวันหมดอายุ — ไม่ prefill end_date ด้วย 2099-12-31 เผื่อผู้ใช้ติ๊กออกจาก
      // "No expiry" แล้วเจอวันในอดีตโผล่มาเฉย ๆ (เหมือน BuQuotaSection.startEdit เดิม)
      const loaded: LicenseDraft = {
        ...draftFromLicense({ ...data, amount }),
        end_date: perpetual ? '' : fmtDate(data.end_date),
      };
      setDraft(loaded);
      setSavedDraft(loaded);
      setNoExpiry(perpetual);
      setSavedNoExpiry(perpetual);
      setFieldErrors({});
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError(t('pages.licenses.loadFailedDetail') + getErrorDetail(err, t));
      }
    } finally {
      setLoading(false);
    }
  }, [id, isNew, config, t]);

  useEffect(() => { void load(); }, [load]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDraft((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const blurOptions = (name: string): { required?: boolean; label?: string } | undefined => {
    if (name === 'amount') return { required: true, label: t(AMOUNT_LABEL_KEYS[config.kind]) };
    if (name === 'start_date') return { required: true, label: t('common.validation.startDate') };
    if (name === 'end_date') return { required: !noExpiry, label: t('common.validation.endDate') };
    return undefined;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value, blurOptions(name), t) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleNoExpiryChange = (checked: boolean) => {
    setNoExpiry(checked);
    // ปิดช่อง end_date แล้วก็ต้องปิด error ของมันด้วย ไม่งั้นแบนเนอร์ error ค้างอยู่ทั้งที่ช่องหายไป
    if (checked) setFieldErrors((prev) => ({ ...prev, end_date: '' }));
  };

  const handleCancelEdit = () => {
    setDraft(savedDraft);
    setNoExpiry(savedNoExpiry);
    setFieldErrors({});
    setError('');
  };

  // กฎข้ามฟิลด์ (end_date หลัง start_date) อยู่ใน validateField ไม่ได้ เพราะมันเห็นทีละฟิลด์
  // — เช็คตรงนี้ตอน submit เหมือน SubscriptionForm
  const validateBeforeSubmit = (): boolean => {
    const next: Record<string, string> = {};
    const amountErr = validateField('amount', draft.amount, { required: true, label: t(AMOUNT_LABEL_KEYS[config.kind]) }, t);
    if (amountErr) next.amount = amountErr;
    const startErr = validateField('start_date', draft.start_date, { required: true, label: t('common.validation.startDate') }, t);
    if (startErr) next.start_date = startErr;
    if (!noExpiry) {
      const endErr = validateField('end_date', draft.end_date, { required: true, label: t('common.validation.endDate') }, t);
      if (endErr) next.end_date = endErr;
      if (!next.start_date && !next.end_date && draft.start_date && draft.end_date) {
        if (new Date(draft.end_date).getTime() <= new Date(draft.start_date).getTime()) {
          next.end_date = t('pages.licenses.endDateAfterStart');
        }
      }
    }
    setFieldErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  // ชื่อฟิลด์จำนวนมาจาก config (`licensed_users` / `licensed_bus`) — payload เป็น
  // Record<string, unknown> เพราะ config.service เป็น union ของสองสัญญา create/update ที่มี
  // ชื่อฟิลด์จำนวนต่างกัน TS ตรวจ union ของ overload ให้ไม่ผ่านแม้ payload จะถูกต้องจริงเสมอตาม
  // config.amountField ต้อง cast ตอนเรียกเพียงจุดเดียว (ดู handleCreateSubmit/handleSave)
  //
  // ส่ง reference_no/note เป็น string ดิบตรง ๆ (ไม่ coerce เป็น `|| null`) ทั้งสอง kind — ตรวจกับ
  // backend ที่ deploy จริงแล้ว (business-unit-license.service.ts:289-290 / cluster-license.service.ts:315-316):
  // ทั้งคู่ merge ด้วย `data.x ?? current.x` ซึ่ง `??` มองแค่ null/undefined ว่า nullish — `''`
  // (empty string) ไม่ใช่ nullish เลยไหลผ่านไปเขียนคอลัมน์จริง ส่วน `null`/`undefined` จะถูก `??`
  // "กลืน" กลับไปเป็นค่าเดิมของ current เงียบ ๆ ก่อนหน้านี้คอมเมนต์ตรงนี้เขียนว่า `null` กับ
  // `undefined` "ให้ผลเหมือนกันเป๊ะ" ซึ่งถูก — แต่สรุปผิดว่านั่นแปลว่าล้างค่าไม่ได้เลย (ลืมเช็ค `''`
  // เทียบกับ `??`) จริง ๆ แล้วแค่เลิกส่ง `null` แล้วส่ง `''` ตรง ๆ ก็ล้างค่าได้ปกติ — ไม่ต้องแก้ backend
  const buildPayload = (): Record<string, unknown> => ({
    [config.amountField]: Number(draft.amount),
    start_date: toIsoStartOfDay(draft.start_date),
    end_date: noExpiry ? PERPETUAL_END_DATE : toIsoEndOfDay(draft.end_date),
    reference_no: draft.reference_no,
    ...(config.showNote ? { note: draft.note } : {}),
  });

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || ownerMissing) return;
    if (!validateBeforeSubmit()) return;
    setSaving(true);
    setError('');
    try {
      const create = config.service.create as unknown as (ownerId: string, data: Record<string, unknown>) => Promise<unknown>;
      const result = await create(ownerId, buildPayload());
      const created = ((result as { data?: { id?: string } })?.data || result) as { id?: string } | undefined;
      toast.success(t('toast.created', { entity: t('pages.licenses.license') }));
      if (created?.id) {
        navigate(`/licenses/${config.editPathSegment}/${created.id}/edit`, { replace: true });
      } else {
        navigate(config.listPath);
      }
    } catch (err: unknown) {
      const { fields } = parseApiError(err, t);
      if (fields && Object.keys(fields).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...fields }));
      } else {
        setError(t('pages.licenses.createFailedPrefix') + getErrorDetail(err, t));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit || isNew) return;
    if (!validateBeforeSubmit()) return;
    // ownerId ว่างไม่ควรเกิดได้ (load() เซ็ตจาก getByIdPlatform เสมอ) แต่ถ้าเกิดขึ้นจริงต้อง fail
    // ให้เห็นชัดตรงนี้ ไม่ใช่ปล่อยให้ PATCH ไปที่ .../undefined/licenses/:id แล้วได้ 404 งง ๆ กลับมา
    if (docVersion == null || !ownerId) {
      setError(t('pages.licenses.missingDocVersionOrOwner'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const update = config.service.update as unknown as
        (ownerId: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
      await update(ownerId, id!, { ...buildPayload(), doc_version: docVersion });
      toast.success(t('toast.saved'));
      await load();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await load();
      } else if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        const { fields } = parseApiError(err, t);
        if (fields && Object.keys(fields).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...fields }));
        } else {
          setError(t('pages.licenses.saveFailedPrefix') + getErrorDetail(err, t));
        }
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
        <div className="space-y-4 sm:space-y-6" role="status" aria-label={t('pages.licenses.loadingAria')}>
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
          <PageHeader backTo={config.listPath} title={t('pages.licenses.license')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.licenses.notFoundTitle')}
                description={t('pages.licenses.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate(config.listPath)}>
                    {t('pages.licenses.backToLicenses')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (ownerMissing) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo={config.listPath} title={t(NEW_PAGE_TITLE_KEYS[config.kind])} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={AlertTriangle}
                title={t('pages.licenses.missingOwnerTitle', { owner: ownerTypeLabelLower })}
                description={t('pages.licenses.missingOwnerDescription', { owner: ownerTypeLabelLower })}
                action={
                  <Button size="sm" onClick={() => navigate(config.listPath)}>
                    {t('pages.licenses.backToLicenses')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const now = new Date();
  const status = !isNew && detail ? statusOfRow(config.kind, detail, now) : null;
  const statusBadge: StatusBadgeInfo | null = status
    ? { variant: STATUS_VARIANT[status], label: t(STATUS_LABEL_KEYS[status]) }
    : null;
  const ownerText = ownerLabel || ownerId;
  // โหมดสร้างยังไม่มีแถวให้อ่าน (`detail` เป็น null) จึงไม่มีคลัสเตอร์ให้แสดง — ต่างจาก
  // เจ้าของที่มาทาง query param ได้ คลัสเตอร์ไม่ถูกส่งมาทาง URL เลย ช่องจะไม่ขึ้นทั้งช่อง
  // แทนที่จะขึ้นเป็นช่องว่าง (ผู้สร้างใบเลือก BU มาแล้ว คลัสเตอร์ตามมาเองตอนบันทึก)
  const cluster = clusterFromRow(config, detail);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <>
            <PageHeader
              backTo={config.listPath}
              title={t(NEW_PAGE_TITLE_KEYS[config.kind])}
              subtitle={t('pages.licenses.createSubtitle', { owner: ownerTypeLabelLower })}
            />
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <LicenseFieldsCard
                config={config}
                draft={draft}
                noExpiry={noExpiry}
                fieldErrors={fieldErrors}
                editing={canEdit}
                ownerText={ownerText}
                ownerId={ownerId}
                cluster={null}
                isNew
                statusBadge={null}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onNoExpiryChange={handleNoExpiryChange}
              />
              <div className="flex gap-3">
                <Can permission="subscription.manage">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? t('common.busy.creating') : t('pages.licenses.createLicense')}
                  </Button>
                </Can>
                <Button type="button" size="sm" variant="outline" onClick={() => navigate(config.listPath)}>
                  <X className="mr-2 h-4 w-4" />
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <PageHeader
              backTo={config.listPath}
              title={licenseNumber || t('pages.licenses.unnamedLicense')}
              subtitle={t('pages.licenses.ownerSubtitle', { owner: ownerTypeLabel, value: ownerText })}
              // "Created … by … · Updated … by …" ใต้ subtitle — รูปแบบเดียวกับหน้าแก้ไขอื่นทั้งแอป
              // อ่านจาก `detail` (data ที่ unwrap แล้ว) ไม่ใช่ `rawResponse` เพราะ audit อยู่ใน
              // `data.audit` ชั้นใน — normalizeAudit รับได้ทั้งรูป nested และรูปแบน
              audit={normalizeAudit(detail)}
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}

            <LicenseFieldsCard
              config={config}
              draft={draft}
              noExpiry={noExpiry}
              fieldErrors={fieldErrors}
              editing={canEdit}
              ownerText={ownerText}
              ownerId={ownerId}
              cluster={cluster}
              licenseNumber={licenseNumber}
              isNew={false}
              statusBadge={statusBadge}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              onNoExpiryChange={handleNoExpiryChange}
            />
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
          title="License Debug"
          fabClassName={hasChanges ? 'bottom-20' : undefined}
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default LicensePurchaseForm;
