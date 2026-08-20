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
      toast.error('Could not load licenses', { description: getErrorDetail(err) });
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
      toast.success('License added');
      await reload();
    } catch (err) {
      toast.error('Could not add the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  const update = useCallback(async (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.update(buId, id, data);
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
  }, [buId, reload]);

  const remove = useCallback(async (id: string) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.delete(buId, id);
      toast.success('License removed');
      await reload();
    } catch (err) {
      toast.error('Could not remove the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  return {
    licenses,
    loading,
    saving,
    // Consumed by BusinessUnitDocument's read-only "Max users" display (Task 3.5) — the
    // card below computes these independently from its own `licenses` prop; this copy is
    // for the document header, not a second source of truth (same inputs, same functions).
    activeSeats: sumActiveLicenses(licenses),
    activeLicenseCount: licenses.filter((l) => licenseStatus(l) === 'active').length,
    reload,
    create,
    update,
    remove,
  };
}
