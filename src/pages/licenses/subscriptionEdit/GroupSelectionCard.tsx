import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import licenseFeatureGroupService from '../../../services/licenseFeatureGroupService';
import subscriptionService from '../../../services/subscriptionService';
import type { LicenseFeatureGroup, LicenseFeature } from '../../../types';
import { getErrorDetail, devLog } from '../../../utils/errorParser';
import { useI18n } from '../../../hooks/useI18n';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
import { FetchErrorState } from '../../../components/FetchErrorState';
import { ChevronRight, ChevronDown, ExternalLink, X } from 'lucide-react';

export interface GroupSelectionCardProps {
  /** กลุ่มที่ใบนี้เลือกไว้ — id ล้วน */
  groupIds: string[];
  onChange: (groupIds: string[]) => void;
  /** ไม่มี `subscription.manage` — แสดงอย่างเดียว ไม่มี checkbox */
  readOnly: boolean;
  /**
   * feature ที่ใบนี้ถืออยู่จริงตามที่ backend คำนวณ — ใช้เตือนเมื่อใบยังไม่ถูกย้ายเข้าระบบกลุ่ม
   * (มี feature แต่ไม่มีกลุ่ม) ซึ่งเป็นสภาพที่เกิดได้ระหว่างเฟสย้ายข้อมูล
   */
  currentFeatureKeys: string[];
}

/**
 * ตัวเลือก **กลุ่มสิทธิ์** สำหรับหน้าขายสัญญา — มาแทน `FeatureSelectionCard` ที่ให้ติ๊ก feature ทีละตัว
 *
 * แต่ละกลุ่มกางดู feature ข้างในได้แบบอ่านอย่างเดียว เพื่อให้คนขายเห็นว่าลูกค้าได้อะไรจริง ๆ
 * โดยไม่ต้องเดาจากชื่อกลุ่ม และมีแถบสรุปจำนวน feature ที่รวมได้จากกลุ่มที่เลือก
 *
 * The group picker for the sales page, replacing the per-feature checklist. Each group expands
 * to a read-only list of what it grants, so nobody has to guess from the group's name.
 */
