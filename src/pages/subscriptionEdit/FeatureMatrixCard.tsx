import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Plus, Search, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { HIT_SLOP_44 } from '../../lib/hitSlop';
import { cn } from '../../lib/utils';
import subscriptionService from '../../services/subscriptionService';
import { devLog } from '../../utils/errorParser';
import { toast } from 'sonner';
import type { BusinessUnit, LicenseFeature, SubscriptionBu } from '../../types';
import {
  addBu,
  availableBus,
  copyFrom,
  filterGroups,
  groupCatalog,
  nextSelectedBuId,
  removeBu,
  removeFeatureKey,
  selectedChildCount,
  setModuleSelection,
  toggleFeature,
  unknownFeatureKeys,
} from './featureSelection';

export interface FeatureMatrixCardProps {
  bus: SubscriptionBu[];
  clusterBus: BusinessUnit[];
  onChange: (bus: SubscriptionBu[]) => void;
  /** No `subscription.manage` — read-only grouped display, no checkboxes / All-None / copy / add-remove. */
  readOnly: boolean;
}

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Per-BU feature entitlement editor — pick a BU, then an accordion grouped by module (pattern
 * copied from ApplicationEdit.tsx's API-catalog accordion). Not a feature × BU table: BU count
 * per cluster is unbounded, and putting the unbounded axis in columns is what breaks that layout
 * (task-B4-brief.md).
 *
 * Everything here mutates the parent's `bus` array via `onChange` — there is no per-card Save.
 * The shared bottom Save bar on SubscriptionEdit persists it (PUT .../features, replace
 * semantics) alongside the subscription-info PATCH.
 */
export function FeatureMatrixCard({ bus, clusterBus, onChange, readOnly }: FeatureMatrixCardProps) {
  const [catalog, setCatalog] = useState<LicenseFeature[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [selectedBuId, setSelectedBuId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [addBuId, setAddBuId] = useState('');
  const [copySourceId, setCopySourceId] = useState('');
  const [confirmRemoveBuId, setConfirmRemoveBuId] = useState<string | null>(null);
  const [confirmCopyOpen, setConfirmCopyOpen] = useState(false);

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

  // Self-healing selection: keeps `selectedBuId` pointed at a real row whenever `bus` changes
  // out from under this card (initial load, external reset, or this card's own edits flowing
  // back down through the controlled `bus` prop).
  useEffect(() => {
    if (bus.length === 0) {
      if (selectedBuId !== '') setSelectedBuId('');
      return;
    }
    if (!bus.some((b) => b.business_unit_id === selectedBuId)) {
      setSelectedBuId(bus[0].business_unit_id);
    }
  }, [bus, selectedBuId]);

  const toggleModule = (moduleKey: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  const handleAddBu = () => {
    if (!addBuId) return;
    onChange(addBu(bus, clusterBus, addBuId));
    setSelectedBuId(addBuId);
    setAddBuId('');
  };

  const requestRemoveBu = (buId: string) => setConfirmRemoveBuId(buId);

  const confirmRemoveBu = () => {
    if (!confirmRemoveBuId) return;
    const removedId = confirmRemoveBuId;
    const nextBus = removeBu(bus, removedId);
    onChange(nextBus);
    setSelectedBuId((prev) => nextSelectedBuId(nextBus, removedId, prev));
    setConfirmRemoveBuId(null);
  };

  const requestCopy = () => {
    if (!copySourceId || !selectedBuId) return;
    setConfirmCopyOpen(true);
  };

  const confirmCopy = () => {
    const source = bus.find((b) => b.business_unit_id === copySourceId);
    onChange(copyFrom(bus, copySourceId, selectedBuId));
    if (source) toast.success(`คัดลอกสิทธิ์จาก ${source.bu_name} แล้ว`);
    setConfirmCopyOpen(false);
    setCopySourceId('');
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

  const available = availableBus(bus, clusterBus);
  const currentBu = bus.find((b) => b.business_unit_id === selectedBuId);
  const selected = new Set(currentBu?.feature_keys ?? []);
  // คีย์ที่สัญญาผูกไว้แต่ไม่มีใน catalog ที่ active แล้ว — ต้องมองเห็นและถอดออกได้ ไม่ใช่ถูกกรอง
  // ทิ้งเงียบ ๆ แล้วยังถูกส่งกลับไปทุกครั้งจนบันทึกไม่ได้ตลอดกาล (review I3)
  const unknownKeys = unknownFeatureKeys(currentBu?.feature_keys ?? [], catalog);
  const groups = groupCatalog(catalog);
  const visibleGroups = filterGroups(groups, query);
  const removingBu = confirmRemoveBuId ? bus.find((b) => b.business_unit_id === confirmRemoveBuId) : undefined;
  const copySourceBu = bus.find((b) => b.business_unit_id === copySourceId);

  if (bus.length === 0) {
    return readOnly ? (
      <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีหน่วยธุรกิจในสัญญานี้</p>
    ) : (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          ยังไม่มีหน่วยธุรกิจในสัญญานี้ — เพิ่มหน่วยธุรกิจเพื่อเริ่มกำหนดสิทธิ์
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={addBuId}
            onChange={(e) => setAddBuId(e.target.value)}
            disabled={available.length === 0}
            className={cn(selectClassName, 'w-auto min-w-56')}
            aria-label="เลือกหน่วยธุรกิจที่จะเพิ่ม"
          >
            <option value="">เลือกหน่วยธุรกิจ…</option>
            {available.map((cb) => (
              <option key={cb.id} value={cb.id}>{cb.code} - {cb.name}</option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" disabled={!addBuId} onClick={handleAddBu}>
            <Plus className="mr-2 h-4 w-4" />
            เพิ่มหน่วยธุรกิจ
          </Button>
        </div>
      </div>
    );
  }

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
              onClick={() => onChange(removeFeatureKey(bus, selectedBuId, k))}
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

  return (
    <div className="space-y-4">
      {/* BU picker */}
      <div className="flex flex-wrap items-center gap-2">
        {bus.map((b) => (
          <div key={b.business_unit_id} className="flex items-center">
            <button
              type="button"
              onClick={() => setSelectedBuId(b.business_unit_id)}
              aria-pressed={b.business_unit_id === selectedBuId}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                b.business_unit_id === selectedBuId
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              {b.bu_name}
            </button>
            {!readOnly && (
              <button
                type="button"
                aria-label={`ถอด ${b.bu_name} ออกจากสัญญา`}
                onClick={() => requestRemoveBu(b.business_unit_id)}
                className={cn('ml-0.5 text-muted-foreground hover:text-destructive', HIT_SLOP_44)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <select
              value={addBuId}
              onChange={(e) => setAddBuId(e.target.value)}
              disabled={available.length === 0}
              className={cn(selectClassName, 'h-8 w-auto min-w-40 text-xs')}
              aria-label="เลือกหน่วยธุรกิจที่จะเพิ่ม"
            >
              <option value="">+ เพิ่มหน่วยธุรกิจ…</option>
              {available.map((cb) => (
                <option key={cb.id} value={cb.id}>{cb.code} - {cb.name}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={!addBuId} onClick={handleAddBu}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              เพิ่ม
            </Button>
          </div>
        )}
      </div>

      {currentBu && (
        <>
          {!readOnly && bus.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                className={cn(selectClassName, 'h-8 w-auto min-w-48 text-xs')}
                aria-label="คัดลอกสิทธิ์จากหน่วยธุรกิจ"
              >
                <option value="">คัดลอกสิทธิ์จาก…</option>
                {bus
                  .filter((b) => b.business_unit_id !== selectedBuId)
                  .map((b) => (
                    <option key={b.business_unit_id} value={b.business_unit_id}>{b.bu_name}</option>
                  ))}
              </select>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={!copySourceId} onClick={requestCopy}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                คัดลอก
              </Button>
            </div>
          )}

          {readOnly ? (
            selected.size === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีสิทธิ์ที่กำหนดให้ {currentBu.bu_name}</p>
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
            )
          ) : (
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
                                onChange(setModuleSelection(bus, selectedBuId, g.module.key, childKeys, !allSelected))
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
                                    onClick={() => onChange(toggleFeature(bus, selectedBuId, c.key, !isSelected))}
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
                {selectedChildCount(currentBu.feature_keys, catalog)} รายการที่เลือก
              </p>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmRemoveBuId !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemoveBuId(null); }}
        title="ถอดหน่วยธุรกิจออกจากสัญญา?"
        description={`สิทธิ์ทั้งหมดของ ${removingBu?.bu_name ?? ''} ในสัญญานี้จะถูกลบ — มีผลหลังกด Save Changes`}
        confirmText="ถอดออก"
        confirmVariant="destructive"
        onConfirm={confirmRemoveBu}
      />
      <ConfirmDialog
        open={confirmCopyOpen}
        onOpenChange={setConfirmCopyOpen}
        title="คัดลอกสิทธิ์ทับของเดิม?"
        description={`สิทธิ์ปัจจุบันของ ${currentBu?.bu_name ?? ''} จะถูกแทนที่ทั้งหมดด้วยสิทธิ์ของ ${copySourceBu?.bu_name ?? ''}`}
        confirmText="คัดลอก"
        onConfirm={confirmCopy}
      />
    </div>
  );
}
