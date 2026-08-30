# Audit Trail เฟส 2 — แผน implement ฝั่ง Backend

> **สำหรับ agentic worker:** REQUIRED SUB-SKILL — ใช้ `superpowers:subagent-driven-development`
> หรือ `superpowers:executing-plans` ทำทีละ task ขั้นตอนใช้ checkbox (`- [ ]`)

**Goal:** ขยาย audit trail จาก `tb_cluster` ตัวเดียวเป็น 7 entity พร้อม scoping ที่รองรับทั้ง
entity ที่สังกัด cluster และที่ไม่สังกัด และดึงแถวการเปลี่ยนสมาชิกมาแสดงในไทม์ไลน์เดียวกัน

**Architecture:** registry เพิ่ม CRUD ของ 7 entity (ไม่แตะ `logPlatformEvent` มือ) ·
`micro-cluster` คืน `EntityOwnership` แบบ discriminated union ให้ gateway ตัดสินสิทธิ์ ·
`findByEntityId` ดึงแถวที่เกี่ยวข้องผ่านแผนที่ที่ประกาศไว้

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`

**Spec:** `carmen-platform/docs/superpowers/specs/2026-08-31-record-audit-trail-phase-2-design.md`

**กิ่ง:** `feature/audit-trail-phase-2` (แตกจาก `main`)

---

## Global Constraints

- **ไม่เขียนเทสต์ใหม่** — ไม่สร้าง `*.spec.ts` **แต่ suite เดิมต้องเขียว**
- **`bun run lint` เขียนทับทั้งรีโป** — ใช้ `bunx eslint <path>` หรือ `bun run lint:changed`
- **JSDoc บังคับ `@param`/`@returns` ครบทุกฟังก์ชันที่มี JSDoc** (`jsdoc/require-param`,
  `jsdoc/require-jsdoc` บน method ของ class) — เฟส 1 ตกตรงนี้ 11 error
- **apps คอมไพล์กับ `dist/` ของ package** — แก้ package แล้ว `bun run build:package` ก่อนเสมอ
- **relative import ใน `packages/` ต้องเติม `.js`**
- **ห้ามใช้ raw SQL** — `audit:raw-sql` บังคับ `systemTableRef()` ใช้ Prisma `path` filter แทน
- **ไม่มี migration · ไม่มี permission key ใหม่ · ไม่ต้อง regenerate app-api catalog**
- **`redactSensitiveFields` เทียบชื่อคอลัมน์เต็มแบบตรงตัว ไม่ใช่ prefix** และ
  `LogEventsService` ใช้ `??` (แทนที่ทั้งชุด) — รายการต้องครบรวม default 5 ตัว
- **`entity_type` ที่เก็บจริงตัด `tb_` ออกแล้ว** (`mapEntityType`) — registry ใช้ชื่อเต็ม
  ส่วน `RELATED_ACTIVITY` และ ownership map ใช้ชื่อที่ตัดแล้ว **สองรูปในไฟล์ที่อยู่ติดกัน**
- `boot-check micro-cluster backend-gateway` ไม่อยู่ใน CI ต้องรันเอง
- **`activity-log.service.ts` จะแตะหลายตารางแทนที่จะแตะแค่ `tb_activity`** — ถ้าเกิน
  ~250 บรรทัดหลัง Task 4 ให้แยกตัวหา ownership/related ออกเป็นไฟล์ของตัวเอง
  (Task 2 กับ 3 แยกไว้ให้แล้ว ส่วนที่เหลือใน service คือการเรียกใช้)

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/micro-cluster/src/log/activity-log/entity-ownership.ts` | `EntityOwnership` + แผนที่หา cluster ต่อ entity |
| `apps/micro-cluster/src/log/activity-log/related-activity.ts` | `RELATED_ACTIVITY` + ตัวหา entity_id ที่เกี่ยวข้อง |

**แก้ไข**

| ไฟล์ | แก้อะไร |
|---|---|
| `apps/micro-cluster/src/common/activity/platform-activity-registry.ts` | +7 entity, ขยาย `PLATFORM_SNAPSHOT_INCLUDES` |
| `apps/micro-cluster/src/app.module.ts` | ขยาย `sensitiveFields` |
| `apps/micro-cluster/src/log/activity-log/activity-log.service.ts` | ownership + related + subject name |
| `apps/backend-gateway/.../platform-activity-logs.controller.ts` | `assertClusterInScope` → switch บน ownership |
| `apps/backend-gateway/.../platform-activity-logs.service.ts` | ส่ง ownership ผ่าน |
| `apps/backend-gateway/.../swagger/response.ts` | +field ownership, subject name |

