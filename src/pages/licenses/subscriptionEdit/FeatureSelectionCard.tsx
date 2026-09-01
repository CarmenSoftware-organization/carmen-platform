import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/EmptyState';
import { AllocationTicks } from '../../clusterAdmin/AllocationTicks';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';
import type { LicenseFeature } from '../../../types';
import {
  filterGroups,
  groupCatalog,
  removeFeatureKey,
  setModuleSelection,
  toggleFeature,
  unknownFeatureKeys,
} from './featureSelection';

export interface FeatureSelectionCardProps {
  /** สิทธิ์ทั้งชุดของกลุ่ม — array ของ key ตรง ๆ */
  featureKeys: string[];
  /**
   * แค็ตตาล็อกที่ **ผู้เรียกโหลดมา** ไม่ใช่ที่การ์ดยิงเอง — หน้าแก้ไขกลุ่มสิทธิ์ต้องใช้ชุดเดียวกันนี้
   * วาดแถบสัดส่วนบนหัวหน้าด้วย ถ้าต่างคนต่างยิงจะมีจังหวะที่สองที่บนจอเดียวกันพูดคนละยอด
   */
  catalog: LicenseFeature[];
  catalogLoading: boolean;
  catalogFailed: boolean;
  onReloadCatalog: () => void;
  onChange: (featureKeys: string[]) => void;
  /** ไม่มีสิทธิ์แก้ — แสดงเป็นรายการที่เลือกไว้เฉย ๆ ไม่มีช่องติ๊ก ไม่มีปุ่ม All/None */
  readOnly: boolean;
  /** ข้อความตอนยังไม่มี feature ถูกเลือก */
  emptyMessage: string;
}

/**
 * ตัวเลือกสิทธิ์ของ **หนึ่งชุดสิทธิ์** — หีบเพลงแยกตาม module
 *
 * เดิมชื่อ `FeatureMatrixCard` และมีแกน BU · หน้าขายสัญญาไม่ใช้การ์ดนี้แล้ว (เฟส 4 ถอดสิทธิ์
 * ราย feature ออกจากสัญญาทั้งหมด) เหลือผู้เรียกเดียวคือ `LicenseFeatureGroupEdit` ซึ่งบันทึกผ่าน
 * `licenseFeatureGroupService.setFeatures` (`PUT /license-feature-groups/:id/features`,
 * replace semantics) — การ์ดนี้ไม่มี Save ของตัวเอง ทุกอย่างดันขึ้นไปที่ `onChange`
 *
 * ## สามอย่างที่รอบรื้อนี้แก้
 *
 * **1. คำว่า "ทั้งหมด" เคยมีสองความหมายในคอลัมน์เดียวกัน** ปุ่ม `กางทั้งหมด` (พับ/กางหีบเพลง)
 * ลอยชิดขวาอยู่เหนือแถวของปุ่ม `ทั้งหมด`/`ไม่เอา` (ติ๊กสิทธิ์ทั้งโมดูล) — ขนาดเท่ากัน ghost
 * เหมือนกัน ขอบขวาตรงกัน · นี่ไม่ใช่เรื่องความสวย: กดผิดปุ่มคือติ๊กสิทธิ์เพิ่มให้ทุกสัญญาที่ผูก
 * ชุดนี้ ตอนนี้ตัวพับ/กางย้ายไปอยู่ซ้ายคู่กับช่องค้นหา มีไอคอนของตัวเอง และใช้คำว่า `กาง`/`พับ`
 * ที่ไม่ใช่คำเดียวกับปุ่มติ๊กอีกต่อไป
 *
 * **2. `2/2` กับ `0/9` เคยหนักตาเท่ากันเป๊ะ** ป้ายเลขเล็ก ๆ เป็นสัญญาณเดียว ต้องอ่านทีละหลักถึงจะ
 * รู้ว่าโมดูลไหนคือแก่นของชุดนี้ ตอนนี้ทุกแถวมีแถบขีดหนึ่งขีดต่อหนึ่งสิทธิ์ (`AllocationTicks`
 * ตัวเดียวกับที่โควตาที่นั่งใช้) — โมดูลที่ครบเป็นกำแพงทึบ โมดูลที่ว่างเป็นรางเปล่า อ่านออกโดย
 * ไม่ต้องอ่านเลข · ขีดนับได้จึงไม่โกหกเรื่องแกนแบบที่แถบสัดส่วนต่อแถวจะโกหก (ดู
 * `FeatureCompositionBar`) และโมดูลที่ยังไม่ถูกเลือกเลยจางลงหนึ่งขั้น แทนที่จะแย่งสายตาเท่าตัวที่มี
 *
 * **3. กล่องเลื่อนซ้อนกล่องเลื่อน** หีบเพลงเคยถูกขังใน `max-h-96 overflow-y-auto` กลางการ์ด
 * กลางหน้าที่เลื่อนได้อยู่แล้ว — บนหน้าที่ทั้งหน้ามีไว้ทำสิ่งนี้อย่างเดียว การขังของหลักไว้ใน 384px
 * แล้วปล่อยที่ว่างรอบ ๆ คือการสลับที่กันระหว่างของหลักกับกรอบ ตอนนี้รายการยาวเท่าที่มันยาว
 * แล้วให้หน้าเลื่อน
 */
