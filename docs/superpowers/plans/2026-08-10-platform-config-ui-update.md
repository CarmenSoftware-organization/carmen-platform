# แผนลงมือ — หน้า Platform Config รับ schema ใหม่ + ปิดช่องว่าง rbac.read

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้หน้า Platform Config แก้ค่า rate limit ของคำเชิญได้ จัดการ์ดเป็น 3 กลุ่มที่อ่านออก และปิดช่องว่างสิทธิ์ `rbac.read` ที่ backend v2.0.0 เพิ่งเพิ่ม

**Architecture:** ดึง chrome ที่ซ้ำกันของการ์ด 4 ใบ (header + ปุ่ม Edit + แถบ Save/Cancel + `ReadOnlyText`) ออกเป็น `ConfigCardShell` ตัวเดียว **โดยไม่แตะ form logic** ของแต่ละการ์ด แล้วเพิ่มการ์ดที่ 6 บน shell นั้น จากนั้นจัดหน้าเป็น 3 section และแก้ permission gate 2 จุดที่ตามหลัง backend ไม่ทัน

**Tech Stack:** React 19 + TypeScript strict, shadcn/ui (Radix + CVA), Tailwind 3.4, axios, sonner

**Spec:** `docs/superpowers/specs/2026-08-10-platform-config-ui-update-design.md`

## Global Constraints

ทุก task อยู่ใต้ข้อบังคับเหล่านี้ ไม่ต้องย้ำในแต่ละ task

- **ไม่เขียน automated test** ตามแนวทางของผู้ใช้ — ทุก task จบด้วย `bun run typecheck` + `bun run lint` + commit และยืนยันด้วยเบราว์เซอร์ที่ Task 6
- **ห้ามแตะ `src/pages/emailSettings/`** — `email_routing` ต้องคง `update()` (PUT) ไว้ เพราะการไม่ส่งฟิลด์แปลว่าตั้งใจล้างค่า ถ้าย้ายไป PATCH เส้นทางที่ตั้งไว้จะล้างไม่ออกอีกเลย
- **ห้ามใช้ `<Separator />`** แม้ primitive จะมีอยู่ที่ `src/components/ui/separator.tsx` — ไม่มีหน้าไหนในแอปใช้ ต้นแบบหัวข้อ section คือ `src/pages/EmailSettingManagement.tsx:107-115`
- **ห้ามใส่เพดานบน (`max`) ให้ฟิลด์ rate limit** — backend ใช้ `z.number().int().positive()` ไม่มีเพดาน การใส่ `max` ฝั่ง FE จะทำให้ฟอร์มปฏิเสธค่าที่ API รับได้จริง
- **ฟิลด์ใหม่ใน type ต้องเป็น optional (`?`)** ตามกฎข้อ 11 ของ `CLAUDE.md`
- **ห้ามแตะ `src/components/ui/`** ตามกฎข้อ 2
- **ห้ามใช้ `alert()` / `window.confirm()`** — ใช้ `toast.*` ตามกฎข้อ 3
- Import ที่เลิกใช้ต้องลบทุกครั้ง — `vite-plugin-checker` รัน tsc + eslint และ `TS6133` (unused) จะทำให้ build ล้ม

---

## File Structure

| ไฟล์ | ความรับผิดชอบ | Task |
|---|---|---|
| `src/pages/platformConfig/ConfigCardShell.tsx` | **ใหม่** — chrome ของการ์ด config หนึ่งใบ: header, ปุ่ม Edit, แถบ Save/Cancel และ export `ReadOnlyText` | 1 |
| `src/types/index.ts` | `InvitationConfig` +2 ฟิลด์ optional | 1 |
| `src/pages/platformConfig/InvitationConfigCard.tsx` | ห่อ shell (ใช้ `patch()` อยู่แล้ว) | 2 |
| `src/pages/platformConfig/LinkConfigCard.tsx` | ห่อ shell + PUT→PATCH | 2 |
| `src/pages/platformConfig/SignupConfigCard.tsx` | ห่อ shell + PUT→PATCH | 2 |
| `src/pages/platformConfig/NotificationEmailConfigCard.tsx` | ห่อ shell + PUT→PATCH | 2 |
| `src/pages/platformConfig/InvitationLimitsCard.tsx` | **ใหม่** — 2 ฟิลด์ rate limit ของ key `invitation` | 3 |
| `src/pages/PlatformConfigManagement.tsx` | `editingKey`→`editingCard`, วางการ์ดที่ 6 (Task 3), 3 section + skeleton (Task 4) | 3, 4 |
| `src/App.tsx` | route `/platform/permissions` → `rbac.read` | 5 |
| `src/pages/RoleEdit.tsx` | แยก 403 ใน `fetchCatalog` | 5 |

