import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import licenseFeatureService from '../services/licenseFeatureService';
import type { LicenseFeatureAdminRow } from '../types';
import { type FeatureState } from '../constants/featureFlags';
import { moduleOf } from './licenses/subscriptionEdit/featureSelection';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useI18n } from '../hooks/useI18n';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { CatalogStateBar, type CatalogFilter } from './licenseFeatures/CatalogStateBar';
import { ModuleShelf, type ModuleGroup } from './licenseFeatures/ModuleShelf';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { Tags, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { TKey } from '../i18n/types';

/**
 * คีย์คำอธิบายของหน้านี้โดยเฉพาะ — **ห้ามใช้ของหน้า Feature Flags ซ้ำ**
 * ที่นั่น `hide` แปลว่าเมนูหายและ URL ตรงเจอ 404 ส่วนที่นี่แปลว่าหายจากแค็ตตาล็อกที่ขายได้
 * คนละเรื่องกันสิ้นเชิง การใช้ชุดเดียวกันจะทำให้ผู้ดูแลอ่านแล้วเข้าใจผิดว่ากำลังปิดหน้าจอ
 */
const LICENSE_STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.licenseFeatures.state.active',
  inactive: 'pages.licenseFeatures.state.inactive',
  hide: 'pages.licenseFeatures.state.hide',
};

const LICENSE_STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.licenseFeatures.state.activeHint',
  inactive: 'pages.licenseFeatures.state.inactiveHint',
  hide: 'pages.licenseFeatures.state.hideHint',
};

const EMPTY_STATE_COUNTS: Record<FeatureState, number> = { active: 0, inactive: 0, hide: 0 };

/**
 * ลำดับเดียวกับ backend: `sort_order asc` แล้วต่อด้วย `key asc` · เทียบ `key` ด้วย `<`/`>`
 * ไม่ใช่ `localeCompare` เพื่อให้เป็นลำดับ byte เดียวกับ Postgres ไม่ใช่ลำดับตาม locale ของเบราว์เซอร์
 */
function byOrderThenKey(a: LicenseFeatureAdminRow, b: LicenseFeatureAdminRow): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * แค็ตตาล็อก license feature — client-filtered ไม่ใช่ server-side
 *
 * แถวทั้งหมดมาจาก `scripts/generate-license-catalog` ฝั่ง backend จำนวนจึงมีเพดานเชิงโครงสร้าง
 * ไม่ได้งอกตามการใช้งาน ดึงครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce** เพราะการพิมพ์
 * ไม่ทำให้เกิด fetch — และด้วยเหตุผลเดียวกัน **ไม่มีการแบ่งหน้า** ทั้ง 76 แถวอยู่ในมือแล้ว
 * การหั่นเป็น 8 หน้าเคยบังคับให้ผู้ดูแลเปิดทีละหน้าเพื่อตอบคำถามที่แถบสรุปตอบได้ในวินาทีเดียว
 *
 * หน้านี้แก้ได้แค่ `state` ไม่มีปุ่มเพิ่ม/ลบแถว — key/label/sort_order เป็นของ generator
 *
 * **บันทึกทันทีทีละแถว ไม่เก็บ draft** ต่างจากหน้า /platform/features โดยเจตนา:
 * ที่นั่น backend เป็น PUT ที่ทับทั้ง map ทีเดียว ส่วนที่นี่แต่ละแถวถือ `doc_version` ของตัวเอง
 * การรวบหลายแถวเป็นชุดเดียวแล้วยิง PATCH ทีละตัวบังคับให้ต้องออกแบบ UX ตอนสำเร็จครึ่ง ๆ
 * ("สำเร็จ 18 ล้มเหลว 2 — แต่ 2 อันไหน") ทั้งที่ปัญหานั้นไม่มีอยู่ถ้าไม่รวบ
 * ผลพลอยได้คือหน้านี้ไม่ต้องมี useUnsavedChanges เพราะไม่มีสถานะค้าง
 */
