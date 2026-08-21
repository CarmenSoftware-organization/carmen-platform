import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/EmptyState';
import { HIT_SLOP_44 } from '../../lib/hitSlop';
import { cn } from '../../lib/utils';
import subscriptionService from '../../services/subscriptionService';
import { devLog } from '../../utils/errorParser';
import type { LicenseFeature } from '../../types';
import {
  filterGroups,
  groupCatalog,
  removeFeatureKey,
  selectedChildCount,
  setModuleSelection,
  toggleFeature,
  unknownFeatureKeys,
} from './featureSelection';

export interface FeatureSelectionCardProps {
  /** สิทธิ์ทั้งชุดของสัญญา — สัญญาหนึ่งใบผูก BU เดียว จึงเป็น array ของ key ตรง ๆ ไม่ใช่ราย BU */
  featureKeys: string[];
  /** ชื่อ BU ของสัญญา — ใช้ในข้อความเท่านั้น `null` = ข้อมูลผิดรูปจากยุคก่อน migration */
  buName: string | null;
  onChange: (featureKeys: string[]) => void;
  /** No `subscription.manage` — read-only grouped display, no checkboxes / All-None. */
  readOnly: boolean;
}

/**
 * Feature entitlement editor for one contract — an accordion grouped by module (pattern copied
 * from ApplicationEdit.tsx's API-catalog accordion).
 *
 * เดิมชื่อ `FeatureMatrixCard` และมีแกน BU: เลือก BU ก่อนแล้วค่อยติ๊กสิทธิ์ พร้อมปุ่มเพิ่ม/ถอด BU
 * และคัดลอกสิทธิ์ข้าม BU · ตอนนี้หนึ่งสัญญาผูก BU เดียวที่กำหนดตอนสร้างและเปลี่ยนไม่ได้ แกนนั้นจึง
 * หายไปทั้งแกน — การ "เปลี่ยนคู่สัญญา" ไม่ใช่การกระทำที่ทำผ่านหน้าแก้สิทธิ์ได้อีกต่อไป
 *
 * Everything here mutates the parent's `featureKeys` via `onChange` — there is no per-card Save.
 * The shared bottom Save bar on SubscriptionEdit persists it (PUT .../features, replace
 * semantics) alongside the subscription-info PATCH.
 */