---

## Task 1: `ConfigCardShell` + ฟิลด์ใหม่ใน type

**Files:**
- Create: `src/pages/platformConfig/ConfigCardShell.tsx`
- Modify: `src/types/index.ts:763-766`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces:
  - `ConfigCardShell` — React component รับ props ตามด้านล่าง
  - `ReadOnlyText` — `React.FC<{ value: string }>` export จากไฟล์เดียวกัน ทุกการ์ดใน Task 2–3 จะ import ตัวนี้แทนที่จะประกาศเอง
  - `InvitationConfig` — เพิ่ม `max_per_admin_per_hour?: number` และ `max_per_cluster_per_day?: number`

- [ ] **Step 1: สร้าง `src/pages/platformConfig/ConfigCardShell.tsx`**

โค้ดของ header และแถบ Save/Cancel ยกมาจากการ์ดที่มีอยู่แบบไม่เปลี่ยน markup เลย — ทั้ง 4 การ์ดเขียนเหมือนกันอยู่แล้ว ต่างแค่ title/description

```tsx
import React from 'react';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

interface ConfigCardShellProps {
  title: string;
  /** คำอธิบายใต้หัวข้อการ์ด รับ node ได้เพื่อให้ใส่ <code> หรือลิงก์ได้ */
  description: React.ReactNode;
  canManage: boolean;
  isEditing: boolean;
  saving: boolean;
  onRequestEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** ฟิลด์ของการ์ดนั้น — shell ไม่รู้จักและไม่ยุ่งกับ form state */
  children: React.ReactNode;
}

/**
 * เปลือกของการ์ดใน Platform Config — header, ปุ่ม Edit และแถบ Save/Cancel
 *
 * ตั้งใจไม่ถือ form state: `formData` / `fieldErrors` / `validate` / การเรียก service
 * ยังอยู่ในการ์ดแต่ละใบ เพราะหน้านี้ไม่มี test รองรับ การดึง logic ออกมาด้วยจะเปลี่ยน
 * พฤติกรรมของการ์ดที่ทำงานอยู่ 4 ชุดพร้อมกันโดยไม่มีอะไรจับ regression
 */
export const ConfigCardShell: React.FC<ConfigCardShellProps> = ({
  title,
  description,
  canManage,
  isEditing,
  saving,
  onRequestEdit,
  onSave,
  onCancel,
  children,
}) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div className="min-w-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {canManage && !isEditing && (
        <Button variant="outline" size="sm" onClick={onRequestEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      )}
    </CardHeader>
    <CardContent className="space-y-4">
      {children}

      {isEditing && (
        <div className="flex gap-3 pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
);

/** ช่องอ่านอย่างเดียวของฟอร์ม config — เดิมประกาศซ้ำในทุกการ์ด */
export const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);
```

- [ ] **Step 2: เพิ่ม 2 ฟิลด์เข้า `InvitationConfig`**

ที่ `src/types/index.ts` แทนที่ interface เดิม (บรรทัด 763–766)

```ts
export interface InvitationConfig {
  base_url: string;
  expiry_days: number;
  /**
   * เพดานคำเชิญต่อผู้ดูแลหนึ่งคนต่อชั่วโมง (backend default 100)
   * optional เพราะแถวที่บันทึกก่อน backend PR #318 ไม่มีฟิลด์นี้
   */
  max_per_admin_per_hour?: number;
  /** เพดานคำเชิญต่อ cluster ต่อวัน (backend default 500) */
  max_per_cluster_per_day?: number;
}
```

- [ ] **Step 3: ตรวจว่าคอมไพล์ผ่าน**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่านทั้งคู่ `ConfigCardShell` ยังไม่มีใครเรียกใช้ในขั้นนี้ ซึ่งไม่เป็นปัญหาเพราะเป็น export ไม่ใช่ตัวแปรในไฟล์

- [ ] **Step 4: Commit**

```bash
git add src/pages/platformConfig/ConfigCardShell.tsx src/types/index.ts
git commit -m "feat(platform-config): เพิ่ม ConfigCardShell และฟิลด์ rate limit ใน InvitationConfig"
```

---

## Task 2: ย้ายการ์ดเดิม 4 ใบมาใช้ shell และเปลี่ยน PUT เป็น PATCH

