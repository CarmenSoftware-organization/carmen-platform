# Platform Config (`tb_platform_config`) — Design

**วันที่:** 2026-08-06
**สถานะ:** อนุมัติแล้ว รอเขียน implementation plan
**repo ที่เกี่ยวข้อง:** `carmen-turborepo-backend-v2` (หลัก) + `carmen-platform` (หน้าจอ)

---

## 1. ปัญหา

`CARMEN_SYSTEM` (platform DB schema) ไม่มีตารางเก็บการตั้งค่าระดับแพลตฟอร์มเลย ค่าที่ควรแก้ได้โดยไม่ต้อง deploy จึงถูกยัดไว้ใน environment variable

ตัวที่เจ็บที่สุดคือคู่นี้ ซึ่งถูกเลื่อนมาจาก spec `2026-08-05-cluster-admin-layout-design.md`:

| env var | ที่ประกาศ | ที่ใช้ |
|---|---|---|
| `INVITATION_BASE_URL` | `apps/micro-cluster/src/libs/config.env.ts:69` | `user-invitation.service.ts:231` |
| `INVITATION_EXPIRY_DAYS` | `apps/micro-cluster/src/libs/config.env.ts:66` | `user-invitation.service.ts:236, 388, 658` |

การเปลี่ยน URL ปลายทางของลิงก์คำเชิญ หรือปรับอายุคำเชิญ ทุกวันนี้ต้องแก้ env แล้ว redeploy micro-cluster

## 2. เป้าหมาย

สร้างที่เก็บ config ระดับแพลตฟอร์มแบบ key/value ใน `CARMEN_SYSTEM` โดยลอกสัญญาของ `tb_application_config` (tenant) มา แล้วย้าย config คู่ invitation มาเป็น key แรก พร้อมหน้าจอให้ platform admin แก้ได้เอง

**ไม่ใช่เป้าหมาย:** ย้าย env ทุกตัวเข้ามา — รอบนี้เอาแค่ invitation ตัว key ถัดไปเพิ่มได้ที่ registry เดียว

## 3. สิ่งที่ลอกมา และสิ่งที่ตั้งใจไม่ลอก

ต้นแบบคือ `tb_application_config` + `apps/micro-business/src/app-config/app-config.service.ts`

**ลอก:** โครงตาราง key/value, per-key Zod schema, ตาราง default ต่อ key, `findFirst` → `update`/`create` แทน upsert บน constraint

**ไม่ลอก และเหตุผล:**

| ไม่ลอก | เหตุผล |
|---|---|
| ไฟล์เดียว 627 บรรทัด | ฝั่ง tenant กองรวม Zod 8 ตัว + ระบบเข้ารหัส + ตาราง default + `getSignatureCandidates()` ที่ไปอ่าน `tb_workflow` ซึ่งไม่ใช่เรื่อง config เลย ฝั่ง platform แยก schema ออกไฟล์ตัวเองตั้งแต่แรก service เหลือ CRUD + validate + default (~150 บรรทัด) |
| `secretPathsFor` / `encryptSensitiveFields` / `maskSensitiveFields` / `retainMaskedSecrets` (~120 บรรทัด) | ยังไม่มี key ไหนมีค่าลับ เพิ่มเมื่อมี key ที่ต้องใช้จริง |
| ยอมรับ key ที่ไม่รู้จักแบบ passthrough | platform config เป็นชุดปิดเล็ก ๆ ถ้าเขียน key มั่วได้ ตารางจะกลายเป็นลิ้นชักขยะ และ FE กับ DB จะเริ่มไม่ตรงกัน ในเมื่อ FE เป็นฟอร์มเฉพาะทาง การเพิ่ม key ยังไงก็ต้องแตะ FE ชุดปิดจึงสอดคล้องกว่า |

---

## 4. Data model

`packages/prisma-shared-schema-platform/prisma/schema.prisma` — วางต่อจาก `tb_email_sender_profile`

