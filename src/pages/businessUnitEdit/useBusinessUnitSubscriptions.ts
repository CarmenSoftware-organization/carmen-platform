import { useEffect, useRef, useState } from 'react';
import subscriptionService from '../../services/subscriptionService';
import { useAuth } from '../../context/AuthContext';
import { devLog } from '../../utils/errorParser';
import type { Subscription } from '../../types';

export interface BusinessUnitSubscriptions {
  items: Subscription[];
  loading: boolean;
  /** โหลดล้ม — แยกจาก `items.length === 0` เพราะ "ไม่มีสัญญา" กับ "ดูไม่ได้" ตัดสินใจคนละอย่าง */
  failed: boolean;
}

/**
 * สัญญาทุกใบที่ออกให้ BU นี้ — ไม่มี endpoint ราย BU จึงใช้ `getAll` + `advance.where` กรองผ่าน
 * ความสัมพันธ์ `tb_subscription_bu` (หนึ่งสัญญาผูกหนึ่ง BU · `business_unit_id` ไม่ใช่คอลัมน์ของ
 * `tb_subscription` เอง จึงกรองตรง ๆ แบบ `cluster_id` ไม่ได้) `advance.where` ถูกส่งเป็น Prisma
 * `WhereInput` ดิบ (phase-b-backend-contract.md §8.1) relation filter จึงใช้ได้
 *
 * `sort` บังคับ: backend ไม่มี ORDER BY ตั้งต้น ใบล่าสุดต้องอยู่บนสุดเสมอ
 *
 * **ตรวจ `subscription.read` ก่อนยิง ไม่ใช่แค่ก่อนวาด** — เหตุผลเดียวกับ `SubscriptionCard` ของ
 * Cluster Edit: ผู้ใช้ที่ไม่มีสิทธิ์ (cluster admin เปิดหน้า BU ผ่าน shell ของตัวเอง) จะได้ 401
 * จาก gateway ซึ่ง `tokenRefresh.ts` แยกจาก token หมดอายุไม่ออก แล้วเตะออกจากระบบทั้งที่ยังใช้งานได้
 */
export function useBusinessUnitSubscriptions(
  buId: string | undefined,
  /**
   * ส่ง `clusterId` = ยิงผ่าน `/clusters/:id/subscriptions` ที่ตรวจด้วยสมาชิกภาพผู้ดูแลคลัสเตอร์
   * (shell ของ cluster admin) โดยไม่สนใจ `subscription.read` — backend AND ตัวกรอง BU ของเราไว้ใต้
   * `cluster_id` ของมันเอง · ไม่ส่ง = ทางเดิมของ shell platform ที่ต้องมี `subscription.read`
   */
  opts?: { clusterId?: string },
): BusinessUnitSubscriptions {
  const { hasPermission } = useAuth();
  const clusterId = opts?.clusterId;
  const canRead = !!clusterId || hasPermission('subscription.read');
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [failed, setFailed] = useState(false);
  // กัน response ของคำขอเก่าทับของใหม่เมื่อ buId เปลี่ยนกลางคัน (มาตรฐาน hooks ของ repo)
  const reqId = useRef(0);

  useEffect(() => {
    if (!buId || !canRead) {
      setLoading(false);
      return;
    }
    const mine = ++reqId.current;
    setLoading(true);
    setFailed(false);
    const paginate = {
      perpage: -1,
      sort: 'end_date:desc',
      advance: JSON.stringify({
        where: { tb_subscription_bu: { some: { business_unit_id: buId, deleted_at: null } } },
      }),
    };
    (clusterId
      ? subscriptionService.listForCluster(clusterId, paginate)
      : subscriptionService.getAll(paginate))
      .then((res) => {
        if (mine !== reqId.current) return;
        setItems(res?.data ?? []);
      })
      .catch((err) => {
        if (mine !== reqId.current) return;
        devLog('Failed to load subscriptions for business unit:', err);
        setFailed(true);
      })
      .finally(() => {
        if (mine === reqId.current) setLoading(false);
      });
  }, [buId, canRead, clusterId]);

  return { items, loading, failed };
}
