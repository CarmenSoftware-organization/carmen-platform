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
  /** ป้ายช่องจำนวนที่ผู้ใช้เห็น */
  amountLabel: string;
  /** หัวข้อหน้าโหมดสร้าง (`PageHeader title`) — เขียนตรง ๆ แยกจาก amountLabel แทนที่จะ compose
   *  ด้วย `Add ${amountLabel} License` เพราะ amountLabel เป็นป้ายของ "ช่องจำนวน" (สั้น ห้วน พอดี
   *  label ของ input) ไม่ใช่สำนวนหัวข้อหน้า สอง kind สะกด/เรียงคำต่างกันได้ตามธรรมชาติของภาษา
   *  (`Add seat license` vs `Add BU quota license`) โดยไม่ต้องพึ่งสูตร string เดียวที่บังคับให้เหมือนกัน */
  newPageTitle: string;
  /** ชื่อฟิลด์จำนวนบนสาย */
  amountField: 'licensed_users' | 'licensed_bus';
  /** ป้ายชนิดเจ้าของ */
  ownerLabel: string;
  /** ชื่อ query param ที่ใช้ prefill เจ้าของตอนสร้าง */
  ownerParam: 'bu' | 'cluster';
  /** ใบชนิดนี้มีสวิตช์ "ไม่มีวันหมดอายุ" ไหม (sentinel ปี 2099) */
  showNoExpiry: boolean;
  /** ใบชนิดนี้มีช่อง note ไหม */
  showNote: boolean;
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
  amountLabel: 'Seats',
  newPageTitle: 'Add seat license',
  amountField: 'licensed_users',
  ownerLabel: 'Business Unit',
  ownerParam: 'bu',
  showNoExpiry: false,
  showNote: false,
  listPath: '/licenses',
  editPathSegment: 'seats',
  service: businessUnitLicenseService,
};

export const BU_QUOTA_CONFIG: LicenseKindConfig = {
  kind: 'bu-quota',
  amountLabel: 'BU quota',
  newPageTitle: 'Add BU quota license',
  amountField: 'licensed_bus',
  ownerLabel: 'Cluster',
  ownerParam: 'cluster',
  showNoExpiry: true,
  showNote: true,
  listPath: '/licenses',
  editPathSegment: 'bu-quota',
  service: clusterLicenseService,
};