```prisma
model tb_platform_config {
  doc_version Int    @default(0) @db.Integer
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key         String @db.VarChar
  value       Json   @default("{}") @db.JsonB

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  @@unique([key, deleted_at], map: "platform_config_key_u")
  @@index([key], map: "platform_config_key_idx")
}
```

เหมือน `tb_application_config` ทุกคอลัมน์ ต่างแค่ชื่อ constraint

Migration: `packages/prisma-shared-schema-platform/prisma/migrations/20260806200000_platform_config/migration.sql` — `CREATE TABLE` เปล่า **ไม่ seed แถวใด ๆ** เพราะค่าที่ต้องใส่ต่างกันในแต่ละ environment (ดู §9 ข้อ 3) migration จึงย้อนกลับได้และรันตอนไหนก็ได้

### 4.1 ข้อจำกัดที่รู้ตัว — unique constraint ไม่ได้กัน key ซ้ำจริง

`@@unique([key, deleted_at])` ไม่บังคับอะไรกับแถวที่ยังไม่ถูกลบ เพราะ PostgreSQL ถือว่า `NULL ≠ NULL` สองแถวที่ `key='invitation'` และ `deleted_at = NULL` จึงอยู่ร่วมกันได้ ตารางฝั่ง tenant มีบั๊กนี้เหมือนกัน แต่ไม่แสดงอาการเพราะ service ใช้ `findFirst` → `update` ไม่ได้พึ่ง constraint

**ตัดสินใจ: คงไว้ตามต้นแบบ** ทางแก้จริงคือ partial unique index (`WHERE deleted_at IS NULL`) หรือ `NULLS NOT DISTINCT` แต่ Prisma schema ประกาศไม่ได้ทั้งคู่ ถ้าใส่ดิบใน migration แล้ว `prisma migrate dev` ครั้งถัดไปจะมองเป็น drift แล้วสั่ง drop ทิ้ง

รับความเสี่ยงได้เพราะ (ก) หน้าต่างการแข่งขันคือ admin สองคนกด Save คีย์เดียวกันในเสี้ยววินาทีเดียวกันตอนที่ยังไม่มีแถวนั้น (ข) ผลที่ตามมาคือมีแถวเกิน ไม่ใช่ข้อมูลหาย และ (ค) การฝืน Prisma แลกมาด้วยความเสี่ยง migration drift ที่แพงกว่า

## 5. สิทธิ์

`packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` เพิ่ม 2 รายการ:

| permission | คำอธิบาย |
|---|---|
| `platform_config.read` | View platform configuration values |
| `platform_config.manage` | Create and update platform configuration values |

`seed.platform-role-permission.data.ts`:

| role | ได้ |
|---|---|
| `cluster_admin` | ได้อยู่แล้วผ่าน `["*"]` |
| `platform_admin` | `platform_config.*` |
| `support_manager` | `platform_config.read` (สอดคล้องกับที่ role นี้ได้ `email_setting.read`) |
| `support_staff`, `security_officer` | ไม่ได้ |

drift checker ที่มีอยู่แล้ว (`check.platform-permission-drift.ts`, `check.platform-role-permission-drift.ts`) จะจับให้ถ้า seed กับ DB ไม่ตรง

---

## 6. Backend — micro-cluster

โมดูลใหม่ `apps/micro-cluster/src/cluster/platform-config/` 4 ไฟล์ ตาม pattern ของ `email-sender-profile/` ที่อยู่ข้าง ๆ (รวมถึงการ inject platform prisma ด้วย `@Inject('PRISMA_SYSTEM')` และ provider `{ provide: 'PRISMA_SYSTEM', useValue: PrismaClient_SYSTEM }` ใน module)

### 6.1 `platform-config.schema.ts` — registry ที่เดียวจบ

```ts
export const InvitationConfigSchema = z.object({
  base_url: z.string().url(),
  expiry_days: z.number().int().positive().max(365),
});
export type InvitationConfig = z.infer<typeof InvitationConfigSchema>;

export const PLATFORM_CONFIG_REGISTRY = {
  invitation: {
    schema: InvitationConfigSchema,
    default: { base_url: 'http://localhost:3000/invitations', expiry_days: 7 },
  },
} as const;
```

