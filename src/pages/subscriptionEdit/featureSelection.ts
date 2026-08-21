import type { LicenseFeature } from '../../types';

/**
 * Pure state-transition logic for `FeatureSelectionCard` — kept out of the component so it can be
 * unit-tested directly rather than exercised only by clicking through the UI (task-B4
 * corrections §4). Every function here is a plain `(state, …args) => nextState` transform; none
 * of them call `onChange`, touch `useState`, or hit the network.
 *
 * สถานะที่ทุกฟังก์ชันแปลงคือ `string[]` ของ feature key ตรง ๆ — เดิมเป็น `SubscriptionBu[]`
 * เพราะใบเดียวผูกได้หลาย BU ตอนนี้หนึ่งใบผูก BU เดียว แกน BU จึงหายไปทั้งแกน
 * (`addBu` `removeBu` `copyFrom` `availableBus` `nextSelectedBuId` `toFeaturesPayload` ถูกลบ)
 */

export interface FeatureGroup {
  module: LicenseFeature;
  children: LicenseFeature[];
}

/**
 * Module key = the text before the first '.'. A bare top-level key (no '.') is its own module —
 * matches the backend's own rule (phase-b-backend-contract.md §5) so the UI never disagrees with
 * how the server composed the catalog.
 */
export function moduleOf(key: string): string {
  const i = key.indexOf('.');
  return i === -1 ? key : key.slice(0, i);
}

/**
 * ลำดับเดียวกับ backend เป๊ะ: `sort_order asc` แล้วต่อด้วย `key asc`
 * (`subscription.service.ts:588-591`) — ไม่มี tiebreaker แปลว่าสอง feature ที่ `sort_order` เท่ากัน
 * สลับที่กันเองได้ทุก render และไม่ตรงกับที่ server ส่งมา (review M11) · เทียบ `key` ด้วย `<`/`>`
 * ไม่ใช่ `localeCompare` เพื่อให้เป็นลำดับ byte เดียวกับ Postgres ไม่ใช่ลำดับตาม locale ของเบราว์เซอร์
 */
function byOrderThenKey(a: LicenseFeature, b: LicenseFeature): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * module → children, sorted. `parent_key === null` is a top-level module (contract §5); the
 * backend already returns rows pre-sorted by `sort_order` then `key`, but re-sorting here is
 * cheap and keeps this function correct even if that guarantee ever changes.
 */
export function groupCatalog(catalog: LicenseFeature[]): FeatureGroup[] {
  const modules = catalog
    .filter((f) => f.parent_key === null)
    .slice()
    .sort(byOrderThenKey);
  return modules.map((m) => ({
    module: m,
    children: catalog
      .filter((f) => f.parent_key === m.key)
      .slice()
      .sort(byOrderThenKey),
  }));
}

/**
 * feature key ของ BU ที่ไม่มีอยู่ใน catalog ที่ active — เกิดขึ้นเมื่อ feature ถูก `is_active: false`
 * หลังจากสัญญาผูกมันไว้แล้ว (catalog กรองเฉพาะ active, contract §5)
 *
 * ต้องแสดงให้เห็น ไม่ใช่กรองทิ้งเงียบ ๆ: `PUT .../features` เป็น replace semantics และ backend
 * ตอบ **422 "feature key ที่ไม่รู้จัก: …"** ทุกครั้งที่ยังส่งคีย์นั้นกลับไป → ตกสาขา generic →
 * `getErrorDetail` redact ใน production → ผู้ใช้เห็นแค่ "Please try again later." กดกี่ครั้งก็เหมือนเดิม
 * โดยไม่มีปุ่มไหนถอดมันออกได้เลย (review I3)
 */
export function unknownFeatureKeys(featureKeys: string[], catalog: LicenseFeature[]): string[] {
  const known = new Set(catalog.map((f) => f.key));
  return featureKeys.filter((k) => !known.has(k)).slice().sort();
}

