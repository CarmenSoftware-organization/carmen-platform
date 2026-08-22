import type { BusinessUnit } from '../types';
import { normalizeAudit } from './audit';

/**
 * Rank business units within their cluster — must match the DB view `v_cluster_bu_quota`
 * exactly: `COALESCE(is_hq, false) DESC, created_at ASC, id ASC`. A badge that disagrees with
 * the real gate (which BU actually gets the 403) is worse than no badge at all, because the
 * user will trust it and act on the wrong unit.
 *
 * Shared by `BusinessUnitsSection` (ClusterEdit's platform-admin view) and `BusinessUnitList`
 * (the cluster-admin view) — extracted here rather than duplicated so the two can never drift
 * apart from each other or from the view.
 *
 * Rank over the FULL business-unit list of the cluster (inactive units included, same as the
 * view) — never a filtered/sorted/paginated subset, or the badge would land on the wrong row
 * (or disappear) depending on what the caller happens to be looking at.
 *
 * จัดอันดับหน่วยธุรกิจภายในคลัสเตอร์ของตัวเอง — ต้องตรงกับ DB view `v_cluster_bu_quota` เป๊ะ:
 * `COALESCE(is_hq, false) DESC, created_at ASC, id ASC` แบดจ์ที่ไม่ตรงกับด่านจริง (BU ไหนโดน 403
 * จริง) แย่กว่าไม่มีแบดจ์เลย เพราะผู้ใช้จะเชื่อมันแล้วไปกดที่หน่วยผิด
 *
 * ใช้ร่วมกันโดย `BusinessUnitsSection` (มุมมองผู้ดูแลแพลตฟอร์มใน ClusterEdit) และ
 * `BusinessUnitList` (มุมมองผู้ดูแลคลัสเตอร์) — แยกออกมาไว้ที่นี่แทนการก็อปปี้ซ้ำ เพื่อไม่ให้ทั้งสอง
 * เพี้ยนไปจากกันหรือจาก view
 *
 * @param businessUnits - Every business unit in the cluster — never a filtered/paginated subset / หน่วยธุรกิจทั้งหมดของคลัสเตอร์ ห้ามเป็นชุดที่กรองหรือแบ่งหน้าแล้ว
 * @returns Map of business-unit id to its 1-based rank / แมป id หน่วยธุรกิจไปยังอันดับ (เริ่มที่ 1)
 */
// `GET /api-system/business-units` runs through the gateway's `@EnrichAuditUsers()`
// (apps/backend-gateway/src/common/enrichment/audit-shape.ts, `mutateToAuditShape`), which
// DELETES the flat `created_at` off every row and re-nests it as `audit.created.at` instead.
// A comparator that only reads `bu.created_at` therefore silently loses its middle tie-break
// tier on exactly the endpoint this file's callers use — the badge would then land on `id`
// order instead of creation order for any two non-HQ business units, which is the ordinary
// case in a cluster with more than one. Read through `normalizeAudit()` — the app-wide single
// point of truth for every shape the backend sends `created_at` in (flat, nested, or absent
// once the gateway drops the flat field) — do not "simplify" this back to `bu.created_at` alone.
// `GET /api-system/business-units` วิ่งผ่าน `@EnrichAuditUsers()` ของ gateway ซึ่ง**ลบ**
// `created_at` แบบแบนออกจากทุกแถวแล้วซ้อนใหม่เป็น `audit.created.at` แทน comparator ที่อ่านแค่
// `bu.created_at` จึงเสียชั้น tie-break กลางไปเงียบ ๆ บน endpoint เดียวกับที่ผู้เรียกไฟล์นี้ใช้อยู่จริง
// แบดจ์จะไปเรียงตาม `id` แทนลำดับการสร้างสำหรับ BU ที่ไม่ใช่ HQ สองหน่วยใด ๆ ซึ่งเป็นกรณีปกติของ
// คลัสเตอร์ที่มีมากกว่าหนึ่งหน่วย อ่านผ่าน `normalizeAudit()` ซึ่งเป็นจุดเดียวที่รู้ทุกรูปแบบที่
// backend ส่ง created_at มา ห้าม "ทำให้ง่ายขึ้น" กลับไปเป็น `bu.created_at` เดี่ยว ๆ
const createdAtOf = (bu: BusinessUnit): string | undefined => normalizeAudit(bu).created?.at;

export function rankBusinessUnits(businessUnits: BusinessUnit[]): Map<string, number> {
  const sorted = [...businessUnits].sort((a, b) => {
    const hq = Number(b.is_hq ?? false) - Number(a.is_hq ?? false);
    if (hq !== 0) return hq;
    const ta = Date.parse(createdAtOf(a) ?? '');
    const tb = Date.parse(createdAtOf(b) ?? '');
    // A missing/unparseable created_at (NaN) must never make the comparator return NaN —
    // sort()'s order is implementation-defined when it does, so the Over-limit badge could
    // land on a different row between renders of the same data. Fall through to the id
    // tie-break instead, and treat a missing created_at as sorting last (matches Postgres'
    // `ORDER BY created_at ASC` default of NULLS LAST, so the FE and the view still agree).
    const bothValid = !Number.isNaN(ta) && !Number.isNaN(tb);
    if (bothValid && ta !== tb) return ta - tb;
    if (!bothValid && Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
  return new Map(sorted.map((bu, i) => [bu.id, i + 1]));
}

/** Count of business units whose rank exceeds the quota — `0` when the cap is unknown/unenforced (`null`), never coerced. */
export function countOverLimit(ranked: Map<string, number>, cap: number | null): number {
  if (cap == null) return 0;
  let count = 0;
  ranked.forEach((rank) => { if (rank > cap) count += 1; });
  return count;
}
