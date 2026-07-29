# Platform Email Settings — หน้า Admin (Design)

วันที่: 2026-07-30
สถานะ: อนุมัติ design แล้ว
ต่อจาก: backend PR #264 (`carmen-turborepo-backend-v2`, branch `feature/platform-email-sender-profile`)

## ปัญหา / เป้าหมาย

backend PR #264 ย้ายค่าที่อยู่ผู้ส่งอีเมลระดับ platform (`no-reply@…`) และ SMTP ที่ใช้ส่ง
จาก environment variable ไปเก็บใน `tb_email_sender_profile` (CARMEN-SYSTEM) พร้อม API ครบ
แต่ยังไม่มีหน้าจอ — วันนี้ต้องยิง API เองถึงจะตั้งค่าได้ ซึ่งไม่ใช่ทางที่แอดมินจะใช้จริง

เป้าหมาย: หน้า admin ใน `carmen-platform` ที่ตั้งค่า ดู แก้ ลบ และ **ส่งเมลทดสอบ** ได้
โดยไม่ต้องแตะ env หรือฐานข้อมูล

## API ที่มีให้ใช้

ทั้งหมดอยู่ใต้ `/api-system/platform/email-settings`

| Method | Path | Permission |
|---|---|---|
| GET | `/` | `email_setting.read` |
| GET | `/:email_setting_id` | `email_setting.read` |
| POST | `/` | `email_setting.manage` |
| PUT | `/:email_setting_id` | `email_setting.manage` |
| DELETE | `/:email_setting_id` | `email_setting.manage` |
| POST | `/:email_setting_id/test` | `email_setting.manage` |

พฤติกรรมของ backend ที่หน้าจอต้องรู้:

- `smtp_password` ที่อ่านกลับมา**เป็นค่ามาสก์ `••••••` เสมอ** ไม่เคยคืนค่าจริง
- ตอนเขียน: ส่งค่ามาสก์กลับไป หรือไม่ส่งฟิลด์เลย = **คงรหัสผ่านเดิม** · ส่งค่าใหม่ = เปลี่ยน ·
  ส่ง `null`/`''` = ลบรหัสผ่าน
- `update` ต้องมี `doc_version` ไม่งั้น 400 · ถ้าไม่ตรง → 409
- 1 แถว active ต่อ 1 `purpose` — สร้างซ้ำได้ 409
- `POST /:id/test` รับ `{ to?: string }` — ไม่ส่ง `to` แล้ว backend เติมอีเมลผู้เรียกจาก JWT
  · endpoint นี้ทดสอบ **โปรไฟล์ที่บันทึกไว้แล้ว** ไม่ใช่ค่าที่อยู่ในฟอร์ม
- ถ้าไม่มีโปรไฟล์ active สำหรับ purpose นั้น ระบบจะ **fallback ไปใช้ SMTP จาก env ของเซิร์ฟเวอร์**

## ข้อมูลตั้งต้นที่มีผลต่อการออกแบบ

| เรื่อง | สถานะ |
|---|---|
| จำนวนข้อมูลสูงสุด | **3 แถวตลอดกาล** — `enum_email_sender_purpose` มีแค่ `no_reply`/`support`/`billing` และ backend บังคับ 1 active ต่อ purpose |
| precedent หน้า config | `src/pages/ReportFormGroupManagement.tsx` (309 บรรทัด) — การ์ดต่อกลุ่ม ไม่มี DataTable |
| precedent ที่ CLAUDE.md อ้าง | `PrintTemplateMapping*` — **ถูกลบไปแล้ว** (ฟีเจอร์ถูกถอดทั้งฝั่ง backend และ frontend) CLAUDE.md ยังอ้างอยู่ ต้องแก้ |
| case conversion | `src/services/api.ts` **ไม่มี** converter — type ใน repo นี้ใช้ snake_case ตรง ๆ (ต่างจาก convention กลาง) |
| เทสต์ | 28/28 หน้ามีเทสต์ครบ |
| permission mocking ในเทสต์ | `vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))` แล้วสลับ `auth.hasPermission` ต่อเทสต์ (`ReportFormGroupManagement.test.tsx`) |

## การตัดสินใจเชิงออกแบบ