รายการ key ที่มี, schema ตรวจค่า, และค่า default มาจากออบเจ็กต์เดียว — เพิ่ม key ใหม่ = เพิ่ม 1 entry

ค่า default ตรงกับ default เดิมใน `config.env.ts` ทั้งสองตัว (บรรทัด 66 และ 69) จึงไม่มีพฤติกรรมใดเปลี่ยนสำหรับ environment ที่ไม่เคย override

### 6.2 `platform-config.service.ts`

```ts
type ConfigRow = {
  id: string | null;          // null เมื่อยังไม่มีแถวจริง (คืน default)
  key: string;
  value: unknown;             // ออบเจ็กต์ที่ผ่าน schema ของ key นั้น
  created_at: string | null;
  created_by_id: string | null;
  updated_at: string | null;
  updated_by_id: string | null;
};

list(): Promise<ConfigRow[]>                       // ทุก key ใน registry เติม default ให้ที่ยังไม่มีแถว
get(key): Promise<ConfigRow>                       // ไม่มีแถว → คืน default (id เป็น null)
upsert(key, value, user_id): Promise<ConfigRow>    // validate ด้วย registry ก่อนเขียน
getInvitationConfig(): Promise<InvitationConfig>   // typed accessor
```

**ไม่มี `delete`** — FE เขียนออบเจ็กต์เต็มใบเสมอ ฟังก์ชัน "reset เป็น default" ยังไม่มีใครขอ เพิ่มทีหลังได้ใน ~15 บรรทัด

**typed accessor** (`getInvitationConfig`) เป็นแนวทางที่เลือกไว้: ทำ get → Zod parse → เติม default ครบในที่เดียว consumer ได้ออบเจ็กต์ที่ type ถูกตั้งแต่ compile time และ logic เติม default มีที่อยู่แห่งเดียวจึงเพี้ยนกันไม่ได้เมื่อมี consumer ตัวที่สอง เพิ่ม key ใหม่ = เพิ่ม accessor ~8 บรรทัด

**ไม่ทำ cache** — invitation ส่งไม่กี่ครั้งต่อวัน การ cache แลกมาด้วยอาการ "แก้ค่าแล้วทำไมยังไม่มีผล" ซึ่งแพงกว่า DB query ที่ประหยัดได้

### 6.3 กติกาเมื่อค่าใน DB ใช้ไม่ได้

| สถานการณ์ | พฤติกรรม |
|---|---|
| ไม่มีแถว | คืน default — แปลว่า "ยังไม่เคยตั้งค่า" ซึ่ง default ถูกต้องอยู่แล้ว |
| มีแถว แต่ Zod ไม่ผ่าน | **โยน error** ไม่ fallback |

`upsert` validate ด้วย Zod ตัวเดียวกัน ค่าเสียจึงเกิดได้ทางเดียวคือมีคนแก้ DB ตรง (SQL Workbench) หรือเราไปรัด schema ให้แคบลง ทั้งสองกรณีคือ "มีคนทำพัง" การ fallback เงียบ ๆ จะทำให้อีเมลเชิญถูกส่งออกไปพร้อมลิงก์ `localhost:3000` โดยไม่มีใครรู้ ซึ่งแย่กว่าการให้ admin เห็น error ทันที

### 6.4 `platform-config.controller.ts` — RPC

```
{ cmd: 'platform-configs.find-all', service: 'platform-configs' }   payload: {}
{ cmd: 'platform-configs.find-one', service: 'platform-configs' }   payload: { key }
{ cmd: 'platform-configs.upsert',   service: 'platform-configs' }   payload: { key, value, user_id }
```

`user_id` มาจาก Keycloak token ที่ gateway (แบบเดียวกับ `platform_email-settings.service.ts`) ไม่ใช่จาก request body

