import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureGroupService from '../services/licenseFeatureGroupService';
import { FeatureSelectionCard } from './licenses/subscriptionEdit/FeatureSelectionCard';
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
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../hooks/useI18n';
import { cn } from '../lib/utils';
import { validateField } from '../utils/validation';
import { parseApiError, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { Save, Loader2, ArrowLeft, SearchX, Info, AlertTriangle } from 'lucide-react';
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

/**
 * หน้าแก้ไขกลุ่มสิทธิ์ license — รองรับทั้งโหมดสร้าง (`/new`) และโหมดแก้ (`/:id/edit`)
 *
 * ใช้ `FeatureSelectionCard` ตัวเดียวกับหน้าขายสัญญาซ้ำ ไม่ได้ย้ายไฟล์ เพราะหน้าขาย
 * (`SubscriptionForm`) ยังใช้อยู่ — ส่ง `emptyMessage` เข้าไปแทนการพึ่ง `buName` ที่ไม่มีในบริบทนี้
 *
 * การบันทึกเป็นสอง request เสมอเมื่อมีการแตะ feature: meta ก่อน แล้วจึง feature โดยใช้
 * `doc_version` **ที่ response ของ request แรกคืนมา** ไม่ใช่ค่าที่ถืออยู่ก่อนหน้า เพราะ update
 * เพิ่งเลื่อนเวอร์ชันไปแล้ว การส่งค่าเก่าจะได้ 409 ทันที
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
          subtitle={isNew ? t('pages.licenseFeatureGroups.subtitle') : formData.code}
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
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* รัศมีความเสียหายของหน้านี้ — บนหน้ารายการเลขนี้เป็นแค่ "รู้ไว้" แต่ที่นี่คือจุดที่การกระทำ
            เกิดจริง: ทุกสัญญาที่ผูกกลุ่มนี้ได้สิทธิ์ตามชุดที่บันทึกไว้ ณ เวลาที่อ่าน ไม่ใช่ตามชุด
            ที่มันซื้อไป การถอด feature ออกหนึ่งตัวจึงถอดออกจากทุกสัญญาพร้อมกัน ไม่มีขั้นยืนยันอื่น */}
        {!isNew && subscriptionCount > 0 && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="flex items-start gap-2.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {subscriptionCount === 1
                    ? t('pages.licenseFeatureGroups.inUseWarningTitleOne')
                    : t('pages.licenseFeatureGroups.inUseWarningTitle', { count: subscriptionCount })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('pages.licenseFeatureGroups.inUseWarningBody')}
                </p>
                {/* เทียบกับ savedFormData ไม่ใช่ค่าคงที่ — ประโยคนี้ต้องโผล่เฉพาะตอนที่ผู้ใช้
                    กำลังจะ "ปิด" กลุ่มที่เปิดอยู่ ไม่ใช่ทุกครั้งที่เปิดหน้ากลุ่มที่ปิดไว้แล้ว

                    `invisible` ไม่ใช่การถอดออกจาก DOM: ถ้าบรรทัดนี้งอกออกมาตอนติ๊ก กล่องเตือน
                    จะสูงขึ้นแล้วดันฟอร์มลงทั้งแผง ช่องติ๊กเลื่อนหนีนิ้วในจังหวะที่เพิ่งกดพอดี
                    (ยืนยันในเบราว์เซอร์แล้ว — คลิกครั้งที่สองที่พิกัดเดิมพลาดเป้า) */}
                <p
                  aria-hidden={!(savedFormData.is_active && !formData.is_active)}
                  className={cn(
                    'text-xs font-medium text-warning',
                    savedFormData.is_active && !formData.is_active ? 'visible' : 'invisible',
                  )}
                >
                  {t('pages.licenseFeatureGroups.deactivateWarning', { count: subscriptionCount })}
                </p>
              </div>
            </CardContent>
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
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('pages.licenseFeatureGroups.code')}</Label>
                  {isNew && canManage ? (
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => handleFieldChange('code', e.target.value)}
                      onBlur={() => handleFieldBlur('code')}
                      className={fieldErrors.code ? 'border-destructive' : ''}
                    />
                  ) : (
                    <ReadOnlyField value={<span className="font-mono text-xs">{formData.code}</span>} />
                  )}
                  {fieldErrors.code ? (
                    <p className="text-xs text-destructive">{fieldErrors.code}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('pages.licenseFeatureGroups.codeHint')}
                    </p>
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
                    <p className="text-xs text-destructive">{fieldErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2 lg:col-span-2">
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

                <div className="space-y-2">
                  <Label htmlFor="sort_order">{t('pages.licenseFeatureGroups.sortOrder')}</Label>
                  {canManage ? (
                    <Input
                      id="sort_order"
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => handleFieldChange('sort_order', e.target.value)}
                    />
                  ) : (
                    <ReadOnlyField value={formData.sort_order} />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('pages.licenseFeatureGroups.sortOrderHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="is_active">{t('pages.licenseFeatureGroups.active')}</Label>
                  {/* ช่องติ๊กเปล่า ๆ ไม่บอกว่าติ๊กแล้วเกิดอะไร — ข้อความข้างช่องคือสิ่งที่ทำให้
                      "ใช้งาน" หมายถึง "ยังหยิบไปขายได้" แทนที่จะเป็นสวิตช์ที่ต้องเดา */}
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      id="is_active"
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={formData.is_active}
                      disabled={!canManage}
                      onChange={(e) => handleFieldChange('is_active', e.target.checked)}
                    />
                    <span className="text-muted-foreground">
                      {t('pages.licenseFeatureGroups.activeHint')}
                    </span>
                  </label>
                </div>
              </div>
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
              buName={null}
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
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureGroupEdit;
