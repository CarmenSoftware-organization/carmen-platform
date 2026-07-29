# Platform Email Settings Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า admin ที่ตั้งค่า ดู แก้ ลบ และส่งเมลทดสอบ สำหรับ platform email sender profile ได้โดยไม่ต้องยิง API เอง

**Architecture:** หน้า config เดียวที่ `/platform/email-settings` แสดงการ์ด 3 ใบซึ่ง render จาก enum ฝั่ง frontend แล้ว join ข้อมูลจาก API เข้าไป — การ์ดเป็นเจ้าของ form state และเรียก service เอง ส่วนหน้าเป็นเจ้าของว่ามีโปรไฟล์อะไรบ้างและตอนนี้กำลังแก้ใบไหน ไม่มี DataTable ไม่มี pagination เพราะ enum จำกัดข้อมูลไว้ที่ 3 แถวตลอดกาล

**Tech Stack:** React 19 + TypeScript (Vite 8) · Tailwind 3.4 + shadcn/ui · react-router-dom v6 · Axios (`src/services/api.ts`) · sonner · Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-07-30-platform-email-settings-admin-design.md`
**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`
**Branch:** `feature/email-settings-admin`

## Global Constraints

ข้อกำหนดต่อไปนี้ใช้กับ **ทุก task** โดยปริยาย:

- **รอบนี้เขียนเทสต์** (spec D9) — ผู้ใช้ตัดสินให้เขียน ซึ่ง**ทับกฎประจำที่ให้ข้ามเทสต์** ทุก task ทำแบบ TDD: เขียนเทสต์ที่ fail ก่อน → รันให้เห็นว่า fail → implement → รันให้ผ่าน → commit
- **เทสต์วางคู่ซอร์ส** (`Foo.tsx` → `Foo.test.tsx`) · import จาก `vitest` แบบชัดเจน ไม่มี globals · assert พฤติกรรม role/text ไม่ใช้ snapshot
- **ห้ามแก้ `src/components/ui/`** (CLAUDE.md กฎข้อ 2) — ยกเว้นไม่มีเลยในแผนนี้
- **ห้ามใช้ `alert()` / `window.confirm()`** — ใช้ `toast.*` และ `<ConfirmDialog>` (กฎข้อ 3)
- **สถานะ active/inactive ใช้ `<Badge variant="success" | "secondary">`** ห้ามใช้คลาสสีเขียวดิบ (กฎข้อ 5)
- **ห้ามเพิ่ม library ภายนอก** (กฎข้อ 6)
- **โค้ด debug ครอบด้วย `process.env.NODE_ENV === 'development'`** (กฎข้อ 7)
- **type ที่ใช้ร่วมอยู่ใน `src/types/index.ts`** · `FormData` ของหน้าอยู่ในไฟล์หน้า (กฎข้อ 10)
- **ฟิลด์ใหม่เป็น optional (`?`)** เว้นแต่ API การันตี (กฎข้อ 11)
- **ทุก `catch` ใช้ `parseApiError(err)` + `toast.error()`** และ `setFieldErrors(fields)` เมื่อมี (กฎข้อ 12)
- **`doc_version` ห้ามอยู่ใน `formData`** ส่งเฉพาะตอน update และเฉพาะเมื่อมีค่า · 409 → `notifyVersionConflict()` + refetch (กฎข้อ 17)
- **snake_case ใน TypeScript** — `src/services/api.ts` ของ repo นี้ **ไม่มี** case converter ต่างจาก convention กลาง
- **มาสก์รหัสผ่านคือ `'••••••'`** (U+2022 หกตัว) ตรงกับค่าที่ backend ใช้
- **คำสั่งตรวจ:** `bun run test` (Vitest one-shot) · `bun run build` (รัน eslint ผ่าน vite-plugin-eslint ให้ในตัว) · **ไม่มี** คำสั่ง lint แยก

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/constants/emailSenderPurposes.ts` | แหล่งความจริงของ 3 การ์ด — value / label / inUse / description |
| `src/services/emailSettingService.ts` | เรียก API 6 ตัว, ตัดคีย์ `to` ที่ว่างออก, unwrap envelope |
| `src/services/emailSettingService.test.ts` | contract กับ backend |
| `src/pages/emailSettings/PasswordField.tsx` | คอนโทรล "เปลี่ยนรหัสผ่าน" — คืน `string \| undefined` เท่านั้น |
| `src/pages/emailSettings/PasswordField.test.tsx` | ตารางสัญญา 5 แถว |
| `src/pages/emailSettings/TestEmailDialog.tsx` | dialog ผู้รับ + แปลง reason เป็นข้อความที่ทำอะไรต่อได้ |
| `src/pages/emailSettings/EmailSettingCard.tsx` | 1 การ์ด — view / form / save / delete / เรียก test dialog |
| `src/pages/EmailSettingManagement.tsx` | orchestrator |
| `src/pages/EmailSettingManagement.test.tsx` | integration ของหน้า |

**แก้ไข**

| ไฟล์ | เหตุผล |
|---|---|
| `src/types/index.ts` | เพิ่ม `EmailSenderPurpose`, `EmailSetting`, `EmailSettingTestResult` |
| `src/utils/validation.ts:26-29` | เพิ่ม `case 'from_email':` เข้ากลุ่มที่ตรวจรูปแบบอีเมล |
| `src/App.tsx` | route |
| `src/components/Layout.tsx` | nav item |
| `CLAUDE.md` | บันทึกหน้าใหม่ + แก้ precedent `PrintTemplateMapping` ที่ถูกลบไปแล้ว |

---

## Task 1: Types, constants, และ service

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/constants/emailSenderPurposes.ts`
- Create: `src/services/emailSettingService.ts`
- Test: `src/services/emailSettingService.test.ts`

**Interfaces:**
- Produces: `EmailSenderPurpose` · `EmailSetting` · `EmailSettingTestResult` · `EMAIL_SENDER_PURPOSES` · `emailSettingService.{getAll,getById,create,update,remove,sendTest}` — ใช้ในทุก task ถัดไป

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/services/emailSettingService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import emailSettingService from './emailSettingService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const BASE = '/api-system/platform/email-settings';

