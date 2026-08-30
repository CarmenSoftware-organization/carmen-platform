import { useCallback, useEffect, useRef, useState } from 'react';
import activityLogService from '../services/activityLogService';
import { getErrorDetail } from '../utils/errorParser';
import type { ActivityLogDetail, ActivityLogEntry } from '../types';

const PER_PAGE = 20;

/**
 * โหลดประวัติการเปลี่ยนแปลงของเรคอร์ดหนึ่งตัว พร้อมโหลด diff ทีละแถวตอนผู้ใช้กางดู
 *
 * `enabled` ผูกกับสถานะเปิด/ปิดของแผ่น Sheet — ปิดแล้วไม่ยิง request แต่ **ไม่ล้าง state**
 * เปิดใหม่ต้องเห็นของเดิมทันที ไม่ใช่กะพริบว่างแล้วโหลดซ้ำ
 * (agent-os/standards/hooks/fetch-race-guards.md)
 *
 * ใช้ generation counter ไม่ใช่ cancelled flag เพราะ entityId เปลี่ยนได้ระหว่างที่ request
 * ยังบินอยู่ — สองคำขอที่ทับกันจะเป็น "ตัวปัจจุบัน" ได้ทั้งคู่ถ้าใช้แค่ flag และตัวเก่าที่มาช้ากว่า
 * จะเขียนทับผลของตัวใหม่
 *
 * @param entityType - ชื่อตารางที่ตัด prefix tb_ ออกแล้ว เช่น "cluster"
 * @param entityId - เรคอร์ดที่ต้องการอ่านประวัติ
 * @param enabled - ยิง request เมื่อเป็น true เท่านั้น
 * @returns รายการ สถานะโหลด ตัวควบคุมโหลดเพิ่ม และ diff ที่โหลดมาแล้ว
 */
export function useActivityTrail(
  entityType: string,
  entityId: string | undefined,
  enabled: boolean,
) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [details, setDetails] = useState<Record<string, ActivityLogDetail | undefined>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  const generationRef = useRef(0);
  // เรคอร์ดที่ผลลัพธ์ปัจจุบันเป็นของมัน — กันโหลดซ้ำทุกครั้งที่เปิด-ปิดแผ่น
  const loadedIdRef = useRef<string | null>(null);
  // รายการที่เคยขอ detail แล้ว — กางซ้ำไม่ยิงใหม่ และไม่ยิงซ้อนระหว่างตัวแรกยังบิน
  const detailRequestedRef = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(
    (targetPage: number, append: boolean) => {
      if (!entityId) return;
      const generation = ++generationRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');

      activityLogService
        .getRecordTrail(entityType, entityId, { page: targetPage, perpage: PER_PAGE })
        .then((response) => {
          if (generation !== generationRef.current) return;
          const list = response.data || [];
          setEntries((prev) => (append ? [...prev, ...list] : list));
          setTotal(response.paginate?.total ?? list.length);
          setRawResponse(response);
        })
        .catch((err: unknown) => {
          if (generation !== generationRef.current) return;
          setError(getErrorDetail(err));
          // ให้ลองใหม่ได้: ลืมว่าเคยโหลดเรคอร์ดนี้แล้ว
          if (!append) loadedIdRef.current = null;
        })
        .finally(() => {
          // guard ทุกกิ่งรวม finally — setLoading(false) จากคำขอที่ถูกทิ้งจะดับ spinner
          // ทั้งที่คำขอปัจจุบันยังบินอยู่
          if (generation !== generationRef.current) return;
          if (append) setLoadingMore(false);
          else setLoading(false);
        });
    },
    [entityType, entityId],
  );

  useEffect(() => {
    if (!enabled || !entityId) return;
    if (loadedIdRef.current === entityId) return;
    loadedIdRef.current = entityId;
    setPage(1);
    fetchPage(1, false);
  }, [enabled, entityId, fetchPage]);

  const hasMore = entries.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  const loadDetail = useCallback((id: string) => {
    if (detailRequestedRef.current.has(id)) return;
    detailRequestedRef.current.add(id);
    setDetailLoading((prev) => ({ ...prev, [id]: true }));
    activityLogService
      .getDetail(id)
      .then(({ data }) => setDetails((d) => ({ ...d, [id]: data })))
      .catch((err: unknown) => {
        setError(getErrorDetail(err));
        // ให้กางใหม่แล้วลองอีกครั้งได้
        detailRequestedRef.current.delete(id);
      })
      .finally(() => setDetailLoading((d) => ({ ...d, [id]: false })));
  }, []);

  return {
    entries,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    details,
    detailLoading,
    loadDetail,
    rawResponse,
  };
}
