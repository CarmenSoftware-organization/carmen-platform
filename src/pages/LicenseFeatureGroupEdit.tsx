import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureGroupService from '../services/licenseFeatureGroupService';
import { FeatureSelectionCard } from './licenses/subscriptionEdit/FeatureSelectionCard';
import { GroupCompositionPanel } from './licenses/GroupCompositionPanel';
import {
  selectedChildCount,
  selectedModuleCount,
} from './licenses/subscriptionEdit/featureSelection';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { Skeleton } from '../components/ui/skeleton';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useFeatureCatalog } from '../hooks/useFeatureCatalog';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../hooks/useI18n';
import { cn } from '../lib/utils';
import { validateField } from '../utils/validation';
import { parseApiError, isNotFoundError, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { Save, Loader2, ArrowLeft, SearchX, Info } from 'lucide-react';
import { toast } from 'sonner';

interface LicenseFeatureGroupFormData {
  code: string;
  name: string;
  description: string;
  sort_order: string; // เก็บเป็นสตริงในฟอร์ม แปลงเป็นตัวเลขตอนส่ง
  is_active: boolean;
}

const emptyForm: LicenseFeatureGroupFormData = {
  code: '',
  name: '',
  description: '',
  sort_order: '0',
  is_active: true,
};

/** เพดานเดียวกับหน้ารายการ — จำนวนกลุ่มมีเพดานเชิงโครงสร้าง ไม่ได้งอกตามการใช้งาน */
const SIBLING_PAGE_SIZE = 200;

/**
 * ปุ่มหนึ่งข้างของ segmented "ขายอยู่ / หยุดขาย"
 *
 * ท่าเดียวกับ `TermModeButton` ใน `LicensePurchaseForm` — ราง `bg-muted` กับหัวที่ยกขึ้นเป็น
 * `bg-background` ตัวอักษรจึงอ่านบนพื้นทึบเสมอ ไม่ใช่บนคอนทราสต์ 1.07:1 ที่รีโปนี้จ่ายค่าเรียนไปแล้ว
 */
function StatusModeButton({
  active, disabled, onClick, children,
}: { active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-sm px-3 py-1 text-xs whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * หน้าแก้ไขกลุ่มสิทธิ์ license — รองรับทั้งโหมดสร้าง (`/new`) และโหมดแก้ (`/:id/edit`)
 *
 * ## รูปทรงของหน้า
 *
 * ชุดสิทธิ์คือ **รายการขาย** ไม่ใช่ record หกช่อง คนที่เปิดหน้านี้มาถามคำถามเดียว: "ชุดนี้คือ
 * ชุดอะไร" หน้าจึงเรียงเป็น *ตัวตน → สัดส่วน → ตำแหน่งบนฟอร์มขาย → ของข้างใน* แทนที่จะเป็น
 * กริดช่องกรอกที่ให้น้ำหนัก `sort_order` เท่า `name` แล้วโยนของจริงไว้ในกล่องเลื่อนใต้สุด
 *
 * `รหัส` พูดครั้งเดียวและพูดให้มีน้ำหนัก — เดิมมันเป็นทั้ง subtitle จาง ๆ ใต้ชื่อ **และ** ช่อง
 * อ่านอย่างเดียวในกริดอีกรอบ สองครั้งโดยที่ไม่มีรอบไหนอ่านเหมือนเป็นตัวตนของชุด
 *
 * แค็ตตาล็อกถูกโหลด**ที่หน้านี้** (`useFeatureCatalog`) แล้วส่งลงทั้งแผงสัดส่วนและตัวเลือก —
 * ยกออกมาจากใน `FeatureSelectionCard` เพราะสองที่นั้นต้องพูดยอดเดียวกันบนจอเดียวกัน
 *
 * ## การบันทึก
 *
 * เป็นสอง request เสมอเมื่อมีการแตะ feature: meta ก่อน แล้วจึง feature โดยใช้ `doc_version`
 * **ที่ response ของ request แรกคืนมา** ไม่ใช่ค่าที่ถืออยู่ก่อนหน้า เพราะ update เพิ่งเลื่อน
 * เวอร์ชันไปแล้ว การส่งค่าเก่าจะได้ 409 ทันที
 */
const LicenseFeatureGroupEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const isNew = !id;
  const canManage = hasPermission('license_feature_group.manage');

  const [formData, setFormData] = useState<LicenseFeatureGroupFormData>(emptyForm);
  const [savedFormData, setSavedFormData] = useState<LicenseFeatureGroupFormData>(emptyForm);
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);
  const [savedFeatureKeys, setSavedFeatureKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  /** จำนวนสัญญาที่ผูกกลุ่มนี้อยู่ — อ่านอย่างเดียว มาจาก GET ไม่เคยถูกส่งกลับตอนบันทึก */
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  /** `sort_order` ที่กลุ่ม *อื่น* ถืออยู่ — ใช้เตือนตอนกรอกเลขที่ชนกัน ไม่ใช่ตอนกดบันทึก */
  const [siblingOrders, setSiblingOrders] = useState<Set<number>>(new Set());

  const catalog = useFeatureCatalog();

  const formRef = useRef<HTMLFormElement>(null);

  // เทียบทั้งฟิลด์ข้อความและชุด feature — การแก้เฉพาะ feature ก็ถือว่ามีการเปลี่ยนแปลง
  const hasChanges =
    canManage &&
    (JSON.stringify(formData) !== JSON.stringify(savedFormData) ||
      JSON.stringify([...featureKeys].sort()) !== JSON.stringify([...savedFeatureKeys].sort()));
  useUnsavedChanges(hasChanges);

  const handleCancel = useCallback(() => {
    navigate('/license-feature-groups');
  }, [navigate]);

  useGlobalShortcuts({
    onSave: () => { if (canManage && !saving) formRef.current?.requestSubmit(); },
    onCancel: handleCancel,
  });

  const applyDetail = useCallback((detail: {
    code: string;
    name: string;
    description?: string | null;
    sort_order: number;
    is_active: boolean;
    feature_keys?: string[];
    subscription_count?: number;
  }) => {
    const next: LicenseFeatureGroupFormData = {
      code: detail.code ?? '',
      name: detail.name ?? '',
      description: detail.description ?? '',
      sort_order: String(detail.sort_order ?? 0),
      is_active: detail.is_active ?? true,
    };
    setFormData(next);
    setSavedFormData(next);
    const keys = Array.isArray(detail.feature_keys) ? detail.feature_keys : [];
    setFeatureKeys(keys);
    setSavedFeatureKeys(keys);
    setSubscriptionCount(detail.subscription_count ?? 0);
  }, []);

  const fetchGroup = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      // การ fetch ครั้งก่อนบน instance นี้อาจตั้ง notFound ไว้ — เคลียร์ก่อนเพื่อให้ fetch
      // ที่สำเร็จกู้หน้ากลับมาได้
      setNotFound(false);
      const response = await licenseFeatureGroupService.getById(id);
      setRawResponse(response);
      const detail = response?.data ?? (response as never);
      applyDetail(detail);
      setDocVersion(getDocVersion(detail));
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
        return;
      }
      const { message } = parseApiError(err, t);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id, applyDetail, t]);

  useEffect(() => {
    void fetchGroup();
  }, [fetchGroup]);

  /**
   * ลำดับที่กลุ่มอื่นถืออยู่ — หน้ารายการวาดลำดับที่ชนกันเป็นสีเตือนมานานแล้ว แต่ *หน้าที่สร้าง
   * การชนนั้น* กลับไม่รู้ว่ามีการชนอยู่ ผู้ใช้จึงตั้งเลขซ้ำได้โดยไม่มีอะไรค้าน แล้วไปเจอสีส้ม
   * ในตารางทีหลังโดยไม่รู้ว่ามันเกิดตอนไหน
   *
   * **ล้มแล้วเงียบ** ไม่พ่วงกับ `error` ของหน้า: ไม่รู้ว่าลำดับชนไหม ≠ แก้กลุ่มนี้ไม่ได้
   */
  useEffect(() => {
    let cancelled = false;
    licenseFeatureGroupService
      .getAll({ page: 1, perpage: SIBLING_PAGE_SIZE, sort: 'sort_order:asc' })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setSiblingOrders(new Set(rows.filter((g) => g.id !== id).map((g) => g.sort_order)));
      })
      .catch((err: unknown) => {
        devLog('fetch sibling license feature groups failed', err);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleFieldChange = (name: keyof LicenseFeatureGroupFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleFieldBlur = (name: 'code' | 'name' | 'description') => {
    const message = validateField(name, formData[name], {
      required: name !== 'description',
      label: t(`pages.licenseFeatureGroups.${name}`),
    });
    setFieldErrors((prev) => ({ ...prev, ...(message ? { [name]: message } : {}) }));
  };

  const validateBeforeSubmit = (): boolean => {
    const errors: Record<string, string> = {};
    const codeError = validateField('code', formData.code, {
      required: true,
      label: t('pages.licenseFeatureGroups.code'),
    });
    if (codeError) errors.code = codeError;
    const nameError = validateField('name', formData.name, {
      required: true,
      label: t('pages.licenseFeatureGroups.name'),
    });
    if (nameError) errors.name = nameError;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildMetaPayload = () => ({
    name: formData.name.trim(),
    description: formData.description.trim() || null,
    sort_order: Number(formData.sort_order) || 0,
    is_active: formData.is_active,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ทุกเส้นทางบันทึกลงมาที่นี่ (ปุ่ม Save และ Ctrl/⌘+S) การตรวจสิทธิ์จึงต้องอยู่ที่นี่ด้วย
    // ไม่ใช่แค่ห่อปุ่มด้วย <Can>
    if (!canManage || saving) return;
    if (!validateBeforeSubmit()) return;

    setSaving(true);
    setError('');

    try {
      if (isNew) {
        const created = await licenseFeatureGroupService.create({
          ...buildMetaPayload(),
          code: formData.code.trim(),
        });
        const detail = created?.data ?? (created as never);
        // ตั้ง feature เฉพาะเมื่อมีการเลือกไว้ — กลุ่มเปล่าเป็นสภาพที่ถูกต้อง ไม่ต้องยิง request เปล่า
        if (featureKeys.length > 0) {
          await licenseFeatureGroupService.setFeatures(
            detail.id,
            featureKeys,
            getDocVersion(detail) ?? 0,
          );
        }
        toast.success(t('pages.licenseFeatureGroups.created'));
        navigate(`/license-feature-groups/${detail.id}/edit`, { replace: true });
        return;
      }

      const metaChanged = JSON.stringify(formData) !== JSON.stringify(savedFormData);
      const featuresChanged =
        JSON.stringify([...featureKeys].sort()) !== JSON.stringify([...savedFeatureKeys].sort());

      let version = docVersion ?? 0;
      if (metaChanged) {
        const updated = await licenseFeatureGroupService.update(id!, {
          ...buildMetaPayload(),
          doc_version: version,
        });
        const detail = updated?.data ?? (updated as never);
        // update เพิ่งเลื่อนเวอร์ชัน — ใช้ค่าที่คืนมา ไม่ใช่ค่าเดิมที่ถืออยู่ ไม่งั้น setFeatures
        // ข้างล่างจะได้ 409 ทันทีทั้งที่ไม่มีใครมาแก้แข่ง
        version = getDocVersion(detail) ?? version;
      }
      if (featuresChanged) {
        await licenseFeatureGroupService.setFeatures(id!, featureKeys, version);
      }

      toast.success(t('pages.licenseFeatureGroups.updated'));
      await fetchGroup();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
        return;
      }
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchGroup();
        return;
      }
      const { message, fields } = parseApiError(err, t);
      if (fields) setFieldErrors(fields);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * สองยอดที่แผงสัดส่วนกระทบกัน — คิดจากแค็ตตาล็อกก้อนเดียวกับที่ตัวเลือกใช้ ตัวเลขบนหัวหน้า
   * จึงเป็นตัวเลขเดียวกับที่ป้าย `n/total` ในแต่ละแถวรวมกันได้ ไม่ใช่คนละแหล่ง
   */
  const childCount = useMemo(
    () => selectedChildCount(featureKeys, catalog.catalog),
    [featureKeys, catalog.catalog],
  );
  const moduleCount = useMemo(
    () => selectedModuleCount(featureKeys, catalog.catalog),
    [featureKeys, catalog.catalog],
  );

  // ตัวหารมีก็ต่อเมื่อโหลดสำเร็จ — `failed` กับ "ยังโหลดอยู่" ต้องไม่กลายเป็นตัวหาร 0
  const catalogTotal = catalog.failed || catalog.loading ? null : catalog.catalog.length;

  const orderDuplicate = siblingOrders.has(Number(formData.sort_order) || 0);

  if (notFound) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={SearchX}
              title={t('pages.licenseFeatureGroups.emptyTitle')}
              description={t('pages.licenseFeatureGroups.emptyDescription')}
              action={
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('common.action.back')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <PageHeader
          title={
            isNew
              ? t('pages.licenseFeatureGroups.newGroup')
              : formData.name || t('pages.licenseFeatureGroups.editGroup')
          }
          subtitle={t('pages.licenseFeatureGroups.subtitle')}
          actions={
            <div className="flex gap-3">
              <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.action.back')}
              </Button>
              {canManage && (
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t('common.action.saveChanges')}
                </Button>
              )}
            </div>
          }
        />

        {error && (
          <Card className="border-destructive">
            <CardContent className="text-destructive py-4 text-sm">{error}</CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-4 py-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                {/* ตัวตนซ้าย สัดส่วนขวา — สองคำถามแรกของหน้านี้ อยู่ในสายตาเดียวกัน
                    คอลัมน์ขวาตรึงที่ 18rem: แผงสัดส่วนถือแถบที่ใช้แกนร่วมกับหน้ารายการ
                    ถ้าความกว้างยืดตามเนื้อหา ความยาวแถบจะเลิกหมายถึงจำนวนเดียวกันสองหน้า */}
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">{t('pages.licenseFeatureGroups.code')}</Label>
                      {isNew && canManage ? (
                        <>
                          <Input
                            id="code"
                            value={formData.code}
                            onChange={(e) => handleFieldChange('code', e.target.value)}
                            onBlur={() => handleFieldBlur('code')}
                            className={cn('font-mono', fieldErrors.code && 'border-destructive')}
                          />
                          {fieldErrors.code ? (
                            <p className="text-destructive text-xs">{fieldErrors.code}</p>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              {t('pages.licenseFeatureGroups.codeHint')}
                            </p>
                          )}
                        </>
                      ) : (
                        // รหัสของชุดที่ออกไปแล้วไม่ใช่ช่องกรอกที่กรอกไม่ได้ — มันคือตัวตน
                        // แผ่นป้ายโมโนสเปซจึงอ่านเป็น "นี่คือชื่อเรียกของชุดนี้" ไม่ใช่
                        // "ช่องนี้เสีย" และคำอธิบายว่าแก้ไม่ได้ยืนอยู่ข้าง ๆ ไม่ใช่ใต้ช่อง
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="bg-muted/50 rounded-md border px-2 py-1 font-mono text-sm">
                            {formData.code || '—'}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {t('pages.licenseFeatureGroups.codeHint')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name">{t('pages.licenseFeatureGroups.name')}</Label>
                      {canManage ? (
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleFieldChange('name', e.target.value)}
                          onBlur={() => handleFieldBlur('name')}
                          className={fieldErrors.name ? 'border-destructive' : ''}
                        />
                      ) : (
                        <ReadOnlyField value={formData.name} />
                      )}
                      {fieldErrors.name && (
                        <p className="text-destructive text-xs">{fieldErrors.name}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">
                        {t('pages.licenseFeatureGroups.description')}
                      </Label>
                      {canManage ? (
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleFieldChange('description', e.target.value)}
                          onBlur={() => handleFieldBlur('description')}
                          rows={2}
                        />
                      ) : (
                        <ReadOnlyField value={formData.description} />
                      )}
                    </div>
                  </div>

                  <GroupCompositionPanel
                    childCount={childCount}
                    moduleCount={moduleCount}
                    catalogTotal={catalogTotal}
                    subscriptionCount={subscriptionCount}
                    // เทียบกับ `savedFormData` ไม่ใช่ค่าคงที่ — บรรทัดเตือนต้องโผล่เฉพาะตอนที่
                    // ผู้ใช้กำลังจะ "ปิด" ชุดที่เปิดอยู่ ไม่ใช่ทุกครั้งที่เปิดหน้าชุดที่ปิดไว้แล้ว
                    willDeactivate={savedFormData.is_active && !formData.is_active}
                  />
                </div>

                {/* ลำดับกับสถานะเป็นเรื่องเดียวกัน: "ชุดนี้โผล่ตรงไหนบนฟอร์มขาย และโผล่ไหม"
                    เดิมมันเป็นสองในหกช่องของกริดที่ให้น้ำหนักเท่า `ชื่อ` แถบเดียวใต้เส้นคั่น
                    พูดประโยคนั้นได้ครบโดยไม่ต้องแย่งน้ำหนักกับตัวตนของชุด */}
                <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <Label htmlFor="sort_order">{t('pages.licenseFeatureGroups.sortOrder')}</Label>
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Input
                          id="sort_order"
                          type="number"
                          value={formData.sort_order}
                          onChange={(e) => handleFieldChange('sort_order', e.target.value)}
                          className={cn('w-20 tabular-nums', orderDuplicate && 'border-warning')}
                        />
                      ) : (
                        <ReadOnlyField value={formData.sort_order} />
                      )}
                      <span className="text-muted-foreground text-sm">
                        {t('pages.licenseFeatureGroups.orderOnSalesForm')}
                      </span>
                    </div>
                    <p className={cn('text-xs', orderDuplicate ? 'text-warning' : 'text-muted-foreground')}>
                      {orderDuplicate
                        ? t('pages.licenseFeatureGroups.orderDuplicate')
                        : t('pages.licenseFeatureGroups.sortOrderHint')}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('common.status.label')}</Label>
                    {/* สวิตช์ที่ตัดสินว่าชุดนี้ยังขายอยู่ไหม เคยเป็น checkbox ดิบพร้อมประโยค
                        อธิบายห้อยข้าง ๆ — สองสถานะที่ *สลับที่กัน* อ่านง่ายกว่าช่องติ๊กที่ต้อง
                        เดาว่าติ๊กแล้วแปลว่าอะไร และสูงคงที่ แถวจึงไม่ขยับตอนสลับ */}
                    <div
                      role="group"
                      aria-label={t('common.status.label')}
                      className="bg-muted flex h-9 items-center rounded-md p-0.5"
                    >
                      <StatusModeButton
                        active={formData.is_active}
                        disabled={!canManage}
                        onClick={() => handleFieldChange('is_active', true)}
                      >
                        {t('pages.licenseFeatureGroups.sellingOn')}
                      </StatusModeButton>
                      <StatusModeButton
                        active={!formData.is_active}
                        disabled={!canManage}
                        onClick={() => handleFieldChange('is_active', false)}
                      >
                        {t('pages.licenseFeatureGroups.sellingOff')}
                      </StatusModeButton>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formData.is_active
                        ? t('pages.licenseFeatureGroups.activeHint')
                        : t('pages.licenseFeatureGroups.inactiveHint')}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('pages.licenseFeatureGroups.featuresCard')}</CardTitle>
            <CardDescription className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('pages.licenseFeatureGroups.parentAutoAdded')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureSelectionCard
              featureKeys={featureKeys}
              catalog={catalog.catalog}
              catalogLoading={catalog.loading}
              catalogFailed={catalog.failed}
              onReloadCatalog={catalog.reload}
              emptyMessage={t('pages.licenseFeatureGroups.noFeaturesSelected')}
              onChange={setFeatureKeys}
              readOnly={!canManage}
            />
          </CardContent>
        </Card>
      </form>

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title={t('pages.licenseFeatureGroups.editGroup')}
          endpoint={`/api-system/platform/license-feature-groups${id ? `/${id}` : ''}`}
          tabs={[
            { key: 'response', label: 'response', data: rawResponse },
            { key: 'form', label: 'form', data: { formData, featureKeys, docVersion } },
            {
              key: 'composition',
              label: 'composition',
              data: { childCount, moduleCount, catalogTotal, orderDuplicate },
            },
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureGroupEdit;