describe('emailSettingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAll requests the email-settings endpoint with an explicit perpage', async () => {
    const rows = [{ id: '1', purpose: 'no_reply', from_email: 'a@b.co' }];
    mockApi.get.mockResolvedValue({ data: { data: rows } });
    const result = await emailSettingService.getAll();
    expect(mockApi.get).toHaveBeenCalledWith(`${BASE}?perpage=20`);
    expect(result).toEqual({ data: rows });
  });

  it('sendTest omits the "to" key entirely when no recipient is given', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, {});
  });

  it('sendTest omits the "to" key when the recipient is only whitespace', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1', '   ');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, {});
  });

  it('sendTest sends a trimmed "to" when a recipient is given', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1', '  admin@carmen.io  ');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, { to: 'admin@carmen.io' });
  });

  it('sendTest unwraps the result whether or not it is enveloped', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: false, reason: 'smtp-error' } } });
    await expect(emailSettingService.sendTest('id-1')).resolves.toEqual({
      sent: false,
      reason: 'smtp-error',
    });
    mockApi.post.mockResolvedValue({ data: { sent: true } });
    await expect(emailSettingService.sendTest('id-1')).resolves.toEqual({ sent: true });
  });

  it('update forwards doc_version through to the request body', async () => {
    mockApi.put.mockResolvedValue({ data: { data: { id: 'id-1' } } });
    await emailSettingService.update('id-1', { from_name: 'Carmen', doc_version: 4 });
    expect(mockApi.put).toHaveBeenCalledWith(`${BASE}/id-1`, {
      from_name: 'Carmen',
      doc_version: 4,
    });
  });

  it('create posts to the collection endpoint', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 'new' } } });
    await emailSettingService.create({ purpose: 'no_reply', from_email: 'a@b.co' });
    expect(mockApi.post).toHaveBeenCalledWith(BASE, {
      purpose: 'no_reply',
      from_email: 'a@b.co',
    });
  });

  it('remove deletes by id', async () => {
    mockApi.delete.mockResolvedValue({ data: { data: 'id-1' } });
    await emailSettingService.remove('id-1');
    expect(mockApi.delete).toHaveBeenCalledWith(`${BASE}/id-1`);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `bun run test -- src/services/emailSettingService.test.ts`
Expected: FAIL — หา module `./emailSettingService` ไม่เจอ

- [ ] **Step 3: เพิ่ม types**

ใน `src/types/index.ts` ต่อท้ายไฟล์:

```ts
export type EmailSenderPurpose = 'no_reply' | 'support' | 'billing';

/**
 * Platform-wide outbound email sender profile.
 * `smtp_password` is ALWAYS the mask (`••••••`) when it comes from the API —
 * the real value is never returned. See docs/superpowers/specs/2026-07-30-*.
 */
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
  smtp_password?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailSettingTestResult {
  sent: boolean;
  reason?: string;
}
```

- [ ] **Step 4: เพิ่ม constants**

สร้าง `src/constants/emailSenderPurposes.ts`:

```ts
import type { EmailSenderPurpose } from '../types';

export interface EmailSenderPurposeMeta {
  value: EmailSenderPurpose;
  label: string;
  /** false = ยังไม่มีระบบไหนส่งอีเมลผ่าน purpose นี้ — การ์ดจะขึ้นคำเตือน */
  inUse: boolean;
  description: string;
}

export const EMAIL_SENDER_PURPOSES: EmailSenderPurposeMeta[] = [
  {
    value: 'no_reply',
    label: 'No-reply',
    inUse: true,
    description: 'อีเมลอัตโนมัติที่ผู้ใช้ตอบกลับไม่ได้ เช่น รีเซ็ตรหัสผ่าน',
  },
  {
    value: 'support',
    label: 'Support',
    inUse: false,
    description: 'อีเมลที่ต้องการให้ผู้รับตอบกลับหาทีมซัพพอร์ตได้',
  },
  {
    value: 'billing',
    label: 'Billing',
    inUse: false,
    description: 'อีเมลเรื่องใบแจ้งหนี้และการชำระเงิน',
  },
];
```

- [ ] **Step 5: เขียน service**

สร้าง `src/services/emailSettingService.ts`:

```ts
import api from './api';
import type { ApiListResponse, EmailSetting, EmailSettingTestResult } from '../types';

const BASE = '/api-system/platform/email-settings';

// The purpose enum caps this list at 3 rows, so an explicit perpage is plenty.
// It is stated rather than left to the backend default so a future change to that
// default cannot silently truncate the list.
const PERPAGE = 20;

const emailSettingService = {
  getAll: async (): Promise<ApiListResponse<EmailSetting>> => {
    const response = await api.get(`${BASE}?perpage=${PERPAGE}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: Partial<EmailSetting>) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  update: async (id: string, data: Partial<EmailSetting>) => {
    const response = await api.put(`${BASE}/${id}`, data);
    return response.data;
  },

  remove: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },

  /**
   * Send a test email through a stored profile.
   * When `to` is blank the key is omitted ENTIRELY (not sent as an empty string) —
   * the backend only substitutes the caller's own address when the key is absent.
   */
  sendTest: async (id: string, to?: string): Promise<EmailSettingTestResult> => {
    const trimmed = to?.trim();
    const body = trimmed ? { to: trimmed } : {};
    const response = await api.post(`${BASE}/${id}/test`, body);
    return response.data?.data ?? response.data;
  },
};

export default emailSettingService;
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `bun run test -- src/services/emailSettingService.test.ts`
Expected: PASS ทั้ง 8 เทสต์

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/constants/emailSenderPurposes.ts src/services/emailSettingService.ts src/services/emailSettingService.test.ts
git commit -m "feat(email-settings): types, purpose constants และ service layer"
```

---

## Task 2: `PasswordField`

**Files:**
- Create: `src/pages/emailSettings/PasswordField.tsx`
- Test: `src/pages/emailSettings/PasswordField.test.tsx`

**Interfaces:**
- Produces: `<PasswordField hasStoredPassword isNew onChange />` โดย `onChange: (value: string | undefined) => void` — **ไม่มีทางส่ง `null` หรือ `''`** ใช้ใน Task 3

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/pages/emailSettings/PasswordField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from './PasswordField';

describe('PasswordField', () => {
  it('shows that a password is stored and emits nothing until touched', () => {
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    expect(screen.getByText('ตั้งรหัสผ่านไว้แล้ว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SMTP password')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the no-password state when nothing is stored', () => {
    render(<PasswordField hasStoredPassword={false} isNew={false} onChange={vi.fn()} />);
    expect(screen.getByText('ไม่ได้ตั้งรหัสผ่าน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งรหัสผ่าน' })).toBeInTheDocument();
  });

  it('emits the typed value while editing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }));
    await user.type(screen.getByLabelText('SMTP password'), 'hunter2');
    expect(onChange).toHaveBeenLastCalledWith('hunter2');
  });

  it('emits undefined — never an empty string — when the field is left blank', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }));
    await user.type(screen.getByLabelText('SMTP password'), 'ab');
    await user.clear(screen.getByLabelText('SMTP password'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(onChange).not.toHaveBeenCalledWith('');
    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(screen.getByText('ปล่อยว่าง = ไม่เปลี่ยนรหัสผ่านเดิม')).toBeInTheDocument();
  });

  it('cancelling editing restores the idle state and emits undefined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }));
    await user.type(screen.getByLabelText('SMTP password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' })).toBeInTheDocument();
  });

  it('starts in editing mode for a new profile with no idle state to return to', () => {
    render(<PasswordField hasStoredPassword={false} isNew onChange={vi.fn()} />);
    expect(screen.getByLabelText('SMTP password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ยกเลิก' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `bun run test -- src/pages/emailSettings/PasswordField.test.tsx`
Expected: FAIL — หา `./PasswordField` ไม่เจอ

- [ ] **Step 3: เขียน component**

สร้าง `src/pages/emailSettings/PasswordField.tsx`:

```tsx
import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

