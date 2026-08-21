import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getErrorDetail } from '../../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';

/**
 * รูปของ service ที่ hook นี้ขับได้ — `clusterLicenseService` และ `businessUnitLicenseService`
 * มี signature ตรงนี้อยู่แล้วทั้งคู่ จึงส่งเข้ามาตรง ๆ ได้โดยไม่ต้องมี adapter
 */
export interface LicenseLedgerService<TLicense, TCreate> {
  getAll(ownerId: string): Promise<unknown>;
  create(ownerId: string, data: TCreate): Promise<unknown>;
  update(ownerId: string, id: string, data: Partial<TLicense> & { doc_version: number }): Promise<unknown>;
  delete(ownerId: string, id: string): Promise<unknown>;
}

/**
 * CRUD ของ "ใบ" หนึ่งชนิด — ใช้ร่วมทั้งใบที่นั่ง (ราย BU) และใบโควตา BU (ราย cluster)
 *
 * hook นี้จงใจ **ไม่คำนวณยอดรวมใด ๆ** เพราะกติกาของสองชนิดต่างกันสิ้นเชิง: ที่นั่งเป็นผลรวม
 * ของทุกใบที่คุ้มครองอยู่ ส่วนโควตา BU เป็นใบที่ชนะใบเดียว · ผู้เรียกคำนวณเองจาก `licenses`
 * ด้วย `sumActiveLicenses` หรือ `activeLicense` ตามชนิดของตัวเอง
 */
export function useLicenseLedger<TLicense extends { id: string }, TCreate>(
  ownerId: string | undefined,
  service: LicenseLedgerService<TLicense, TCreate>,
) {
  const [licenses, setLicenses] = useState<TLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ ownerId เปลี่ยนกลางคัน
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const res = (await service.getAll(ownerId)) as { data?: unknown } | unknown[];
      if (mine !== reqId.current) return;
      // service คืน `response.data` ดิบ (envelope { data } รวมอยู่ด้วย) — ต้อง unwrap เอง
      // ตามรูปแบบเดียวกับ clusterService/subscriptionService ทั้ง repo
      const rows = Array.isArray(res) ? res : (res as { data?: unknown }).data;
      setLicenses(Array.isArray(rows) ? (rows as TLicense[]) : []);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('Could not load licenses', { description: getErrorDetail(err) });
      setLicenses([]);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [ownerId, service]);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (data: TCreate) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.create(ownerId, data);
      toast.success('License added');
      await reload();
    } catch (err) {
      toast.error('Could not add the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service]);

  const update = useCallback(async (id: string, data: Partial<TLicense> & { doc_version: number }) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.update(ownerId, id, data);
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
  }, [ownerId, reload, service]);

  const remove = useCallback(async (id: string) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.delete(ownerId, id);
      toast.success('License removed');
      await reload();
    } catch (err) {
      toast.error('Could not remove the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service]);

  return { licenses, loading, saving, reload, create, update, remove };
}