| # | ประเด็น | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| D1 | รูปหน้า | หน้า config เดียว การ์ด 3 ใบ ไม่มี Management+Edit | ข้อมูลสูงสุด 3 แถว — DataTable + pagination + CSV เป็นเครื่องมือผิดขนาด กฎข้อ 13 เขียนไว้สำหรับ entity ที่ข้อมูลไม่จำกัด |
| D2 | ที่มาของการ์ด | render จาก **enum ฝั่ง frontend** แล้ว join response เข้าไป | ถ้า map จาก response อย่างเดียว purpose ที่ยังไม่มีแถวจะหายไปเงียบ ๆ แอดมินจะไม่รู้ว่ามีช่องให้ตั้ง |
| D3 | แสดงกี่ purpose | ครบ 3 แต่ `support`/`billing` มีคำเตือนชัดว่ายังไม่มีระบบไหนส่งผ่านช่องทางนี้ | วันนี้มีแค่ flow reset password ที่ใช้ `no_reply` — ซ่อนไว้จะทำให้เตรียมล่วงหน้าไม่ได้ แต่ไม่เตือนจะเข้าใจผิดว่าตั้งแล้วมีเมลออก |
| D4 | สิทธิ์ | `read` เข้าหน้าได้ · `manage` แก้ได้ · ใช้ `<Can>` **ซ่อนปุ่ม** ไม่ใช่ disable | ปุ่มที่กดไม่ได้สื่อว่า "ทำได้แต่ตอนนี้ไม่ได้" ซึ่งไม่จริง — ผู้ใช้ระดับ support จะเปิด ticket ถาม |
| D5 | ช่องรหัสผ่าน | ปุ่ม "เปลี่ยนรหัสผ่าน" (idle ↔ editing) · `PasswordField` คืนได้แค่ `string \| undefined` | ทำให้สถานะอันตราย (ส่ง `''` ไปล้าง credential) **พิมพ์ไม่ออก** ปลอดภัยกว่าการเช็คเงื่อนไขตอน submit |
| D6 | ลบรหัสผ่าน | **ไม่รองรับ** จาก UI นี้ ทั้งที่ backend รองรับ | ทางเดียวที่จะได้ `null` คือช่องว่าง ซึ่งเป็นสถานะเดียวกับ "เปิดแล้วเปลี่ยนใจ" · ราคาของการเผลอลบแล้วเมลหยุดส่งเงียบ ๆ สูงกว่าความสะดวกในเคสที่แทบไม่เกิด |
| D7 | จำนวนการ์ดที่แก้พร้อมกัน | **ทีละใบ** หน้าถือ `editingPurpose` | สองใบพร้อมกันทำให้ `Ctrl+S` ไม่มีคำตอบว่าบันทึกใบไหน และคำเตือน unsaved บอกไม่ได้ว่าอันไหน |
| D8 | ส่งทดสอบ | dialog ที่มีช่องผู้รับ prefill อีเมลผู้ใช้ · **ซ่อนปุ่มขณะกำลังแก้** | backend ทดสอบโปรไฟล์ที่บันทึกแล้ว ถ้ากดได้ระหว่างแก้ แอดมินจะได้ผลของค่าเก่าแล้วสรุปผิด |
| D9 | เทสต์ | เขียนครบ 3 ไฟล์ (service / PasswordField / page) | repo นี้ 28/28 หน้ามีเทสต์ — **ตัดสินใจโดยผู้ใช้ในรอบนี้ ทับกฎประจำที่ให้ข้ามเทสต์** |

## 1. เส้นทาง สิทธิ์ และโครงไฟล์

```tsx
// src/components/Layout.tsx — allNavItems, กลุ่ม Platform ต่อจาก Applications
{ path: '/platform/email-settings', label: 'Email Settings', icon: Mail,
  permission: 'email_setting.read', group: 'Platform' }

// src/App.tsx
<Route path="/platform/email-settings" element={
  <PrivateRoute requiredPermission="email_setting.read"><EmailSettingManagement /></PrivateRoute>
} />
```

