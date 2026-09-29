import businessUnitService from '../services/businessUnitService';
import { fetchAllPages, type PagedResponse } from './fetchAllPages';
import type { BusinessUnit } from '../types';

export interface FetchAllBusinessUnitsOptions {
  /** กรองด้วย cluster_id ฝั่ง server (advance where) */
  clusterId?: string;
  /** เช่น 'code:asc' — ไม่ส่ง = ลำดับของ backend */
  sort?: string;
  /** ชื่อใน devLog เมื่อชนเพดาน */
  label: string;
}

/**
 * BU ทั้งหมด (หรือทั้งหมดของ cluster หนึ่ง) แบบไล่ทีละหน้า — ทางแทน `perpage: -1` / `perpage: 200`
 * ที่ gateway จะตอบ 400 (ช่วง 4c ของ lazy-lookup) · หน้าละ 100 สูงสุด 10 หน้า ชนเพดาน = devLog
 */
export function fetchAllBusinessUnits({
  clusterId, sort, label,
}: FetchAllBusinessUnitsOptions): Promise<BusinessUnit[]> {
  const advance = clusterId ? JSON.stringify({ where: { cluster_id: clusterId } }) : undefined;
  return fetchAllPages<BusinessUnit>(
    (page, perpage) =>
      businessUnitService.getAll({
        page,
        perpage,
        ...(sort ? { sort } : {}),
        ...(advance ? { advance } : {}),
      }) as Promise<PagedResponse<BusinessUnit>>,
    { pageSize: 100, maxPages: 10, label, context: clusterId ? { clusterId } : undefined },
  );
}
