import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import clusterLicenseService from '../../../services/clusterLicenseService';
import { getErrorDetail } from '../../../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../../../utils/docVersion';
import { effectiveCap, licenseStatus } from '../../../utils/clusterLicense';
import type { ClusterLicense } from '../../../types';

export function useClusterLicenses(clusterId: string | undefined) {
  const [licenses, setLicenses] = useState<ClusterLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ clusterId เปลี่ยนกลางคัน
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!clusterId) return;
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const res = await clusterLicenseService.getAll(clusterId);
      if (mine !== reqId.current) return;
      // clusterLicenseService คืน response.data ดิบ (envelope { data } รวมอยู่ด้วย) —
      // ต้อง unwrap เอง ตามรูปแบบเดียวกับ clusterService/subscriptionService ทั้ง repo
      const rows = res?.data ?? res;
      setLicenses(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('Could not load licenses', { description: getErrorDetail(err) });
      setLicenses([]);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (data: Omit<ClusterLicense, 'id' | 'cluster_id' | 'doc_version'>) => {
    if (!clusterId) return;
    setSaving(true);
    try {
      await clusterLicenseService.create(clusterId, data);
      toast.success('License added');
      await reload();
    } catch (err) {
      toast.error('Could not add the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [clusterId, reload]);

  const update = useCallback(async (id: string, data: Partial<ClusterLicense> & { doc_version: number }) => {
    if (!clusterId) return;
    setSaving(true);
    try {
      await clusterLicenseService.update(clusterId, id, data);
      toast.success('License saved');
      await reload();
    } catch (err) {
      // 409 ต้องตรวจก่อน branch ทั่วไปเสมอ — ไม่งั้นผู้ใช้เห็นข้อความผิดสาเหตุ
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await reload();
        return;
      }
      toast.error('Could not save the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [clusterId, reload]);

  const remove = useCallback(async (id: string) => {
    if (!clusterId) return;
    setSaving(true);
    try {
      await clusterLicenseService.delete(clusterId, id);
      toast.success('License removed');
      await reload();
    } catch (err) {
      toast.error('Could not remove the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [clusterId, reload]);

  return {
    licenses,
    loading,
    saving,
    // โควตาที่มีผล = ใบที่ชนะใบเดียว ไม่ใช่ผลรวม — การเผลอ sum ที่นี่คือบั๊กที่เงียบที่สุดของฟีเจอร์นี้
    cap: effectiveCap(licenses),
    activeCount: licenses.filter((l) => licenseStatus(l) === 'active').length,
    reload,
    create,
    update,
    remove,
  };
}