### 6.5 ตัด `user-invitation.service.ts` ออกจาก env

ปัจจุบันมี 4 จุดที่อ่าน env และ **สองกลุ่มต้องได้ค่าเดียวกันเสมอ**:

- บรรทัด 388 และ 658 เอา `expiry_days` ไปคำนวณ `expiresAt` เขียนลง `tb_user_invitation`
- บรรทัด 236 เอาไปเขียนในอีเมลว่า "หมดอายุใน N วัน"

ทุกวันนี้ทั้งสองกลุ่มอ่าน constant ตัวเดียวกันจึงเพี้ยนกันไม่ได้ พอย้ายไปอ่าน DB ถ้าปล่อยให้แต่ละเมธอดอ่านเอง แล้ว admin กด Save คั่นระหว่างนั้น อีเมลจะบอก 7 วัน ขณะที่ DB เขียน 14

**ข้อบังคับ: อ่าน config ครั้งเดียวต่อหนึ่งการเชิญ แล้วส่ง `expiry_days` ลงไปเป็นพารามิเตอร์ของ `sendInvitationEmail`** ห้ามให้เมธอดลูกอ่านซ้ำ

การแก้ทั้งหมด:

| ไฟล์ | แก้ |
|---|---|
| `user-invitation.service.ts` | inject `PlatformConfigService`, เรียก `getInvitationConfig()` ที่หัวเมธอด create และ resend, ส่ง `base_url` + `expiry_days` ลงไปยัง `sendInvitationEmail` |
| `libs/config.env.ts` | ลบบรรทัด 66, 69, 130, 133 |
| `apps/micro-cluster/.env.example` | ลบบรรทัด 72, 75 |

### 6.6 กับดักตอน boot

`UserInvitationModule` ต้อง `imports: [PlatformConfigModule]` และ `PlatformConfigModule` ต้อง `exports: [PlatformConfigService]` ถ้าลืม micro-cluster จะ **crash ตอน boot** ด้วย "Nest can't resolve dependencies" ซึ่ง unit test ที่ mock provider ไว้จับไม่ได้ — เคยเจอมาแล้วกับ `PlatformPermissionGuard` ที่ทำ gateway ล้มตอน boot

---

## 7. Backend — gateway

`apps/backend-gateway/src/platform/platform_configs/` 4 ไฟล์ ตาม `platform_email-settings/` (controller / service / module / `swagger/`)

```
@Controller('api-system/platform/configs')
@UseGuards(KeycloakGuard, PlatformPermissionGuard)

GET  /        @RequirePlatformPermission('platform_config.read')
GET  /:key    @RequirePlatformPermission('platform_config.read')
PUT  /:key    @RequirePlatformPermission('platform_config.manage')
```

`:key` ผ่าน `KEY_REGEX = /^[a-zA-Z0-9_.-]+$/` ก่อนส่งต่อ RPC (ลอกจากฝั่ง tenant — กัน path traversal และ key แปลกปลอมตั้งแต่ขอบนอก)

Module ต้อง register `PlatformPermissionGuard` + `PlatformPermissionService` ใน `providers` และ `CLUSTER_SERVICE` ใน `ClientsModule.register([rpcClient(...)])` **ถ้าลืมตัวใดตัวหนึ่ง gateway ล้มตอน boot** สุดท้ายลงทะเบียนใน `app.module.ts` ต่อจาก `PlatformEmailSettingsModule`

---

