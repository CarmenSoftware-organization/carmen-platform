import type { BusinessUnit } from '../types';

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
export function rankBusinessUnits(businessUnits: BusinessUnit[]): Map<string, number> {
  const sorted = [...businessUnits].sort((a, b) => {
    const hq = Number(b.is_hq ?? false) - Number(a.is_hq ?? false);
    if (hq !== 0) return hq;
    const ta = Date.parse(a.created_at ?? '');
    const tb = Date.parse(b.created_at ?? '');
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