**Files:**
- Modify: `src/pages/platformConfig/InvitationConfigCard.tsx`
- Modify: `src/pages/platformConfig/LinkConfigCard.tsx`
- Modify: `src/pages/platformConfig/SignupConfigCard.tsx`
- Modify: `src/pages/platformConfig/NotificationEmailConfigCard.tsx`

**Interfaces:**
- Consumes: `ConfigCardShell`, `ReadOnlyText` จาก Task 1
- Produces: props ภายนอกของการ์ดทั้ง 4 **ไม่เปลี่ยน** — `PlatformConfigManagement.tsx` ยังเรียกเหมือนเดิมทุกตัวอักษรจนกว่าจะถึง Task 3

การแก้ทั้ง 4 ไฟล์เป็นรูปแบบเดียวกัน ทำทีละไฟล์แล้วค่อยไปไฟล์ถัดไป

- [ ] **Step 1: แก้ `InvitationConfigCard.tsx`**

1. ลบ `const ReadOnlyText = ...` ที่ประกาศในไฟล์ (บรรทัด 45–49)
2. แทน import block เดิมด้วย

```tsx
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConfigCardShell, ReadOnlyText } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { InvitationConfig, PlatformConfig } from '../../types';
```

`Card`/`CardContent`/`CardHeader`/`CardTitle`/`Button` และไอคอน `Loader2`/`Pencil`/`Save`/`X` **ต้องหายไปจาก import** — ตอนนี้อยู่ใน shell แล้ว ถ้าลืมลบ `TS6133` จะทำให้ build ล้ม

3. เปลี่ยน JSX ที่ return: จาก `<Card>…</Card>` เป็น

```tsx
  return (
    <ConfigCardShell
      title="Invitation"
      description="ลิงก์ปลายทางและอายุของคำเชิญเข้าคลัสเตอร์"
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {/* ---- ยกบรรทัด 148–197 (สองบล็อก space-y-2: Base URL และ Expiry) มาไว้ตรงนี้ ไม่เปลี่ยนอะไรข้างใน ---- */}
    </ConfigCardShell>
  );
```

บล็อก `{isEditing && (<div className="flex gap-3 pt-2">…)}` บรรทัด 199–214 **ลบทิ้ง** — shell แสดงให้แล้ว

ส่วน `handleSave` ของไฟล์นี้ **ไม่ต้องแก้** มันใช้ `patch()` อยู่แล้ว แต่ให้อัปเดตคอมเมนต์เหนือ `platformConfigService.patch(` เป็น

```ts
      // patch ไม่ใช่ update: การ์ด Rate limits แก้ max_per_admin_per_hour /
      // max_per_cluster_per_day ของคีย์เดียวกันนี้อยู่คนละใบ การส่งด้วย update()
      // ซึ่งเป็น full replace จะเขียนทับค่าที่การ์ดนี้ไม่ได้แสดง
```

- [ ] **Step 2: แก้ `LinkConfigCard.tsx` แบบเดียวกัน**

ลบ `ReadOnlyText` (บรรทัด 34–38), ตัด import ที่ย้ายไป shell, ห่อด้วย shell โดยส่ง `title={title}` `description={description}` (สอง prop นี้การ์ดรับมาจากภายนอกอยู่แล้ว), ยกบรรทัด 156–203 มาเป็น children และลบแถบ Save/Cancel บรรทัด 205–220

จากนั้นเปลี่ยนการบันทึกที่บรรทัด 124 จาก `update` เป็น `patch`

```ts
      // PATCH ไม่ใช่ PUT: หลัง backend PR #319 การส่งไม่ครบทุกฟิลด์ของ schema ตอบ 422
      // การ์ดนี้แสดงครบทั้ง 2 ฟิลด์ในวันนี้ แต่ PATCH ทำให้วันที่ backend เติมฟิลด์ที่ 3
      // เข้า schema การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะพังทันที
      await platformConfigService.patch(configKey, {
        base_url: formData.base_url.trim(),
        expiry_hours: Number(formData.expiry_hours),
      });
```

- [ ] **Step 3: แก้ `SignupConfigCard.tsx` แบบเดียวกัน**

`title="Sign-up"` `description="ลิงก์ปลายทางของอีเมลยืนยันอีเมลก่อนสร้างบัญชี"`
ลบ `ReadOnlyText` บรรทัด 50–54 · children คือบรรทัด 149–198 · ลบแถบ Save/Cancel บรรทัด 200–215

เปลี่ยนการบันทึกที่บรรทัด 115 (คอมเมนต์เดียวกับ Step 2)

