# Record Audit Trail เฟส 2 — ขยายเป็น 6 entity

วันที่: 2026-08-31
ต่อจาก: `2026-08-30-record-audit-trail-design.md` (เฟส 1 — `tb_cluster` · ขึ้น production แล้ว)
รีโป: `carmen-turborepo-backend-v2` (เฟส A) · `carmen-platform` (เฟส B)

## ปัญหา

เฟส 1 ทำ `tb_cluster` ตัวเดียว entity ที่เหลือยังไม่มีประวัติการเปลี่ยนแปลง
และ `assertClusterInScope` ที่เขียนไว้ตั้งอยู่บนสมมติฐานว่า **ทุกเรคอร์ดสังกัด cluster เดียว**
ซึ่งจริงเฉพาะ `tb_cluster` เท่านั้น

## สภาพปัจจุบัน (สำรวจแล้ว)

### entity แบ่งเป็นสามกลุ่ม ไม่ใช่รูปแบบเดียว

| กลุ่ม | entity | ผูกกับ cluster ยังไง |
|---|---|---|
| **A — สังกัด cluster ตรง** | `tb_business_unit`, `tb_cluster_license` | คอลัมน์ `cluster_id` |
| **B — ไม่สังกัด cluster** | `tb_application`, `tb_platform_role`, `tb_report_template` | ของระดับแพลตฟอร์มล้วน |
| **C — ผูกหลายที่** | `tb_news` (`business_unit_ids` JsonB), `tb_user` (ผ่าน `tb_cluster_user`) | ไม่มี cluster เดียว |

### entity อยู่ micro ตัวไหน

7 ใน 8 อยู่ `micro-cluster` ซึ่งมี `PlatformActivityInterceptor` แล้ว
**ยกเว้น `platform-roles` ที่อยู่ `micro-business`** — ที่นั่นมี `ActivityInterceptor` ของ tenant
ซึ่งเรียก `logTenantEvent` แบบตายตัว ลงทะเบียนไปจะเขียนผิดสโคปโดยไม่ error

### `logPlatformEvent` แบบมือ 4 จุดไม่ได้ซ้ำกับ interceptor

`cluster.service.ts:1342/:1499` และ `business-unit.service.ts:1331/:1583` บันทึก
**ตารางเชื่อม** ไม่ใช่ตัว entity:

| | มือ (ของเดิม) | interceptor (ถ้าลงทะเบียน membership cmd) |
|---|---|---|
| `entity_type` | `tb_cluster_user` / `tb_user_tb_business_unit` | `tb_business_unit` |
| `old/new_data` | `null` ทั้งคู่ | snapshot ของ BU ที่**ไม่ได้เปลี่ยน** |
| `meta_data` | `event_type: membership.granted/revoked` · `scope` · `cluster_id` · `subject_user_id` · `business_unit_id` | ไม่มี |

⇒ การเปลี่ยนสมาชิก **ถูกบันทึกครบอยู่แล้วและดีกว่าที่ interceptor ทำได้**
ปัญหาจริงคือ UI มองไม่เห็น เพราะ query ด้วย `entity_id` ของ BU
ส่วนแถว membership เก็บ `entity_id` ของแถวเชื่อม

## การตัดสินใจ

| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| กลุ่ม B (ไม่สังกัด cluster) | platform-level permission เท่านั้น | ต่อยอดหลักที่โค้ดใช้อยู่ · "ไม่มี cluster" กับ "ทุก cluster" เป็นคนละเรื่อง การรวมสองอย่างคือที่มาของช่องโหว่ที่ `platform-analytics` เคยโดน |
| กลุ่ม C (ผูกหลายที่) | รวมกับกลุ่ม B | `old_data` ของ news เก็บ `business_unit_ids` ทั้งชุด ⇒ เห็นประวัติ = เห็นว่าผูกกับ cluster อื่นไหนบ้าง เป็นข้อมูลข้ามคลัสเตอร์โดยตัวมันเอง scope ยังไงก็รั่ว |
| `platform_role` | **ข้ามเฟสนี้** | อยู่ `micro-business` ซึ่งเป็นแอปใหญ่ที่ทุก request ผ่าน interceptor และเราเพิ่งเห็นว่าความผิดพลาดชั้นนี้ไม่มีอาการให้เห็น (PR #444) ควรเป็นงานแยกที่มีการตรวจของตัวเอง |
| gateway รู้ cluster ได้ยังไง | `micro-cluster` join คืนมาในแถว | join อยู่ที่เดียวกับที่รู้จัก schema ดีที่สุด · ไม่เพิ่ม round-trip · entity platform-only ได้ค่าที่บอกตัวเองโดยธรรมชาติ |
| registry | CRUD ล้วน ไม่แตะ `logPlatformEvent` มือ | membership ถูกบันทึกดีกว่าแล้ว เปิด interceptor ทับจะได้แถวขยะที่บอกว่า BU ถูกแก้ทั้งที่ไม่ได้เปลี่ยน |
| การเปลี่ยนสมาชิก | ดึงแถวที่เกี่ยวข้องมาแสดงในไทม์ไลน์เดียว | ได้ผลลัพธ์ที่ต้องการโดยไม่แตะโค้ดเดิมและไม่มีแถวซ้ำ |
| นิยาม "เกี่ยวข้อง" | แผนที่ประกาศเป็นค่าคงที่ใน `micro-cluster` | migration + backfill ไม่คุ้มกับ entity เดียวที่ใช้ตอนนี้ และ migration บนกิ่งนี้ apply ทันทีที่ push |
| ชื่อคนใน membership row | backend เติมให้ | `mapActorInfo` ทำ pattern นี้อยู่แล้ว · แสดง UUID ดิบทำให้ฟีเจอร์ตอบคำถาม "ใครเพิ่มคนนี้" ได้แค่ครึ่งเดียว |

### ทางเลือกที่พิจารณาแล้วไม่เอา

- **เพิ่มคอลัมน์ `parent_entity_id` ลง `tb_activity`** — สะอาดกว่าในระยะยาว แต่ต้อง migration + backfill + แก้ 4 จุดเดิม ไม่คุ้มกับ entity เดียว
- **ลงทะเบียน membership cmd แล้วถอด `logPlatformEvent` มือ** — เคยเลือกไว้แล้วถอนหลังพบว่าสองอย่างบันทึกคนละ entity_type และของมือเก็บ metadata ที่ interceptor ทำไม่ได้
- **gateway ยิง RPC ถาม cluster ทุกครั้ง** — เพิ่ม round-trip และ helper ที่มี (`clusterIdForBusinessUnit`) ครอบแค่ BU

---

## เฟส A — Backend

### A1. Registry เพิ่ม 6 entity

ลง `PLATFORM_ACTIVITIES` ใน `platform-activity-registry.ts` — **CRUD ล้วน ไม่มี membership cmd**

| entity | cmd prefix | กลุ่ม |
|---|---|---|
| `tb_business_unit` | `business-units.` | A |
| `tb_cluster_license` | `cluster-licenses.` | A |
| `tb_business_unit_license` | `business-unit-licenses.` | A (join 2 ชั้น) |
| `tb_application` | `applications.` | B |
| `tb_report_template` | `report-templates.` | B |
| `tb_news` | `news.` | C→B |
| `tb_user` | `users.` | C→B |

**ชื่อ cmd จริงต้องยืนยันจาก `packages/rpc-contract/src/contracts/` ก่อนเขียน** — แต่ละ entity
มี 6-10 cmd เดาไม่ได้ (เฟส 1 เดา `clusters.create/update/delete` ถูกพอดี ซึ่งเป็นความบังเอิญ)

### A2. `SNAPSHOT_INCLUDES` ต่อ entity

`tb_cluster` เป็นตารางแบนจึงเป็น `{}` แต่ entity อื่นอาจมีตารางลูก (ที่อยู่ BU, tag ของ news)
**ไล่ schema ทีละตัว** — ขาด include ที่ควรมี snapshot จะขาดส่วนนั้นไปเงียบ ๆ

### A3. `sensitiveFields` ต้องไล่ schema ใหม่ทุก entity

`redactSensitiveFields` เทียบ **ชื่อคอลัมน์เต็มแบบตรงตัว ไม่ใช่ prefix** — `'token'` ไม่ครอบ
`'logo_file_token'` รายการปัจจุบันมีแค่ของ `tb_cluster` · `tb_user_profile` มี
`avatar_file_token` + `signature_file_token` · entity อื่นอาจมี secret ของตัวเอง

และ `LogEventsService` ใช้ `??` (แทนที่ทั้งชุด) ไม่ใช่ spread — รายการที่ตั้งไว้ต้องครบรวม default

### A4. `EntityOwnership` — ห้ามใช้ `null`

```ts
/**
 * เรคอร์ดนี้อยู่ใต้ cluster ไหน หรือเป็นของระดับแพลตฟอร์ม
 *
 * ตั้งใจไม่ใช้ `string | null` เพราะ `null` จะชนกับ `null` ของ resolveAllowedClusterIds
 * ซึ่งแปลว่า "ไม่จำกัด" — ตรงข้ามกันคนละขั้ว การพิมพ์ผิดจะกลายเป็นช่องโหว่ที่อ่านโค้ดแล้วดูถูกต้อง
 * discriminated union บังคับให้ handle ทั้งสองกิ่ง ลืมกิ่งไหนเป็น compile error
 */
export type EntityOwnership =
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'platform' };
```

แผนที่หา ownership:

```
business_unit          → tb_business_unit.cluster_id
cluster_license        → tb_cluster_license.cluster_id
business_unit_license  → join tb_business_unit → cluster_id
cluster                → entity_id คือ cluster id เอง
(นอกรายการ)            → { kind: 'platform' }
```

**BU ที่ถูกลบไปแล้ว → fail closed (403)** ไม่ใช่ตกไปเป็น platform — เดาไม่ออกว่าใครควรเห็น

**บนสาย wire ส่งเป็น `{ kind, cluster_id? }`** ไม่ใช่ `cluster_id: null` เพื่อไม่ให้ความกำกวม
กลับมาตอน serialize

### A5. `findByEntityId` เปลี่ยนเป็นสามขั้น

1. **หา ownership** — ทำ**ก่อน**อ่านประวัติ เพื่อให้ gateway ปฏิเสธได้โดยไม่ต้องอ่านข้อมูลที่ไม่ควรเห็น
2. **หา entity_id ที่เกี่ยวข้อง** จาก `RELATED_ACTIVITY`
3. **query `tb_activity`** ด้วย `entity_id IN (...)` เรียง `created_at desc` เหมือนเดิม

### A6. `RELATED_ACTIVITY`

```ts
/**
 * แถวประวัติที่ควรปรากฏในไทม์ไลน์ของ entity หนึ่ง แม้ถูกบันทึกด้วย entity_type อื่น
 *
 * ผลิตโดย logPlatformEvent แบบมือที่ business-unit.service.ts:1331/:1583 และ
 * cluster.service.ts:1342/:1499 ซึ่งบันทึกตารางเชื่อมพร้อม meta_data ที่ชี้กลับมาหาแม่
 * **แก้รูป meta_data ที่นั่นแล้วต้องแก้ที่นี่ด้วย ไม่งั้นแถวจะหายจากไทม์ไลน์เงียบ ๆ**
 */
export const RELATED_ACTIVITY: Readonly<Record<string, RelatedSpec[]>> = {
  business_unit: [{ entityType: 'user_tb_business_unit', metaKey: 'business_unit_id' }],
  cluster:       [{ entityType: 'cluster_user',           metaKey: 'cluster_id' }],
};
```

⚠️ **คีย์ที่นี่ใช้ชื่อที่ตัด `tb_` ออกแล้ว** (`mapEntityType` ตัดตอนเขียน) ต่างจาก registry
ฝั่ง interceptor ที่ใช้ชื่อเต็ม — สองที่ใช้คนละรูปในไฟล์ที่อยู่ติดกัน ต้องมีคอมเมนต์กำกับ

query ใช้ Prisma `path` filter บน JsonB (`meta_data->>'<metaKey>'`) **ห้ามใช้ raw SQL** —
`audit:raw-sql` บังคับ `systemTableRef()` ถ้าเขียน raw

### A7. เติมชื่อ subject ใน membership row

ขยาย `mapActorInfo` ให้ resolve `meta_data.subject_user_id` เป็นชื่อด้วย ใช้ pattern เดิม
(distinct ids → `tb_user` + `tb_user_profile` → map)

### A8. ขนาดไฟล์

`activity-log.service.ts` จะแตะหลายตารางแทนที่จะแตะแค่ `tb_activity`
**ถ้าเกิน ~250 บรรทัด แยกตัวหา ownership ออกเป็นไฟล์ของตัวเอง**

### A9. สิ่งที่ไม่เปลี่ยน

`:id/detail` · `resolveAllowedClusterIds` · permission key เดิมสองตัว (**ไม่มี key ใหม่
⇒ ไม่ต้อง seed บน DEV**) · `AppIdGuard` ชื่อเดิม (**ไม่ต้อง regenerate catalog**) ·
ไม่มี migration

### A10. gateway อ่าน ownership

```ts
switch (ownership.kind) {
  case 'platform':
    // เรคอร์ดไม่สังกัด cluster ใด — cluster scope เข้าถึงไม่ได้เลย ต้องถือคีย์ระดับ platform
    if (resolveAllowedClusterIds(req.platformPermissions, key) !== null) {
      throw new ForbiddenException();
    }
    return;
  case 'cluster': {
    const allowed = resolveAllowedClusterIds(req.platformPermissions, key);
    if (allowed === null) return; // platform-wide หรือ super admin
    if (!allowed.includes(ownership.clusterId.toLowerCase())) {
      throw new ForbiddenException();
    }
    return;
  }
}
```

---

## เฟส B — Frontend

### B1. ย้ายคอมโพเนนต์ขึ้นที่กลาง

`ActivityTrailSheet` / `useActivityTrail` / `ActivityDiffView` ไม่มีอะไรผูกกับ cluster
ยกเว้นที่อยู่ของไฟล์ ตาม `hook-placement.md` ("ย้ายขึ้นเมื่อมีหน้าที่สองใช้") — **ถึงเวลาแล้ว**
ไป `src/components/activityTrail/` (hook ไป `src/hooks/`)

### B2. ปุ่มบน 5 หน้า

| หน้า | `entityType` |
|---|---|
| BusinessUnitEdit | `business_unit` |
| ApplicationEdit | `application` |
| UserEdit | `user` |
| NewsEdit | `news` |
| ReportTemplateEdit | `report_template` |

**`entityType` ต้องเป็นชื่อที่ตัด `tb_` ออกแล้ว** — ส่งผิดได้รายการว่างโดยไม่มี error
ซึ่งดูเหมือน "ไม่มีประวัติ" พอดี

### B3. แถว membership แสดงเป็นประโยค ไม่ใช่ตาราง diff ว่าง

แถวที่ `meta_data.event_type` ขึ้นต้นด้วย `membership.` มี `old/new_data` เป็น `null`
กางออกมาตอนนี้จะเจอ "ไม่มีฟิลด์ใดเปลี่ยนที่ถูกบันทึกไว้" ซึ่ง**อ่านแล้วเข้าใจผิด**
เพราะไม่ใช่การแก้ฟิลด์ตั้งแต่แรก

แสดงเป็น `เพิ่มสมาชิก · <ชื่อคน>` / `ถอนสมาชิก · <ชื่อคน>` โดยอ่านชื่อที่ A7 เติมให้

### B4. เพิ่มทางเช็ค platform-level ที่ FE

Application / ReportTemplate / News / User เป็น platform-only ไม่มี cluster id ให้ส่ง
`<Can permission="activity_log.read">` เปล่า ๆ **ตกไปกิ่ง "cluster ไหนก็ได้" ซึ่งไม่เข้ม**
(`utils/permissions.ts:17-27`) ⇒ คนที่มีสิทธิ์แค่ใน cluster เดียวจะเห็นปุ่มทั้งที่กดแล้วได้ 403

**เพิ่มความสามารถที่ขาดให้ `<Can>`** — prop ใหม่ (เช่น `scope="platform"`) หรือ helper ที่อ่าน
`effectivePermissions.platform` ตรง ๆ โดย**ไม่เปลี่ยนพฤติกรรมของ call site ที่มีอยู่**

เหตุผลที่ไม่ปล่อยให้ปุ่มโผล่แล้วได้ 403: UI จะโกหกเรื่องสิทธิ์ ซึ่งเป็นสิ่งที่เฟส 1 ตั้งใจเลี่ยง
("ไม่มีสิทธิ์ = ไม่เห็นปุ่ม") และที่ไม่ใช้ `isSuperAdmin`: คนที่ถือ `activity_log.read` ระดับ
platform โดยไม่ใช่ super admin จะไม่เห็นทั้งที่มีสิทธิ์ — เป็นกฎที่ไม่ตรงกับ permission model

⚠️ `<Can>` เป็นของกลางที่หน้าอื่นใช้ — การแก้ต้องไม่กระทบ call site เดิม
ตรวจด้วย `bun run test` (มีเทสต์ที่ใช้ `Can` จริง ไม่ mock ตามกฎข้อ 18)

### B5. ต้องสำรวจก่อนเขียน

- 5 หน้านั้นมีที่แขวนปุ่มแบบ `ClusterPlate.headerAction` ไหม — BU Edit แยกเป็น 5 tab
  อาจไม่มี plate เดียว
- แต่ละหน้าใช้ `<Can>` รูปไหนอยู่แล้ว

### B6. i18n

เพิ่มคีย์ membership 2-3 ตัว ที่เหลือใช้ซ้ำได้ทั้งหมด

---

## ลำดับ deploy

backend ก่อนเสมอ → merge → auto-deploy DEV → ตรวจ → FE

**ไม่มี seed · ไม่มี migration · ไม่มี catalog regenerate** — ตัดขั้นที่พลาดง่ายที่สุดของเฟส 1 ออกหมด

## การตรวจ (ผูกกับความเสี่ยงทีละข้อ)

| ความเสี่ยง | วิธีตรวจ |
|---|---|
| `EntityOwnership` ตีความผิดขั้ว | ยิง `record/:id` ของ **application** ด้วยผู้ใช้ที่ถือ `activity_log.read` มาทาง cluster scope เท่านั้น → **403** · แล้วยิงด้วย platform-level → **200** · **สองเคสต้องทำคู่กัน** เคสเดียวแยกไม่ออกว่าปิดตายหมดหรือเปิดหมด |
| BU scoping | ยิง `record/:id` ของ BU ในคลัสเตอร์ที่ผู้ใช้ไม่มีสิทธิ์ → 403 |
| แถว related หายเงียบ | เพิ่มสมาชิกเข้า BU บน DEV → ไทม์ไลน์ของ BU ต้องมีแถวใหม่โผล่ **ในหน้าจอ** ไม่ใช่แค่ query DB เห็น |
| `entity_type` ผิดรูป | ทั้ง 6 entity ต้องคืนรายการไม่ว่างหลังแก้ของจริงอย่างละครั้ง — ตัวที่คืนว่างคือตัวที่ส่งชื่อผิด |
| `SNAPSHOT_INCLUDES` ขาดตารางลูก | แก้ฟิลด์ในตารางลูก (ที่อยู่ BU) → diff ต้องเห็น ไม่ใช่ `has_changes: false` |
| `sensitiveFields` ขาดคอลัมน์ | **query `tb_activity` ตรงใน DB** หา token/secret ที่ไม่ถูก redact — ดูผ่าน UI ไม่พอ |

## ⛔ เงื่อนไขที่ต้องมีก่อนเริ่มตรวจ

**ต้องมีบัญชีบน DEV ที่ได้ `activity_log.read` มาทาง cluster scope เท่านั้น (ไม่ใช่ super admin)**

การตรวจหลักของเฟสนี้ — platform-only ไม่หลุดให้ cluster scope — **ทำไม่ได้เลยถ้าไม่มีบัญชีแบบนี้**
เฟส 1 ข้ามข้อนี้มาได้เพราะ scoping ตอนนั้นง่าย รอบนี้ข้ามไม่ได้
**super admin เห็นข้อมูลไม่พิสูจน์อะไรเลย**

## ความเสี่ยงที่ยอมรับ

- **`RELATED_ACTIVITY` ผูกกับรูป `meta_data` ที่โค้ดอื่นเขียน** ไม่มี type บังคับ —
  บรรเทาด้วยคอมเมนต์สองทาง ไม่ใช่การป้องกันจริง
- **`platform_role` ไม่มีประวัติ** — ข้ามโดยตั้งใจ
- **entity ที่แก้ก่อน deploy ไม่มีประวัติ** — เรียกคืนไม่ได้
- **BU ที่ถูกลบ → 403** เลือก fail closed

## หนี้ที่เปิดค้าง

1. `platform_role` (ต้องแตะ `micro-business`)
2. related rows ของ entity อื่นนอกจาก BU/cluster
3. การตรวจสิทธิ์ 2 ข้อที่ค้างจากเฟส 1 — **กลายเป็นเงื่อนไขบังคับของเฟสนี้แล้ว**
4. `platformOnly` ของ `<Can>` ที่เพิ่มในเฟสนี้ — หน้าอื่นที่ควรใช้แต่ยังใช้รูปเดิมอยู่