**ไฟล์ที่สร้าง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/pages/EmailSettingManagement.tsx` | orchestrator — โหลด, ถือ `editingPurpose`, ประกอบการ์ด, shortcuts, debug sheet |
| `src/pages/emailSettings/EmailSettingCard.tsx` | 1 การ์ดต่อ 1 purpose — read-only view / ฟอร์ม / test / unset |
| `src/pages/emailSettings/PasswordField.tsx` | คอนโทรล "เปลี่ยนรหัสผ่าน" |
| `src/services/emailSettingService.ts` | เรียก API 6 ตัว |
| `src/constants/emailSenderPurposes.ts` | แหล่งความจริงของ 3 การ์ด |

**ไฟล์ที่แก้:** `src/types/index.ts` (เพิ่ม type) · `src/components/Layout.tsx` (nav) · `src/App.tsx` (route)
· `CLAUDE.md` (แก้ precedent ที่ตายแล้ว + บันทึกหน้าใหม่)

`PasswordField` แยกออกมาเพราะมี state ของตัวเองและเป็นจุดที่ contract กับ backend ซับซ้อนที่สุด —
แยกแล้วเทสต์ได้ตรงโดยไม่ต้องยกทั้งหน้าขึ้นมา

## 2. Types และ service

```ts
// src/types/index.ts
export type EmailSenderPurpose = 'no_reply' | 'support' | 'billing';

