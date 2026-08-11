# Broadcast contract drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่ง `end_at` ที่ backend บังคับ และย้าย severity ไปอยู่ใน `metadata` เพื่อให้หน้า `/broadcasts/new` กลับมาส่ง broadcast ได้แทนที่จะได้ 400 ทุกครั้ง

**Architecture:** แก้ frontend อย่างเดียว 3 ไฟล์ Task 1 แก้ปัญหา 400 ให้จบด้วยค่าเริ่มต้น 30 วันโดยยังไม่มี UI, Task 2 เพิ่มฟิลด์ Expires ให้ผู้ใช้ควบคุม, Task 3 ทำให้ Preview เลิกบอกเป็นนัยว่าผู้รับเห็นสี severity แต่ละ task ส่งมอบของที่ใช้งานได้เองและ review แยกกันได้

**Tech Stack:** React 19 + TypeScript, Vite, Vitest (jsdom) + React Testing Library, Tailwind + shadcn/ui

## Global Constraints

- แก้เฉพาะ repo `carmen-platform` — ห้ามแตะ `carmen-turborepo-backend-v2` และห้ามมี migration
- **ไม่ต้องเขียนไฟล์เทสต์ใหม่** ตาม `~/.claude/CLAUDE.md` (Skip Automated Tests During Plan Execution) — implement → typecheck/lint → commit เทสต์เดิมที่มีอยู่ต้องยังเขียว
- `end_at` และ `scheduled_at` ส่งเป็น ISO 8601 พร้อม `Z` เสมอ ผ่าน `toISOString()` เท่านั้น
- ห้ามเพิ่ม library ภายนอก — ไม่มี date library ในโปรเจกต์นี้โดยเจตนา
- ห้ามแตะ `src/components/ui/` primitives
- gate ก่อน commit ทุก task: `bun run typecheck` และ `bun run lint` ต้องผ่าน
- branch ปัจจุบันคือ `fix/broadcast-contract-drift-end-at` — commit ลง branch นี้ ห้าม push ห้ามเปิด PR เว้นแต่ผู้ใช้สั่ง
- สเปกอ้างอิง: `docs/superpowers/specs/2026-08-11-broadcast-contract-drift-design.md`

---

## File Structure

| ไฟล์ | ความรับผิดชอบ | Task |
|---|---|---|
| `src/types/index.ts:775-791` | รูป payload ที่ส่งขึ้น API | 1 |
| `src/pages/BroadcastCompose.tsx` | form state, การคำนวณ `end_at`/severity, UI, validation | 1, 2 |
| `src/pages/broadcastCompose/BroadcastPreview.tsx` | แสดงวันหมดอายุ + บอกความจริงเรื่อง severity | 3 |

ไม่มีไฟล์ใหม่ — `BroadcastCompose.tsx` ยาว ~620 บรรทัดซึ่งยังอยู่ในเกณฑ์ของ repo นี้ และการเพิ่มฟิลด์เดียวไม่ใช่เหตุผลพอที่จะแยกไฟล์

---

### Task 1: ส่ง `end_at` และ `metadata.severity` (แก้ 400 ให้จบ)

**Files:**
- Modify: `src/types/index.ts:775-791`
- Modify: `src/pages/BroadcastCompose.tsx:41-98` (form state + builders), `:326-335` (isDirty)

**Interfaces:**
- Consumes: ไม่มี — task แรก
- Produces:
  - `type ExpiryPreset = '7d' | '30d' | '90d' | 'custom'`
  - `BroadcastFormData` เพิ่มฟิลด์ `expiryPreset: ExpiryPreset` และ `expiresAtLocal: string`
  - `function resolveExpiryIso(form: BroadcastFormData): string`
  - `function resolveSeverity(form: BroadcastFormData): string`
  - `BroadcastSystemPayload` / `BroadcastBuPayload` มี `end_at: string` (required) และไม่มี `type` อีกต่อไป

- [ ] **Step 1: แก้ payload types**