```ts
      await platformConfigService.patch('signup', {
        verify_base_url: formData.verify_base_url.trim(),
        link_expiry_hours: Number(formData.link_expiry_hours),
      });
```

- [ ] **Step 4: แก้ `NotificationEmailConfigCard.tsx` แบบเดียวกัน**

`title="Notification Email"` `description="ผู้รับอีเมลแจ้งเตือนภายใน (รายงาน / การแจ้งเตือนระดับหน่วยธุรกิจ)"`

ลบ `ReadOnlyText` บรรทัด 59–63 · children คือบรรทัด 165–257 (สี่บล็อก: Sending, Recipients, CC, Subject prefix) · ลบแถบ Save/Cancel บรรทัด 259–274

การ์ดนี้ใช้ checkbox กับ list ของอีเมล — **ห้ามแก้ `splitCsv` หรือ logic การแปลง recipients/cc** เปลี่ยนเฉพาะบรรทัด 129 จาก `update` เป็น `patch` โดยคง payload เดิมทั้ง 4 ฟิลด์

```ts
      // PATCH ไม่ใช่ PUT: หลัง backend PR #319 การส่งไม่ครบทุกฟิลด์ของ schema ตอบ 422
      // การ์ดนี้แสดงครบทั้ง 4 ฟิลด์ในวันนี้ แต่ PATCH ทำให้วันที่ backend เติมฟิลด์ที่ 5
      // เข้า schema การ์ดนี้ยังบันทึกได้ตามเดิมแทนที่จะพังทันที
      await platformConfigService.patch('notification_email', {
        enabled: formData.enabled,
        recipients: splitCsv(formData.recipients),
        cc: splitCsv(formData.cc),
        subject_prefix: formData.subject_prefix.trim(),
      });
```

- [ ] **Step 5: ตรวจว่าไม่มี `ReadOnlyText` ซ้ำและไม่มี PUT หลงเหลือในหน้านี้**

```bash
grep -rn "const ReadOnlyText" src/pages/platformConfig/
grep -rn "platformConfigService.update" src/pages/platformConfig/
```
คาดหวัง: คำสั่งแรกได้เฉพาะ `ConfigCardShell.tsx` · คำสั่งที่สองได้ **0 บรรทัด**

```bash
grep -rn "platformConfigService.update" src/pages/emailSettings/
```
คาดหวัง: ยังต้องเจอ `EmailRoutingCard.tsx` — ถ้าหายแปลว่าเผลอไปแก้ไฟล์นอกขอบเขต

- [ ] **Step 6: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/platformConfig/
git commit -m "refactor(platform-config): ย้ายการ์ดทั้งสี่มาใช้ ConfigCardShell และเปลี่ยน PUT เป็น PATCH"
```

---

## Task 3: การ์ด Rate limits และแยกสถานะแก้ไขตามการ์ดไม่ใช่ตามคีย์

**Files:**
- Create: `src/pages/platformConfig/InvitationLimitsCard.tsx`
- Modify: `src/pages/PlatformConfigManagement.tsx`

**Interfaces:**
- Consumes: `ConfigCardShell`, `ReadOnlyText` (Task 1) · `InvitationConfig` ที่มี 2 ฟิลด์ใหม่ (Task 1)
- Produces:
  - `InvitationLimitsCard` — props ชุดเดียวกับการ์ดอื่นทุกตัว: `{ config: PlatformConfig | null; canManage: boolean; isEditing: boolean; onRequestEdit: () => void; onCancelEdit: () => void; onSaved: () => void | Promise<void> }`
  - `PlatformConfigManagement` เปลี่ยนภายในเป็น `editingCard` — ไม่มีใครนอกไฟล์อ้างถึง state นี้

- [ ] **Step 1: สร้าง `src/pages/platformConfig/InvitationLimitsCard.tsx`**

```tsx
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConfigCardShell, ReadOnlyText } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { InvitationConfig, PlatformConfig } from '../../types';

interface InvitationLimitsCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

interface LimitsFormData {
  max_per_admin_per_hour: string;
  max_per_cluster_per_day: string;
}

/** ต้องเท่ากับ default ใน PLATFORM_CONFIG_REGISTRY ฝั่ง backend */
const DEFAULTS = {
  max_per_admin_per_hour: 100,
  max_per_cluster_per_day: 500,
};

