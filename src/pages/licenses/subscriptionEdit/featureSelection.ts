import type { LicenseFeature } from '../../../types';
import { ancestorsOf, descendantKeys, flattenDescendants } from '../../../utils/featureTree';

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
  /** ลูกหลาน**ทุกชั้น**ของโมดูลนี้ เรียงแบบ depth-first · depth 1 = ลูกตรง, 2 = หลาน */
  children: (LicenseFeature & { depth: number })[];
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
 * module → ลูกหลาน**ทุกชั้น** เรียงแบบ depth-first (`parent_key === null` คือโมดูลราก)
 *
 * เดิม filter `parent_key === m.key` ซึ่งเทียบชั้นเดียว — พอ catalog กลายเป็นต้นไม้ n ชั้น
 * หลานจะหายไปจาก picker ทั้งตัว ขายไม่ได้เลยทั้งที่อยู่ใน catalog
 *
 * `flattenDescendants` เรียงด้วยโครงต้นไม้ ไม่ใช่ `sort_order` ดิบ เพราะ generator วางหลาน
 * ไว้แถบ `+500` ของโมดูลราก การเรียงด้วย `sort_order` ตรง ๆ จะทำให้หลานไปกองท้ายรายการ
 */
export function groupCatalog(catalog: LicenseFeature[]): FeatureGroup[] {
  const modules = catalog
    .filter((f) => f.parent_key === null)
    .slice()
    .sort(byOrderThenKey);
  return modules.map((m) => ({
    module: m,
    children: flattenDescendants(catalog, m.key),
  }));
}

/**
 * feature key ของ BU ที่ไม่มีอยู่ใน catalog ที่ active — เกิดขึ้นเมื่อ feature ถูก `is_active: false`
 * หลังจากสัญญาผูกมันไว้แล้ว (catalog กรองเฉพาะ active, contract §5)
 *
 * ต้องแสดงให้เห็น ไม่ใช่กรองทิ้งเงียบ ๆ: `PUT /license-feature-groups/:id/features` เป็น replace semantics และ backend
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
 * จำนวน **module แม่** ที่ถูกเลือกไว้ (`parent_key === null`)
 *
 * มีไว้กระทบยอดกับ `feature_count` ที่ backend คืนมา ไม่ใช่ตัวเลขที่ผู้ใช้ต้องนับเอง:
 * หน้ารายการกลุ่มสิทธิ์แสดง 76 (ทุกคีย์ที่เก็บไว้ รวมพ่อที่ถูกเติมให้ตามกฎ "ลูกลากพ่อ") แต่
 * `selectedChildCount` แสดง 66 โดยตั้งใจ (เฉพาะลูก ให้ตรงกับผลรวม badge ต่อโมดูล) — ตัวเลข
 * สองตัวต่างกัน 10 อยู่คนละหน้าโดยไม่มีอะไรอธิบาย ตัวนี้คือ 10 นั้น
 *
 * คีย์ที่ไม่อยู่ใน catalog ไม่ถูกนับ (บล็อก "ไม่รู้จัก" นับให้ต่างหาก) ผลรวมจึงเท่ากับ
 * `feature_count` ก็ต่อเมื่อกลุ่มไม่ได้ถือคีย์ที่หลุดจากแค็ตตาล็อกไปแล้ว
 */
export function selectedModuleCount(featureKeys: string[], catalog: LicenseFeature[]): number {
  const modules = new Set(catalog.filter((f) => f.parent_key === null).map((f) => f.key));
  return featureKeys.filter((k) => modules.has(k)).length;
}

/**
 * Search filter: a group matches if its module label/key matches, or any descendant does. When
 * only descendants match, the group is kept with just those (not the whole set) — a group whose
 * module label matches keeps every child, mirroring ApplicationEdit's catalog filter.
 *
 * บรรพบุรุษของแถวที่ตรงถูกเก็บไว้ด้วย ไม่งั้นค้นเจอหลานแต่พ่อหาย แล้วการเยื้องตาม `depth`
 * จะอ่านเป็นรายการลอย ๆ ที่ไม่รู้ว่าอยู่ใต้อะไร · คัดจาก `g.children` เดิมเพื่อรักษาลำดับ
 * depth-first กับค่า `depth` ที่คำนวณไว้แล้ว
 */
export function filterGroups(groups: FeatureGroup[], query: string): FeatureGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => {
      const moduleMatch = g.module.label.toLowerCase().includes(q) || g.module.key.toLowerCase().includes(q);
      if (moduleMatch) return g;
      const hit = g.children.filter(
        (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
      );
      if (hit.length === 0) return { ...g, children: [] };
      const keep = new Set<string>();
      hit.forEach((c) => {
        keep.add(c.key);
        ancestorsOf(c.key, g.children).forEach((a) => keep.add(a));
      });
      return { ...g, children: g.children.filter((c) => keep.has(c.key)) };
    })
    .filter((g) => g.children.length > 0);
}

/**
 * Toggle one feature, keeping the parent invariant at **every** level: a selected node implies
 * every one of its ancestors is selected, and an ancestor with no selected descendants is not
 * selected either. Backend re-derives nothing, so the UI is the only place this holds — and
 * "procurement unchecked but Purchase Request checked" reads as broken.
 *
 * เดินสาย `parent_key` ผ่าน `ancestorsOf` ไม่ใช้ `moduleOf()` อีกแล้ว: `moduleOf` ให้แค่โมดูลราก
 * ติ๊ก `system_admin.workflow.purchase_request` แล้วเติมให้แค่ `system_admin` ไม่เติม
 * `system_admin.workflow` ⇒ ได้กลุ่มที่ evaluator ฝั่ง gateway บล็อกเอง (ขายของที่ตัวเองบล็อก)
 *
 * The `startsWith(`${module}.`)` prefix (WITH the trailing dot) is load-bearing: without it,
 * clearing `procurement` would also clear an unrelated module named `procurement_extra`.
 */
export function toggleFeature(
  featureKeys: string[],
  key: string,
  checked: boolean,
  catalog: LicenseFeature[],
): string[] {
  const next = new Set(featureKeys);
  const ancestors = ancestorsOf(key, catalog);

  if (checked) {
    next.add(key);
    ancestors.forEach((a) => next.add(a));
    return Array.from(next).sort();
  }

  next.delete(key);
  descendantKeys(key, next).forEach((k) => next.delete(k));

  // ไล่ถอดบรรพบุรุษจากใกล้ที่สุดขึ้นไป — พ่อที่ไม่เหลือลูกที่ถูกเลือกต้องหลุดตาม และการถอดพ่อ
  // อาจทำให้ปู่ไม่เหลือลูกด้วย จึงต้องไล่ทีละชั้น ไม่ใช่ตรวจครั้งเดียว
  for (const a of ancestors.slice().reverse()) {
    if (descendantKeys(a, next).length === 0) next.delete(a);
  }
  return Array.from(next).sort();
}

/**
 * Select/deselect every descendant of one module (+ the module itself) in one shot — backs the
 * "ทั้งหมด / ไม่เอา" buttons. `toggleFeature` alone can't do "select all" because
 * `checked: true` with `key === module` only adds the module key, not what hangs under it.
 *
 * `childKeys` ที่ผู้เรียกส่งมาคือ `g.children.map(c => c.key)` ซึ่งตอนนี้เป็นลูกหลาน**ทุกชั้น**แล้ว
 * ฟังก์ชันนี้จึงไม่ต้องเดินต้นไม้เอง แต่ยังต้องเติม/ถอดตัวโมดูลเองเหมือนเดิม
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
