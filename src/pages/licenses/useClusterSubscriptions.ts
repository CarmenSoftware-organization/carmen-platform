import { useCallback, useEffect, useRef, useState } from 'react';
import subscriptionService from '../../services/subscriptionService';
import { buildAdvance } from './subscriptionManagement/buildAdvance';
import { getErrorDetail, devLog } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { Subscription } from '../../types';

/**
 * สัญญาทั้งหมดของ cluster หนึ่ง — ไม่มี endpoint เฉพาะ cluster จึงใช้ `getAll` + advance filter
 * `cluster_id` (ประกอบด้วย `buildAdvance` ตัวเดียวกับที่ `SubscriptionTable` ใช้)
 *
 * ย้ายออกมาจาก `SubscriptionSection` เพราะแถบสรุปหัวหน้า (`LicenseHealthStrip`) ต้องนับสัญญาที่
 * หมดอายุ/ใกล้หมดด้วย ถ้าปล่อยให้ section ดึงเอง เพจจะต้องยิงคำขอชุดที่สองเพื่อนับสิ่งเดียวกัน
 * แล้วสองที่จะเพี้ยนจากกันได้เงียบ ๆ ตอนหนึ่งในสองโหลดล้ม
 *
 * `failed` แยกจาก `items.length === 0` โดยตั้งใจ ตามเหตุผลเดียวกับ `useLicenseLedger.loadFailed`
 * — "ไม่มีสัญญา" กับ "ดูไม่ได้ว่ามีสัญญาไหม" นำไปสู่การตัดสินใจคนละอย่าง
 */
export function useClusterSubscriptions(clusterId: string | undefined) {
  const { t } = useI18n();
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ clusterId เปลี่ยนกลางคัน (มาตรฐาน hooks ของ repo)
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!clusterId) return;
    const mine = ++reqId.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await subscriptionService.getAll({
        perpage: -1,
        sort: 'end_date:desc',
        advance: buildAdvance({ search: '', states: [], expiringSoon: false, clusterId }),
      });
      if (mine !== reqId.current) return;
      setItems(res?.data ?? []);
    } catch (err) {
      if (mine !== reqId.current) return;
      devLog('Failed to load subscriptions for cluster:', err);
      setErrorMsg(getErrorDetail(err, t));
      setFailed(true);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [clusterId, t]);

  useEffect(() => { void reload(); }, [reload]);

  return { items, loading, failed, errorMsg, reload };
}