export function FeatureSelectionCard({
  featureKeys,
  catalog,
  catalogLoading,
  catalogFailed,
  onReloadCatalog,
  onChange,
  readOnly,
  emptyMessage,
}: FeatureSelectionCardProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const toggleModule = (moduleKey: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  if (catalogFailed) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('pages.subscriptions.featuresLoadFailed')}
        description={t('pages.subscriptions.featuresLoadFailedHint')}
        action={<Button size="sm" onClick={onReloadCatalog}>{t('common.action.retry')}</Button>}
      />
    );
  }

  if (catalogLoading) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm" role="status">
        {t('pages.subscriptions.featuresLoading')}
      </p>
    );
  }

  const selected = new Set(featureKeys);
  // คีย์ที่กลุ่มผูกไว้แต่ไม่มีใน catalog ที่ active แล้ว — ต้องมองเห็นและถอดออกได้ ไม่ใช่ถูกกรอง
  // ทิ้งเงียบ ๆ แล้วยังถูกส่งกลับไปทุกครั้งจนบันทึกไม่ได้ตลอดกาล (review I3)
  const unknownKeys = unknownFeatureKeys(featureKeys, catalog);
  const groups = groupCatalog(catalog);
  const visibleGroups = filterGroups(groups, query);

  // กลุ่มเล็ก ๆ ท้ายรายการสำหรับคีย์ที่ไม่รู้จัก — โหมดอ่านอย่างเดียวแสดงเฉย ๆ (ไม่มีปุ่ม) โหมดแก้
  // มีปุ่มถอดทีละคีย์ · **ไม่ถอดให้อัตโนมัติ** การแก้ payload ให้เงียบ ๆ คือการเปลี่ยนสิ่งที่ลูกค้า
  // ได้รับโดยที่ไม่มีใครเห็นว่าเปลี่ยนอะไรไป
  const unknownBlock = unknownKeys.length > 0 && (
    <div className="border-warning/50 bg-warning/5 space-y-1.5 rounded-md border border-dashed p-2">
      <p className="text-muted-foreground text-xs font-medium">
        {t('pages.subscriptions.unrecognisedDisabled', { count: unknownKeys.length })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {unknownKeys.map((k) =>
          readOnly ? (
            <Badge key={k} variant="outline" className="font-mono text-xs" title={k}>{k}</Badge>
          ) : (
            <Button
              key={k}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 font-mono text-xs"
              aria-label={t('pages.subscriptions.removeUnrecognised', { key: k })}
              onClick={() => onChange(removeFeatureKey(featureKeys, k))}
            >
              {k}
              <X className="h-3 w-3" />
            </Button>
          ),
        )}
      </div>
      <p className="text-muted-foreground text-[11px]">
        {readOnly
          ? t('pages.subscriptions.disabledStillAttached')
          : t('pages.subscriptions.disabledMustRemove')}
      </p>
    </div>
  );

  const allVisibleModules = visibleGroups.map((g) => g.module.key);
  const allVisibleExpanded = query
    ? true
    : allVisibleModules.length > 0 && allVisibleModules.every((m) => expandedModules.has(m));
  const isExpanded = (moduleKey: string) => (query ? true : expandedModules.has(moduleKey));

  const toggleExpandAllVisible = () => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (allVisibleExpanded) {
        allVisibleModules.forEach((m) => next.delete(m));
      } else {
        allVisibleModules.forEach((m) => next.add(m));
      }
      return next;
    });
  };

  if (readOnly) {
    return (
      <div className="space-y-4">
        {selected.size === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {groups
              .map((g) => ({ ...g, children: g.children.filter((c) => selected.has(c.key)) }))
              .filter((g) => g.children.length > 0)
              .map((g) => (
                <div key={g.module.key} className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium">
                    {g.module.label} <span className="text-muted-foreground">({g.children.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.children.map((c) => (
                      <Badge key={c.key} variant="outline" className="text-xs" title={c.key}>{c.label}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            {unknownBlock}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ค้นหากับพับ/กางอยู่แถวเดียวกัน — ทั้งคู่คือ "จะมองรายการนี้ยังไง" คนละเรื่องกับ
          "จะเอาสิทธิ์ตัวไหน" ที่อยู่ชิดขวาในแต่ละแถวข้างล่าง การแยกฝั่งคือสิ่งที่ทำให้สองคำสั่ง
          ไม่ถูกอ่านเป็นคำสั่งเดียวกันอีก */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pages.subscriptions.searchFeaturesPlaceholder')}
            className="pr-9 pl-9"
            aria-label={t('pages.subscriptions.searchFeatures')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
              aria-label={t('common.clearSearch')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* ระหว่างค้นหา ทุกโมดูลถูกกางบังคับอยู่แล้ว ปุ่มนี้จึงไม่มีอะไรให้ทำ — ซ่อนดีกว่าเสิร์ฟ
            ปุ่มที่กดแล้วไม่เกิดอะไร */}
        {!query && visibleGroups.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={toggleExpandAllVisible}
          >
            {allVisibleExpanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            )}
            {allVisibleExpanded
              ? t('pages.licenseFeatureGroups.collapseShort')
              : t('pages.licenseFeatureGroups.expandShort')}
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="border-input rounded-md border p-2">
          <p className="text-muted-foreground py-4 text-center text-sm">{t('pages.subscriptions.noFeaturesDefined')}</p>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="border-input rounded-md border p-2">
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t('pages.subscriptions.noFeaturesMatch', { query })}
          </p>
        </div>
      ) : (
        <div className="border-input divide-y rounded-md border">
          {visibleGroups.map((g) => {
            const expanded = isExpanded(g.module.key);
            const count = g.children.filter((c) => selected.has(c.key)).length;
            const childKeys = g.children.map((c) => c.key);
            /**
             * module ที่ `inactive` และยังไม่ถูกเลือก จะบล็อกลูกทุกตัวของมัน — เพราะกฎ
             * "ลูกลากพ่อ" ฝั่ง backend เติม module แม่ให้อัตโนมัติ การติ๊กลูกจึงเท่ากับ
             * พยายามเพิ่ม module ที่เลิกขายแล้วเข้ากลุ่ม ซึ่ง backend ตอบ 422
             */
            const moduleBlocked = g.module.state === 'inactive' && !selected.has(g.module.key);
            /**
             * ติ๊กเพิ่มได้เฉพาะตัวที่ `active` (และ module แม่ไม่ถูกบล็อก) ส่วนตัวที่เลือกไว้แล้ว
             * นับรวมเสมอ เพื่อให้ปุ่ม All/None ยังกดเคลียร์ของเดิมออกได้
             */
            const selectableChildKeys = g.children
              .filter((c) => selected.has(c.key) || (c.state === 'active' && !moduleBlocked))
              .map((c) => c.key);
            const allSelected =
              selectableChildKeys.length > 0 && count === selectableChildKeys.length;
            const fillLabel = t('pages.licenseFeatureGroups.moduleFill', {
              module: g.module.label,
              count,
              total: g.children.length,
            });
            return (
              <div key={g.module.key}>
                <div className="flex items-center gap-3 px-2">
                  <button
                    type="button"
                    onClick={() => { if (!query) toggleModule(g.module.key); }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    {/* โมดูลที่ยังไม่มีอะไรถูกเลือกจางลงหนึ่งขั้นและไม่หนา — มันยังอยู่ในที่เดิม
                        (รายการที่สลับลำดับเองตอนคลิกคือรายการที่ติ๊กไม่ได้) แต่เลิกแย่งสายตา
                        กับโมดูลที่เป็นแก่นของชุดนี้จริง ๆ */}
                    <span className={cn('truncate', count > 0 ? 'font-medium' : 'text-muted-foreground')}>
                      {g.module.label}
                    </span>
                  </button>
                  <span
                    className={cn(
                      'w-12 shrink-0 text-right text-xs tabular-nums',
                      count > 0 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {count}/{g.children.length}
                  </span>
                  {/* หนึ่งขีดต่อหนึ่งสิทธิ์ ไม่ใช่แถบสัดส่วน — ขีดนับได้ ความยาวแถบเทียบข้ามแถว
                      ไม่ได้ (ตัวหารต่างกันทุกแถว) · ต่ำกว่า sm ซ่อนไป เพราะที่ 390px ชื่อโมดูล
                      ต้องได้ความกว้างก่อน */}
                  <AllocationTicks
                    className="hidden w-28 shrink-0 sm:flex"
                    used={count}
                    cap={g.children.length}
                    level="none"
                    fillClassName="bg-primary"
                    label={fillLabel}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn('h-6 shrink-0 text-xs', HIT_SLOP_44)}
                    aria-label={
                      allSelected
                        ? t('pages.subscriptions.clearAllIn', { module: g.module.label })
                        : t('pages.subscriptions.selectAllIn', { module: g.module.label })
                    }
                    onClick={() =>
                      onChange(
                        setModuleSelection(
                          featureKeys,
                          g.module.key,
                          allSelected ? childKeys : selectableChildKeys,
                          !allSelected,
                        ),
                      )
                    }
                  >
                    {allSelected ? t('pages.subscriptions.none') : t('common.option.all')}
                  </Button>
                </div>
                {expanded && (
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2 pl-7">
                    {g.children.map((c) => {
                      const isSelected = selected.has(c.key);
                      // เลิกขายของใหม่: ถอดของเดิมออกได้ แต่ติ๊กเพิ่มไม่ได้ — ตรงกับกติกาฝั่ง
                      // backend เป๊ะ ถ้าปิดทั้งสองทาง ผู้ใช้จะถอดของที่เลิกขายแล้วออกไม่ได้เลย
                      const cannotAdd =
                        !isSelected && (c.state === 'inactive' || moduleBlocked);
                      return (
                        <Button
                          key={c.key}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          title={
                            cannotAdd
                              ? `${c.key} — ${t('pages.licenseFeatures.state.inactiveHint')}`
                              : c.key
                          }
                          aria-pressed={isSelected}
                          disabled={cannotAdd}
                          onClick={() => onChange(toggleFeature(featureKeys, c.key, !isSelected))}
                        >
                          {c.label}
                          {c.state === 'inactive' && (
                            <span className="text-[10px] opacity-70">
                              ({t('pages.licenseFeatures.state.inactive')})
                            </span>
                          )}
                          {isSelected && <X className="h-3 w-3" />}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {unknownBlock}
      {/* ยอดรวมกับการกระทบยอด 27/33 ย้ายขึ้นไปอยู่ที่ `GroupCompositionPanel` บนหัวหน้าแล้ว —
          ตัวเลขที่นิยามว่าชุดนี้คือชุดอะไรไม่ควรเป็นบรรทัดสุดท้ายใต้ของทุกอย่าง */}
    </div>
  );
}
