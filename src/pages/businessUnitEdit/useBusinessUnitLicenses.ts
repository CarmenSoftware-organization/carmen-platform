import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import { getErrorDetail } from '../../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { sumActiveLicenses, licenseStatus } from '../../utils/buLicense';
import type { BusinessUnitLicense } from '../../types';

export function useBusinessUnitLicenses(buId: string | undefined) {
  const [licenses, setLicenses] = useState<BusinessUnitLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ buId เปลี่ยนกลางคัน
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!buId) return;
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const res = await businessUnitLicenseService.getAll(buId);
      if (mine !== reqId.current) return;
      // businessUnitLicenseService คืน response.data ดิบ (envelope { data } รวมอยู่ด้วย) —
      // ต้อง unwrap เอง ตามรูปแบบเดียวกับ clusterService/subscriptionService ทั้ง repo
      const rows = res?.data ?? res;
      setLicenses(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('โหลดใบ license ไม่สำเร็จ', { description: getErrorDetail(err) });
      setLicenses([]);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [buId]);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.create(buId, data);
      toast.success('เพิ่มใบ license แล้ว');
      await reload();
    } catch (err) {
      toast.error('เพิ่มใบ license ไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  const update = useCallback(async (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.update(buId, id, data);
      toast.success('บันทึกแล้ว');
      await reload();
    } catch (err) {
      // 409 ต้องตรวจก่อน branch ทั่วไปเสมอ — ไม่งั้นผู้ใช้เห็นข้อความผิดสาเหตุ
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await reload();
        return;
      }
      toast.error('บันทึกไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  const remove = useCallback(async (id: string) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.delete(buId, id);
      toast.success('ลบใบ license แล้ว');
      await reload();
    } catch (err) {
      toast.error('ลบไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  return {
    licenses,
    loading,
    saving,
    activeSeats: sumActiveLicenses(licenses),
    activeLicenseCount: licenses.filter((l) => licenseStatus(l) === 'active').length,
    reload,
    create,
    update,
    remove,
  };
}
