import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import clusterLicenseService from '../../services/clusterLicenseService';
import clusterService from '../../services/clusterService';
import type { ExpiryThresholdsConfig } from '../../types';

export type LicenseKind = 'seat' | 'bu-quota';

/**
 * ทุกอย่างที่ต่างกันระหว่างใบที่นั่งกับใบโควตา BU อยู่ในไฟล์นี้ไฟล์เดียว
 *
 * สิ่งที่ **ไม่** อยู่ที่นี่โดยตั้งใจคือกติกาการนับ — ที่นั่งเป็นผลรวมทุกใบ (`sumActiveLicenses`)
 * โควตาเป็นใบที่ชนะใบเดียว (`activeLicense`) การเอาสองสูตรนั้นมาไว้หลัง config ตัวเดียวกัน
 * คือการเชิญให้ใครสักคนใช้ผิดสูตร ฟอร์มนี้แค่กรอกใบ ไม่คำนวณความจุ
 */
export interface LicenseKindConfig {
  kind: LicenseKind;
  /** ชื่อฟิลด์จำนวนบนสาย */
  amountField: 'licensed_users' | 'licensed_bus';
  /** ชื่อ query param ที่ใช้ prefill เจ้าของตอนสร้าง */
  ownerParam: 'bu' | 'cluster';
  /** ใบชนิดนี้มีสวิตช์ "ไม่มีวันหมดอายุ" ไหม (sentinel ปี 2099) */
  showNoExpiry: boolean;
  /** ใบชนิดนี้มีช่อง note ไหม */
  showNote: boolean;
  /** แสดงคลัสเตอร์แยกจากเจ้าของไหม (คอลัมน์ใน `PurchaseLicenseTable` + ช่องอ่านอย่างเดียวใน
   *  `LicensePurchaseForm`) — ใบที่นั่งมีเจ้าของเป็น BU จึงต้องบอกว่า BU นั้น
   *  อยู่คลัสเตอร์ไหน ส่วนใบโควตา BU มีเจ้าของเป็น cluster เองอยู่แล้ว (ป้ายเจ้าของแปลจาก
   *  `common.label.cluster` — ดู `OWNER_LABEL_KEYS` ในสองไฟล์ที่ใช้ config นี้) การเปิดที่นั่น
   *  จะได้ Cluster สองคอลัมน์ซ้ำกัน */
  showCluster: boolean;
  /** เส้นทางกลับของ `PageHeader backTo` */
  listPath: string;
  /** segment ของ route แก้ไข ('seats' | 'bu-quota') — ใช้ประกอบ path ตอน navigate หลังสร้างสำเร็จ
   *  (`/licenses/${editPathSegment}/${id}/edit`) — เดิมเคยเป็น lookup table แยกอยู่ใน
   *  LicensePurchaseForm.tsx ซึ่งเป็นความต่างตาม kind ที่ควรอยู่ในไฟล์นี้ตั้งแต่แรก */
  editPathSegment: string;
  /** ฟิลด์ของเกณฑ์ "ใกล้หมดอายุ" ใน `useExpiryThresholds().thresholds` ที่ใบชนิดนี้ใช้ —
   *  ชื่อฟิลด์เท่านั้น ไม่ใช่ตัวเลข ค่าจริงมาจาก backend และตั้งค่าได้จากหน้าจอ (#227)
   *  หน้าที่ hardcode 30 จะขัดกับป้ายในตารางที่มาจากใบเดียวกัน */
  expiryThresholdField: keyof ExpiryThresholdsConfig;
  service: typeof businessUnitLicenseService | typeof clusterLicenseService;

  /**
   * อ่าน "เจ้าของใบใช้ไปแล้วเท่าไร" — ตัวหารที่ทำให้จำนวนบนใบมีความหมาย · `null` = ชนิดนี้ไม่มี
   *
   * `undefined` ที่ resolve กลับมาแปลว่า **ไม่รู้** ไม่ใช่ศูนย์ ผู้เรียกต้องไม่แสดงอะไรเลยในกรณีนั้น
   * (`bu_used` เป็น optional ฝั่ง type — การอ่าน absent เป็น 0 คือกับดักที่รีโปนี้เคยเจอมาแล้ว)
   *
   * ใบที่นั่งเป็น `null` เพราะตัวหารของมันคือจำนวนผู้ใช้ของ BU ซึ่งมาจากคนละสูตร (ที่นั่งรวมทุกใบ
   * ส่วนโควตาชนะใบเดียว) การหยิบเลขมาโชว์คู่กันโดยไม่ตรวจสูตรก่อนคือทางที่จะได้เลขผิดแบบเงียบ ๆ
   */
  readUsage: ((ownerId: string) => Promise<number | undefined>) | null;

  /**
   * ยกเลิกใบ — `null` = ชนิดนี้ยกเลิกไม่ได้ (ใบที่นั่งไม่มี endpoint นี้ ไม่ใช่แค่ยังไม่ได้ต่อ)
   *
   * แยกจาก `service` เพราะ `cancel` มีอยู่บน `clusterLicenseService` ตัวเดียว การอ่านมันผ่าน
   * union ของ `service` จึงไม่ผ่าน type check และการ cast ทิ้งเพื่อให้ผ่านคือการซ่อนว่ามีชนิดหนึ่ง
   * ที่เรียกแล้วพังตอน runtime
   */
  cancel: ((ownerId: string, id: string, docVersion: number) => Promise<unknown>) | null;
}

export const SEAT_CONFIG: LicenseKindConfig = {
  kind: 'seat',
  amountField: 'licensed_users',
  ownerParam: 'bu',
  showNoExpiry: false,
  showNote: false,
  showCluster: true,
  listPath: '/licenses',
  editPathSegment: 'seats',
  expiryThresholdField: 'seat_days',
  service: businessUnitLicenseService,
  readUsage: null,
  cancel: null,
};

export const BU_QUOTA_CONFIG: LicenseKindConfig = {
  kind: 'bu-quota',
  amountField: 'licensed_bus',
  ownerParam: 'cluster',
  showNoExpiry: true,
  showNote: true,
  showCluster: false,
  listPath: '/licenses',
  editPathSegment: 'bu-quota',
  expiryThresholdField: 'bu_quota_days',
  service: clusterLicenseService,
  // เจ้าของใบโควตา **คือ** คลัสเตอร์ (`ownerParam: 'cluster'`) `ownerId` ที่ส่งเข้ามาจึงเป็น
  // cluster id ตรง ๆ · อ่าน `bu_used` จาก backend view ที่เดียวกับ ClusterEdit/ClusterLicenseTable
  // ห้ามนับ `businessUnits.length` เองฝั่ง client ไม่งั้นสามหน้าจะได้เลขไม่ตรงกันเงียบ ๆ
  readUsage: async (clusterId: string) => {
    const res = await clusterService.getById(clusterId);
    return ((res?.data ?? res) as { bu_used?: number } | null)?.bu_used;
  },
  cancel: (clusterId: string, id: string, docVersion: number) =>
    clusterLicenseService.cancel(clusterId, id, { doc_version: docVersion }),
};