---

### Task 1: Registry + snapshot includes + sensitiveFields

**Files:**
- Modify: `apps/micro-cluster/src/common/activity/platform-activity-registry.ts`
- Modify: `apps/micro-cluster/src/app.module.ts`

**Interfaces:**
- Produces: `resolvePlatformActivities()` รู้จัก 7 entity ใหม่ ·
  `PLATFORM_SNAPSHOT_INCLUDES` ครอบทุก entity ที่ลงทะเบียน

- [ ] **Step 1: เพิ่ม 7 entity ใน `PLATFORM_ACTIVITIES`**

ชื่อ cmd ยืนยันจาก contract แล้ว — ทุกตัวเป็นรูป `<prefix>.create/update/delete`:

```ts
  ['business-units.create', { action: 'create', entityName: 'tb_business_unit', idSource: CREATED_ID }],
  ['business-units.update', { action: 'update', entityName: 'tb_business_unit', idSource: EDITED_ID }],
  ['business-units.delete', { action: 'delete', entityName: 'tb_business_unit', idSource: DELETED_ID }],
  ['cluster-licenses.create', { action: 'create', entityName: 'tb_cluster_license', idSource: CREATED_ID }],
  ['cluster-licenses.update', { action: 'update', entityName: 'tb_cluster_license', idSource: EDITED_ID }],
  ['cluster-licenses.delete', { action: 'delete', entityName: 'tb_cluster_license', idSource: DELETED_ID }],
  ['business-unit-licenses.create', { action: 'create', entityName: 'tb_business_unit_license', idSource: CREATED_ID }],
  ['business-unit-licenses.update', { action: 'update', entityName: 'tb_business_unit_license', idSource: EDITED_ID }],
  ['business-unit-licenses.delete', { action: 'delete', entityName: 'tb_business_unit_license', idSource: DELETED_ID }],
  ['applications.create', { action: 'create', entityName: 'tb_application', idSource: CREATED_ID }],
  ['applications.update', { action: 'update', entityName: 'tb_application', idSource: EDITED_ID }],
  ['applications.delete', { action: 'delete', entityName: 'tb_application', idSource: DELETED_ID }],
  ['report-templates.create', { action: 'create', entityName: 'tb_report_template', idSource: CREATED_ID }],
  ['report-templates.update', { action: 'update', entityName: 'tb_report_template', idSource: EDITED_ID }],
  ['report-templates.delete', { action: 'delete', entityName: 'tb_report_template', idSource: DELETED_ID }],
  ['news.create', { action: 'create', entityName: 'tb_news', idSource: CREATED_ID }],
  ['news.update', { action: 'update', entityName: 'tb_news', idSource: EDITED_ID }],
  ['news.delete', { action: 'delete', entityName: 'tb_news', idSource: DELETED_ID }],
  ['users.create', { action: 'create', entityName: 'tb_user', idSource: CREATED_ID }],
  ['users.update', { action: 'update', entityName: 'tb_user', idSource: EDITED_ID }],
  ['users.delete', { action: 'delete', entityName: 'tb_user', idSource: DELETED_ID }],
```

**ห้ามลงทะเบียน `user-business-unit.create/update/delete`** — เป็น membership ซึ่ง
`business-unit.service.ts:1331/:1583` บันทึกด้วย `logPlatformEvent` มืออยู่แล้ว พร้อม
`meta_data` ที่ interceptor ทำไม่ได้ ลงทะเบียนทับจะได้แถวที่บอกว่า BU ถูกแก้ทั้งที่ไม่ได้เปลี่ยน

**`business-units.update-for-member` ก็ไม่ลงทะเบียน** — ยังไม่รู้ว่ามันแก้อะไรบ้าง
เปิดเป็นหนี้ไว้ ดีกว่าเดา

- [ ] **Step 2: ขยาย `PLATFORM_SNAPSHOT_INCLUDES`**

