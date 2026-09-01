import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';

/**
 * รูปของ service ที่ hook นี้ขับได้ — `clusterLicenseService` และ `businessUnitLicenseService`
 * มี signature ตรงนี้อยู่แล้วทั้งคู่ จึงส่งเข้ามาตรง ๆ ได้โดยไม่ต้องมี adapter
 *
 * มีแค่ `getAll`/`delete` — สร้าง/แก้ใบย้ายไปฟอร์มเต็มหน้าที่ `/licenses/{seats,bu-quota}/...`
 * (Task 6, `LicensePurchaseForm.tsx`) แล้ว เรียก `config.service.create`/`.update` ตรง ๆ ไม่ผ่าน
 * hook นี้ hook นี้เหลือหน้าที่แค่ทางอ่าน + ลบใบเท่านั้น (Task 8)
 */
export interface LicenseLedgerService {
  getAll(ownerId: string): Promise<unknown>;
  delete(ownerId: string, id: string): Promise<unknown>;
  /**
   * ยกเลิกใบ — มีเฉพาะใบโควตา BU (`clusterLicenseService`) ใบที่นั่งไม่มีแนวคิดนี้เพราะเป็น
   * ผลรวมทุกใบ ไม่ใช่ใบเดียวชนะ จึงเป็น optional ที่นี่ ไม่ใช่ฟิลด์บังคับของสัญญาร่วม
   */
  cancel?(ownerId: string, id: string, data: { doc_version: number }): Promise<unknown>;
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
   * ตอน mount) `remove` ยังคง `reload()` ตามปกติเสมอไม่ว่าค่านี้จะเป็นอะไร — ค่านี้กระทบแค่ effect
   * อัตโนมัติตอน mount เท่านั้น อ่านครั้งเดียวตอน mount ผ่าน ref โดยตั้งใจ (ไม่อยู่ใน dependency
   * array) เพราะผู้เรียกมักส่ง object literal สดทุก render
   */
  skipInitialLoad?: boolean;
}

/**
 * ทางอ่าน + ลบของ "ใบ" หนึ่งชนิด — ใช้ร่วมทั้งใบที่นั่ง (ราย BU) และใบโควตา BU (ราย cluster)
 *
 * สร้าง/แก้ใบย้ายไปฟอร์มเต็มหน้าที่ `/licenses/{seats,bu-quota}/{new,:id/edit}` แล้ว (Task 6) —
 * hook นี้ไม่มีทางเขียนใบใหม่/แก้ไขใบเดิมอีกต่อไป มีแค่ `reload` (อ่าน) กับ `remove` (ลบ) การเก็บ
 * ทางลบไว้เป็นการตัดสินใจของ Task 8: ฟอร์มเต็มหน้าไม่มีปุ่มลบเลย ถ้าตัดทางนี้ออกด้วยจะไม่มีที่ไหน
 * ในแอปลบใบได้อีกเลย
 *
 * hook นี้จงใจ **ไม่คำนวณยอดรวมใด ๆ** เพราะกติกาของสองชนิดต่างกันสิ้นเชิง: ที่นั่งเป็นผลรวม
 * ของทุกใบที่คุ้มครองอยู่ ส่วนโควตา BU เป็นใบที่ชนะใบเดียว · ผู้เรียกคำนวณเองจาก `licenses`
 * ด้วย `sumActiveLicenses` หรือ `activeLicense` ตามชนิดของตัวเอง
 */
export function useLicenseLedger<TLicense extends { id: string }>(
  ownerId: string | undefined,
  service: LicenseLedgerService,
  options?: UseLicenseLedgerOptions<TLicense>,
) {
  const { t } = useI18n();
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
      toast.error(t('pages.licenses.loadFailedTitle'), { description: getErrorDetail(err, t) });
      setLicenses([]);
      setLoadFailed(true);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [ownerId, service, t]);

  // อ่าน `skipInitialLoad` ครั้งเดียวตอน mount ผ่าน ref — ไม่ใส่ใน dependency array เพราะ
  // ผู้เรียกมักส่ง `options` เป็น object literal สดทุก render (ดูคอมเมนต์ที่ตัว option เอง)
  const skipInitialLoadRef = useRef(options?.skipInitialLoad ?? false);
  useEffect(() => {
    if (skipInitialLoadRef.current) return;
    void reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.delete(ownerId, id);
      toast.success(t('pages.licenses.licenseRemoved'));
      await reload();
    } catch (err) {
      toast.error(t('pages.licenses.removeLicenseFailedTitle'), { description: getErrorDetail(err, t) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service, t]);

  /**
   * ยกเลิกใบ — ต่างจาก `remove` ตรงที่ใบยังอยู่ในรายการหลังทำเสร็จ (จึง `reload` เหมือนกัน
   * แต่ผู้ใช้จะยังเห็นใบนั้นพร้อมป้าย "ยกเลิกแล้ว") · service ที่ไม่มี `cancel` (ใบที่นั่ง)
   * จะไม่ทำอะไรเลย ผู้เรียกฝั่งนั้นไม่มีปุ่มให้กดอยู่แล้ว
   */
  const cancel = useCallback(async (id: string, docVersion: number) => {
    if (!ownerId || !service.cancel) return;
    setSaving(true);
    try {
      await service.cancel(ownerId, id, { doc_version: docVersion });
      toast.success(t('pages.licenses.licenseCancelled'));
      await reload();
    } catch (err) {
      toast.error(t('pages.licenses.cancelLicenseFailedTitle'), { description: getErrorDetail(err, t) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service, t]);

  return { licenses, loading, saving, loadFailed, reload, remove, cancel };
}