interface PasswordFieldProps {
  /** true เมื่อโปรไฟล์ที่บันทึกไว้มีรหัสผ่านอยู่ */
  hasStoredPassword: boolean;
  /** true เมื่อกำลังสร้างโปรไฟล์ใหม่ — ไม่มีสถานะ idle ให้กลับไป */
  isNew: boolean;
  /**
   * ค่าที่จะส่งไป backend: string = ตั้งค่าใหม่, undefined = ไม่เปลี่ยน
   * จงใจไม่รองรับ null/'' เพื่อให้ "ล้างรหัสผ่านโดยอุบัติเหตุ" เป็นสิ่งที่พิมพ์ไม่ออก
   */
  onChange: (value: string | undefined) => void;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  hasStoredPassword,
  isNew,
  onChange,
}) => {
  const [editing, setEditing] = useState(isNew);
  const [value, setValue] = useState('');

  const startEditing = () => {
    setEditing(true);
    setValue('');
    onChange(undefined);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue('');
    onChange(undefined);
  };

  const handleInput = (next: string) => {
    setValue(next);
    onChange(next === '' ? undefined : next);
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <Label>SMTP password</Label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {hasStoredPassword ? 'ตั้งรหัสผ่านไว้แล้ว' : 'ไม่ได้ตั้งรหัสผ่าน'}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            {hasStoredPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
          </Button>
        </div>
        {!hasStoredPassword && (
          <p className="text-xs text-muted-foreground">
            โปรไฟล์นี้ส่งเมลโดยไม่ยืนยันตัวตนกับเซิร์ฟเวอร์ SMTP
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="smtp_password">SMTP password</Label>
      <div className="flex items-center gap-3">
        <Input
          id="smtp_password"
          type="password"
          autoComplete="new-password"
          aria-label="SMTP password"
          value={value}
          onChange={(e) => handleInput(e.target.value)}
        />
        {!isNew && (
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
            ยกเลิก
          </Button>
        )}
      </div>
      {!isNew && <p className="text-xs text-muted-foreground">ปล่อยว่าง = ไม่เปลี่ยนรหัสผ่านเดิม</p>}
      <p className="text-xs text-muted-foreground">
        หน้านี้ลบรหัสผ่านออกจากโปรไฟล์ที่มีอยู่ไม่ได้ — ถ้าจะย้ายไปใช้ relay ที่ไม่ต้องยืนยันตัวตน
        ให้ยกเลิกการตั้งค่าแล้วสร้างใหม่
      </p>
    </div>
  );
};
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `bun run test -- src/pages/emailSettings/PasswordField.test.tsx`
Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/pages/emailSettings/PasswordField.tsx src/pages/emailSettings/PasswordField.test.tsx
git commit -m "feat(email-settings): PasswordField ที่คืน null ไม่ได้เลย"
```

---

## Task 3: `TestEmailDialog`

**Files:**
- Create: `src/pages/emailSettings/TestEmailDialog.tsx`
- Test: `src/pages/emailSettings/TestEmailDialog.test.tsx`

**Interfaces:**
- Consumes: `emailSettingService.sendTest(id, to?)` (Task 1)
- Produces: `<TestEmailDialog open settingId defaultTo onOpenChange />` — จัดการ toast เองทั้งหมด ใช้ใน Task 4

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/pages/emailSettings/TestEmailDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestEmailDialog } from './TestEmailDialog';
import emailSettingService from '../../services/emailSettingService';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// This matches the existing pattern in BroadcastCompose.test.tsx:34 and others.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../services/emailSettingService', () => ({
  default: { sendTest: vi.fn() },
}));

const mockSendTest = emailSettingService.sendTest as unknown as ReturnType<typeof vi.fn>;

describe('TestEmailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the recipient when the caller has an email-shaped identity', () => {
    render(
      <TestEmailDialog open settingId="s1" defaultTo="admin@carmen.io" onOpenChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('ผู้รับ')).toHaveValue('admin@carmen.io');
  });

  it('leaves the recipient blank when the identity is a username, not an email', () => {
    render(<TestEmailDialog open settingId="s1" defaultTo="samutpra" onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('ผู้รับ')).toHaveValue('');
  });

  it('reports success with the address it was sent to', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: true });
    render(
      <TestEmailDialog open settingId="s1" defaultTo="admin@carmen.io" onOpenChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(mockSendTest).toHaveBeenCalledWith('s1', 'admin@carmen.io'));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('admin@carmen.io'),
    );
  });

  it('turns a decrypt-failed reason into an actionable message, not the raw code', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: false, reason: 'decrypt-failed' });
    render(<TestEmailDialog open settingId="s1" defaultTo="" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const message = toast.error.mock.calls[0][0] as string;
    expect(message).toContain('SECRET_ENCRYPTION_KEY');
    expect(message).not.toBe('decrypt-failed');
  });

  it('explains an smtp-error in terms of what to check', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: false, reason: 'smtp-error' });
    render(<TestEmailDialog open settingId="s1" defaultTo="" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain('host');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `bun run test -- src/pages/emailSettings/TestEmailDialog.test.tsx`
Expected: FAIL — หา `./TestEmailDialog` ไม่เจอ

- [ ] **Step 3: เขียน component**

สร้าง `src/pages/emailSettings/TestEmailDialog.tsx`:

```tsx
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import emailSettingService from '../../services/emailSettingService';
import { parseApiError } from '../../utils/errorParser';

interface TestEmailDialogProps {
  open: boolean;
  settingId: string;
  /**
   * ตัวตนของผู้เรียก — อาจเป็น username ไม่ใช่อีเมล เพราะ AuthContext ตั้ง
   * user.email จาก credentials.username จึง prefill เฉพาะเมื่อมี '@'
   */
  defaultTo: string;
  onOpenChange: (open: boolean) => void;
}

const REASON_MESSAGE: Record<string, string> = {
  'smtp-error': 'เชื่อมต่อ SMTP ไม่สำเร็จ — ตรวจ host, port, TLS และรหัสผ่าน',
  'decrypt-failed':
    'ถอดรหัสรหัสผ่านไม่ได้ — SECRET_ENCRYPTION_KEY ของเซิร์ฟเวอร์ไม่ตรงกัน ต้องให้ทีมระบบตรวจ',
  'lookup-failed': 'อ่านโปรไฟล์จากฐานข้อมูลไม่ได้',
  'no-config': 'ไม่พบการตั้งค่า SMTP สำหรับโปรไฟล์นี้',
};

export const TestEmailDialog: React.FC<TestEmailDialogProps> = ({
  open,
  settingId,
  defaultTo,
  onOpenChange,
}) => {
  const [to, setTo] = useState(defaultTo.includes('@') ? defaultTo : '');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await emailSettingService.sendTest(settingId, to);
      if (result.sent) {
        const target = to.trim() || 'อีเมลของคุณ';
        toast.success(`ส่งไปที่ ${target} แล้ว — ตรวจกล่องขาเข้าและ spam`);
        onOpenChange(false);
        return;
      }
      toast.error(REASON_MESSAGE[result.reason ?? ''] ?? 'ส่งเมลทดสอบไม่สำเร็จ');
    } catch (err: unknown) {
      toast.error(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ส่งเมลทดสอบ</DialogTitle>
          <DialogDescription>
            ส่งข้อความทดสอบผ่านโปรไฟล์ที่บันทึกไว้ เพื่อยืนยันว่าค่า SMTP ใช้งานได้จริง
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test_to">ผู้รับ</Label>
          <Input
            id="test_to"
            aria-label="ผู้รับ"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="เว้นว่าง = ส่งไปที่อีเมลของคุณ"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            ยกเลิก
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            ส่งเมลทดสอบ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

⚠️ **ตรวจก่อนเขียน:** เปิด `src/components/ui/dialog.tsx` แล้วยืนยันว่า export ครบทั้ง `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` ถ้าชื่อไม่ตรง ให้ยึดตามไฟล์จริงและรายงานว่าเปลี่ยนอะไร

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `bun run test -- src/pages/emailSettings/TestEmailDialog.test.tsx`
Expected: PASS ทั้ง 5 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/pages/emailSettings/TestEmailDialog.tsx src/pages/emailSettings/TestEmailDialog.test.tsx
git commit -m "feat(email-settings): dialog ส่งเมลทดสอบพร้อมแปลง reason เป็นข้อความที่ทำอะไรต่อได้"
```

---

## Task 4: `EmailSettingCard`

**Files:**
- Create: `src/pages/emailSettings/EmailSettingCard.tsx`
- Test: `src/pages/emailSettings/EmailSettingCard.test.tsx`
- Modify: `src/utils/validation.ts:26-29`

**Interfaces:**
- Consumes: `PasswordField` (Task 2) · `TestEmailDialog` (Task 3) · `emailSettingService` (Task 1)
- Produces: `<EmailSettingCard purpose label description inUse setting canManage isEditing callerIdentity onRequestEdit onCancelEdit onSaved />` ใช้ใน Task 5
  โดย **`onSaved: (opts?: { keepEditing?: boolean }) => void`** — ส่ง `{ keepEditing: true }` เฉพาะกรณี
  409 เพื่อให้หน้า refetch แต่ไม่ปิดโหมดแก้ ตามที่ spec §4.3 กำหนด

- [ ] **Step 1: เพิ่ม `from_email` เข้า validateField**

`src/utils/validation.ts` — เพิ่ม case ในกลุ่มอีเมลที่มีอยู่:

```ts
    case 'email':
    case 'hotel_email':
    case 'company_email':
    case 'from_email':
      return isValidEmail(value) ? '' : 'Invalid email format';
```

- [ ] **Step 2: เขียนเทสต์ที่ fail**

สร้าง `src/pages/emailSettings/EmailSettingCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailSettingCard } from './EmailSettingCard';
import emailSettingService from '../../services/emailSettingService';
import type { EmailSetting } from '../../types';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// This matches the existing pattern in BroadcastCompose.test.tsx:34 and others.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../services/emailSettingService', () => ({
  default: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), sendTest: vi.fn() },
}));