```ts
export const PLATFORM_SNAPSHOT_INCLUDES: SnapshotIncludeMap = {
  // ตารางแบน ไม่มีลูกที่เป็นส่วนหนึ่งของตัวมันเอง
  tb_cluster: {},
  tb_cluster_license: {},
  tb_business_unit_license: {},
  tb_report_template: {},
  tb_news: {},

  // BU มีตารางลูก 4 ตัว แต่ไม่ include สักตัว: application_role / subscription_bu /
  // business_unit_license เป็นเอกสารของตัวเองที่มีประวัติแยก ส่วน user_tb_business_unit
  // (สมาชิก) ถูกดึงมาแสดงผ่าน RELATED_ACTIVITY อยู่แล้ว — include ซ้ำจะได้ทั้ง diff
  // และแถว related ในไทม์ไลน์เดียวกัน
  tb_business_unit: {},

  // api_names เป็นส่วนหนึ่งของนิยาม application ไม่ใช่เอกสารแยก
  tb_application: { tb_application_api: true },

  // ไม่ include tb_user_login_session โดยเจตนา: session เปลี่ยนทุกครั้งที่ใครล็อกอิน
  // snapshot จะต่างกันทุกครั้งและ diff จะเต็มไปด้วย noise ที่ไม่มีใครอยากอ่าน
  tb_user: {},
};
```

⚠️ ตรวจชื่อ relation จริงก่อนใช้:
```bash
awk '/^model tb_application \{/,/^\}/' packages/prisma-shared-schema-platform/prisma/schema.prisma | grep "tb_application_api"
```

- [ ] **Step 3: ขยาย `sensitiveFields` ใน `app.module.ts`**

```ts
      sensitiveFields: [
        // ห้าตัวแรกคือ default ของแพ็กเกจ ต้องเขียนซ้ำเพราะ LogEventsService ใช้ `??`
        // (แทนที่ทั้งชุด) ไม่ใช่ spread — ละไว้แล้วหายทั้งหมด
        'password', 'hash', 'token', 'secret', 'api_key',
        // คอลัมน์จริงของ entity ที่ลงทะเบียน — ยืนยันกับ schema.prisma แล้ว
        // การเทียบเป็นชื่อเต็มแบบตรงตัว 'token' จึงไม่ครอบตัวใดข้างล่างนี้เลย
        'logo_file_token',              // tb_cluster, tb_business_unit
        'avatar_file_token',            // tb_cluster, tb_business_unit, tb_user_profile
        'image_file_token',             // tb_news
        'signature_file_token',         // tb_user_profile
        'email_verification_token_hash', // tb_user — hash ของ token ยืนยันอีเมล
      ],
```

**`email_verification_token_hash` คือตัวที่สำคัญที่สุดในรายการนี้** — ไม่ redact แปลว่า
เก็บ hash ของ token ยืนยันอีเมลไว้ในตารางที่ผู้ใช้เปิดดูผ่าน UI ได้ตลอดไป

- [ ] **Step 4: ตรวจและ commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feature/audit-trail-phase-2
npx tsc --noEmit -p apps/micro-cluster
bun run lint:changed
bun run boot-check micro-cluster
git add -A && git commit -m "feat(micro-cluster): audit 7 entity เพิ่มจาก tb_cluster

CRUD ล้วน ไม่ลงทะเบียน membership cmd เพราะ logPlatformEvent มือบันทึกตารางเชื่อม
พร้อม meta_data ที่ interceptor ทำไม่ได้อยู่แล้ว

ไม่ include tb_user_login_session ใน snapshot: session เปลี่ยนทุกครั้งที่ใครล็อกอิน
diff จะเต็มไปด้วย noise

sensitiveFields เพิ่ม email_verification_token_hash เป็นตัวสำคัญสุด — ไม่ redact
แปลว่าเก็บ hash ของ token ยืนยันอีเมลไว้ให้เปิดดูผ่าน UI ได้ตลอดไป"
```

---

### Task 2: `EntityOwnership` + ตัวหา cluster

**Files:**
- Create: `apps/micro-cluster/src/log/activity-log/entity-ownership.ts`

**Interfaces:**
- Produces:
```ts
export type EntityOwnership =
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'platform' };

export async function resolveEntityOwnership(
  prisma: typeof PrismaClient_SYSTEM,
  entityType: string,
  entityId: string,
): Promise<EntityOwnership | null>;  // null = หาไม่เจอ -> caller ต้อง fail closed
```

- [ ] **Step 1: เขียนไฟล์**

```ts
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';

/**
 * เรคอร์ดนี้อยู่ใต้ cluster ไหน หรือเป็นของระดับแพลตฟอร์ม
 *
 * ตั้งใจไม่ใช้ `string | null` เพราะ `null` จะชนกับ `null` ของ resolveAllowedClusterIds
 * ที่ gateway ซึ่งแปลว่า "ไม่จำกัด" — ตรงข้ามกันคนละขั้ว union แบบนี้บังคับให้ handle
 * ทั้งสองกิ่ง ลืมกิ่งไหนเป็น compile error ไม่ใช่ช่องโหว่ที่อ่านโค้ดแล้วดูถูกต้อง
 */