const toForm = (config: PlatformConfig | null): LimitsFormData => {
  const value = (config?.value ?? {}) as Partial<InvitationConfig>;
  return {
    max_per_admin_per_hour: String(
      typeof value.max_per_admin_per_hour === 'number'
        ? value.max_per_admin_per_hour
        : DEFAULTS.max_per_admin_per_hour,
    ),
    max_per_cluster_per_day: String(
      typeof value.max_per_cluster_per_day === 'number'
        ? value.max_per_cluster_per_day
        : DEFAULTS.max_per_cluster_per_day,
    ),
  };
};

export const InvitationLimitsCard: React.FC<InvitationLimitsCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<LimitsFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * backend ใช้ z.number().int().positive() — ไม่มีเพดานบน จึงไม่ตรวจ max ที่นี่
   * การใส่เพดานฝั่ง FE จะทำให้ฟอร์มปฏิเสธค่าที่ API รับได้จริง
   */
  const validate = (value: string): string => {
    if (!value.trim()) return 'ต้องระบุจำนวน';
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return 'ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป';
    return '';
  };

  const handleChange = (name: keyof LimitsFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof LimitsFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      max_per_admin_per_hour: validate(formData.max_per_admin_per_hour),
      max_per_cluster_per_day: validate(formData.max_per_cluster_per_day),
    };
    if (errors.max_per_admin_per_hour || errors.max_per_cluster_per_day) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      // patch ไม่ใช่ update: base_url และ expiry_days ของคีย์เดียวกันนี้อยู่ในการ์ด
      // Invitation อีกใบ การส่งด้วย update() ซึ่งเป็น full replace จะล้างสองค่านั้น
      await platformConfigService.patch('invitation', {
        max_per_admin_per_hour: Number(formData.max_per_admin_per_hour),
        max_per_cluster_per_day: Number(formData.max_per_cluster_per_day),
      });
      toast.success('บันทึกเพดานคำเชิญแล้ว');
      await onSaved();
    } catch (err: unknown) {
      const { message, fields } = parseApiError(err);
      if (fields) setFieldErrors(fields);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const form = toForm(config);

  return (
    <ConfigCardShell
      title="Rate limits"
      description="เพดานจำนวนคำเชิญที่ออกได้ในช่วงเวลาหนึ่ง"
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <div className="space-y-2">
        <Label htmlFor="invitation-max-per-admin-per-hour">ต่อผู้ดูแลหนึ่งคน / ชั่วโมง</Label>
        {isEditing ? (
          <>
            <Input
              id="invitation-max-per-admin-per-hour"
              type="number"
              min={1}
              value={formData.max_per_admin_per_hour}
              onChange={(e) => handleChange('max_per_admin_per_hour', e.target.value)}
              onBlur={() => handleBlur('max_per_admin_per_hour')}
              className={fieldErrors.max_per_admin_per_hour ? 'border-destructive' : ''}
            />
            {fieldErrors.max_per_admin_per_hour && (
              <p className="text-xs text-destructive">{fieldErrors.max_per_admin_per_hour}</p>
            )}
          </>
        ) : (
          <ReadOnlyText value={`${form.max_per_admin_per_hour} คำเชิญ`} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="invitation-max-per-cluster-per-day">ต่อคลัสเตอร์ / วัน</Label>
        {isEditing ? (
          <>
            <Input
              id="invitation-max-per-cluster-per-day"
              type="number"
              min={1}
              value={formData.max_per_cluster_per_day}
              onChange={(e) => handleChange('max_per_cluster_per_day', e.target.value)}
              onBlur={() => handleBlur('max_per_cluster_per_day')}
              className={fieldErrors.max_per_cluster_per_day ? 'border-destructive' : ''}
            />
            {fieldErrors.max_per_cluster_per_day && (
              <p className="text-xs text-destructive">{fieldErrors.max_per_cluster_per_day}</p>
            )}
          </>
        ) : (
          <ReadOnlyText value={`${form.max_per_cluster_per_day} คำเชิญ`} />
        )}
      </div>

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
        <p>
          ค่าเริ่มต้นตั้งไว้สูงโดยตั้งใจ — การเปิดโรงแรมใหม่แล้วเชิญพนักงาน 30–50 คนรวดเดียวเป็น
          สถานการณ์ปกติ เพดานนี้กันการใช้ผิดปกติ <strong>ไม่ใช่ขอบเขตความปลอดภัย</strong> จึงไม่ควรลดลงมา
          ใกล้จำนวนการใช้งานจริง
        </p>
        <p className="mt-2">
          ตัวนับอยู่ในหน่วยความจำของแต่ละ process — <strong>เพดานที่มีผลจริงคูณตามจำนวน instance</strong>{' '}
          ที่รันอยู่ ตั้ง 100 บนสอง instance หมายถึงได้จริงถึง 200
        </p>
      </div>
    </ConfigCardShell>
  );
};
```

คลาส `border-warning/40 bg-warning/10` ของกล่องคำเตือนใช้ token ที่มีอยู่จริง — `--warning` นิยามไว้ที่
`src/index.css:28` (light) และ `:70` (dark) และ map เป็นคลาส Tailwind ที่ `tailwind.config.js:58-61`
**ห้ามเปลี่ยนไปใช้สี Tailwind ดิบ** เช่น `bg-amber-50` ตามกฎข้อ 5

- [ ] **Step 2: เปลี่ยน `editingKey` เป็น `editingCard` ใน `PlatformConfigManagement.tsx`**

เหตุผล: หลัง Step 1 คีย์ `invitation` มี **2 การ์ด** ถ้ายังตัดสินด้วย config key อยู่ การกด Edit ใบหนึ่งจะเปิดโหมดแก้ทั้งสองใบพร้อมกัน

ประกาศ type **นอก** component (เหนือ `const PlatformConfigManagement` บรรทัด 18)

```tsx
/** การ์ดหนึ่งใบในหน้านี้ — ไม่ใช่คีย์ของ config เพราะคีย์ `invitation` มีสองการ์ด */
type CardId =
  | 'invitation'
  | 'invitation_limits'
  | 'signup'
  | 'email_verification'
  | 'password_reset'
  | 'notification_email';
```

แล้วแทนบรรทัด 25

```tsx
  const [editingCard, setEditingCard] = useState<CardId | null>(null);
```

แล้วแทนที่ทุกจุดที่อ้าง `editingKey` / `setEditingKey`:
- บรรทัด 30 → `useUnsavedChanges(editingCard !== null)`
- บรรทัด 51 → `setEditingCard(null)`
- ทุก `isEditing={editingKey === 'x'}` → `isEditing={editingCard === 'x'}`
- ทุก `onRequestEdit={() => setEditingKey('x')}` → `onRequestEdit={() => setEditingCard('x')}`
- ทุก `onCancelEdit={() => setEditingKey(null)}` → `onCancelEdit={() => setEditingCard(null)}`

```bash
grep -n "editingKey" src/pages/PlatformConfigManagement.tsx
```
คาดหวังหลังแก้: **0 บรรทัด**

- [ ] **Step 3: วางการ์ดใหม่ในหน้า**

เพิ่ม import

```tsx
import { InvitationLimitsCard } from './platformConfig/InvitationLimitsCard';
```

แล้วเพิ่มการ์ดต่อจาก `<InvitationConfigCard … />` (ยังอยู่ใน grid เดิม — การจัด section เป็นงานของ Task 4)

```tsx
            <InvitationLimitsCard
              // remount เมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
              key={`invitation-limits-${invitation?.updated_at ?? 'default'}`}
              config={invitation}
              canManage={canManage}
              isEditing={editingCard === 'invitation_limits'}
              onRequestEdit={() => setEditingCard('invitation_limits')}
              onCancelEdit={() => setEditingCard(null)}
              onSaved={handleSaved}
            />
```

ใช้ตัวแปร `invitation` ตัวเดิม (บรรทัด 55) — สองการ์ดอ่านจากแถวเดียวกัน

- [ ] **Step 4: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/platformConfig/InvitationLimitsCard.tsx src/pages/PlatformConfigManagement.tsx
git commit -m "feat(platform-config): เพิ่มการ์ด Rate limits และแยกสถานะแก้ไขตามการ์ด"
```

---

## Task 4: จัดหน้าเป็น 3 section และแก้ skeleton ให้ตรงกับหน้าจริง

**Files:**
- Modify: `src/pages/PlatformConfigManagement.tsx:75-138`

**Interfaces:**
- Consumes: การ์ดทั้ง 6 ใบและ `editingCard` จาก Task 3
- Produces: ไม่มี interface ใหม่ — เปลี่ยนเฉพาะ layout ภายในไฟล์

- [ ] **Step 1: แทนที่บล็อก loading + grid ด้วยโครง 3 section**

ต้นแบบหัวข้อคือ `src/pages/EmailSettingManagement.tsx:107-115` — `<h2 className="text-sm font-semibold text-muted-foreground">` ไม่มีเส้นคั่น

```tsx
        ) : loading ? (
          <div className="space-y-6">
            {[
              { heading: 'Email links & lifetimes', cards: 4 },
              { heading: 'Invitation limits', cards: 1 },
              { heading: 'Notifications', cards: 1 },
            ].map((section) => (
              <div key={section.heading} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">{section.heading}</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {Array.from({ length: section.cards }).map((_, i) => (
                    <Skeleton key={i} className="h-56 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Email links &amp; lifetimes
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* ---- ย้าย InvitationConfigCard, SignupConfigCard และ LinkConfigCard ทั้งสองใบมาไว้ตรงนี้ไม่เปลี่ยน prop ---- */}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Invitation limits</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* ---- ย้าย InvitationLimitsCard มาไว้ตรงนี้ ---- */}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Notifications</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* ---- ย้าย NotificationEmailConfigCard มาไว้ตรงนี้ ---- */}
              </div>
            </div>
          </div>
        )}
```

ลำดับการ์ดใน section แรก: Invitation → Sign-up → Email Verification → Password Reset

การ์ดทั้ง 6 ใบที่ต้องย้ายคือ JSX ที่อยู่ใน `<div className="grid gap-4 lg:grid-cols-2">` เดิม (บรรทัด 80 ถึงก่อน `</div>` ปิด grid) บวกการ์ด `InvitationLimitsCard` ที่ Task 3 เพิ่งเพิ่มเข้าไป

**ห้ามเปลี่ยน prop ของการ์ดใด ๆ ในขั้นนี้** รวมถึง `key={...}` ที่ใช้ remount ตาม `updated_at` — งานนี้คือการย้ายตำแหน่งอย่างเดียว ถ้าเผลอตัด `key` ออก ฟอร์มจะไม่รีเซ็ตตามค่าที่เพิ่ง fetch มา

- [ ] **Step 2: ตรวจว่าไม่ได้ทำการ์ดหล่นระหว่างย้าย**

```bash
grep -c "ConfigCard\|LimitsCard" src/pages/PlatformConfigManagement.tsx
```
คาดหวัง: **11** (import 5 บรรทัด + การใช้งาน 6 ใบ)

- [ ] **Step 3: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/PlatformConfigManagement.tsx
git commit -m "feat(platform-config): จัดการ์ดเป็นสามกลุ่มและแก้ skeleton ให้ตรงกับหน้าจริง"
```

---

## Task 5: ปิดช่องว่างสิทธิ์ `rbac.read`

**Files:**
- Modify: `src/App.tsx:287-290`
- Modify: `src/pages/RoleEdit.tsx:130-144`

**Interfaces:**
- Consumes: ไม่มี — task นี้เป็นอิสระจาก Task 1–4 โดยสิ้นเชิง
- Produces: ไม่มี interface ใหม่

- [ ] **Step 1: เปลี่ยน gate ของ route `/platform/permissions`**

ที่ `src/App.tsx` route `/platform/permissions` (path อยู่บรรทัด 287) เปลี่ยน

```tsx
                <PrivateRoute requiredPermission="role.read">
```
เป็น
```tsx
                <PrivateRoute requiredPermission="rbac.read">
```

**เปลี่ยนเฉพาะ route นี้** — route `/platform/roles` ที่อยู่เหนือขึ้นไปต้องคง `role.read` ไว้ เพราะมันเรียก `roleService.getAll()` ซึ่ง backend ยัง gate ด้วย `role.read`

- [ ] **Step 2: แยก 403 ออกจาก error ทั่วไปใน `RoleEdit.fetchCatalog`**

หน้าไม่พังอยู่แล้วเพราะมี `catalogFailed` — สิ่งที่เพิ่มคือบอกสาเหตุที่ถูกต้อง แทน toast ที่ไม่บอกว่าทำไม

แทน `.catch(...)` เดิม (บรรทัด 137–143)

```tsx
      .catch((err: unknown) => {
        setCatalogFailed(true);
        devLog('Failed to load permission catalog:', err);
        // 403 ที่นี่แปลว่าบัญชีนี้ไม่มี rbac.read ซึ่ง backend เพิ่งเริ่มบังคับ (PR #320)
        // แยกออกมาเพราะผู้ใช้แก้ชื่อ/สถานะ role ต่อได้ ต่างจาก error อื่นที่เป็นความผิดพลาดชั่วคราว
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          toast.error('ไม่มีสิทธิ์ rbac.read จึงโหลดรายการสิทธิ์ไม่ได้', {
            description: 'แก้ชื่อและสถานะของ role ได้ตามปกติ แต่เลือกสิทธิ์ไม่ได้',
          });
          return;
        }
        const { message } = parseApiError(err);
        toast.error('Failed to load permission catalog: ' + message);
      })
```

- [ ] **Step 3: ตรวจว่าไม่ได้เปลี่ยน gate ของ route อื่นโดยไม่ตั้งใจ**

```bash
grep -n "rbac.read\|requiredPermission=\"role" src/App.tsx
```
คาดหวัง: `rbac.read` ปรากฏ **1 ครั้ง** และ `role.read` / `role.create` / `role.update` ยังอยู่ครบสำหรับ route ของ `/platform/roles*`

- [ ] **Step 4: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/RoleEdit.tsx
git commit -m "fix(permissions): หน้า Permission Catalog ใช้ rbac.read ตามที่ backend บังคับ"
```

---

## Task 6: ยืนยันด้วยเบราว์เซอร์

**Files:** ไม่แก้ไฟล์ — เป็นการตรวจรับ

**Interfaces:**
- Consumes: ผลรวมของ Task 1–5

ต้องยิงกับ backend ที่เป็น v2.0.0 แล้ว หากยังไม่มีให้บันทึกว่ายังไม่ได้ยืนยันข้อไหน อย่ารายงานว่าผ่าน

- [ ] **Step 1: เปิด dev server**

```bash
bun run dev:dev
```
เปิด `http://localhost:3304/platform/configs` ด้วยบัญชีที่มี `platform_config.manage`

- [ ] **Step 2: ตรวจโครงหน้า**

เห็น 3 หัวข้อ (Email links & lifetimes / Invitation limits / Notifications) และการ์ดครบ 6 ใบ

- [ ] **Step 3: ตรวจว่าสองการ์ดของคีย์เดียวกันไม่ลากกัน**

กด Edit ที่การ์ด Invitation → การ์ด Rate limits ต้อง **ไม่** เข้าโหมดแก้ตาม แล้วกด Cancel และลองสลับด้าน

- [ ] **Step 4: ตรวจว่า PATCH ไม่ล้างค่าที่การ์ดไม่ได้แสดง — ทิศทางที่หนึ่ง**

จำค่า Rate limits ปัจจุบันไว้ → แก้ `Expiry (days)` ในการ์ด Invitation แล้ว Save → หลังหน้า refetch ค่า Rate limits ต้องเท่าเดิม

- [ ] **Step 5: ตรวจทิศทางที่สอง**

จำ `Base URL` ไว้ → แก้ `ต่อผู้ดูแลหนึ่งคน / ชั่วโมง` แล้ว Save → `Base URL` และ `Expiry (days)` ต้องเท่าเดิม

- [ ] **Step 6: ตรวจการ์ดที่เปลี่ยนเป็น PATCH ว่ายังบันทึกได้**

แก้และ Save ทีละใบ: Sign-up, Email Verification, Password Reset, Notification Email — ต้องขึ้น toast สำเร็จและค่าคงอยู่หลัง refetch

- [ ] **Step 7: ตรวจสิทธิ์**

เปิด `/platform/permissions` ด้วยบัญชีที่มี `rbac.read` → เห็น catalog
ถ้ามีบัญชีที่ไม่มี `rbac.read` ให้เปิดด้วยบัญชีนั้น → ต้องเห็นหน้า 403 ไม่ใช่หน้าว่างพร้อม toast

- [ ] **Step 8: ตรวจ RoleEdit เมื่อโหลด catalog ไม่ได้**

เปิด `/platform/roles/:id/edit` ด้วยบัญชีที่ไม่มี `rbac.read` → แก้ชื่อ/สถานะได้ และเห็นข้อความที่ระบุว่าต้องการ `rbac.read`
ถ้าไม่มีบัญชีแบบนั้นให้ข้าม และบันทึกว่าข้ามเพราะเหตุใด

---

## ลำดับ deploy

รีโปนี้ปล่อยได้ก็ต่อเมื่อ backend v2.0.0 ขึ้นแล้ว **และ seed permission แล้ว**

1. deploy backend v2.0.0
2. **รัน seed ของ platform permission** — ถ้าไม่รัน `rbac.read` จะไม่มีในตาราง ทุกคนจะได้ 403 ที่ `/platform/permissions` และที่ตัวเลือกสิทธิ์ใน `RoleEdit`
3. ตรวจ custom role ที่สร้างเองใน DB — seed ไม่แตะ ต้องเติม `rbac.read` เองถ้าต้องการให้เห็น catalog
4. deploy frontend (`deploy-gcs.yml` เป็น `workflow_dispatch` ต้องกดเอง)