const svc = emailSettingService as unknown as {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const setting: EmailSetting = {
  id: 's1',
  doc_version: 3,
  purpose: 'no_reply',
  from_email: 'no-reply@carmen.io',
  from_name: 'Carmen',
  smtp_host: 'smtp.sendgrid.net',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: 'apikey',
  smtp_password: '••••••',
  is_active: true,
  note: null,
};

const baseProps = {
  purpose: 'no_reply' as const,
  label: 'No-reply',
  description: 'อีเมลอัตโนมัติ',
  inUse: true,
  canManage: true,
  isEditing: false,
  onRequestEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSaved: vi.fn(),
};

describe('EmailSettingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unconfigured state with a setup button when there is no profile', () => {
    render(<EmailSettingCard {...baseProps} setting={null} />);
    expect(screen.getByText('ยังไม่ตั้งค่า')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งค่า' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
  });

  it('summarises a configured profile without revealing the password', () => {
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.getByText('smtp.sendgrid.net:587')).toBeInTheDocument();
    expect(screen.queryByText(/hunter2|apikey-secret/)).not.toBeInTheDocument();
  });

  it('hides every mutating control when the user lacks manage permission', () => {
    render(<EmailSettingCard {...baseProps} canManage={false} setting={setting} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ยกเลิกการตั้งค่า' })).not.toBeInTheDocument();
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
  });

  it('warns when no system sends through this purpose yet', () => {
    render(<EmailSettingCard {...baseProps} inUse={false} setting={null} />);
    expect(screen.getByText(/ยังไม่มีระบบไหนส่งอีเมลผ่านช่องทางนี้/)).toBeInTheDocument();
  });

  it('replaces the test button with an explanation while editing', () => {
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
    expect(screen.getByText('บันทึกก่อนจึงจะทดสอบได้')).toBeInTheDocument();
  });

  it('sends doc_version on update and reports success', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    const onSaved = vi.fn();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} onSaved={onSaved} />);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'Carmen Platform');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).toMatchObject({ doc_version: 3, from_name: 'Carmen Platform' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('omits smtp_password from the update payload when it was never touched', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'X');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).not.toHaveProperty('smtp_password');
  });

  it('blocks saving when the from address is not a valid email', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('From email'));
    await user.type(screen.getByLabelText('From email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(svc.update).not.toHaveBeenCalled();
    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
  });

  it('creates a new profile carrying the purpose and no doc_version', async () => {
    const user = userEvent.setup();
    svc.create.mockResolvedValue({ data: { id: 'new' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={null} />);
    await user.type(screen.getByLabelText('From email'), 'no-reply@carmen.io');
    await user.type(screen.getByLabelText('SMTP host'), 'smtp.carmen.io');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.create).toHaveBeenCalled());
    expect(svc.create.mock.calls[0][0]).toMatchObject({ purpose: 'no_reply' });
    expect(svc.create.mock.calls[0][0]).not.toHaveProperty('doc_version');
  });

  it('saves on Ctrl+S while editing', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
  });

  it('does not hijack Ctrl+S when this card is not the one being edited', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing={false} setting={setting} />);
    await user.keyboard('{Control>}s{/Control}');
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('asks the page to reload but keep editing when the save hits a version conflict', async () => {
    const user = userEvent.setup();
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    const onSaved = vi.fn();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ keepEditing: true }));
  });

  it('explains the env fallback before unsetting a profile', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'ยกเลิกการตั้งค่า' }));
    expect(await screen.findByText(/กลับไปใช้ค่า SMTP จาก environment/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `bun run test -- src/pages/emailSettings/EmailSettingCard.test.tsx`
Expected: FAIL — หา `./EmailSettingCard` ไม่เจอ

- [ ] **Step 4: เขียน component**

สร้าง `src/pages/emailSettings/EmailSettingCard.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Send, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { PasswordField } from './PasswordField';
import { TestEmailDialog } from './TestEmailDialog';
import emailSettingService from '../../services/emailSettingService';
import { parseApiError } from '../../utils/errorParser';
import { validateField } from '../../utils/validation';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import type { EmailSenderPurpose, EmailSetting } from '../../types';

interface EmailSettingCardProps {
  purpose: EmailSenderPurpose;
  label: string;
  description: string;
  inUse: boolean;
  setting: EmailSetting | null;
  canManage: boolean;
  isEditing: boolean;
  callerIdentity?: string;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  /** keepEditing = true เมื่อเจอ 409 — หน้าต้อง refetch แต่ไม่ปิดโหมดแก้ */
  onSaved: (opts?: { keepEditing?: boolean }) => void;
}

interface EmailSettingFormData {
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_username: string;
  is_active: boolean;
  note: string;
}

const emptyForm: EmailSettingFormData = {
  from_email: '',
  from_name: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: false,
  smtp_username: '',
  is_active: true,
  note: '',
};

const toForm = (s: EmailSetting | null): EmailSettingFormData =>
  s
    ? {
        from_email: s.from_email ?? '',
        from_name: s.from_name ?? '',
        smtp_host: s.smtp_host ?? '',
        smtp_port: String(s.smtp_port ?? 587),
        smtp_secure: !!s.smtp_secure,
        smtp_username: s.smtp_username ?? '',
        is_active: s.is_active !== false,
        note: s.note ?? '',
      }
    : { ...emptyForm };

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);

export const EmailSettingCard: React.FC<EmailSettingCardProps> = ({
  purpose,
  label,
  description,
  inUse,
  setting,
  canManage,
  isEditing,
  callerIdentity = '',
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const isNew = setting === null;
  const [formData, setFormData] = useState<EmailSettingFormData>(() => toForm(setting));
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmUnset, setConfirmUnset] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const docVersion = useMemo(() => getDocVersion(setting), [setting]);

  const setValue = (name: keyof EmailSettingFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof EmailSettingFormData, value: string) => {
    const message = validateField(name, value);
    if (message) setFieldErrors((prev) => ({ ...prev, [name]: message }));
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.from_email.trim()) errors.from_email = 'From email is required';
    else {
      const message = validateField('from_email', formData.from_email);
      if (message) errors.from_email = message;
    }
    if (!formData.smtp_host.trim()) errors.smtp_host = 'SMTP host is required';
    const port = Number(formData.smtp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.smtp_port = 'Port must be a whole number between 1 and 65535';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    const payload: Partial<EmailSetting> = {
      purpose,
      from_email: formData.from_email.trim(),
      from_name: formData.from_name.trim() || null,
      smtp_host: formData.smtp_host.trim(),
      smtp_port: Number(formData.smtp_port),
      smtp_secure: formData.smtp_secure,
      smtp_username: formData.smtp_username.trim() || null,
      is_active: formData.is_active,
      note: formData.note.trim() || null,
      ...(password !== undefined ? { smtp_password: password } : {}),
    };
    try {
      if (isNew) {
        await emailSettingService.create(payload);
        toast.success(`ตั้งค่าโปรไฟล์ ${label} แล้ว`);
      } else {
        await emailSettingService.update(setting.id, {
          ...payload,
          ...(docVersion != null ? { doc_version: docVersion } : {}),
        });
        toast.success(`บันทึกโปรไฟล์ ${label} แล้ว`);
      }
      setPassword(undefined);
      onSaved();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        // Reload to latest but stay in edit mode — standard optimistic-lock UX.
        // The page re-keys this card on doc_version, so the remount refreshes the form.
        notifyVersionConflict();
        onSaved({ keepEditing: true });
      } else {
        const parsed = parseApiError(err);
        toast.error(parsed.message);
        if (parsed.fields) setFieldErrors(parsed.fields);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnset = async () => {
    if (!setting) return;
    try {
      await emailSettingService.remove(setting.id);
      toast.success(`ยกเลิกการตั้งค่าโปรไฟล์ ${label} แล้ว`);
      setConfirmUnset(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(parseApiError(err).message);
    }
  };

  const handleCancel = () => {
    setFormData(toForm(setting));
    setPassword(undefined);
    setFieldErrors({});
    onCancelEdit();
  };

  // Ctrl/⌘+S และ Escape ผูกที่การ์ดที่กำลังแก้ ไม่ใช่ที่หน้า — หน้ารับประกันว่ามีการ์ดเดียว
  // ที่ isEditing ได้ในเวลาหนึ่ง ๆ คีย์ลัดจึงไม่กำกวมและไม่ต้องส่ง ref ขึ้นไปให้หน้าเรียก
  // ต้องเรียก "หลัง" ประกาศ handleSave/handleCancel เพื่อไม่ให้ชน no-use-before-define
  useGlobalShortcuts(
    isEditing ? { onSave: () => void handleSave(), onCancel: handleCancel } : {},
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{label}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {!inUse && (
            <p className="mt-2 text-xs text-warning-foreground">
              ยังไม่มีระบบไหนส่งอีเมลผ่านช่องทางนี้ — ตั้งค่าไว้ล่วงหน้าได้ แต่จะยังไม่มีเมลออก
            </p>
          )}
        </div>
        {isNew ? (
          <Badge variant="secondary">ยังไม่ตั้งค่า</Badge>
        ) : (
          <Badge variant={setting.is_active ? 'success' : 'secondary'}>
            {setting.is_active ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!isEditing && !isNew && (
          <div className="space-y-1 text-sm">
            <div>
              {setting.from_name ? `${setting.from_name} <${setting.from_email}>` : setting.from_email}
            </div>
            <div className="text-muted-foreground">
              {`${setting.smtp_host}:${setting.smtp_port}`}
              {setting.smtp_secure ? ' · implicit TLS' : ''}
            </div>
          </div>
        )}

        {!isEditing && isNew && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีโปรไฟล์สำหรับช่องทางนี้ — ระบบจะใช้ค่า SMTP จาก environment ของเซิร์ฟเวอร์แทน
          </p>
        )}

        {isEditing && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`from_email_${purpose}`}>From email</Label>
              <Input
                id={`from_email_${purpose}`}
                aria-label="From email"
                value={formData.from_email}
                onChange={(e) => setValue('from_email', e.target.value)}
                onBlur={(e) => handleBlur('from_email', e.target.value)}
                className={fieldErrors.from_email ? 'border-destructive' : ''}
              />
              {fieldErrors.from_email && (
                <p className="text-xs text-destructive">{fieldErrors.from_email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`from_name_${purpose}`}>From name</Label>
              <Input
                id={`from_name_${purpose}`}
                aria-label="From name"
                value={formData.from_name}
                onChange={(e) => setValue('from_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_host_${purpose}`}>SMTP host</Label>
              <Input
                id={`smtp_host_${purpose}`}
                aria-label="SMTP host"
                value={formData.smtp_host}
                onChange={(e) => setValue('smtp_host', e.target.value)}
                className={fieldErrors.smtp_host ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_host && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_host}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_port_${purpose}`}>SMTP port</Label>
              <Input
                id={`smtp_port_${purpose}`}
                aria-label="SMTP port"
                value={formData.smtp_port}
                onChange={(e) => setValue('smtp_port', e.target.value)}
                className={fieldErrors.smtp_port ? 'border-destructive' : ''}
              />
              {fieldErrors.smtp_port && (
                <p className="text-xs text-destructive">{fieldErrors.smtp_port}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`smtp_username_${purpose}`}>SMTP username</Label>
              <Input
                id={`smtp_username_${purpose}`}
                aria-label="SMTP username"
                value={formData.smtp_username}
                onChange={(e) => setValue('smtp_username', e.target.value)}
              />
            </div>

            <PasswordField
              hasStoredPassword={!!setting?.smtp_password}
              isNew={isNew}
              onChange={setPassword}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.smtp_secure}
                onChange={(e) => setValue('smtp_secure', e.target.checked)}
                aria-label="Use implicit TLS"
              />
              Implicit TLS
            </label>
            <p className="text-xs text-muted-foreground lg:col-span-2">
              เปิดเมื่อใช้ implicit TLS (มักเป็นพอร์ต 465) — พอร์ต 587 ปกติใช้ STARTTLS ให้ปิดไว้
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.is_active}
                onChange={(e) => setValue('is_active', e.target.checked)}
                aria-label="Active"
              />
              Active
            </label>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor={`note_${purpose}`}>Note</Label>
              <Input
                id={`note_${purpose}`}
                aria-label="Note"
                value={formData.note}
                onChange={(e) => setValue('note', e.target.value)}
                placeholder="ใครเป็นเจ้าของ mailbox นี้ / ใช้ provider อะไร"
              />
            </div>
          </div>
        )}

        {!isEditing && !isNew && (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">SMTP username</Label>
              <ReadOnlyText value={setting.smtp_username ?? ''} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Note</Label>
              <ReadOnlyText value={setting.note ?? ''} />
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
                <span className="text-xs text-muted-foreground">บันทึกก่อนจึงจะทดสอบได้</span>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onRequestEdit}>
                  {isNew ? 'ตั้งค่า' : 'Edit'}
                </Button>
                {!isNew && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      ส่งเมลทดสอบ
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmUnset(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      ยกเลิกการตั้งค่า
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>

      {!isNew && (
        <>
          <ConfirmDialog
            open={confirmUnset}
            onOpenChange={setConfirmUnset}
            title={`ยกเลิกการตั้งค่าโปรไฟล์ ${label}`}
            description={
              `หลังจากนี้ระบบจะกลับไปใช้ค่า SMTP จาก environment ของเซิร์ฟเวอร์ ` +
              `ถ้าไม่ได้ตั้งค่านั้นไว้ อีเมลของช่องทางนี้จะหยุดส่ง ` +
              `และต้องตั้งรหัสผ่านใหม่ทั้งหมดหากจะสร้างโปรไฟล์นี้อีกครั้ง`
            }
            confirmText="ยกเลิกการตั้งค่า"
            confirmVariant="destructive"
            onConfirm={handleUnset}
          />
          <TestEmailDialog
            open={testOpen}
            settingId={setting.id}
            defaultTo={callerIdentity}
            onOpenChange={setTestOpen}
          />
        </>
      )}
    </Card>
  );
};
```

⚠️ **ตรวจก่อนเขียน:** `text-warning-foreground` — เปิด `src/index.css` / `tailwind.config.js` แล้วยืนยันว่ามี token นี้จริง ถ้าไม่มี ให้ใช้ token ที่มีอยู่ (เช่น `text-muted-foreground` พร้อมไอคอนเตือน) **อย่าใช้สีดิบ** ตามกฎข้อ 5

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `bun run test -- src/pages/emailSettings/EmailSettingCard.test.tsx`
Expected: PASS ทั้ง 10 เทสต์

- [ ] **Step 6: Commit**

```bash
git add src/pages/emailSettings/EmailSettingCard.tsx src/pages/emailSettings/EmailSettingCard.test.tsx src/utils/validation.ts
git commit -m "feat(email-settings): การ์ดต่อ purpose พร้อม doc_version และคำเตือนตอนยกเลิกการตั้งค่า"
```

---

## Task 5: หน้า `EmailSettingManagement` + route + nav

**Files:**
- Create: `src/pages/EmailSettingManagement.tsx`
- Test: `src/pages/EmailSettingManagement.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: `EmailSettingCard` (Task 4) · `EMAIL_SENDER_PURPOSES` และ `emailSettingService` (Task 1)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/pages/EmailSettingManagement.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailSettingManagement from './EmailSettingManagement';
import emailSettingService from '../services/emailSettingService';
import type { EmailSetting } from '../types';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// This matches the existing pattern in BroadcastCompose.test.tsx:34 and others.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// vi.hoisted for the same reason as `toast` above — vi.mock is hoisted above consts.
const auth = vi.hoisted(() => ({
  hasPermission: (() => true) as (perm: string) => boolean,
  user: { email: 'admin@carmen.io' } as { email?: string } | null,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('../services/emailSettingService', () => ({
  default: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), sendTest: vi.fn() },
}));

const svc = emailSettingService as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const noReply: EmailSetting = {
  id: 's1',
  doc_version: 2,
  purpose: 'no_reply',
  from_email: 'no-reply@carmen.io',
  from_name: 'Carmen',
  smtp_host: 'smtp.sendgrid.net',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: 'apikey',
  smtp_password: '••••••',
  is_active: true,
  note: null,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <EmailSettingManagement />
    </MemoryRouter>,
  );

describe('EmailSettingManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.hasPermission = () => true;
    auth.user = { email: 'admin@carmen.io' };
  });

  it('renders a card for every purpose even when the API returns only one', async () => {
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    expect(await screen.findByText('No-reply')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getAllByText('ยังไม่ตั้งค่า')).toHaveLength(2);
  });

  it('shows the data but no mutating controls without the manage permission', async () => {
    auth.hasPermission = (perm) => perm === 'email_setting.read';
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    expect(await screen.findByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a retry affordance', async () => {
    svc.getAll.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks before abandoning unsaved edits when another card is opened', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'changed');
    await user.click(screen.getAllByRole('button', { name: 'ตั้งค่า' })[0]);
    expect(await screen.findByText(/ทิ้งการแก้ไขที่ยังไม่บันทึก/)).toBeInTheDocument();
  });

  it('reloads and stays in edit mode when the save hits a version conflict', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply] });
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'changed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.getAll).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `bun run test -- src/pages/EmailSettingManagement.test.tsx`
Expected: FAIL — หา `./EmailSettingManagement` ไม่เจอ

- [ ] **Step 3: เขียนหน้า**

สร้าง `src/pages/EmailSettingManagement.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmailSettingCard } from './emailSettings/EmailSettingCard';
import { EMAIL_SENDER_PURPOSES } from '../constants/emailSenderPurposes';
import emailSettingService from '../services/emailSettingService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { EmailSenderPurpose, EmailSetting } from '../types';