ใน `src/types/index.ts` แทนที่ทั้งสอง interface (บรรทัด 775-791) ด้วย:

```ts
export interface BroadcastSystemPayload {
  title: string;
  message: string;
  /**
   * เมื่อประกาศหมดอายุ (ISO 8601 Z) — backend บังคับแบบไม่มี default ตั้งแต่ PR #324
   * (SystemBroadcastCreateSchema) และบังคับแม้ในกิ่ง userIds ที่ตัวมันเองไม่ได้ใช้ค่า
   * เพื่อให้ request มีรูปเดียว การไม่ส่งฟิลด์นี้ = 400 ทุกครั้ง
   */
  end_at: string;
  /** severity ของผู้ส่งอยู่ที่ `metadata.severity` — schema ไม่มีคอลัมน์สำหรับมัน */
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
  userIds?: string[];    // UUIDs; when present, fans out as personal rows
}

export interface BroadcastBuPayload {
  bu_code: string;
  title: string;
  message: string;
  /** ดู BroadcastSystemPayload.end_at — BuBroadcastCreateSchema บังคับเหมือนกัน */
  end_at: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
}
```

`type?: string` หายไปโดยเจตนา — backend zod ทำ `strip` จึงกลืนมันเงียบ ๆ การคงไว้ทำให้ไม่มีอะไรเตือนว่าฟิลด์นี้ตายแล้ว

- [ ] **Step 2: เพิ่ม form state**

ใน `src/pages/BroadcastCompose.tsx` เหนือ `interface BroadcastFormData` (บรรทัด 41) เพิ่ม:

```ts
type ExpiryPreset = '7d' | '30d' | '90d' | 'custom';

const EXPIRY_DAYS: Record<Exclude<ExpiryPreset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;
```

แล้วเพิ่มสองฟิลด์เข้า `BroadcastFormData` และ `initialForm`:

```ts
interface BroadcastFormData {
  title: string;
  message: string;
  typePreset: BroadcastTypePreset;
  typeCustom: string;
  sendMode: 'now' | 'schedule';
  scheduledAtLocal: string;
  buCode: string;
  expiryPreset: ExpiryPreset;
  expiresAtLocal: string;
}

const initialForm: BroadcastFormData = {
  title: '',
  message: '',
  typePreset: 'INFO',
  typeCustom: '',
  sendMode: 'now',
  scheduledAtLocal: '',
  buCode: '',
  expiryPreset: '30d',
  expiresAtLocal: '',
};
```

- [ ] **Step 3: STOP — ผู้ใช้เขียน `resolveExpiryIso` เอง**

**หยุดที่ step นี้และขอให้ผู้ใช้เติมโค้ด** อย่าเขียนแทน นี่เป็น business rule ที่ผู้ใช้ขอไว้ว่าจะตัดสินเอง

แทนที่ `resolveType` (บรรทัด 69-72) ด้วยสองฟังก์ชันนี้ โดยเว้น body ของ `resolveExpiryIso` ไว้:

```ts
/** severity ของผู้ส่ง — ไปอยู่ใน metadata ไม่ใช่ฟิลด์ `type` ที่ backend ทิ้งแล้ว */
function resolveSeverity(form: BroadcastFormData): string {
  return form.typePreset === 'OTHER' ? form.typeCustom.trim().toUpperCase() : form.typePreset;
}

/**
 * แปลง preset/custom เป็น ISO Z สำหรับ `end_at`
 *
 * คำแนะนำจากสเปก (ผู้ใช้ตัดสินขั้นสุดท้าย): base ของ preset ควรเป็น `scheduled_at`
 * เมื่อ sendMode === 'schedule' ไม่ใช่เวลาปัจจุบัน — ไม่งั้นคนที่ตั้งส่งวันที่ 20 แล้วเลือก
 * "7 days" จะได้ประกาศที่หมดอายุวันที่ 18 คือตายก่อนถูกส่ง ผู้รับไม่เห็นอะไรเลย
 * ถ้า scheduledAtLocal ว่างหรือ parse ไม่ได้ ให้ถอยไปใช้เวลาปัจจุบัน (validation
 * บล็อกที่ scheduledAtLocal อยู่แล้วก่อนถึง submit)
 */
function resolveExpiryIso(form: BroadcastFormData): string {
  // TODO(ผู้ใช้): base = Date.now() หรือ scheduled_at?
}
```

