import { useCallback, useEffect, useRef, useState } from 'react';
import subscriptionService from '../../services/subscriptionService';
import { buildAdvance } from './subscriptionManagement/buildAdvance';
import { getErrorDetail, devLog } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
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
 *
 * `scope` เลือก route ตามสิทธิ์ของ shell ที่เรียก: `'platform'` (ค่าตั้งต้น) ยิง `/platform/subscriptions`
 * ซึ่งบังคับ `subscription.read` · `'cluster'` ยิง `/clusters/:id/subscriptions` ที่ตรวจด้วยสมาชิกภาพ
 * ผู้ดูแลคลัสเตอร์แทน — shell ของ cluster admin **ต้อง**ใช้ตัวนี้ เพราะ 401/403 จาก route แรกจะ
 * เตะเขาออกจากระบบ (`tokenRefresh.ts` แยกจาก token หมดอายุไม่ออก) ทั้งสองคืนแถวและ summary รูปเดียวกัน
 */
export function useClusterSubscriptions(
  clusterId: string | undefined,
  scope: 'platform' | 'cluster' = 'platform',
) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
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
      const paginate = {
        perpage: -1,
        sort: 'end_date:desc',
        advance: buildAdvance(
          { search: '', states: [], expiringSoon: false, clusterId },
          thresholds.subscription_days,
        ),
      };
      const res = scope === 'cluster'
        ? await subscriptionService.listForCluster(clusterId, paginate)
        : await subscriptionService.getAll(paginate);
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
  }, [clusterId, scope, t, thresholds.subscription_days]);

  useEffect(() => { void reload(); }, [reload]);

  return { items, loading, failed, errorMsg, reload };
}
