import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import clusterLicenseService from '../../services/clusterLicenseService';

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
  service: typeof businessUnitLicenseService | typeof clusterLicenseService;
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
  service: businessUnitLicenseService,
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
  service: clusterLicenseService,
};