const LicenseFeatureManagement: React.FC = () => {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('license_feature.manage');

  const [rows, setRows] = useState<LicenseFeatureAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<CatalogFilter>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  /**
   * แถวที่รอคำยืนยันก่อนซ่อน — `null` = ไม่มีกล่องเปิดอยู่
   * เก็บทั้งแถวไว้ ไม่ใช่แค่ id เพราะกล่องต้องใช้ทั้ง label และ affected_bu_count
   */
  const [pendingHide, setPendingHide] = useState<LicenseFeatureAdminRow | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await licenseFeatureService.getAll();
      setRawResponse(response);
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (err: unknown) {
      devLog('fetch license features failed', err);
      setError(getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /**
   * คำค้นเท่านั้น ยังไม่ใช้ตัวกรองสถานะ — นี่คือชุดที่แถบสรุปนับ
   *
   * คีย์ของลูกขึ้นต้นด้วยชื่อโมดูลเสมอ (`configuration.currency`) การพิมพ์ชื่อโมดูลจึงกวาด
   * ลูกทั้งโมดูลมาให้เองโดยไม่ต้องมีกฎพิเศษสำหรับการค้นแบบต้นไม้
   */
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.key.toLowerCase().includes(q) || r.label.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const c = { all: searched.length, active: 0, inactive: 0, hide: 0 };
    searched.forEach((r) => {
      c[r.state] += 1;
    });
    return c;
  }, [searched]);

  const visible = useMemo(
    () => (stateFilter === 'all' ? searched : searched.filter((r) => r.state === stateFilter)),
    [searched, stateFilter],
  );

  const filtering = search.trim() !== '' || stateFilter !== 'all';

  /**
   * ชั้นวางต่อโมดูล — ตัวเลขสรุปของหัวชั้นมาจาก `rows` (ทั้งโมดูล) ส่วนรายการลูกมาจาก `visible`
   * (หลังกรอง) สองแหล่งนี้ต่างกันโดยเจตนา ดูเหตุผลใน `ModuleShelf`
   */
  const groups = useMemo<ModuleGroup[]>(() => {
    const totals = new Map<string, { total: number; states: Record<FeatureState, number> }>();
    const moduleRows = new Map<string, LicenseFeatureAdminRow>();
    rows.forEach((r) => {
      if (r.parent_key === null) {
        moduleRows.set(r.key, r);
        return;
      }
      const m = moduleOf(r.key);
      const entry = totals.get(m) ?? { total: 0, states: { ...EMPTY_STATE_COUNTS } };
      entry.total += 1;
      entry.states[r.state] += 1;
      totals.set(m, entry);
    });

    const shownChildren = new Map<string, LicenseFeatureAdminRow[]>();
    const shownModules = new Set<string>();
    visible.forEach((r) => {
      const m = moduleOf(r.key);
      shownModules.add(m);
      if (r.parent_key === null) return;
      const arr = shownChildren.get(m) ?? [];
      arr.push(r);
      shownChildren.set(m, arr);
    });

    return Array.from(shownModules)
      .map((moduleKey) => {
        const stat = totals.get(moduleKey);
        return {
          moduleKey,
          moduleRow: moduleRows.get(moduleKey),
          children: (shownChildren.get(moduleKey) ?? []).slice().sort(byOrderThenKey),
          totalChildren: stat?.total ?? 0,
          childStates: stat?.states ?? { ...EMPTY_STATE_COUNTS },
        };
      })
      .sort((a, b) => {
        const ao = a.moduleRow?.sort_order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.moduleRow?.sort_order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return a.moduleKey < b.moduleKey ? -1 : a.moduleKey > b.moduleKey ? 1 : 0;
      });
  }, [rows, visible]);

  const handleExport = () => {
    const csv = generateCSV(
      visible,
      [
        { key: 'key', label: t('pages.licenseFeatures.key') },
        { key: 'label', label: t('pages.licenseFeatures.label') },
        { key: 'parent_key', label: t('pages.licenseFeatures.module') },
        { key: 'sort_order', label: t('pages.licenseFeatureGroups.sortOrder') },
        { key: 'state', label: t('common.status.label') },
        // ตัวเลขที่ใช้ตัดสินใจบนหน้าจอต้องติดไปกับไฟล์ที่เอาไปคุยกันต่อนอกหน้าจอด้วย
        { key: 'affected_bu_count', label: t('pages.licenseFeatures.affectedBuHeader') },
      ],
    );
    downloadCSV(csv, `license-features-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('toast.exported'));
  };

  /**
   * ยิงการเปลี่ยนสถานะจริง — ปิด toggle ระหว่างรอเพื่อไม่ให้ยิงซ้อน
   * 409 หมายถึงมีคนอื่นแก้แถวนี้ไปแล้ว: แจ้งแล้วดึงใหม่ทั้งชุด ไม่ใช่เขียนทับของเขา
   */
  const applyChange = useCallback(
    async (row: LicenseFeatureAdminRow, next: FeatureState) => {
      setSavingId(row.id);
      try {
        const response = await licenseFeatureService.setState(row.id, next, row.doc_version);
        /*
         * ผสานลงบนแถวเดิม ไม่ทับทั้งก้อน — endpoint `setState` ตอบกลับมาโดย **ไม่มี**
         * `affected_bu_count` (มีเฉพาะใน /all) การเอา response ไปวางแทนที่ตรง ๆ จึงลบตัวเลข
         * นั้นทิ้งหลังบันทึกครั้งแรก และเพราะ `handleChange` ใช้ `?? 0` แถวนั้นก็จะเงียบสนิท
         * ตอนกด `hide` ครั้งถัดไป — ข้ามกล่องยืนยันที่มีไว้กันการปิดเมนูของ BU ที่จ่ายเงินแล้ว
         */
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  ...response.data,
                  // เขียนชัด ไม่พึ่ง spread เพราะ key ที่มีอยู่จริงแต่เป็น undefined ก็ทับได้
                  affected_bu_count: response.data.affected_bu_count ?? r.affected_bu_count,
                }
              : r,
          ),
        );
        toast.success(t('pages.licenseFeatures.stateSaved'));
      } catch (err: unknown) {
        if (isVersionConflict(err)) {
          notifyVersionConflict(t);
          await fetchAll();
        } else {
          devLog('set license feature state failed', err);
          toast.error(getErrorDetail(err, t));
        }
      } finally {
        setSavingId(null);
      }
    },
    [t, fetchAll],
  );

  /**
   * ตัวกั้นก่อนบันทึก — `hide` เท่านั้นที่ต้องยืนยัน
   *
   * `hide` ลบเมนูออกจาก **ทุก BU ที่ถือคีย์นี้พร้อมกัน รวมลูกค้าที่จ่ายเงินไปแล้ว** เพราะ
   * `state` เป็นค่า global ไม่แยกตาม BU ส่วน `inactive` ไม่มีผลกับ runtime เลย (แค่ห้ามติ๊ก
   * เพิ่มใหม่ตอนขาย) การเตือนตรงนั้นด้วยจะกลายเป็นเสียงรบกวนที่คนกดผ่านโดยไม่อ่าน
   * แล้วพอถึง `hide` จริง ๆ ก็จะกดผ่านเหมือนกัน
   *
   * ไม่มีใครถือคีย์นี้ (`affected_bu_count` เป็น 0 หรือ gateway เก่าไม่ส่งมา) → บันทึกเลย
   * ไม่มีอะไรให้เตือน
   */
  const handleChange = useCallback(
    (row: LicenseFeatureAdminRow, next: FeatureState) => {
      if (next === row.state) return;
      if (next === 'hide' && (row.affected_bu_count ?? 0) > 0) {
        setPendingHide(row);
        return;
      }
      void applyChange(row, next);
    },
    [applyChange],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.licenseFeatures.title')}
          subtitle={t('pages.licenseFeatures.subtitle')}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={visible.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('common.action.export')}
            </Button>
          }
        />

        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pages.licenseFeatures.searchPlaceholder')}
                className="pl-9"
                aria-label={t('pages.licenseFeatures.searchPlaceholder')}
              />
            </div>
            <CatalogStateBar
              counts={counts}
              value={stateFilter}
              onChange={setStateFilter}
              labelKeys={LICENSE_STATE_LABEL}
              hintKeys={LICENSE_STATE_HINT}
            />
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-4">
              <FetchErrorState message={error} onRetry={() => void fetchAll()} />
            </CardContent>
          </Card>
        ) : loading && rows.length === 0 ? (
          <Card>
            <CardContent className="py-4">
              <TableSkeleton columns={3} rows={8} />
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-4">
              <EmptyState
                icon={Tags}
                title={t('pages.licenseFeatures.emptyTitle')}
                description={t('pages.licenseFeatures.emptyDescription')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <ModuleShelf
                key={g.moduleKey}
                group={g}
                onChange={handleChange}
                canManage={canManage}
                savingId={savingId}
                filtering={filtering}
                labelKeys={LICENSE_STATE_LABEL}
                hintKeys={LICENSE_STATE_HINT}
              />
            ))}
          </div>
        )}
      </div>

      {/* คำอธิบายต้องบอกด้วยว่า "กู้คืนได้" — นี่ไม่ใช่การลบข้อมูล ตั้งกลับเป็น active แล้วเมนู
          กลับมาเองภายใน 1 นาที (อายุ cache ของ gateway) การเตือนแรงเกินความจริงจะทำให้คน
          เลิกอ่านกล่องเตือน ซึ่งอันตรายกว่าไม่มีกล่องเลย */}
      <ConfirmDialog
        open={pendingHide !== null}
        onOpenChange={(open) => !open && setPendingHide(null)}
        title={t('pages.licenseFeatures.hideConfirmTitle')}
        description={t('pages.licenseFeatures.hideConfirmDescription', {
          label: pendingHide?.label ?? '',
          count: pendingHide?.affected_bu_count ?? 0,
        })}
        confirmText={t('pages.licenseFeatures.hideConfirmAction')}
        confirmVariant="destructive"
        onConfirm={async () => {
          const row = pendingHide;
          setPendingHide(null);
          if (row) await applyChange(row, 'hide');
        }}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title={t('pages.licenseFeatures.title')}
          endpoint="/api-system/platform/license-features/all"
          tabs={[
            { key: 'response', label: 'response', data: rawResponse },
            { key: 'visible', label: 'visible', data: visible },
            { key: 'groups', label: 'groups', data: groups },
          ]}
        />
      )}
    </Layout>
  );
};

export default LicenseFeatureManagement;