/**
 * ถอด feature key ออกจาก BU หนึ่งใบแบบตรงตัว — ไม่แตะคีย์อื่นเลย
 *
 * ต่างจาก `toggleFeature(..., false)` โดยตั้งใจ: ตัวนั้นรักษา invariant module↔children ด้วย
 * (ถอดลูกตัวสุดท้ายแล้วถอด module ตามให้) ซึ่งถูกสำหรับคีย์ที่อยู่ใน catalog แต่ผิดสำหรับคีย์
 * ที่ไม่รู้จัก — `moduleOf('procurement.legacy')` คือ `'procurement'` ที่ยังใช้งานได้อยู่ การกด
 * "ถอด" คีย์ที่ตายแล้วต้องไม่ไปถอดโมดูลที่ยังมีชีวิตทิ้ง
 */
export function removeFeatureKey(featureKeys: string[], key: string): string[] {
  return featureKeys.filter((k) => k !== key);
}

/**
 * จำนวน feature ที่เลือกไว้ **นับเฉพาะลูก** (`parent_key !== null`)
 *
 * key ของ module ถูกเลือกอัตโนมัติเมื่อมีลูกถูกเลือก (ดู `toggleFeature`) ถ้านับรวมด้วย ตัวเลข
 * "N รายการที่เลือก" จะไม่ตรงกับผลรวมของ badge `count/total` ต่อโมดูลที่อยู่เหนือมันบนจอเดียวกัน
 * — เลือกลูกตัวเดียวแล้วขึ้น "2 รายการที่เลือก" (review M5) · คีย์ที่ไม่อยู่ใน catalog ไม่ถูกนับ
 * เพราะมีบล็อก "ไม่รู้จัก" นับให้ต่างหากอยู่แล้ว
 */
export function selectedChildCount(featureKeys: string[], catalog: LicenseFeature[]): number {
  const children = new Set(catalog.filter((f) => f.parent_key !== null).map((f) => f.key));
  return featureKeys.filter((k) => children.has(k)).length;
}

/**
 * Search filter: a group matches if its module label/key matches, or any child does. When only
 * children match, the group is kept with just the matching children (not the whole set) — a
 * group whose module label matches keeps every child, mirroring ApplicationEdit's catalog filter.
 */
export function filterGroups(groups: FeatureGroup[], query: string): FeatureGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => {
      const moduleMatch = g.module.label.toLowerCase().includes(q) || g.module.key.toLowerCase().includes(q);
      if (moduleMatch) return g;
      const children = g.children.filter(
        (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
      );
      return { ...g, children };
    })
    .filter((g) => g.children.length > 0);
}

/**
 * Toggle one feature, keeping the module-parent invariant: a child selected implies its module
 * is selected, and a module with no selected children is not selected either. Backend re-derives
 * the parent on save regardless, but the UI must agree with it the moment a box is checked, or
 * "procurement unchecked but Purchase Request checked" reads as broken.
 *
 * The `startsWith(`${module}.`)` prefix (WITH the trailing dot) is load-bearing: without it,
 * clearing `procurement` would also clear an unrelated module named `procurement_extra`.
 */
export function toggleFeature(featureKeys: string[], key: string, checked: boolean): string[] {
  const next = new Set(featureKeys);
  const module = moduleOf(key);
  const childPrefix = `${module}.`;

  if (checked) {
    next.add(key);
    next.add(module);
  } else {
    next.delete(key);
    if (key === module) {
      Array.from(next).forEach((k) => { if (k.startsWith(childPrefix)) next.delete(k); });
    } else {
      const hasChild = Array.from(next).some((k) => k.startsWith(childPrefix));
      if (!hasChild) next.delete(module);
    }
  }
  return Array.from(next).sort();
}

/**
 * Select/deselect every child of one module (+ the module itself) in one shot — backs the
 * "ทั้งหมด / ไม่เอา" buttons. `toggleFeature` alone can't do "select all children" because
 * `checked: true` with `key === module` only adds the module key, not its children.
 */
export function setModuleSelection(
  featureKeys: string[],
  moduleKey: string,
  childKeys: string[],
  selected: boolean,
): string[] {
  const next = new Set(featureKeys);
  if (selected) {
    next.add(moduleKey);
    childKeys.forEach((k) => next.add(k));
  } else {
    next.delete(moduleKey);
    childKeys.forEach((k) => next.delete(k));
  }
  return Array.from(next).sort();
}