ตัวช่วยที่มีให้ใช้แล้ว: `EXPIRY_DAYS`, `DAY_MS`, `form.expiryPreset`, `form.expiresAtLocal`, `form.sendMode`, `form.scheduledAtLocal` ผลลัพธ์ต้องเป็น `new Date(...).toISOString()` เสมอ

- [ ] **Step 4: แก้ payload builders**

แทนที่ body ของทั้งสองฟังก์ชัน (บรรทัด 74-98) ด้วย:

```ts
function buildSystemPayload(form: BroadcastFormData, recipients: UserOption[]): BroadcastSystemPayload {
  const payload: BroadcastSystemPayload = {
    title: form.title.trim(),
    message: form.message.trim(),
    end_at: resolveExpiryIso(form),
    metadata: { severity: resolveSeverity(form) },
  };
  if (recipients.length > 0) payload.userIds = recipients.map((r) => r.id);
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

function buildBuPayload(form: BroadcastFormData): BroadcastBuPayload {
  const payload: BroadcastBuPayload = {
    bu_code: form.buCode,
    title: form.title.trim(),
    message: form.message.trim(),
    end_at: resolveExpiryIso(form),
    metadata: { severity: resolveSeverity(form) },
  };
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}
```

- [ ] **Step 5: อัปเดต isDirty**

ใน block `isDirty` (บรรทัด 326-335) เพิ่มสองเงื่อนไขต่อจาก `formData.scheduledAtLocal.length > 0 ||`:

```ts
    formData.expiryPreset !== '30d' ||
    formData.expiresAtLocal.length > 0 ||
```

เทียบกับ `'30d'` ไม่ใช่ค่าว่าง เพราะ `'30d'` คือค่าเริ่มต้น — ฟอร์มที่ยังไม่ถูกแตะต้องรายงานว่า "No changes"

- [ ] **Step 6: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: ผ่านทั้งหมด `BroadcastCompose.test.tsx` (3 tests) ยืนยันแค่ว่า `sendSystem`/`sendBu` ถูกเรียก ไม่ได้ยืนยันรูป payload จึงไม่ควรพัง ถ้าพังให้อ่าน error ก่อนแก้ อย่าแก้เทสต์ให้ผ่านเฉย ๆ

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/pages/BroadcastCompose.tsx
git commit -m "fix(broadcast): ส่ง end_at ที่ backend บังคับ และย้าย severity เข้า metadata

backend PR #324 เพิ่ม end_at เป็นฟิลด์บังคับแบบไม่มี default ทั้งสอง broadcast
endpoint ทำให้ POST จากหน้านี้ได้ 400 ทุกครั้ง และฟิลด์ type ที่ส่งมาตลอดถูก zod
strip ทิ้งเงียบเพราะ schema ใหม่ไม่มีมัน — severity จึงย้ายไปอยู่ใน metadata ที่มี
อยู่แล้วทั้งใน DB, zod schema และ type ฝั่งนี้

ค่าเริ่มต้น 30 วันทำให้ฟอร์มส่งได้ทันทีโดยยังไม่มี UI ให้เลือก ซึ่งจะตามมาใน task ถัดไป"
```

---

### Task 2: ฟิลด์ Expires ในหน้าฟอร์ม + validation

**Files:**
- Modify: `src/pages/BroadcastCompose.tsx:176` (ValidatableField), `:210-232` (validateOne + VALIDATABLE_FIELDS), `:519-547` (Delivery section JSX)

**Interfaces:**
- Consumes: `ExpiryPreset`, `EXPIRY_DAYS`, `formData.expiryPreset`, `formData.expiresAtLocal` จาก Task 1
- Produces: `'expiresAtLocal'` เป็นสมาชิกของ `ValidatableField` — ทุกที่ที่ validate ฟอร์มจะครอบคลุมมันเอง

- [ ] **Step 1: เพิ่มฟิลด์เข้า ValidatableField**

แก้บรรทัด 176:

```ts
  type ValidatableField = 'title' | 'message' | 'typeCustom' | 'scheduledAtLocal' | 'expiresAtLocal' | 'buCode' | 'recipients';