const EmailSettingManagement: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('email_setting.manage');

  const [settings, setSettings] = useState<EmailSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPurpose, setEditingPurpose] = useState<EmailSenderPurpose | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<EmailSenderPurpose | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // Any open editor counts as unsaved work: the card owns the form state, so the
  // page cannot inspect dirtiness without coupling to it. Guarding on "an editor
  // is open" is the conservative side of that trade.
  useUnsavedChanges(editingPurpose !== null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await emailSettingService.getAll();
      setSettings(response.data ?? []);
      if (process.env.NODE_ENV === 'development') setRawResponse(response);
    } catch (err: unknown) {
      setError(getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const requestEdit = (purpose: EmailSenderPurpose) => {
    if (editingPurpose !== null && editingPurpose !== purpose) {
      setPendingSwitch(purpose);
      return;
    }
    setEditingPurpose(purpose);
  };

  const handleSaved = async (opts?: { keepEditing?: boolean }) => {
    if (!opts?.keepEditing) setEditingPurpose(null);
    await fetchAll();
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Email Settings"
          subtitle="โปรไฟล์ผู้ส่งอีเมลระดับ platform — ที่อยู่ผู้ส่งและค่า SMTP ที่ระบบใช้ส่งเมลออก"
        />

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {EMAIL_SENDER_PURPOSES.map((meta) => {
              const setting = settings.find((s) => s.purpose === meta.value) ?? null;
              return (
              <EmailSettingCard
                // Keying on doc_version remounts the card whenever the stored row
                // changes, which is exactly what the 409 path needs: the form resets
                // to the freshly-fetched values while the page keeps it in edit mode.
                key={`${meta.value}-${setting?.doc_version ?? 'new'}`}
                purpose={meta.value}
                label={meta.label}
                description={meta.description}
                inUse={meta.inUse}
                setting={setting}
                canManage={canManage}
                isEditing={editingPurpose === meta.value}
                callerIdentity={user?.email ?? ''}
                onRequestEdit={() => requestEdit(meta.value)}
                onCancelEdit={() => setEditingPurpose(null)}
                onSaved={handleSaved}
              />
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
        title="ทิ้งการแก้ไขที่ยังไม่บันทึก?"
        description="คุณกำลังแก้โปรไฟล์อื่นอยู่ ถ้าไปต่อ การแก้ไขที่ยังไม่บันทึกจะหายไป"
        confirmText="ทิ้งการแก้ไข"
        confirmVariant="destructive"
        onConfirm={() => {
          setEditingPurpose(pendingSwitch);
          setPendingSwitch(null);
        }}
      />

      <DevDebugSheet
        title="Email Settings — raw"
        endpoint="/api-system/platform/email-settings"
        data={rawResponse}
      />
    </Layout>
  );
};

export default EmailSettingManagement;
```

หมายเหตุความปลอดภัยสำหรับ `DevDebugSheet`: `rawResponse` ปลอดภัยเพราะ API คืน `smtp_password`
เป็นค่ามาสก์เสมอ — เขียนคอมเมนต์กำกับไว้เหนือ `setRawResponse` ว่านี่คือสมมติฐานที่ผูกกับ backend

- [ ] **Step 4: เพิ่ม route**

`src/App.tsx` — เพิ่ม import และ route ใกล้กลุ่ม `/platform/...` ที่มีอยู่:

```tsx
import EmailSettingManagement from './pages/EmailSettingManagement';
```

```tsx
<Route
  path="/platform/email-settings"
  element={
    <PrivateRoute requiredPermission="email_setting.read">
      <EmailSettingManagement />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 5: เพิ่ม nav item**

`src/components/Layout.tsx` — เพิ่ม `Mail` เข้า import จาก `lucide-react` แล้วเพิ่มใน `allNavItems`
ต่อจากบรรทัด Applications:

```tsx
{ path: '/platform/email-settings', label: 'Email Settings', icon: Mail, permission: 'email_setting.read', group: 'Platform' },
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `bun run test -- src/pages/EmailSettingManagement.test.tsx`
Expected: PASS ทั้ง 5 เทสต์

- [ ] **Step 7: Commit**

```bash
git add src/pages/EmailSettingManagement.tsx src/pages/EmailSettingManagement.test.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat(email-settings): หน้า config, route และ nav item"
```

---

## Task 6: เอกสารและตรวจทั้งชุด

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: แก้ precedent ที่ตายแล้วใน CLAUDE.md**

หัวข้อ **Print Template Mapping Specifics** อ้างถึง `PrintTemplateMappingManagement.tsx` และ
`PrintTemplateMappingEdit.tsx` ซึ่ง**ถูกลบไปแล้วทั้งคู่** (ยืนยันด้วย `ls src/pages/ | grep -i print`
ที่ไม่คืนอะไร) เปลี่ยนหัวข้อนั้นเป็น **Configuration Page Pattern** โดยยกตัวอย่างที่ยังมีอยู่จริง:

```markdown
## Configuration Page Pattern

บางหน้าเป็น **หน้า config ไม่ใช่หน้า Management** และจงใจไม่ทำตามกฎข้อ 13 — เมื่อชุดข้อมูล
มีขนาดจำกัดแน่นอน (เช่นถูกจำกัดด้วย enum) DataTable + pagination + CSV export เป็นเครื่องมือ
ผิดขนาด ให้ใช้การ์ดแทน

ตัวอย่างที่ยังมีอยู่จริง:
- `src/pages/ReportFormGroupManagement.tsx` — การ์ดต่อ report group
- `src/pages/EmailSettingManagement.tsx` — การ์ดต่อ email sender purpose (สูงสุด 3 ใบตลอดกาล)
  · หน้าถือ `editingPurpose` เพื่อให้แก้ได้ทีละใบ · การ์ดเป็นเจ้าของ form state และเรียก service เอง

(`PrintTemplateMapping*` ที่เคยเป็นตัวอย่างของหัวข้อนี้ถูกลบไปแล้วพร้อมฟีเจอร์ทั้งฝั่ง frontend
และ backend — อย่าอ้างอิงอีก)
```

- [ ] **Step 2: บันทึกหน้าใหม่ในหัวข้อ Project Structure**

เพิ่ม `emailSettings/` เข้าบล็อกโครงสร้างใต้ `pages/` ให้ตรงกับของจริง:

```
    emailSettings/     EmailSettingManagement.tsx decomposed — EmailSettingCard,
                       PasswordField (คืน null ไม่ได้), TestEmailDialog
```

- [ ] **Step 3: รันชุดตรวจทั้งหมด**

```bash
bun run test
bun run build
```
Expected: เทสต์เขียวทั้งชุด (ของเดิม ~1002 + ของใหม่ 34) · build ผ่าน (vite-plugin-eslint รัน lint ให้ในตัว)

ถ้า `bun run build` ล้มเหลวด้วย eslint error ในไฟล์ที่ task นี้ไม่ได้แตะ ให้รายงานว่าเป็นหนี้เดิม
อย่าไล่แก้

- [ ] **Step 4: ตรวจด้วยตาใน dev server**

```bash
bun run dev:dev
```

เปิด `http://localhost:3304/platform/email-settings` แล้วยืนยัน:

| # | ตรวจ | เกณฑ์ผ่าน |
|---|---|---|
| 1 | หน้าโหลดขึ้น | เห็นการ์ด 3 ใบ ไม่ crash |
| 2 | nav | มี "Email Settings" ในกลุ่ม Platform |
| 3 | responsive | ที่ความกว้างระดับมือถือ การ์ดเรียงเป็นคอลัมน์เดียว อ่านได้ |

⚠️ **ข้อ 1 จะได้ 401/403 ถ้า backend PR #264 ยังไม่ deploy หรือยังไม่ได้ grant `email-setting.*`
ให้ application record** — นั่นคือผลที่ถูกต้อง ไม่ใช่บั๊กของหน้านี้ ให้บันทึกไว้ในรายงานแทน
การพยายามแก้

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: บันทึกหน้า Email Settings และแก้ precedent PrintTemplateMapping ที่ถูกลบไปแล้ว"
```

---

## สรุปลำดับ dependency

```
Task 1 (types/constants/service) ─┬─→ Task 3 (TestEmailDialog) ─┐
                                  │                             ├─→ Task 4 (Card) ─→ Task 5 (Page+route+nav) ─→ Task 6 (docs+verify)
Task 2 (PasswordField) ───────────┴─────────────────────────────┘
```

Task 1 กับ Task 2 ทำขนานกันได้ · Task 3 ต้องรอ Task 1 · Task 4 ต้องรอ 1, 2, 3 · Task 5 ต้องรอ 4 · Task 6 ต้องรอทุกตัว

## หลังแผนนี้จบ

หน้านี้ merge ได้อิสระ แต่**ใช้งานจริงไม่ได้จนกว่า backend PR #264 จะ merge + deploy**
รวมถึงต้อง grant `email-setting.*` ทั้ง 6 ตัวให้ application record ที่ frontend ใช้ ไม่งั้น
`AppIdGuard` ฝั่ง gateway จะตอบ 401 ทุก endpoint — รายละเอียดอยู่ใน PR body ของ #264