export type EntityOwnership =
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'platform' };

/**
 * entity ที่สังกัด cluster และวิธีหา — คีย์ใช้ชื่อที่ตัด prefix tb_ ออกแล้ว
 *
 * ⚠️ ต่างจาก PLATFORM_ACTIVITIES ที่ใช้ชื่อเต็ม (`tb_business_unit`) เพราะค่านี้เทียบกับ
 * `tb_activity.entity_type` ซึ่ง mapEntityType ตัด prefix ทิ้งตอนเขียน
 *
 * entity ที่ไม่อยู่ในแผนที่นี้ = ของระดับแพลตฟอร์ม ⇒ ต้องมีสิทธิ์ระดับ platform ถึงจะดูได้
 * ไม่ใช่ "ใครก็ดูได้"
 */
type OwnershipResolver = (
  prisma: typeof PrismaClient_SYSTEM,
  entityId: string,
) => Promise<string | null>;

const CLUSTER_OWNED: Readonly<Record<string, OwnershipResolver>> = {
  // entity_id คือ cluster id เอง
  cluster: async (_p, id) => id,

  business_unit: async (p, id) =>
    (await p.tb_business_unit.findUnique({ where: { id }, select: { cluster_id: true } }))
      ?.cluster_id ?? null,

  cluster_license: async (p, id) =>
    (await p.tb_cluster_license.findUnique({ where: { id }, select: { cluster_id: true } }))
      ?.cluster_id ?? null,

  // สองชั้น: license -> BU -> cluster
  business_unit_license: async (p, id) => {
    const lic = await p.tb_business_unit_license.findUnique({
      where: { id },
      select: { business_unit_id: true },
    });
    if (!lic?.business_unit_id) return null;
    const bu = await p.tb_business_unit.findUnique({
      where: { id: lic.business_unit_id },
      select: { cluster_id: true },
    });
    return bu?.cluster_id ?? null;
  },
};

/**
 * หาว่าเรคอร์ดหนึ่งสังกัด cluster ไหน
 * @param prisma - Prisma client ของแพลตฟอร์ม
 * @param entityType - ชื่อตารางที่ตัด prefix tb_ ออกแล้ว ตามที่เก็บใน tb_activity
 * @param entityId - คีย์หลักของเรคอร์ด
 * @returns ownership ของเรคอร์ด หรือ `null` เมื่อหาไม่เจอ (แถวถูกลบไปแล้ว) — caller ต้อง fail closed
 */
export async function resolveEntityOwnership(
  prisma: typeof PrismaClient_SYSTEM,
  entityType: string,
  entityId: string,
): Promise<EntityOwnership | null> {
  const resolver = CLUSTER_OWNED[entityType];
  if (!resolver) return { kind: 'platform' };
  const clusterId = await resolver(prisma, entityId);
  // แถวหาย (ถูก hard delete) — เดาไม่ออกว่าใครควรเห็น จึงคืน null ให้ caller ปฏิเสธ
  if (!clusterId) return null;
  return { kind: 'cluster', clusterId };
}
```

⚠️ **ยืนยันชื่อคอลัมน์ก่อนใช้:**
```bash
awk '/^model tb_business_unit_license \{/,/^\}/' \
  packages/prisma-shared-schema-platform/prisma/schema.prisma | grep -E "business_unit_id|^  id "
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
npx tsc --noEmit -p apps/micro-cluster && bun run lint:changed
git add -A && git commit -m "feat(micro-cluster): ตัวหา EntityOwnership ของเรคอร์ด

discriminated union ไม่ใช่ string|null เพราะ null จะชนกับ null ของ
resolveAllowedClusterIds ที่แปลว่าไม่จำกัด — ตรงข้ามกันคนละขั้ว