```

- [ ] **Step 2: เพิ่ม case ใน validateOne**

ใน `validateOne` แทรก case ใหม่ต่อจาก `case 'scheduledAtLocal'` (หลังบรรทัด 218):

```ts
      case 'expiresAtLocal': {
        // preset ไม่ต้องตรวจ — คำนวณจาก base เสมอจึงเป็นอนาคตโดยนิยาม
        if (form.expiryPreset !== 'custom') return '';
        const v = form.expiresAtLocal;
        if (!v) return 'Pick an expiry date and time';
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) return 'Invalid date/time';
        if (ts <= Date.now()) return 'Expiry must be in the future';
        if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
          const scheduled = new Date(form.scheduledAtLocal).getTime();
          if (!Number.isNaN(scheduled) && ts <= scheduled) {
            return 'Expiry must be after the scheduled send time';
          }
        }
        return '';
      }
```

- [ ] **Step 3: เพิ่มเข้า VALIDATABLE_FIELDS**

แก้บรรทัด 230-232:

```ts
  const VALIDATABLE_FIELDS: ValidatableField[] = [
    'title', 'message', 'typeCustom', 'scheduledAtLocal', 'expiresAtLocal', 'buCode', 'recipients',
  ];
```

- [ ] **Step 4: เพิ่ม UI ใน Delivery section**

ใน section Delivery แทรกต่อจากบล็อก `{formData.sendMode === 'schedule' && (…)}` ที่ปิดที่บรรทัด 546 ก่อน `</section>`:

```tsx
                <div className="space-y-2 pt-1">
                  <Label htmlFor="expiryPreset">Expires</Label>
                  <select
                    id="expiryPreset"
                    value={formData.expiryPreset}
                    onChange={(e) => setField('expiryPreset', e.target.value as ExpiryPreset)}
                    className={SELECT_CLASS}
                  >
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                    <option value="custom">Custom…</option>
                  </select>
                  {formData.expiryPreset === 'custom' && (
                    <div className="space-y-1">
                      <input
                        id="expiresAtLocal"
                        type="datetime-local"
                        value={formData.expiresAtLocal}
                        onChange={(e) => setField('expiresAtLocal', e.target.value)}
                        onBlur={() => handleFieldBlur('expiresAtLocal')}
                        className={SELECT_CLASS + (fieldErrors.expiresAtLocal ? ' border-destructive' : '')}
                      />
                      {fieldErrors.expiresAtLocal && (
                        <p className="text-xs text-destructive">{fieldErrors.expiresAtLocal}</p>
                      )}
                    </div>
                  )}
                </div>
```

ใช้ `<select>` ดิบ + `SELECT_CLASS` และ `<input type="datetime-local">` ให้ตรงกับแพตเทิร์นที่ Type dropdown (บรรทัด 491-500) และ scheduled input (บรรทัด 534-541) ใช้อยู่แล้วในไฟล์นี้ ไม่ใช่ shadcn `Select`

- [ ] **Step 5: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: ผ่านทั้งหมด `<Label htmlFor="expiryPreset">` ทำให้ `getByLabelText('Expires')` ใช้ได้ถ้ามีใครเขียนเทสต์ทีหลัง

- [ ] **Step 6: Commit**

```bash
git add src/pages/BroadcastCompose.tsx
git commit -m "feat(broadcast): เพิ่มฟิลด์ Expires แบบ preset 7/30/90 วัน + custom