export function GroupSelectionCard({
  groupIds,
  onChange,
  readOnly,
  currentFeatureKeys,
}: GroupSelectionCardProps) {
  const { t } = useI18n();

  const [groups, setGroups] = useState<LicenseFeatureGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** feature ของแต่ละกลุ่ม โหลดเมื่อกางครั้งแรกเท่านั้น — รายการกลุ่มไม่ได้พ่วง feature มาให้ */
  const [featuresByGroup, setFeaturesByGroup] = useState<Record<string, string[]>>({});
  const [catalog, setCatalog] = useState<LicenseFeature[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [list, cat] = await Promise.allSettled([
        licenseFeatureGroupService.getAll({ page: 1, perpage: 200, sort: 'sort_order:asc' }),
        subscriptionService.getFeatureCatalog(),
      ]);
      if (list.status === 'rejected') throw list.reason;
      // เก็บ **ทั้งหมด** ไว้ที่นี่ แล้วค่อยแยกตอน render — กลุ่ม interface ถูกกันออกจาก *รายการที่เลือกได้*
      // (ขายบนใบ INF ใบสัญญาห้ามถือ backend 400 ตั้งแต่เฟส 4) แต่ถ้ากรองทิ้งตั้งแต่ตรงนี้ สัญญาที่
      // ยังค้างกลุ่ม interface อยู่จะไม่เห็นมันที่ไหนเลย นับไม่เข้าสรุป และเอาออกไม่ได้ — บันทึกก็ 400
      // ทุกครั้ง กลายเป็นสัญญาที่ซ่อมผ่านหน้าจอไม่ได้ (ดู `leftoverGroups`)
      setGroups(Array.isArray(list.value?.data) ? list.value.data : []);
      // catalog ใช้แค่แปลง key เป็นชื่อที่อ่านออก — ล้มได้โดยไม่ทำให้การ์ดพัง
      if (cat.status === 'fulfilled') {
        setCatalog(Array.isArray(cat.value?.data) ? cat.value.data : []);
      } else {
        devLog('feature catalog fetch failed — falling back to raw keys', cat.reason);
      }
    } catch (err: unknown) {
      devLog('license feature group fetch failed', err);
      setError(getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of catalog) map.set(f.key, f.label);
    return map;
  }, [catalog]);

  /**
   * สถานะราย feature — ใช้ติดป้าย "เลิกขายของใหม่" ให้คนขายเห็นว่ากลุ่มนี้มีของที่ปิดการขายอยู่
   * แค็ตตาล็อกที่โหลดมาไม่มีตัวที่ `hide` อยู่แล้ว คีย์ที่หาไม่เจอจึงเป็นคีย์กำพร้าไม่ใช่ inactive
   */
  const stateByKey = useMemo(() => {
    const map = new Map<string, LicenseFeature['state']>();
    for (const f of catalog) map.set(f.key, f.state);
    return map;
  }, [catalog]);

  const selected = useMemo(() => new Set(groupIds), [groupIds]);

  /** กลุ่มที่ให้ติ๊กได้จริง — เฉพาะ standard (กลุ่มไม่ระบุชนิด = standard ตามค่าเริ่มต้นของ backend) */
  const selectableGroups = useMemo(
    () => groups.filter((g) => (g.kind ?? 'standard') === 'standard'),
    [groups],
  );

  /** กลุ่ม interface ที่ยัง "ค้าง" อยู่บนสัญญานี้ — แสดงอ่านอย่างเดียวพร้อมปุ่มนำออกเท่านั้น */
  const leftoverGroups = useMemo(
    () => groups.filter((g) => g.kind === 'interface' && selected.has(g.id)),
    [groups, selected],
  );

  const removeGroup = (id: string) => {
    if (readOnly) return;
    onChange(groupIds.filter((g) => g !== id));
  };

  const toggleGroup = (id: string) => {
    if (readOnly) return;
    // Array.from ไม่ใช่ spread — tsconfig ของโปรเจกต์ target ต่ำกว่า es2015 จึง iterate Set ตรง ๆ ไม่ได้
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const toggleExpand = async (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
      setExpanded(next);
      return;
    }
    next.add(id);
    setExpanded(next);
    if (featuresByGroup[id]) return;
    try {
      const detail = await licenseFeatureGroupService.getById(id);
      const keys = detail?.data?.feature_keys ?? [];
      setFeaturesByGroup((prev) => ({ ...prev, [id]: keys }));
    } catch (err: unknown) {
      devLog('group detail fetch failed', err);
      setFeaturesByGroup((prev) => ({ ...prev, [id]: [] }));
    }
  };

  /**
   * จำนวน feature ที่รวมได้จากกลุ่มที่เลือก — นับจาก `feature_count` ของแต่ละกลุ่ม ซึ่ง**อาจนับซ้ำ**
   * ถ้าสองกลุ่มมี feature ตัวเดียวกัน จึงแสดงเป็น "จากกลุ่ม N กลุ่ม" คู่กันเสมอ ไม่ใช่ตัวเลขเดี่ยว ๆ
   * ที่ชวนให้เข้าใจว่าเป็นจำนวนสิทธิ์สุทธิ · ตัวเลขสุทธิจริงมาจาก backend หลังบันทึก
   */
  // นับจาก `groups` ทั้งก้อน (รวมกลุ่ม interface ที่ค้าง) — สรุปที่ไม่นับของที่ยังติดอยู่บนสัญญา
  // คือสรุปที่โกหก และทำให้คนขายไม่รู้ว่ายังมีอะไรต้องเอาออกก่อนกดบันทึก
  const selectedGroups = useMemo(
    () => groups.filter((g) => selected.has(g.id)),
    [groups, selected],
  );

  const isUnmigrated = groupIds.length === 0 && currentFeatureKeys.length > 0;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return <FetchErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      {isUnmigrated && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          {t('pages.subscriptions.notMigratedToGroups', { count: currentFeatureKeys.length })}
        </div>
      )}

      {leftoverGroups.length > 0 && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <p className="text-xs text-foreground">{t('pages.subscriptions.interfaceGroupLeftover')}</p>
          {leftoverGroups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <span className="truncate text-sm">{g.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{g.code}</span>
              <Badge variant="secondary" className="shrink-0">
                {g.feature_count}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0"
                disabled={readOnly}
                onClick={() => removeGroup(g.id)}
              >
                <X className="mr-2 h-4 w-4" />
                {t('pages.subscriptions.removeLeftoverGroup')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectableGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.subscriptions.noGroupsAvailable')}{' '}
          <Link to="/license-feature-groups" className="text-primary hover:underline">
            {t('pages.licenseFeatureGroups.title')}
          </Link>
        </p>
      ) : (
        <div className="rounded-md border">
          {selectableGroups.map((g) => {
            const isOpen = expanded.has(g.id);
            const isPicked = selected.has(g.id);
            const keys = featuresByGroup[g.id];
            return (
              <div key={g.id} className="border-b last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-primary"
                      checked={isPicked}
                      onChange={() => toggleGroup(g.id)}
                      aria-label={g.name}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleExpand(g.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm">{g.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {g.code}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {g.feature_count}
                    </Badge>
                    {!g.is_active && (
                      <Badge variant="outline" className="shrink-0">
                        {t('common.status.inactive')}
                      </Badge>
                    )}
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t bg-muted/30 px-3 py-2">
                    {keys === undefined ? (
                      <Skeleton className="h-4 w-40" />
                    ) : keys.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t('pages.licenseFeatureGroups.noFeaturesSelected')}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {keys.map((k) => (
                          <span
                            key={k}
                            title={k}
                            className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {labelByKey.get(k) ?? k}
                            {stateByKey.get(k) === 'inactive' && (
                              <span className="ml-1 opacity-70">
                                ({t('pages.licenseFeatures.state.inactive')})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          {t('pages.subscriptions.groupsSelectedSummary', {
            groups: selectedGroups.length,
            features: selectedGroups.reduce((n, g) => n + g.feature_count, 0),
          })}
        </span>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/license-feature-groups" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('pages.subscriptions.manageGroups')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