entity ที่ไม่อยู่ในแผนที่ = platform-only ต้องมีสิทธิ์ระดับ platform ไม่ใช่ใครก็ดูได้
แถวที่หาไม่เจอคืน null ให้ caller fail closed"
```

---

### Task 3: `RELATED_ACTIVITY` + `findByEntityId` สามขั้น

**Files:**
- Create: `apps/micro-cluster/src/log/activity-log/related-activity.ts`
- Modify: `apps/micro-cluster/src/log/activity-log/activity-log.service.ts`

**Interfaces:**
- Consumes: `resolveEntityOwnership` (Task 2)
- Produces: `findByEntityId` คืน `{ paginate, data, ownership }`

- [ ] **Step 1: เขียน `related-activity.ts`**

```ts
/** แถวที่เกี่ยวข้องหนึ่งชนิด */
export interface RelatedSpec {
  /** entity_type ของแถวที่จะดึง (ตัด prefix tb_ ออกแล้ว) */
  entityType: string;
  /** คีย์ใน meta_data ที่ชี้กลับมาหา entity แม่ */
  metaKey: string;
}

/**
 * แถวประวัติที่ควรปรากฏในไทม์ไลน์ของ entity หนึ่ง แม้ถูกบันทึกด้วย entity_type อื่น
 *
 * ผลิตโดย logPlatformEvent แบบมือที่:
 *   apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:1331 และ :1583
 *   apps/micro-cluster/src/cluster/cluster/cluster.service.ts:1342 และ :1499
 * ซึ่งบันทึกตารางเชื่อมพร้อม meta_data ที่ชี้กลับมาหาแม่
 *
 * ⚠️ **แก้รูป meta_data ที่สี่จุดนั้นแล้วต้องแก้ที่นี่ด้วย** ไม่มี type ไหนบังคับความสัมพันธ์นี้
 * แถวจะหายจากไทม์ไลน์เงียบ ๆ โดยไม่มี error
 */
export const RELATED_ACTIVITY: Readonly<Record<string, readonly RelatedSpec[]>> = {
  business_unit: [{ entityType: 'user_tb_business_unit', metaKey: 'business_unit_id' }],
  cluster: [{ entityType: 'cluster_user', metaKey: 'cluster_id' }],
};
```

⚠️ **ยืนยัน `entity_type` ที่เก็บจริง** — `mapEntityType` ตัด `tb_` แล้วแปลง camelCase
รันบน DEV เพื่อดูค่าจริงก่อนเขียนตายตัว:

```sql
SELECT DISTINCT entity_type FROM tb_activity
WHERE meta_data->>'event_type' LIKE 'membership.%';
```

- [ ] **Step 2: แก้ `findByEntityId` เป็นสามขั้น**

```ts
  @TryCatch
  async findByEntityId(params: IFindByEntityParams) {
    const page = params.page ?? 1;
    const perpage = params.perpage ?? DEFAULT_PERPAGE;

    // ขั้น 1: หา ownership ก่อนอ่านประวัติ — gateway ต้องปฏิเสธได้โดยไม่ต้องอ่าน
    // ข้อมูลที่ผู้เรียกไม่ควรเห็น
    const entityType = params.entity_type;
    const ownership = entityType
      ? await resolveEntityOwnership(this.prismaSystem, entityType, params.entity_id)
      : null;
    if (entityType && ownership === null) {
      // แถวแม่หาย — fail closed ไม่ใช่ตกไปเป็น platform
      return Result.errorFromCatalog(ERROR_CATALOG.ACTIVITY_LOG_NOT_FOUND);
    }

    // ขั้น 2: หา entity_id ที่เกี่ยวข้อง
    const relatedIds = entityType
      ? await this.findRelatedEntityIds(entityType, params.entity_id)
      : [];

    // ขั้น 3: query รวมทั้งของตัวเองและของที่เกี่ยวข้อง
    const where = {
      deleted_at: null,
      entity_id: { in: [params.entity_id, ...relatedIds] },
    };

    const [rows, total] = await Promise.all([
      this.prismaSystem.tb_activity.findMany({
        where,
        orderBy: [{ created_at: 'desc' as const }],
        skip: (page - 1) * perpage,
        take: perpage,
      }),
      this.prismaSystem.tb_activity.count({ where }),
    ]);

    return Result.ok({
      paginate: { total, page, perpage, pages: total === 0 ? 1 : Math.ceil(total / perpage) },
      data: await this.mapActorInfo(rows),
      ownership: ownership ?? { kind: 'platform' as const },
    });
  }
