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

export interface UseLicenseLedgerOptions<TLicense> {
  /**
   * ใช้ข้อมูลที่มีอยู่แล้วจากที่อื่น (เช่น batch load ของ parent) เป็นค่าตั้งต้นของ `licenses`
   * แทนการเริ่มจาก `[]` เสมอ — ผู้เรียกที่ไม่ส่ง (undefined) ได้พฤติกรรมเดิมทุกประการ
   */
  initialLicenses?: TLicense[];
  /** คู่กับ `initialLicenses` — ค่าตั้งต้นของ `loadFailed` (ดูคอมเมนต์ที่ field นั้น) */
  initialLoadFailed?: boolean;
  /**
   * ข้าม GET อัตโนมัติตอน mount — ใช้เมื่อผู้เรียกส่ง `initialLicenses`/`initialLoadFailed` มาแล้ว
   * และไม่ต้องการยิงคำขอซ้ำกับที่โหลดมาแล้วจากที่อื่น ค่าเริ่มต้น `false` (= พฤติกรรมเดิม: ยิงเสมอ
   * ตอน mount) `create`/`update`/`remove` ยังคง `reload()` ตามปกติเสมอไม่ว่าค่านี้จะเป็นอะไร —
   * ค่านี้กระทบแค่ effect อัตโนมัติตอน mount เท่านั้น อ่านครั้งเดียวตอน mount ผ่าน ref โดยตั้งใจ
   * (ไม่อยู่ใน dependency array) เพราะผู้เรียกมักส่ง object literal สดทุก render
   */
  skipInitialLoad?: boolean;
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
  options?: UseLicenseLedgerOptions<TLicense>,
) {
  const [licenses, setLicenses] = useState<TLicense[]>(options?.initialLicenses ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // แยกจาก "licenses ว่าง" โดยตั้งใจ — `[]` มีสองความหมายที่ conflate กันไม่ได้: "ไม่มีใบจริง"
  // กับ "โหลดไม่ได้" ผู้เรียกที่ต้องแยกสองเคสนี้ (เช่น `SeatRowCard`) อ่านค่านี้แทนการเดาจาก
  // `licenses.length === 0` (review C1 ของ Task 6 — เดิม catch แล้ว setLicenses([]) เฉย ๆ ทำให้
  // BU ที่โหลดไม่สำเร็จแสดงเป็น "ไม่มีใบ" พร้อมปุ่ม Add ที่กดได้จริง)
  const [loadFailed, setLoadFailed] = useState(options?.initialLoadFailed ?? false);
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
      setLoadFailed(false);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('Could not load licenses', { description: getErrorDetail(err) });
      setLicenses([]);
      setLoadFailed(true);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [ownerId, service]);

  // อ่าน `skipInitialLoad` ครั้งเดียวตอน mount ผ่าน ref — ไม่ใส่ใน dependency array เพราะ
  // ผู้เรียกมักส่ง `options` เป็น object literal สดทุก render (ดูคอมเมนต์ที่ตัว option เอง)
  const skipInitialLoadRef = useRef(options?.skipInitialLoad ?? false);
  useEffect(() => {
    if (skipInitialLoadRef.current) return;
    void reload();
  }, [reload]);

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

  return { licenses, loading, saving, loadFailed, reload, create, update, remove };
}