export function FeatureSelectionCard({
  featureKeys,
  buName,
  onChange,
  readOnly,
}: FeatureSelectionCardProps) {
  const [catalog, setCatalog] = useState<LicenseFeature[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    setCatalogFailed(false);
    subscriptionService
      .getFeatureCatalog()
      .then((res) => setCatalog(res?.data ?? []))
      .catch((err) => {
        setCatalogFailed(true);
        devLog('Failed to load license feature catalog:', err);
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

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
        title="โหลดรายการสิทธิ์ไม่สำเร็จ"
        description="ยังแก้สิทธิ์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"
        action={<Button size="sm" onClick={loadCatalog}>ลองใหม่</Button>}
      />
    );
  }

  if (catalogLoading) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground" role="status">
        กำลังโหลดรายการสิทธิ์…
      </p>
    );
  }

  const selected = new Set(featureKeys);
  // คีย์ที่สัญญาผูกไว้แต่ไม่มีใน catalog ที่ active แล้ว — ต้องมองเห็นและถอดออกได้ ไม่ใช่ถูกกรอง
  // ทิ้งเงียบ ๆ แล้วยังถูกส่งกลับไปทุกครั้งจนบันทึกไม่ได้ตลอดกาล (review I3)
  const unknownKeys = unknownFeatureKeys(featureKeys, catalog);
  const groups = groupCatalog(catalog);
  const visibleGroups = filterGroups(groups, query);

  // กลุ่มเล็ก ๆ ท้ายรายการสำหรับคีย์ที่ไม่รู้จัก — โหมดอ่านอย่างเดียวแสดงเฉย ๆ (ไม่มีปุ่ม) โหมดแก้
  // มีปุ่มถอดทีละคีย์ · **ไม่ถอดให้อัตโนมัติ** การแก้ payload ให้เงียบ ๆ คือการเปลี่ยนสัญญาของลูกค้า
  // โดยที่ไม่มีใครเห็นว่าเปลี่ยนอะไรไป
  const unknownBlock = unknownKeys.length > 0 && (
    <div className="space-y-1.5 rounded-md border border-dashed border-warning/50 bg-warning/5 p-2">
      <p className="text-xs font-medium text-muted-foreground">
        ไม่รู้จัก (ถูกปิดใช้งาน) ({unknownKeys.length})
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
              aria-label={`ถอดสิทธิ์ที่ไม่รู้จัก ${k}`}
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
          ? 'สิทธิ์เหล่านี้ถูกปิดใช้งานในระบบแล้ว แต่ยังผูกอยู่กับสัญญานี้'
          : 'สิทธิ์เหล่านี้ถูกปิดใช้งานในระบบแล้ว — ต้องถอดออกก่อน จึงจะบันทึกสิทธิ์ของสัญญานี้ได้'}
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
          <p className="text-sm text-muted-foreground">
            ยังไม่มีสิทธิ์ที่กำหนดให้{buName ? ` ${buName}` : 'สัญญานี้'}
          </p>
        ) : (
          <div className="space-y-3">
            {groups
              .map((g) => ({ ...g, children: g.children.filter((c) => selected.has(c.key)) }))
              .filter((g) => g.children.length > 0)
              .map((g) => (
                <div key={g.module.key} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
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
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาโมดูลหรือสิทธิ์..."
          className="pl-9 pr-9"
          aria-label="ค้นหาสิทธิ์"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="ล้างการค้นหา"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-md border border-input p-2">
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีรายการสิทธิ์ในระบบ</p>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-md border border-input p-2">
          <p className="text-sm text-muted-foreground text-center py-4">
            ไม่พบสิทธิ์ที่ตรงกับ &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleExpandAllVisible}>
              {allVisibleExpanded ? 'หุบทั้งหมด' : 'กางทั้งหมด'}
            </Button>
          </div>
          <div className="rounded-md border border-input max-h-96 overflow-y-auto divide-y">
            {visibleGroups.map((g) => {
              const expanded = isExpanded(g.module.key);
              const count = g.children.filter((c) => selected.has(c.key)).length;
              const allSelected = g.children.length > 0 && count === g.children.length;
              const childKeys = g.children.map((c) => c.key);
              return (
                <div key={g.module.key}>
                  <div className="flex items-center gap-2 px-2">
                    <button
                      type="button"
                      onClick={() => { if (!query) toggleModule(g.module.key); }}
                      className="flex min-h-11 flex-1 items-center gap-1.5 text-left text-sm font-medium"
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{g.module.label}</span>
                      <Badge variant={count > 0 ? 'default' : 'secondary'} className="text-xs">
                        {count}/{g.children.length}
                      </Badge>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn('h-6 text-xs', HIT_SLOP_44)}
                      aria-label={allSelected ? `ไม่เอาทั้งหมดใน ${g.module.label}` : `เอาทั้งหมดใน ${g.module.label}`}
                      onClick={() =>
                        onChange(setModuleSelection(featureKeys, g.module.key, childKeys, !allSelected))
                      }
                    >
                      {allSelected ? 'ไม่เอา' : 'ทั้งหมด'}
                    </Button>
                  </div>
                  {expanded && (
                    <div className="flex flex-wrap gap-1.5 px-2 pb-2 pl-7">
                      {g.children.map((c) => {
                        const isSelected = selected.has(c.key);
                        return (
                          <Button
                            key={c.key}
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs gap-1"
                            title={c.key}
                            aria-pressed={isSelected}
                            onClick={() => onChange(toggleFeature(featureKeys, c.key, !isSelected))}
                          >
                            {c.label}
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
        </>
      )}
      {unknownBlock}
      {/* นับเฉพาะ "ลูก" ให้ตรงกับผลรวมของ badge count/total ต่อโมดูลข้างบน — key ของ
          module ถูกติ๊กอัตโนมัติตามลูก ถ้านับด้วยจะกลายเป็น "2 รายการ" ทั้งที่เลือกลูกเดียว
          (review M5) */}
      <p className="text-xs text-muted-foreground">
        {selectedChildCount(featureKeys, catalog)} รายการที่เลือก
      </p>
    </div>
  );
}