```

⚠️ **`entity_type` filter หายไปจาก `where`** โดยเจตนา — เดิมกรองด้วย `entity_type` เพื่อ
ความแม่นยำ แต่ตอนนี้ต้องรับหลาย type (ของตัวเอง + ของที่เกี่ยวข้อง) ความแม่นยำมาจาก
`entity_id` ซึ่งเป็น UUID อยู่แล้ว

- [ ] **Step 3: เขียน `findRelatedEntityIds`**

```ts
  /**
   * หา entity_id ของแถวที่เกี่ยวข้องกับเรคอร์ดนี้
   *
   * ใช้ Prisma `path` filter บน JsonB ไม่ใช่ raw SQL — audit:raw-sql บังคับให้ raw query
   * ทุกตัวผ่าน systemTableRef()
   * @param entityType - ชื่อตารางของเรคอร์ดแม่ (ตัด prefix tb_ ออกแล้ว)
   * @param entityId - คีย์หลักของเรคอร์ดแม่
   * @returns entity_id ของแถวที่เกี่ยวข้อง ว่างเมื่อ entity นี้ไม่มีรายการใน RELATED_ACTIVITY
   */
  private async findRelatedEntityIds(
    entityType: string,
    entityId: string,
  ): Promise<string[]> {
    const specs = RELATED_ACTIVITY[entityType];
    if (!specs?.length) return [];

    const found = await Promise.all(
      specs.map((spec) =>
        this.prismaSystem.tb_activity.findMany({
          where: {
            deleted_at: null,
            entity_type: spec.entityType,
            meta_data: { path: [spec.metaKey], equals: entityId },
          },
          select: { entity_id: true },
        }),
      ),
    );

    return found
      .flat()
      .map((r) => r.entity_id)
      .filter((v): v is string => !!v);
  }
```

- [ ] **Step 4: ตรวจ + commit**

```bash
npx tsc --noEmit -p apps/micro-cluster && bun run lint:changed && bun run boot-check micro-cluster
git add -A && git commit -m "feat(micro-cluster): ดึงแถวที่เกี่ยวข้องเข้าไทม์ไลน์เดียวกัน

การเปลี่ยนสมาชิกถูกบันทึกครบอยู่แล้วโดย logPlatformEvent มือ แต่ UI มองไม่เห็นเพราะ
เก็บด้วย entity_id ของแถวเชื่อม ไม่ใช่ของ BU

หา ownership ก่อนอ่านประวัติ เพื่อให้ gateway ปฏิเสธได้โดยไม่ต้องอ่านข้อมูลที่ไม่ควรเห็น
แถวแม่ที่หาไม่เจอ fail closed"
```

---

### Task 4: เติมชื่อ subject ใน membership row

**Files:**
- Modify: `apps/micro-cluster/src/log/activity-log/activity-log.service.ts`

**Interfaces:**
- Produces: แถวที่มี `meta_data.subject_user_id` จะมี `subject_name` เพิ่มมา

- [ ] **Step 1: ขยาย `mapActorInfo`**

รวม `subject_user_id` เข้ากับ `actor_id` ใน query เดียว (ทั้งคู่ชี้ `tb_user`) แล้ว map กลับ:

```ts
    // subject_user_id คือ "คนที่ถูกเพิ่ม/ถอด" ต่างจาก actor_id ที่เป็น "คนที่ลงมือ"
    // ดึงพร้อมกันเพราะชี้ตารางเดียวกัน — แยก query จะยิงสองรอบเพื่อข้อมูลชุดเดียว
    const subjectIds = rows
      .map((r) => (r.meta_data as Record<string, unknown> | null)?.subject_user_id)
      .filter((v): v is string => typeof v === 'string');
    const allIds = [...new Set([...actorIds, ...subjectIds])];
```

แล้วเติม `subject_name` ลงแถวจาก map เดียวกับที่ actor ใช้

- [ ] **Step 2: ตรวจ + commit**

```bash
npx tsc --noEmit -p apps/micro-cluster && bun run lint:changed
git add -A && git commit -m "feat(micro-cluster): เติมชื่อคนที่ถูกเพิ่ม/ถอดในแถว membership

subject_user_id เป็น UUID ดิบ แสดงตรง ๆ ทำให้ฟีเจอร์ตอบคำถาม 'ใครเพิ่มคนนี้เข้ามา'
ได้แค่ครึ่งเดียว ดึงพร้อม actor เพราะชี้ tb_user ตารางเดียวกัน"
```

---

### Task 5: Gateway — ownership switch

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.service.ts`
- Modify: `apps/backend-gateway/src/platform/platform-activity-logs/swagger/response.ts`

**Interfaces:**
- Consumes: `ownership` จาก response ของ `findByEntityId` (Task 3)
- Produces: `EntityOwnership` ฝั่ง gateway

⚠️ **type ข้าม app ไม่ได้** — `EntityOwnership` ที่ Task 2 สร้างอยู่ใน `apps/micro-cluster`
gateway import ตรงไม่ได้ (คนละ app คนละ tsconfig) มีสองทาง:

