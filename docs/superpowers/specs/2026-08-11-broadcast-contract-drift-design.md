# Broadcast contract drift — `end_at` และ severity ที่ไม่มีที่เก็บ

วันที่: 2026-08-11
สถานะ: design ยืนยันแล้ว รอ implement
ขอบเขต: frontend เท่านั้น (`carmen-platform`) — ไม่แตะ backend ไม่มี migration

## ปัญหา

`http://localhost:3304/broadcasts/new` กด Send แล้วได้ `400 Bad Request` ทุกครั้ง

### Root cause

backend PR #324 (`feature/notification-redesign`) commit `d6826b7dc` เพิ่ม `end_at` เป็นฟิลด์
**บังคับ** ในทั้งสอง endpoint:

```ts
// carmen-turborepo-backend-v2
// apps/backend-gateway/src/common/dto/notification/notification.dto.ts:54, 119
end_at: z.string().datetime(),   // ไม่มี .optional() ไม่มี .default()
```

frontend ไม่เคยส่ง `end_at` (`src/types/index.ts:775-791`) จึงตกที่ zod validation ก่อนถึง
handler ตรงกับที่ swagger ของ backend ระบุเอง: `'Invalid payload — end_at missing/invalid'`

`end_at` บังคับ **แม้ในกิ่ง `userIds`** ที่ backend ไม่ได้ใช้ค่านั้นเลย — คอมเมนต์ที่
`notification.dto.ts:48-53` ระบุว่าจงใจ เพื่อให้ request มีรูปเดียวไม่ว่า server จะ resolve
audience ไปทางไหน ฝั่ง FE จึงต้องส่งเสมอ ไม่มีเงื่อนไขยกเว้น

### บั๊กเงียบที่พบระหว่างสอบสวน

FE ส่ง `type: 'SYS_CRITICAL' | 'SYS_WARNING' | …` (`BroadcastCompose.tsx:69-72`) แต่ schema
ใหม่ **ไม่มีฟิลด์ `type`** — zod object ทำ `strip` ไม่ใช่ `strict` ค่าจึงหายเงียบแทนที่จะ 400
ซึ่งเป็นเหตุผลที่บั๊กนี้อยู่มาได้โดยไม่มีใครเห็น

controller hardcode `event: enum_notification_event.info` ทั้งสองเส้น
(`notification.controller.ts` — system builder และบรรทัด 496 สำหรับ bu)

severity **ไม่มีที่เก็บใน schema เลย**:

```prisma
// packages/prisma-shared-schema-platform/prisma/schema.prisma:122
enum enum_notification_event { info  workflow  comment }
```

`event` คือแกน "ชนิดเหตุการณ์" ใช้ร่วมกับ `tb_notification` ทั้งระบบ ไม่ใช่แกน severity และ
`tb_broadcast_notification` (schema.prisma:368-383) มีแค่ `event`, `scope`, `metadata Json?`
ไม่มีคอลัมน์ severity หรือ type

### ไม่มีผู้รับคนไหนเคยเห็น severity

| ที่ | อ่าน severity ไหม |
|---|---|
| `src/pages/broadcastCompose/BroadcastPreview.tsx` + เทสต์ | อ่าน — แต่เป็นหน้า compose ของผู้ส่งเอง |
| notification list response DTO (backend `swagger/response.ts`) | ไม่ — คืน `doc_type`/`event`/`metadata` |
| `carmen-inventory-frontend-react` | ไม่มีเลย |

severity ถูกส่งออกไปแล้วหายมาตลอด Preview บนหน้า compose คือที่เดียวที่มันมีผล

## การตัดสินใจ

1. **`end_at`** — เพิ่มฟิลด์ Expires เป็น preset dropdown (7/30/90 วัน) + `Custom…` ที่เปิด
   `datetime-local` ค่าเริ่มต้น 30 วัน ผู้ใช้เห็นและควบคุมได้ แต่ไม่ถูกบังคับให้กรอกทุกครั้ง
2. **severity** — ย้ายไปอยู่ใน `metadata.severity` แทนฟิลด์ `type` ที่ตายแล้ว ไม่แตะ backend
   ไม่มี migration เก็บเจตนาผู้ส่งไว้รอวันที่มี UI ฝั่งผู้รับ

ทางเลือกที่พิจารณาแล้วไม่เลือก: เพิ่มค่าใน `enum_notification_event` (ปนแกน semantics กับ
notification ทั้งระบบ), เพิ่มคอลัมน์ `severity` + enum ใหม่ (สะอาดที่สุดเชิง data model แต่ต้อง
migration + DTO + service + query และ backend ต้อง deploy ก่อน — ยกไว้ทำเมื่อมีคนอ่านจริง)

## การเปลี่ยนแปลง

ไฟล์ที่แตะ: `src/types/index.ts`, `src/pages/BroadcastCompose.tsx`,
`src/pages/broadcastCompose/BroadcastPreview.tsx`

### 1. Payload types (`src/types/index.ts:775-791`)

```ts
export interface BroadcastSystemPayload {
  title: string;
  message: string;
  end_at: string;                        // เพิ่ม — required, ISO 8601 Z
  metadata?: Record<string, unknown>;    // severity ย้ายมาที่นี่
  scheduled_at?: string;
  userIds?: string[];
}

export interface BroadcastBuPayload {
  bu_code: string;
  title: string;
  message: string;
  end_at: string;                        // เพิ่ม — required, ISO 8601 Z
  metadata?: Record<string, unknown>;
  scheduled_at?: string;
}
```

ลบ `type?: string` ออกจากทั้งสอง interface — ถ้าปล่อยไว้ tsc จะไม่เตือนใครเลยว่าฟิลด์นี้ตายแล้ว