ผู้ใช้ควบคุมวันหมดอายุของประกาศได้เองแทนค่าตายตัว 30 วันจาก task ก่อน custom
เปิด datetime-local พร้อม validation ว่าต้องเป็นอนาคตและต้องหลังเวลาส่งที่ตั้งไว้
preset ไม่ต้อง validate เพราะคำนวณจาก base จึงเป็นอนาคตโดยนิยาม"
```

---

### Task 3: Preview บอกวันหมดอายุและเลิกบอกเป็นนัยว่าผู้รับเห็นสี

**Files:**
- Modify: `src/pages/broadcastCompose/BroadcastPreview.tsx:51-61` (props), `:114-130` (Delivery block)
- Modify: `src/pages/BroadcastCompose.tsx:348-353` (label), `:553-563` (ส่ง prop)

**Interfaces:**
- Consumes: `resolveExpiryIso` จาก Task 1, `formData.expiryPreset`/`expiresAtLocal` จาก Task 1
- Produces: `BroadcastPreviewProps` เพิ่ม `expiresLabel?: string` — **optional** เพื่อให้ `BroadcastPreview.test.tsx` เดิมที่ spread `base` object ไม่พัง

- [ ] **Step 1: เพิ่ม prop**

ใน `BroadcastPreview.tsx` เพิ่มบรรทัดสุดท้ายของ `BroadcastPreviewProps` (หลังบรรทัด 60):

```ts
  expiresLabel?: string; // formatted expiry time, when resolvable
```

และเพิ่ม `expiresLabel,` เข้า destructuring ของ `BroadcastPreview` ต่อจาก `scheduledLabel,` (บรรทัด 73)

- [ ] **Step 2: แสดงวันหมดอายุ + คำเตือนความจริง**

ใน block Delivery แทรกต่อจาก `</div>` ที่ปิด flex container (บรรทัด 129) ก่อน `</div>` ที่ปิด block:

```tsx
          {expiresLabel && (
            <div className="text-muted-foreground flex items-center gap-2 px-2.5 py-1 text-sm">
              <Calendar className="size-4 shrink-0" />
              <span className="min-w-0">Expires {expiresLabel}</span>
            </div>
          )}
          <p className="text-muted-foreground/80 px-2.5 pt-1 text-[11px] leading-relaxed">
            สีและป้ายกำกับด้านบนเป็นการจัดหมวดภายใน — ผู้รับเห็นเป็นการแจ้งเตือนทั่วไป
          </p>
```

`Calendar` ถูก import อยู่แล้วที่บรรทัด 1 ไม่ต้องเพิ่ม import

ข้อความนี้จำเป็นเพราะ backend hardcode `event: enum_notification_event.info` ให้ทุก broadcast — แถบสีและ Badge จึงเป็นจริงเฉพาะบนหน้าจอผู้ส่ง เก็บ severity ลง `metadata` ต่อไปได้ แต่ต้องไม่ทำให้คนส่งเข้าใจผิด

- [ ] **Step 3: คำนวณ label แล้วส่งเข้า Preview**

ใน `BroadcastCompose.tsx` เพิ่มต่อจาก `scheduledLabel` (หลังบรรทัด 353):

```ts
  const expiresLabel = (() => {
    const iso = resolveExpiryIso(formData);
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? undefined : t.toLocaleString();
  })();
```

แล้วเพิ่ม prop ต่อจาก `scheduledLabel={scheduledLabel}` (บรรทัด 562):

```tsx
              expiresLabel={expiresLabel}
```

- [ ] **Step 4: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: ผ่านทั้งหมด `BroadcastPreview.test.tsx` มี 4 เทสต์ที่ spread `base` object — `expiresLabel` เป็น optional จึงไม่ต้องแก้ไฟล์เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/pages/broadcastCompose/BroadcastPreview.tsx src/pages/BroadcastCompose.tsx
git commit -m "feat(broadcast): Preview แสดงวันหมดอายุและบอกว่าผู้รับไม่เห็นสี severity

backend hardcode event: info ให้ broadcast ทุกอัน แถบสีและ Badge ใน Preview จึง
เป็นจริงเฉพาะบนหน้าจอผู้ส่ง การปล่อยให้ Preview เงียบเรื่องนี้ทำให้คนกด Send เชื่อว่า
ผู้รับจะเห็น Critical เป็นสีแดง"
```