## 8. Frontend — carmen-platform

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/platformConfigService.ts` | `getAll()` / `getByKey(key)` / `update(key, value)` — `BASE = '/api-system/platform/configs'` |
| `src/types/index.ts` | `PlatformConfig` + `InvitationConfig` (ฟิลด์ใหม่เป็น optional ตาม rule 11) |
| `src/pages/PlatformConfigManagement.tsx` | หน้า config page |
| `src/components/nav/platformNav.ts` | เมนู `Platform Config` (icon `Settings`) กลุ่ม `Platform` ต่อจาก Email Settings |
| `src/App.tsx` | route `/platform/configs` + `<PrivateRoute requiredPermission="platform_config.read">` |

### 8.1 หน้าตา

ตาม **Configuration Page Pattern** (`EmailSettingManagement.tsx`) — การ์ดต่อหนึ่ง config key, หน้าเพจถือ `editingKey` ให้แก้ได้ทีละการ์ด

รอบนี้มีการ์ดเดียวคือ **Invitation**:

- `base_url` — `Input` + validate ตอน blur ว่า `new URL(v)` ไม่ throw
- `expiry_days` — `Input type="number"` ช่วง 1–365
- Save/Cancel ตาม Loading Button Pattern, ปุ่ม Edit gate ด้วย `hasPermission('platform_config.manage')`

`base_url` ต้อง validate ฝั่ง FE ด้วย ไม่ใช่ปล่อยให้ backend เตะกลับอย่างเดียว เพราะค่าที่ parse ไม่ได้จะไปโผล่ตอน `new URL(...)` ใน `sendInvitationEmail` ซึ่งเป็นตอนที่การเชิญเดินไปครึ่งทางแล้ว การให้ admin เห็น error ตอนพิมพ์ถูกกว่ามาก

FE validation เป็นเรื่อง UX เท่านั้น — **backend เป็นผู้ตัดสินสุดท้ายเสมอ** และ `z.string().url()` อาจเข้มกว่า `new URL()` ในบางเคส ถ้าไม่ตรงกันให้ยึด error จาก backend

(หมายเหตุ: base URL ที่มี query string ติดมาอยู่แล้วไม่ใช่ปัญหา — `user-invitation.service.ts:226-230` จัดการไว้แล้วด้วยการประกอบผ่าน `searchParams.set()` แทนการต่อสตริง อย่าไปเพิ่มกฎห้าม query string ใน schema)

**ไม่ทำ** CSV export / DataTable / filter Sheet — นี่คือ config page ไม่ใช่ Management page ชุด key เป็นชุดปิด เล็ก และไม่มีวันเกินสิบ ตรงตามข้อยกเว้นของ rule 13 ที่ `CLAUDE.md` ระบุไว้

**ไม่ทำ** `doc_version` / 409 handling (ดู §11)

---

## 9. ลำดับ deploy (ห้ามสลับ)

### 🚨 ความเสี่ยงข้อเดียวที่ใหญ่จริง

`config.env.ts:69` มี `.default('http://localhost:3000/invitations')` แต่ environment จริงตั้ง `INVITATION_BASE_URL` ทับไว้ พอลบ env ทิ้งแล้ว DB ยังไม่มีแถว → `getInvitationConfig()` คืน default → **อีเมลเชิญทุกฉบับบน DEV/UAT/PROD จะมีลิงก์ `localhost:3000`** และพังแบบเงียบ ไม่มี error ไม่มี log จะรู้ตัวก็ตอนมีคนบ่นว่ากดลิงก์เชิญไม่ได้

`expiry_days` ไม่เสี่ยงเท่า เพราะ default ในโค้ด (7) ตรงกับ default ใน env อยู่แล้ว

### ลำดับ

| # | ขั้นตอน | ถ้าข้าม |
|---|---|---|
| 1 | apply migration สร้าง `tb_platform_config` | micro-cluster query แล้วได้ 42P01 |
| 2 | seed `platform_config.read` / `platform_config.manage` + grant ให้ role | admin เปิดหน้าแล้วโดน 403 |
| 3 | **INSERT แถว `invitation` ด้วย `base_url` จริงของ environment นั้น** ผ่าน SQL Workbench (ตอนนั้น gateway/FE ยังไม่ขึ้น จึงใช้หน้าจอไม่ได้) | ลิงก์เชิญชี้ localhost |
| 4 | deploy micro-cluster | — |
| 5 | deploy backend-gateway | หน้า FE ได้ 404 |
| 6 | deploy frontend | — |

ข้อ 3 ต้องทำแยกทุก environment เพราะค่าต่างกัน วิธีหาค่า: อ่าน `INVITATION_BASE_URL` ที่ environment นั้นตั้งอยู่จริงก่อน deploy

---

## 10. Error handling

| จุด | พฤติกรรม |
|---|---|
| key ไม่อยู่ใน registry | 400 พร้อมรายชื่อ key ที่รองรับ |
| Zod ไม่ผ่านตอน upsert | 400 พร้อมข้อความราย field |
| อ่านเจอแถวแต่ค่าเสีย | โยน error (§6.3) — การเชิญล้มดัง ๆ |
| FE ทุก catch block | `parseApiError(err)` + `toast.error()` ตาม rule 12 |

## 11. การตรวจสอบก่อนปิดงาน

ตามค่าตั้งใน CLAUDE.md ส่วนตัวว่าให้ข้าม automated test ระหว่างรัน plan — ใช้ static check + ตรวจด้วยมือแทน (ชุดทดสอบเดิมที่มีอยู่ยังต้องเขียว)

- `bun run typecheck` + `bun run lint` ฝั่ง carmen-platform
- **สตาร์ท micro-cluster และ backend-gateway ขึ้นมาจริง ดูว่าไม่ crash** — DI ของทั้งสอง app มีกับดัก boot ที่ unit test จับไม่ได้ (§6.6, §7)
- รัน `check.platform-permission-drift.ts` + `check.platform-role-permission-drift.ts`
- บน DEV: เปิด `/platform/configs` แก้ค่า → ส่งคำเชิญจริง 1 ฉบับ → **ตรวจว่า host ในลิงก์ตรงกับที่เพิ่งตั้ง และวันหมดอายุที่เขียนในอีเมลตรงกับ `expires_at` ใน DB**

ข้อสุดท้ายพิสูจน์สองเรื่องพร้อมกัน: config ถูกอ่านจากฐานข้อมูลจริง และการส่ง `expiry_days` ลงไปแทนการอ่านซ้ำ (§6.5) ทำงานถูกต้อง

## 12. ของที่ตั้งใจไม่ทำรอบนี้

| ไม่ทำ | เหตุผล |
|---|---|
| ระบบเข้ารหัส/mask ค่าลับ | ยังไม่มี key ไหนมีค่าลับ |
| `delete` / ปุ่ม reset เป็น default | ยังไม่มีใครขอ เพิ่มทีหลัง ~15 บรรทัด |
| บังคับ `doc_version` (guard `where { key, doc_version }` + 409 + FE `notifyVersionConflict`) | คอลัมน์มีไว้ตามต้นแบบแต่ยังไม่บังคับ เหมือนฝั่ง tenant — หน้านี้มีคนแก้ 2-3 คน งานที่เพิ่มไม่คุ้ม |
| cache | ปริมาณต่ำ แลกมาด้วยอาการ "แก้แล้วไม่มีผล" ที่แพงกว่า |
| override รายคลัสเตอร์ | ตาราง key/value ไม่มีคอลัมน์ scope ตามต้นแบบ ถ้าวันหน้าต้องการค่อยเพิ่มคอลัมน์ |
| ย้าย env ตัวอื่นเข้ามา | รอบนี้เอาแค่ invitation — key ถัดไปเพิ่มที่ `PLATFORM_CONFIG_REGISTRY` + accessor + การ์ด FE |

## 13. อ้างอิง

- ต้นแบบตาราง: `packages/prisma-shared-schema-tenant/prisma/schema.prisma:5294`
- ต้นแบบ service: `apps/micro-business/src/app-config/app-config.service.ts`
- pattern ตาราง platform + RPC + gateway: `tb_email_sender_profile` / `email-sender-profile/` / `platform_email-settings/`
- ที่มาของการเลื่อน: `docs/superpowers/specs/2026-08-05-cluster-admin-layout-design.md` (ส่วน out of scope)
