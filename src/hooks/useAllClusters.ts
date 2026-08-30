import { useEffect, useState } from 'react';
import clusterService from '../services/clusterService';
import { fetchAllPages } from '../utils/fetchAllPages';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useI18n } from './useI18n';
import type { Cluster } from '../types';

export const CLUSTER_PAGE_SIZE = 100;
export const CLUSTER_MAX_PAGES = 10;

/** ทุก cluster เรียงตามชื่อ — ไล่ทีละหน้าแบบมีเพดาน ไม่ใช่ `perpage: 200` ที่ตัดจบเงียบ ๆ */
export function fetchAllClusters(): Promise<Cluster[]> {
  return fetchAllPages<Cluster>(
    (page, perpage) => clusterService.getAll({ page, perpage, sort: 'name:asc' }),
    { pageSize: CLUSTER_PAGE_SIZE, maxPages: CLUSTER_MAX_PAGES, label: 'fetchAllClusters' },
  );
}

export interface UseAllClustersResult {
  clusters: Cluster[];
  loading: boolean;
  /** ข้อความสำหรับแสดงข้าง ๆ ตัวเลือก cluster — '' เมื่อไม่มีปัญหา */
  error: string;
}

/**
 * รายชื่อ cluster ทั้งหมดสำหรับ dropdown — ใช้ร่วมกันสองที่ (ตัวกรองในมุมมอง "By subscription" ของ
 * `/licenses` — `SubscriptionTable` แบบ embedded, ไม่ใช่ route แยก `/licenses/subscriptions` ที่ถูก
 * ถอดออกไปแล้ว — และตัวเลือกตอนสร้างสัญญาใน `/licenses/subscriptions/new`) จึงอยู่ใน `src/hooks/` ตาม
 * `agent-os/standards/hooks/hook-placement.md`
 *
 * โหลดครั้งเดียวตอน mount และกันผลลัพธ์ค้างด้วย `cancelled` flag (one-shot load ไม่ใช่ refetch
 * ตาม input จึงไม่ต้องใช้ generation counter)
 *
 * ข้อความความล้มเหลวถูกแปลตอน render ไม่ใช่ตอน catch — เก็บแต่ *รายละเอียด* ไว้ใน state แล้วค่อย
 * ประกอบกับคำนำหน้าที่แปลแล้ว ทำให้สลับภาษาระหว่างที่ banner ค้างอยู่ได้โดยไม่ต้อง refetch
 * (ถ้าใส่ `t` ลง deps ของ effect การเปลี่ยนภาษาจะยิง API ใหม่ทั้งชุด)
 *
 * ความล้มเหลวถูก **คืนออกไปเป็น `error`** ไม่ใช่กลืนหาย — ทั้งสองหน้ามีที่ว่างข้างตัวเลือกให้แสดง
 * ข้อความอยู่แล้ว (hook-placement.md: "feeds one component that has somewhere to show it
 * inline → return `error: string`") · ส่วนกรณีข้อมูลเกินเพดานหน้าจะถูก `devLog` จากใน
 * `fetchAllPages` เพราะเป็นความผิดปกติของระบบ ไม่ใช่สิ่งที่ผู้ใช้แก้ได้
 *
 * @param enabled ปิดการโหลดไปเลยเมื่อหน้านั้นยังไม่ต้องใช้ (เช่นหน้าแก้สัญญาเดิมที่ cluster ตายตัว)
 */
export function useAllClusters(enabled = true): UseAllClustersResult {
  const { t } = useI18n();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setErrorDetail('');
    fetchAllClusters()
      .then((rows) => { if (!cancelled) setClusters(rows); })
      .catch((err: unknown) => {
        if (cancelled) return;
        devLog('Failed to load clusters:', err);
        setErrorDetail(getErrorDetail(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  const error = errorDetail ? t('pages.licenses.loadFailedPrefix') + errorDetail : '';

  return { clusters, loading, error };
}