---

### Task 4: ยืนยันในเบราว์เซอร์

**Files:** ไม่แก้ไฟล์ — เป็นการตรวจสอบ

**Interfaces:**
- Consumes: ผลลัพธ์ทั้งหมดจาก Task 1-3

- [ ] **Step 1: เปิดหน้าและตรวจฟอร์ม**

เปิด `http://localhost:3304/broadcasts/new` (dev server รันด้วย `bun run dev:dev` ถ้ายังไม่ได้รัน) ตรวจว่า:
- section Delivery มีฟิลด์ **Expires** ค่าเริ่มต้น **30 days**
- เลือก **Custom…** แล้วมี `datetime-local` โผล่ ใส่วันที่ในอดีตแล้ว blur ต้องขึ้น `Expiry must be in the future`
- Preview ด้านขวาแสดง `Expires <วันเวลา>` และบรรทัดคำเตือนเรื่องสี

- [ ] **Step 2: STOP — ขออนุญาตผู้ใช้ก่อนส่งจริง**

**ห้ามกด Send เอง** การกดคือการยิง notification จริงถึงผู้ใช้ ขออนุญาตผู้ใช้ก่อน และเมื่อได้อนุญาตแล้วให้ใช้ **audience = Specific users เลือกผู้ใช้คนเดียว** ไม่ใช่ All users

- [ ] **Step 3: ยืนยัน 201 และรูป payload**

หลังกด Send อ่าน Network tab ของ `POST /api/notifications/broadcasts/system` แล้วยืนยัน:
- status **201** (ไม่ใช่ 400)
- request body มี `end_at` เป็น ISO ลงท้ายด้วย `Z`
- request body มี `metadata.severity`
- request body **ไม่มี** `type`

- [ ] **Step 4: บันทึกผล**

เขียนผลที่สังเกตได้จริง (status, payload ที่เห็น) ลงท้ายไฟล์สเปก
`docs/superpowers/specs/2026-08-11-broadcast-contract-drift-design.md` ใต้หัวข้อใหม่
`## ผลการตรวจสอบ` แล้ว commit ถ้ายังไม่ได้ส่งจริงเพราะผู้ใช้ไม่อนุญาต ให้บันทึกตามนั้นตรง ๆ
ห้ามเขียนว่ายืนยันแล้ว

---

## Self-Review

**Spec coverage:**

| ข้อกำหนดในสเปก | Task |
|---|---|
| payload types + ลบ `type` | 1 |
| form state `expiryPreset`/`expiresAtLocal` | 1 |
| `resolveSeverity` ทิ้ง prefix `SYS_`/`BU_` | 1 |
| `resolveExpiryIso` base ขึ้นกับ sendMode | 1 (ผู้ใช้เขียน) |
| builders ใส่ `end_at` + `metadata` | 1 |
| UI preset dropdown + custom | 2 |
| validation 4 กฎ | 2 |
| Preview แสดง expiry + คำเตือน | 3 |
| timezone ISO Z | 1, 3 |
| ตรวจในเบราว์เซอร์ | 4 |

**Placeholder scan:** `TODO(ผู้ใช้)` ใน Task 1 Step 3 เป็น placeholder โดยเจตนา — เป็นจุดที่ผู้ใช้ขอตัดสินเอง และ step ระบุชัดว่าให้หยุดรอ ไม่ใช่ให้ผู้ execute เดา ที่เหลือไม่มี

**Type consistency:** `ExpiryPreset`, `EXPIRY_DAYS`, `DAY_MS`, `resolveExpiryIso`, `resolveSeverity`, `expiresAtLocal`, `expiryPreset`, `expiresLabel` ใช้ชื่อเดียวกันตลอด Task 1-3 ตรวจแล้ว