### 2. Form state (`BroadcastCompose.tsx:41-59`)

```ts
type ExpiryPreset = '7d' | '30d' | '90d' | 'custom';

interface BroadcastFormData {
  // …ของเดิม
  expiryPreset: ExpiryPreset;    // default '30d'
  expiresAtLocal: string;        // ใช้เมื่อ expiryPreset === 'custom'
}
```

### 3. Payload builders (`BroadcastCompose.tsx:69-98`)

ลบ `resolveType()` ทิ้ง แทนด้วย:

```ts
function resolveSeverity(form: BroadcastFormData): string {
  return form.typePreset === 'OTHER'
    ? form.typeCustom.trim().toUpperCase()
    : form.typePreset;
}
```

ทิ้ง prefix `SYS_`/`BU_` เพราะซ้ำซ้อนกับ `doc_type` ที่ backend ตั้งเองจาก endpoint อยู่แล้ว

`buildSystemPayload` / `buildBuPayload` ใส่ `end_at: resolveExpiryIso(form)` และ
`metadata: { severity: resolveSeverity(form) }`

### 4. `resolveExpiryIso` — จุดที่ต้องตัดสิน base

```ts
function resolveExpiryIso(form: BroadcastFormData): string
```

`custom` → `new Date(form.expiresAtLocal).toISOString()`

preset (`7d`/`30d`/`90d`) → นับจาก base + จำนวนวัน โดย **base ขึ้นกับ `sendMode`**:

- `sendMode === 'now'` → base คือเวลาปัจจุบัน
- `sendMode === 'schedule'` → base คือ `scheduled_at`

เหตุผล: ถ้านับจากปัจจุบันเสมอ ผู้ใช้ที่ตั้งส่งวันที่ 20 แล้วเลือก "7 days" จะได้ประกาศที่
หมดอายุวันที่ 18 — **ตายก่อนถูกส่ง** ผู้รับไม่เห็นอะไรเลย การนับจากเวลาที่ประกาศจะปรากฏจริง
ทำให้ "7 วัน" หมายถึงอายุที่ผู้รับเห็นจริง ซึ่งตรงกับที่ผู้ใช้เข้าใจ

fallback: ถ้า `sendMode === 'schedule'` แต่ `scheduledAtLocal` ยังว่างหรือ parse ไม่ได้ ให้ใช้
เวลาปัจจุบันเป็น base (ฟอร์มจะถูก validation บล็อกที่ `scheduledAtLocal` อยู่แล้วก่อนถึง submit)

### 5. Validation (`BroadcastCompose.tsx:176, 231`)

เพิ่ม `'expiresAtLocal'` เข้า `ValidatableField` union และเข้า array ที่ re-validate ก่อน submit
ตามแพตเทิร์นเดิมของ `scheduledAtLocal`

กฎ (ทำงานเฉพาะเมื่อ `expiryPreset === 'custom'`):

- ว่าง → `'Expiry is required'`
- parse ไม่ได้ → `'Invalid date'`
- ไม่ใช่อนาคต → `'Expiry must be in the future'`
- `sendMode === 'schedule'` และไม่หลัง `scheduled_at` → `'Expiry must be after the scheduled send time'`

preset ไม่ต้อง validate — คำนวณจาก base เสมอจึงเป็นอนาคตโดยนิยาม

### 6. Preview ต้องไม่โกหก (`BroadcastPreview.tsx`)

วันนี้ Preview แสดงแถบสีตาม severity ราวกับผู้รับจะเห็น ทั้งที่ backend hardcode `event: info`
ให้ทุกอัน เพิ่มใต้บล็อก DELIVERY:

```
Expires  10 Sep 2026, 09:00
ⓘ สีและป้ายกำกับเป็นการจัดหมวดภายใน — ผู้รับเห็นเป็นการแจ้งเตือนทั่วไป
```

รับ prop ใหม่ `expiresLabel: string` (จัดรูปแบบมาจากหน้า compose ตาม inline formatter ของ repo)
คงแถบสี severity ไว้ตามเดิม — ค่ายังถูกเก็บลง `metadata` จริง เพียงแต่บอกความจริงว่าวันนี้ผู้รับ
ยังไม่เห็นมัน

## Timezone

`end_at` และ `scheduled_at` ส่งเป็น ISO 8601 พร้อม `Z` เสมอ (`toISOString()`) input เป็น
`datetime-local` ซึ่งเป็นเวลาท้องถิ่นของเบราว์เซอร์ — FE เป็นชั้นเดียวที่แปลง ตามกฎของโปรเจกต์

## การตรวจสอบ

- `bun run typecheck` และ `bun run lint` ผ่าน
- เทสต์เดิมของ `BroadcastPreview` และ `BroadcastCompose` ยังเขียว (ปรับเฉพาะที่ prop เปลี่ยน)
- ตรวจในเบราว์เซอร์ที่ `http://localhost:3304/broadcasts/new`: กด Send จริงหนึ่งครั้งด้วย
  **audience = Specific users เลือกผู้ใช้คนเดียว** เพื่อไม่ให้ยิงถึงทุกคน แล้วยืนยันว่า
  `POST /api/notifications/broadcasts/system` ตอบ **201** และ body มี `end_at` กับ
  `metadata.severity` — การส่งจริงต้องขออนุญาตผู้ใช้ก่อนกด

## นอกขอบเขต

- ยกระดับ severity เป็นคอลัมน์จริง + enum — ทำเมื่อมี UI ฝั่งผู้รับที่อ่านมัน
- UI ฝั่งผู้รับที่แสดงสีตาม severity
- การขอให้ backend เปลี่ยน `end_at` เป็น `.default()` เพื่อไม่ให้ FE เก่าพัง — คุยแยก
