import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { useI18n } from '../hooks/useI18n';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import featureFlagService from '../services/featureFlagService';
import { getErrorDetail } from '../utils/errorParser';
import {
  FEATURE_CATALOG,
  isFeatureKey,
  type FeatureDefinition,
  type FeatureState,
} from '../constants/featureFlags';
import { FeatureStateToggle } from '../components/FeatureStateToggle';
import type { TKey } from '../i18n/types';

/**
 * หน้าตั้งสถานะฟีเจอร์ — หน้า Config ไม่ใช่หน้า Management: ชุดฟีเจอร์ถูกกำหนดโดยแค็ตตาล็อกใน
 * โค้ด ไม่ใช่ข้อมูลที่ผู้ใช้สร้าง จึงไม่มีตาราง ไม่มีค้นหา ไม่มีแบ่งหน้า
 * A Config page, not a Management one: the feature set comes from an in-code catalog.
 *
 * หน้านี้ไม่มี flag ของตัวเองโดยเจตนา — สวิตช์ที่ปิดตัวเองได้จะเปิดกลับไม่ได้อีกเลยจากหน้าจอ
 * Deliberately ungated: a switch that can turn itself off could never be turned back on.
 */
const FeatureFlagManagement: React.FC = () => {
  const { t } = useI18n();
  const { states, isReady, refresh } = useFeatureFlags();
  // ร่างที่กำลังแก้ ตั้งต้นจากค่าที่มีผลจริงตอนเปิดหน้า
  const [draft, setDraft] = useState<Record<string, FeatureState>>(states);
  const [saving, setSaving] = useState(false);
  const [orphanToRemove, setOrphanToRemove] = useState<string | null>(null);

  // คีย์ที่เซิร์ฟเวอร์เก็บไว้แต่แค็ตตาล็อกรุ่นนี้ไม่รู้จัก — ตัวชดเชยที่ backend ไม่ตรวจชื่อคีย์ให้
  // (schema ฝั่งนั้นเป็น record ฟรีฟอร์มโดยเจตนา ดู platform-config.schema.ts)
  // The compensation for the backend's free-form key space.
  const orphans = useMemo(
    () => Object.keys(draft).filter((k) => !isFeatureKey(k)),
    [draft],
  );

  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(states),
    [draft, states],
  );
  useUnsavedChanges(hasChanges);

  // จัดกลุ่มจากแถวที่ groupKey ซ้ำกันติด ๆ แบบเดียวกับ Sidebar เพื่อให้ลำดับบนหน้านี้ตรงกับเมนู
  // ที่ผู้ดูแลเพิ่งมองอยู่ ไม่ใช่เรียงใหม่ตามตัวอักษร
  // Grouped by consecutive runs, exactly like the sidebar, so the order matches the menu.
  const groups = useMemo(() => {
    const out: { groupKey: TKey; items: FeatureDefinition[] }[] = [];
    for (const f of FEATURE_CATALOG) {
      const last = out[out.length - 1];
      if (last && last.groupKey === f.groupKey) last.items.push(f);
      else out.push({ groupKey: f.groupKey, items: [f] });
    }
    return out;
  }, []);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await featureFlagService.update(draft);
      // ดึงค่าใหม่เพื่อให้ sidebar และด่านเส้นทางสะท้อนผลทันทีโดยไม่ต้องรีโหลดทั้งหน้า
      await refresh();
      toast.success(t('pages.featureFlags.saved'));
    } catch (err) {
      toast.error(getErrorDetail(err, t) || t('pages.featureFlags.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  useGlobalShortcuts({ onSave: hasChanges && !saving ? handleSave : undefined });

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.featureFlags.title')}
          subtitle={t('pages.featureFlags.subtitle')}
          actions={
            <Button onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
            </Button>
          }
        />

        {!isReady ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <Card key={group.groupKey}>
              <CardHeader>
                <CardTitle className="text-base">{t(group.groupKey)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((f) => (
                  <div
                    key={f.key}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{t(f.labelKey)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{f.key}</div>
                    </div>
                    <FeatureStateToggle
                      value={draft[f.key] ?? f.defaultState}
                      featureLabel={t(f.labelKey)}
                      onChange={(next) => setDraft((d) => ({ ...d, [f.key]: next }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}

        {orphans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('pages.featureFlags.orphans.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('pages.featureFlags.orphans.description')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {orphans.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs">{key}</span>
                  <Button variant="outline" size="sm" onClick={() => setOrphanToRemove(key)}>
                    {t('pages.featureFlags.orphans.remove')}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ConfirmDialog
          open={orphanToRemove !== null}
          onOpenChange={(open) => {
            if (!open) setOrphanToRemove(null);
          }}
          title={t('pages.featureFlags.orphans.confirmTitle')}
          description={t('pages.featureFlags.orphans.confirmBody')}
          confirmVariant="destructive"
          onConfirm={() => {
            // เอาออกจากร่างเท่านั้น การลบจริงเกิดตอนกดบันทึก เพราะ PUT แทนที่แมปทั้งใบอยู่แล้ว
            // Draft-only: the actual removal happens on save, since PUT replaces the whole map.
            setDraft((d) => {
              const next = { ...d };
              if (orphanToRemove) delete next[orphanToRemove];
              return next;
            });
            setOrphanToRemove(null);
          }}
        />

        <DevDebugSheet
          title={t('pages.featureFlags.title')}
          endpoint="/api-system/platform/feature-flags"
          tabs={[
            { key: 'draft', label: 'draft', data: draft },
            { key: 'effective', label: 'effective', data: states },
            { key: 'orphans', label: 'orphans', data: orphans },
          ]}
        />
      </div>
    </Layout>
  );
};

export default FeatureFlagManagement;