- **ประกาศซ้ำที่ gateway** ในไฟล์ `activity-log-scope.ts` ที่มีอยู่ — union สองกิ่งสั้นพอที่
  การซ้ำจะถูกกว่าการสร้าง shared package ใหม่เพื่อ type เดียว **เลือกทางนี้** และเขียน
  คอมเมนต์สองทางผูกกับต้นฉบับ
- ย้ายขึ้น `packages/` — เกินความจำเป็นสำหรับ type เดียวที่ยังไม่มีตัวที่สามใช้

```ts
/**
 * สำเนาของ EntityOwnership ใน apps/micro-cluster/src/log/activity-log/entity-ownership.ts
 *
 * ประกาศซ้ำเพราะข้าม app import ไม่ได้ และ union สองกิ่งไม่คุ้มกับการตั้ง shared package
 * **แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย** — ตัวที่บังคับความสอดคล้องคือ boot-check + การตรวจ
 * ด้วยมือใน Task 6 ไม่ใช่ compiler
 */
export type EntityOwnership =
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'platform' };
```

⚠️ **บนสาย wire เป็น snake_case** — micro ส่ง `{ kind, cluster_id }` (ตามรูป response
ทั้งระบบ) แต่ type ฝั่ง gateway เขียนเป็น `clusterId` ต้องแปลงตอนอ่าน หรือประกาศให้ตรง
กับสายจริง **ยืนยันรูปที่ส่งจริงด้วยการยิง endpoint หลัง Task 3 เสร็จก่อนเขียน Task 5**

- [ ] **Step 1: แทน `assertClusterInScope` ด้วย switch**

`assertClusterInScope` เดิมสมมติว่า `entityId` คือ cluster id — จริงเฉพาะ `tb_cluster`
แทนด้วยตัวที่รับ ownership:

```ts
  /**
   * ปฏิเสธผู้เรียกที่สิทธิ์ไม่ครอบเรคอร์ดนี้
   *
   * endpoint นี้คืนค่าเก่าของทุกฟิลด์ จึงรั่วแรงกว่า analytics ที่เคยรั่วข้าม tenant มาแล้ว
   * การมี permission key ไม่พอ
   * @param req - คำขอที่ PlatformPermissionGuard แนบ effective permissions มา
   * @param ownership - เรคอร์ดนี้สังกัด cluster ไหน หรือเป็นของระดับแพลตฟอร์ม
   * @param required - คีย์สิทธิ์ที่คุม endpoint ผู้เรียก
   * @returns ไม่คืนค่า โยน ForbiddenException เมื่ออยู่นอกขอบเขต
   */
  private assertOwnershipInScope(
    req: RequestWithPlatformPermissions,
    ownership: EntityOwnership,
    required: ActivityLogPermissionKey,
  ): void {
    const allowed = resolveAllowedClusterIds(req.platformPermissions, required);

    switch (ownership.kind) {
      case 'platform':
        // เรคอร์ดไม่สังกัด cluster ใด — cluster scope เข้าถึงไม่ได้เลย
        // `null` ที่นี่แปลว่า "ถือคีย์ระดับ platform หรือเป็น super admin" ซึ่งเป็นเงื่อนไข
        // เดียวที่ผ่าน ค่าอื่น (รวม []) คือได้สิทธิ์มาทาง cluster scope ⇒ ปฏิเสธ
        if (allowed !== null) throw new ForbiddenException();
        return;
      case 'cluster':
        if (allowed === null) return; // platform-wide หรือ super admin
        if (!allowed.includes(ownership.clusterId.toLowerCase())) {
          throw new ForbiddenException();
        }
        return;
    }
  }
```

- [ ] **Step 2: เรียงลำดับใน handler**

ownership มาจาก response ⇒ ต้องอ่านก่อนแล้วค่อยตัดสิน แล้ว**ทิ้งผลถ้าไม่ผ่าน**:

```ts
    const result = await this.service.findByEntityId({...});
    if (result.isOk()) {
      const payload = result.value as { ownership?: EntityOwnership };
      // ไม่มี ownership มาด้วย = micro ตัวเก่ายังไม่ได้ deploy ⇒ fail closed
      if (!payload.ownership) throw new ForbiddenException();
      this.assertOwnershipInScope(req, payload.ownership, ACTIVITY_LOG_READ);
    }
    this.respond(res, result);
```