export interface EmailSetting {
  id: string;
  doc_version?: number;
  purpose: EmailSenderPurpose;
  from_email: string;
  from_name?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username?: string | null;
  smtp_password?: string | null;   // API คืนค่ามาสก์เสมอ
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailSettingTestResult {
  sent: boolean;
  reason?: string;   // smtp-error | decrypt-failed | lookup-failed
}
```

ฟิลด์ที่ API ไม่การันตีเป็น optional ทั้งหมด (กฎข้อ 11)

```ts
// src/services/emailSettingService.ts
const BASE = '/api-system/platform/email-settings';

const emailSettingService = {
  getAll: async (): Promise<ApiListResponse<EmailSetting>> => {
    const response = await api.get(`${BASE}?perpage=20`);
    return response.data;
  },
  getById: async (id: string) => (await api.get(`${BASE}/${id}`)).data,
  create:  async (data: Partial<EmailSetting>) => (await api.post(BASE, data)).data,
  update:  async (id: string, data: Partial<EmailSetting>) => (await api.put(`${BASE}/${id}`, data)).data,
  remove:  async (id: string) => (await api.delete(`${BASE}/${id}`)).data,
  sendTest: async (id: string, to?: string): Promise<EmailSettingTestResult> => {
    const body = to?.trim() ? { to: to.trim() } : {};
    const response = await api.post(`${BASE}/${id}/test`, body);
    return response.data?.data ?? response.data;
  },
};
```

ทุก method คืน `response.data` ไม่ใช่ตัว axios response — ตรงกับ `clusterService` และ service อื่นทั้งหมด
ของ repo · `sendTest` unwrap `{ data }` envelope แบบยอมรับได้ทั้งสองรูป เพราะ endpoint นี้เป็น endpoint
เดียวในชุดที่คืน object ผลลัพธ์ ไม่ใช่ entity

- `perpage=20` ระบุไว้ทั้งที่ enum จำกัดผลที่ 3 แถว — กันไม่ให้ default page size ของ backend
  ตัดข้อมูลเงียบ ๆ ถ้าวันหนึ่งเปลี่ยน ราคาถูกกว่า pagination loop ที่ repo นี้เคยต้องแก้ย้อนหลัง
  ในหน้า Form Groups
- `sendTest` **ตัดคีย์ `to` ออกทั้งคีย์** เมื่อว่าง ไม่ใช่ส่ง `to: ''` — เพราะ backend เติมอีเมล
  ผู้เรียกเฉพาะเมื่อไม่มีคีย์
- `update` เป็น pass-through `Partial<EmailSetting>` และ type มี `doc_version?: number`
  จึงส่งต่ออัตโนมัติตามที่ CLAUDE.md ระบุ ไม่ต้องเขียน payload builder

```ts
// src/constants/emailSenderPurposes.ts
export const EMAIL_SENDER_PURPOSES = [
  { value: 'no_reply', label: 'No-reply', inUse: true,
    description: 'อีเมลอัตโนมัติที่ผู้ใช้ตอบกลับไม่ได้ เช่น รีเซ็ตรหัสผ่าน' },
  { value: 'support', label: 'Support', inUse: false,
    description: 'อีเมลที่ต้องการให้ผู้รับตอบกลับหาทีมซัพพอร์ตได้' },
  { value: 'billing', label: 'Billing', inUse: false,
    description: 'อีเมลเรื่องใบแจ้งหนี้และการชำระเงิน' },
] as const;
```

`inUse: false` ทำให้การ์ดแสดงคำเตือนว่า **"ยังไม่มีระบบไหนส่งอีเมลผ่านช่องทางนี้ — ตั้งค่าไว้ล่วงหน้าได้
แต่จะยังไม่มีเมลออก"** ตาม D3

## 3. การ์ด

```ts
interface EmailSettingCardProps {
  purpose: EmailSenderPurpose;
  label: string;
  description: string;
  inUse: boolean;
  setting: EmailSetting | null;   // null = ยังไม่ตั้งค่า
  canManage: boolean;
  isEditing: boolean;             // หน้าเป็นคนตัดสิน (D7)
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;            // ให้หน้า refetch
}
```

การ์ดเป็นเจ้าของ form state และเรียก service เอง · หน้าเป็นเจ้าของว่า "มีโปรไฟล์อะไรบ้าง" และ
"ตอนนี้แก้ใบไหนอยู่"

**สองสถานะของการ์ด**

| สถานะ | แสดง |
|---|---|
| ยังไม่ตั้งค่า | label + description + badge "ยังไม่ตั้งค่า" + ปุ่ม **ตั้งค่า** |
| ตั้งค่าแล้ว | `from_name <from_email>` · `smtp_host:smtp_port` · `<Badge variant={is_active ? 'success' : 'secondary'}>` · ปุ่ม **Edit** / **ส่งเมลทดสอบ** / **ยกเลิกการตั้งค่า** |

**ฟิลด์ในฟอร์ม:** `from_email` (บังคับ, ตรวจรูปแบบอีเมลด้วย `validateField`) · `from_name` ·
`smtp_host` (บังคับ) · `smtp_port` (default 587) · `smtp_secure` · `smtp_username` ·
`smtp_password` (`PasswordField`) · `is_active` · `note`

`smtp_secure` มี helper text: **"เปิดเมื่อใช้ implicit TLS (มักเป็นพอร์ต 465) — พอร์ต 587 ปกติ
ใช้ STARTTLS ให้ปิดไว้"** เพราะกรอกผิดแล้วอาการคือ "ส่งไม่ออก" โดยไม่บอกสาเหตุ

ทุกฟิลด์ render สองโหมด (แก้ไข / อ่านอย่างเดียว) ตาม Form Field Pattern ของ CLAUDE.md

### 3.1 `PasswordField` — สัญญา

| สถานะ | แสดง | คืนค่า |
|---|---|---|
| มีรหัสอยู่แล้ว ยังไม่แตะ | "ตั้งรหัสผ่านไว้แล้ว" + ปุ่ม **เปลี่ยนรหัสผ่าน** | `undefined` |
| ไม่มีรหัส (relay ไม่ต้อง auth) | "ไม่ได้ตั้งรหัสผ่าน" + ปุ่ม **ตั้งรหัสผ่าน** | `undefined` |
| กำลังพิมพ์ | ช่อง `type="password"` + ปุ่ม **ยกเลิก** | ข้อความที่พิมพ์ |
| กำลังพิมพ์แต่ปล่อยว่าง | ช่อง + hint "ปล่อยว่าง = ไม่เปลี่ยน" | `undefined` |
| สร้างใหม่ | ช่องเปล่าตลอด (ไม่มีสถานะ idle) | ข้อความที่พิมพ์ หรือ `undefined` ถ้าว่าง |

**ไม่มีทางคืน `null`** (D6) ใต้ปุ่มมีข้อความว่าถ้าจะเปลี่ยนไปใช้ relay ที่ไม่ต้อง auth
ให้ยกเลิกการตั้งค่าแล้วสร้างใหม่

### 3.2 ส่งเมลทดสอบ

ปุ่ม → dialog ช่องผู้รับหนึ่งช่อง ปล่อยว่างได้ ปุ่มยืนยันแสดง spinner และรอผลจริง

**การ prefill ต้องระวัง:** `AuthContext` ตั้ง `user.email` จาก `credentials.username` (`AuthContext.tsx:156`)
ซึ่งอาจเป็น **username ไม่ใช่อีเมล** เพราะระบบนี้ล็อกอินด้วย username ได้ จึง prefill เฉพาะเมื่อค่านั้น
มี `@` เท่านั้น กรณีอื่นปล่อยช่องว่างพร้อม placeholder ว่า "เว้นว่าง = ส่งไปที่อีเมลของคุณ" —
กัน dialog เติมค่าที่ backend จะปฏิเสธ

| ผลลัพธ์ | toast |
|---|---|
| `sent: true` | ✅ ส่งไปที่ `<address>` แล้ว — ตรวจกล่องขาเข้าและ spam |
| `smtp-error` | ❌ เชื่อมต่อ SMTP ไม่สำเร็จ — ตรวจ host, port, TLS และรหัสผ่าน |
| `decrypt-failed` | ❌ ถอดรหัสรหัสผ่านไม่ได้ — `SECRET_ENCRYPTION_KEY` ของเซิร์ฟเวอร์ไม่ตรงกัน ต้องให้ทีมระบบตรวจ |
| `lookup-failed` | ❌ อ่านโปรไฟล์จากฐานข้อมูลไม่ได้ |

**ปุ่มทดสอบไม่แสดงขณะกำลังแก้ฟอร์ม** แสดงข้อความ "บันทึกก่อนจึงจะทดสอบได้" แทน (D8)

## 4. State, ข้อผิดพลาด, doc_version

```ts
// EmailSettingManagement.tsx
const [settings, setSettings] = useState<EmailSetting[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [editingPurpose, setEditingPurpose] = useState<EmailSenderPurpose | null>(null);
const [rawResponse, setRawResponse] = useState<unknown>(null);
```

```ts
// EmailSettingCard.tsx
const [formData, setFormData] = useState<EmailSettingFormData>(initial);
const [savedFormData, setSavedFormData] = useState<EmailSettingFormData>(initial);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const [docVersion, setDocVersion] = useState<number>();   // ห้ามอยู่ใน formData
const [saving, setSaving] = useState(false);
```

กดปุ่ม Edit ของอีกใบขณะยังมี dirty → `<ConfirmDialog>` ถามว่าจะทิ้งการแก้ไขไหม
`useUnsavedChanges(hasChanges)` และ `useGlobalShortcuts({ onSave, onCancel })` ผูกที่หน้าครั้งเดียว
แล้ววิ่งไปหาการ์ดที่กำลังแก้อยู่ — ตรงตามกฎข้อ 14 โดยไม่ต้องทำสามชุด

**`doc_version` ตามกฎข้อ 17:** เก็บจาก `getDocVersion(setting)` ตอนโหลด ไม่อยู่ใน `formData` ·
ส่งเฉพาะตอน update และเฉพาะเมื่อมีค่า · `isVersionConflict(err)` → `notifyVersionConflict()` +
refetch โดยการ์ด**ยังอยู่ในโหมดแก้** และค่าถูกโหลดใหม่เป็นล่าสุด

**ทุก `catch`** ใช้ `parseApiError(err)` → `toast.error(message)` และ `setFieldErrors(fields)`
เมื่อ backend ส่ง field error กลับมา (กฎข้อ 12)

| เงื่อนไข | แสดง |
|---|---|
| `loading` | การ์ด skeleton 3 ใบ |
| โหลดล้มเหลว | `<FetchErrorState>` พร้อมปุ่มลองใหม่ |
| ปกติ | การ์ดจริง 3 ใบ |

ไม่มี empty state — การ์ดขึ้นครบเสมอ สถานะ "ยังไม่ตั้งค่า" อยู่ในตัวการ์ด

**ยกเลิกการตั้งค่า** → `<ConfirmDialog>` (ห้าม `window.confirm` ตามกฎข้อ 3) ข้อความบอกผลจริง:

> ลบโปรไฟล์ No-reply — หลังจากนี้ระบบจะกลับไปใช้ค่า SMTP จาก environment ของเซิร์ฟเวอร์
> ถ้าไม่ได้ตั้งค่านั้นไว้ **อีเมลรีเซ็ตรหัสผ่านจะหยุดส่ง** และต้องตั้งรหัสผ่านใหม่ทั้งหมด
> หากจะสร้างโปรไฟล์นี้อีกครั้ง

**Debug sheet** ครอบด้วย `process.env.NODE_ENV === 'development'` เก็บ `rawResponse` พร้อม
คอมเมนต์กำกับว่าปลอดภัยเพราะ API คืนค่ามาสก์เสมอ — เป็นสมมติฐานที่ถ้า backend เปลี่ยนวันหลังจะพังเงียบ

## 5. เทสต์

### `src/services/emailSettingService.test.ts`
- `getAll()` ยิง URL ถูกและมี `perpage`
- `sendTest(id)` ไม่ระบุผู้รับ → body **ไม่มีคีย์ `to`** (ไม่ใช่ `to: ''`)
- `sendTest(id, 'a@b.co')` → body มี `to`
- `update` ส่ง `doc_version` ทะลุถึง payload

### `src/pages/emailSettings/PasswordField.test.tsx`
ครบทั้ง 5 แถวของตาราง 3.1 โดยเฉพาะสองแถวที่เป็นกับดัก:
- มีรหัสอยู่ ไม่แตะ → `undefined`
- กดเปลี่ยนรหัส ปล่อยว่าง บันทึก → **`undefined` ไม่ใช่ `''`** — เทสต์นี้คือสิ่งที่กันไม่ให้
  credential ถูกล้างโดยอุบัติเหตุถ้ามีใครมา "ทำให้เรียบง่ายขึ้น" วันหลัง

### `src/pages/EmailSettingManagement.test.tsx`
mock `Layout`, `AuthContext`, `sonner`, service · `MemoryRouter` ของจริง · **ปล่อย `Can` ทำงานจริง**
เพื่อให้การทดสอบสิทธิ์มีความหมาย (ตาม precedent `ReportFormGroupManagement.test.tsx`)

- ขึ้นครบ 3 การ์ดแม้ API คืนมาแค่ `no_reply`
- ไม่มี `manage` → ไม่มีปุ่ม Edit / Test / ยกเลิกการตั้งค่า แต่ยังเห็นข้อมูล
- เปิดแก้ใบที่สองขณะใบแรก dirty → ขึ้น ConfirmDialog
- ปุ่มทดสอบหายไปขณะแก้ และมีข้อความ "บันทึกก่อนจึงจะทดสอบได้"
- save ได้ 409 → เรียก `notifyVersionConflict` และ refetch โดยยังอยู่โหมดแก้
- ส่งทดสอบได้ `{ sent: false, reason: 'decrypt-failed' }` → toast เป็นข้อความที่ทำอะไรต่อได้
  ไม่ใช่ reason ดิบ
- ยกเลิกการตั้งค่า → ConfirmDialog มีข้อความเตือนเรื่อง fallback ไป env

**ไม่ทดสอบ:** การจัดวาง/สไตล์, ค่า default ที่เป็น constant, การ render ของ `DevDebugSheet` (dev-only)

**เกณฑ์ผ่าน:** `bun run test` เขียวทั้งชุด · `bun run build` ผ่าน (vite-plugin-eslint รัน lint ตอน build)

## 6. นอกขอบเขต

- **ไม่แก้ `src/components/ui/`** (กฎข้อ 2)
- **ไม่ทำหน้าประวัติการส่ง / log อีเมล** — backend ไม่มี API
- **ไม่ทำ UI ลบรหัสผ่าน** (D6)
- **ไม่แตะ flow อีเมลระดับ BU** — คนละระบบ อยู่ในหน้า config ของ BU
- **ไม่เพิ่ม E2E** — อยู่ในรีโปพี่น้อง `../carmen-platform-e2e` เป็นงานแยก

## 7. ความเสี่ยงที่รู้ตัว

| ความเสี่ยง | ผลกระทบ | การรับมือ |
|---|---|---|
| backend PR #264 ยังไม่ merge และยังไม่ deploy | หน้าเรียก API แล้วได้ 404/401 ทั้งหมด | หน้านี้ merge ได้อิสระ แต่**ใช้งานจริงไม่ได้จนกว่า backend จะขึ้น** รวมถึงต้อง grant `email-setting.*` ให้ application record ด้วย ไม่งั้น `AppIdGuard` ตอบ 401 |
| permission `email_setting.*` ยังไม่ถูก seed | nav ไม่ขึ้นและเข้าหน้าไม่ได้แม้เป็น admin | เป็นขั้นตอน deploy ของ backend (PR #264 §6.4) |
| แอดมินกดทดสอบแล้วเข้าใจว่าทดสอบค่าที่เพิ่งพิมพ์ | สรุปผลผิด แก้ปัญหาผิดจุด | ซ่อนปุ่มขณะแก้ + ข้อความ "บันทึกก่อนจึงจะทดสอบได้" (D8) |
| เผลอล้าง credential | เมลหยุดส่งเงียบ ๆ | `PasswordField` คืน `null` ไม่ได้เลย + เทสต์ pin ไว้ (D5, D6) |