⚠️ **`!payload.ownership` ต้อง fail closed** — ระหว่าง deploy gateway ใหม่อาจคุยกับ
micro ตัวเก่าที่ยังไม่ส่ง ownership ถ้าปล่อยผ่านจะเปิดทุกเรคอร์ดให้ทุกคนชั่วคราว

- [ ] **Step 3: `detail` ใช้ทางเดียวกัน**

`:id/detail` ต้องหา ownership จาก `entity_type`+`entity_id` ของแถวที่อ่านมา แล้วตรวจ
**หลังอ่านก่อนส่ง** เหมือนเดิม แต่ใช้ `assertOwnershipInScope`

- [ ] **Step 4: ตรวจครบชุด + commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
bun run audit:api-system-permission
bun run audit:message-pattern-literal
bun run audit:rest-contract
bun run audit:raw-sql
bun run check-types
bun run lint:changed
bun run boot-check backend-gateway micro-cluster
git add -A && git commit -m "feat(gateway): ตัดสินสิทธิ์จาก EntityOwnership แทนการเดา cluster จาก entity_id

assertClusterInScope เดิมสมมติว่า entity_id คือ cluster id ซึ่งจริงเฉพาะ tb_cluster
เรคอร์ด platform-only ต้องถือคีย์ระดับ platform เท่านั้น สิทธิ์ที่ได้มาทาง cluster scope
เข้าถึงไม่ได้เลย

ownership ที่ไม่มีมาด้วย = micro ตัวเก่ายังไม่ deploy ⇒ fail closed"
```

---

### Task 6: Deploy DEV + ตรวจ

**Files:** ไม่มีการแก้โค้ด

- [ ] **Step 1: เปิด PR แล้ว merge**

ไม่มี migration · ไม่มี permission key ใหม่ · ไม่ต้อง seed · ไม่ต้อง regenerate catalog

- [ ] **Step 2: ยืนยันว่า deploy จริง**

`gh run list --branch main --limit 5` แล้วรอ `Deploy Dev` success

- [ ] **Step 3: ⛔ ตรวจ ownership — ต้องมีบัญชีที่ไม่ใช่ super admin**

**ข้อนี้คือการตรวจหลักของทั้งเฟส และทำไม่ได้เลยถ้าไม่มีบัญชีที่ได้ `activity_log.read`
มาทาง cluster scope เท่านั้น**

| เคส | คาดหวัง |
|---|---|
| ผู้ใช้ cluster-scope ยิง `record/:id` ของ **application** | **403** |
| ผู้ใช้ platform-level ยิงอันเดียวกัน | **200** |
| ผู้ใช้ cluster-scope ยิง BU ใน cluster ตัวเอง | **200** |
| ผู้ใช้ cluster-scope ยิง BU ใน cluster อื่น | **403** |

**สี่เคสต้องทำครบ** — สองเคสแรกคู่กันพิสูจน์ว่าไม่ได้ปิดตายหมดหรือเปิดหมด
**super admin เห็นข้อมูลไม่พิสูจน์อะไรเลย**

- [ ] **Step 4: ตรวจแถว related**

เพิ่มสมาชิกเข้า BU บน DEV → ยิง `record/<bu-id>` → ต้องมีแถว `user_tb_business_unit`
โผล่พร้อม `subject_name` ที่เป็นชื่อคนไม่ใช่ UUID

- [ ] **Step 5: ตรวจ entity_type ทั้ง 7**

แก้ของจริงอย่างละครั้งแล้วยิง `record/:id` — **ตัวที่คืนรายการว่างคือตัวที่ส่งชื่อผิด**

- [ ] **Step 6: ตรวจ redaction ใน DB**

```sql
SELECT entity_type,
       old_data->>'email_verification_token_hash' AS token_hash,
       old_data->>'image_file_token' AS img,
       old_data->>'signature_file_token' AS sig
FROM tb_activity
WHERE entity_type IN ('user','news')
ORDER BY created_at DESC LIMIT 10;
```

Expected: ทุกคอลัมน์เป็น `[REDACTED]` หรือ null — **ค่าจริงห้ามปรากฏ**
ดูผ่าน UI ไม่พอ redaction ทำตอนเขียน

- [ ] **Step 7: ตรวจ snapshot ไม่มี session noise**

ล็อกอิน/ล็อกเอาต์สลับกันหลายครั้ง แล้วแก้ชื่อ user หนึ่งครั้ง → diff ต้องมีแค่ฟิลด์ที่แก้
ไม่มี `tb_user_login_session` โผล่มา
