# BU Auto Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้ไม่ต้องกรอก `code` ตอนสร้าง Business Unit อีกต่อไป — backend สร้างรหัส `BU-XXXXXXXX` ที่ไม่ซ้ำกับ BU ตัวใดในฐานข้อมูลให้ และรหัสนั้นแก้ไม่ได้หลังสร้าง

**Architecture:** ย้ายการตั้ง `code` จากฟอร์มฝั่ง frontend ไปอยู่ที่จุด insert เพียงจุดเดียวใน `micro-cluster` โดยเปลี่ยน `code` ใน create DTO เป็น optional, เพิ่ม unique index ระดับตารางบน `tb_business_unit.code` แล้วให้ service สุ่มรหัสและวน insert จนกว่าฐานข้อมูลจะรับ — ชั้นที่ตัดสินคือ `P2002` จาก unique index ไม่ใช่ผลของ query ฝั่ง frontend เพียงซ่อนช่อง Code ในหน้า new และทำให้เป็น read-only ในหน้า Edit

**Tech Stack:** NestJS + Prisma (PostgreSQL, schema `carmen_system`) ฝั่ง backend; React + TypeScript + Vite + Vitest ฝั่ง frontend

**Spec:** `docs/superpowers/specs/2026-09-04-bu-auto-code-design.md`

## Global Constraints

- **สอง repo:** `carmen-turborepo-backend-v2` (BE) และ `carmen-platform` (FE) — path ในแผนนี้เป็น path ภายใน repo ของตัวเอง
- **ลำดับ deploy ห้ามสลับ:** BE ต้องขึ้น DEV และยืนยันแล้วก่อน FE เสมอ ถ้า FE ขึ้นก่อน การสร้าง BU จะพังด้วย `code field is required`
- **ไม่เขียนไฟล์ test ใหม่ในรอบนี้** ตามข้อตกลงของผู้ใช้ — แก้เฉพาะ test เดิมที่จะกลายเป็นสีแดง static check (typecheck / lint) ยังต้องรันทุกครั้ง และการตรวจมือในเบราว์เซอร์ยังต้องทำ
- **ฝั่ง BE ห้ามใช้ `bun run lint`** — สคริปต์นั้นมี `--fix` และเขียนทับทั้ง repo ใช้ `bunx eslint <path>` เจาะเฉพาะไฟล์ที่แก้
- **jest ของ backend-v2 ต้องมี `--runInBand --forceExit`** ไม่งั้น LokiTransport ทำให้ค้าง
- **รูปแบบ code:** `BU-` + 8 ตัวอักษรจากชุด `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (Crockford base32 ตัด `I L O U`) รวม 11 ตัวอักษร
- **ชื่อ unique index:** `business_unit_code_deleted_at_u`
- **จำนวนรอบสุ่มสูงสุด:** 5
- ทุก commit ลงท้ายด้วย `Claude-Session: https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP`
- branch ฝั่ง BE: `feature/bu-auto-code` · branch ฝั่ง FE: `feature/bu-auto-code` (สร้างไว้แล้ว มี commit spec อยู่)

---

## File Structure

**Backend — `carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` (แก้ บรรทัด ~228) | ประกาศ unique index ระดับตารางบน `code` |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260904000000_business_unit_code_global_unique/migration.sql` (สร้าง) | SQL ของ index นั้น |
| `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts` (แก้ บรรทัด 18) | `code` เป็น optional ใน create schema |
| `apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts` (แก้ บรรทัด 9) | `code?: string` |
| `apps/micro-cluster/src/cluster/business-unit/business-unit-code.helper.ts` (สร้าง) | ฟังก์ชันสุ่มรหัสตัวเดียว ไม่มี state ไม่แตะฐานข้อมูล |
| `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` (แก้ บรรทัด 129–152 และ 236) | ใช้ helper วน insert, และทำให้ `code` แก้ไม่ได้ตอน update |

`business-unit-code.helper.ts` แยกออกมาเป็นไฟล์ของตัวเองเพราะเป็นตรรกะบริสุทธิ์ที่อ่านและตรวจได้โดยไม่ต้องมีฐานข้อมูล ต่างจาก service ที่ยาว 1300+ บรรทัดและผูกกับ Prisma ทุกบรรทัด

**Frontend — `carmen-platform`**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/pages/businessUnitEdit/BusinessUnitDocument.tsx` (แก้ บรรทัด 223) | ช่อง Code แสดงเฉพาะ `!isNew` และ read-only เสมอ |
| `src/pages/BusinessUnitEdit.tsx` (แก้ บรรทัด ~421, 448, 480) | ถอด `code` ออกจาก validation, จากรายการ "ยังขาดอะไร" และจาก payload |
| `src/pages/BusinessUnitEdit.test.tsx` (แก้ บรรทัด 153–188) | ปรับ test เดิมสองเคสที่ยึดกับ Code ที่ผู้ใช้พิมพ์ |

---

### Task 1: ด่านตรวจข้อมูลซ้ำก่อนทำอะไรทั้งสิ้น

ไม่มีการแก้โค้ดในงานนี้ — เป็นด่านที่ต้องผ่านก่อน Task 2 เท่านั้น ถ้าด่านนี้ไม่ผ่าน แผนที่เหลือใช้ไม่ได้และต้องกลับไปคุยกับผู้ใช้

**Files:** ไม่มี

**Interfaces:**
- Consumes: ไม่มี
- Produces: คำยืนยันว่าไม่มี `code` ซ้ำข้าม cluster ในทุก environment — Task 2 พึ่งข้อนี้ทั้งหมด

- [ ] **Step 1: ยิง query หา code ซ้ำบน DEV**

ใช้หน้า SQL Workbench ของ platform หรือต่อ psql ตรงไปที่ DB ของ DEV แล้วรัน:

```sql
SELECT code, count(*) AS n
FROM carmen_system.tb_business_unit
WHERE deleted_at IS NULL
GROUP BY code
HAVING count(*) > 1
ORDER BY n DESC;
```

คาดหวัง: **0 แถว**

- [ ] **Step 2: ยิง query เดียวกันบน UAT และ production**

รัน SQL ชุดเดิมกับอีกสอง environment ห้ามข้าม — migration จะถูก apply ทั้งสามที่ในที่สุด และ `prisma migrate deploy` ลาก migration ที่ค้างอยู่ทั้งชุด

คาดหวัง: **0 แถว ทั้งสองที่**

- [ ] **Step 3: บันทึกผลและตัดสิน**

- ได้ 0 แถวทั้งสาม environment → เดินต่อ Task 2
- ได้แถวใดแถวหนึ่ง → **หยุดทันที ห้ามแก้ข้อมูล ห้ามข้ามไป Task 2** รายงานผลให้ผู้ใช้พร้อมรายการ code ที่ซ้ำ เหตุผล: `code` ถูกอ้างด้วยค่า (ไม่ใช่ FK) ที่ `tb_business_unit_interface.bu_code` และ `bu_codes` ใน micro-cronjobs การเปลี่ยน code ของ BU เดิมจะไม่มี error ให้เห็น มีแต่ entitlement และ cronjob ที่เงียบหายไป

---

### Task 2: Migration — unique index ระดับตารางบน `code`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (บล็อก `model tb_business_unit` เริ่มบรรทัด 147, บรรทัด `@@unique` เดิมอยู่ราวบรรทัด 228)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260904000000_business_unit_code_global_unique/migration.sql`

**Interfaces:**
- Consumes: ผลของ Task 1 (ไม่มี code ซ้ำ)
- Produces: constraint `business_unit_code_deleted_at_u` ซึ่ง Task 3 ใช้เป็นชั้นตัดสินการชนกันผ่าน Prisma error `P2002`

- [ ] **Step 1: เพิ่มบรรทัด `@@unique` ใน schema.prisma**

ในบล็อก `model tb_business_unit` วางบรรทัดใหม่ **ก่อน** `@@unique([cluster_id, code, deleted_at], ...)` ที่มีอยู่:

```prisma
  /// code เป็น identifier ระดับแพลตฟอร์ม ไม่ใช่แค่ระดับ cluster — tb_business_unit_interface.bu_code,
  /// endpoint /platform/business-units/{bu_code}/interface-entitlement และ bu_codes ใน micro-cronjobs
  /// ล้วนอ้างถึงด้วย "ค่า" ไม่ใช่ FK จึงตีความ code ว่าเป็นของ BU ตัวเดียวทั้งระบบมาตลอด
  /// unique ต่อ cluster ข้างล่างจึงเป็นการรับประกันที่อ่อนกว่าที่ระบบใช้งานจริง บรรทัดนี้ปิดช่องนั้น
  /// deleted_at อยู่ในคีย์ด้วยแบบเดียวกับ unique เดิม เพื่อไม่ให้ BU ที่ถูก soft-delete แล้วกันรหัสไว้ตลอดกาล
  @@unique([code, deleted_at], map: "business_unit_code_deleted_at_u")
  @@unique([cluster_id, code, deleted_at], map: "business_unit_cluster_code_deleted_at_u")
```

- [ ] **Step 2: เขียนไฟล์ migration**

สร้างโฟลเดอร์ `20260904000000_business_unit_code_global_unique/` แล้วใส่ `migration.sql`:

```sql
-- code ของ BU เป็น identifier ระดับแพลตฟอร์ม ไม่ใช่ระดับ cluster
--
-- tb_business_unit_interface.bu_code, endpoint /platform/business-units/{bu_code}/interface-entitlement
-- และ bu_codes ใน micro-cronjobs อ้างถึง code ด้วย "ค่า" ไม่ใช่ foreign key ทั้งสามที่จึงตีความมาตลอดว่า
-- code หนึ่งค่าหมายถึง BU ตัวเดียวในทั้งระบบ แต่ข้อบังคับที่มีอยู่จริงคือ unique ต่อ cluster เท่านั้น
-- migration นี้ทำให้ข้อบังคับตรงกับสิ่งที่ระบบใช้งานอยู่จริง
--
-- The BU code is a platform-wide identifier, not a per-cluster one. Three separate consumers already
-- resolve it by value; only the constraint lagged behind.
--
-- deleted_at อยู่ในคีย์แบบเดียวกับ business_unit_cluster_code_deleted_at_u เพื่อให้ BU ที่ถูก soft-delete
-- ไปแล้วปล่อยรหัสคืน แทนที่จะกันไว้ตลอดกาล
CREATE UNIQUE INDEX "business_unit_code_deleted_at_u"
  ON "tb_business_unit" ("code", "deleted_at");
```

- [ ] **Step 3: ตรวจว่า schema กับ migration ตรงกัน**

```bash
cd packages/prisma-shared-schema-platform && bun run db:generate
```

คาดหวัง: generate ผ่านโดยไม่มี error

- [ ] **Step 4: apply migration บน DEV แล้วยืนยันว่า index เกิดจริง**

```bash
cd packages/prisma-shared-schema-platform && bun run db:deploy
```

แล้วยืนยันด้วย SQL:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'tb_business_unit' AND indexname = 'business_unit_code_deleted_at_u';
```

คาดหวัง: 1 แถว ถ้า `db:deploy` ล้มด้วย duplicate key ให้ย้อนกลับไป Task 1 — แปลว่าการตรวจตรงนั้นข้าม environment ใด environment หนึ่งไป

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20260904000000_business_unit_code_global_unique
git commit -m "$(cat <<'MSG'
feat(business-unit): บังคับ code ให้ไม่ซ้ำทั้งฐานข้อมูล ไม่ใช่แค่ในคลัสเตอร์

code ถูกอ้างด้วยค่าจาก tb_business_unit_interface.bu_code, endpoint
interface-entitlement และ bu_codes ใน micro-cronjobs มาตลอด ทั้งสามที่จึงถือว่า
code หนึ่งค่าคือ BU ตัวเดียวในระบบ แต่ข้อบังคับจริงเป็นแค่ unique ต่อคลัสเตอร์

Claude-Session: https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP
MSG
)"
```

---

### Task 3: Backend — สร้าง code ให้เองเมื่อผู้เรียกไม่ส่งมา

**Files:**
- Create: `apps/micro-cluster/src/cluster/business-unit/business-unit-code.helper.ts`
- Modify: `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts:18`
- Modify: `apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts:9`
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:129-152`

**Interfaces:**
- Consumes: constraint `business_unit_code_deleted_at_u` จาก Task 2
- Produces: `generateBusinessUnitCode(): string` — ไม่รับพารามิเตอร์ คืน string รูปแบบ `BU-XXXXXXXX` ยาว 11 ตัวอักษรเสมอ; และสัญญาใหม่ของ `POST /api-system/business-units` ที่ `code` เป็น optional ซึ่ง Task 5 พึ่งพา

- [ ] **Step 1: เขียน helper สุ่มรหัส**

สร้าง `apps/micro-cluster/src/cluster/business-unit/business-unit-code.helper.ts`:

```ts
import { randomBytes } from 'node:crypto';

/**
 * Crockford base32 — ตัด I, L, O, U ออกจาก 36 ตัวอักษรปกติ เพื่อไม่ให้ผู้ใช้อ่าน 1 เป็น I,
 * 0 เป็น O หรือพิมพ์ผิดตอนคัดลอกรหัสจากหน้าจอไปใส่ที่อื่น
 * Crockford base32: I, L, O and U are dropped so a human copying the code cannot confuse
 * them with 1, 0 or each other.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_SUFFIX_LENGTH = 8;

/**
 * สุ่มรหัสหน่วยธุรกิจหนึ่งค่า ไม่แตะฐานข้อมูล — ผู้เรียกเป็นคนรับผิดชอบเรื่องการชนกัน
 * Generates one candidate business-unit code. Collision handling belongs to the caller.
 * @returns รหัสรูปแบบ `BU-XXXXXXXX` ยาว 11 ตัวอักษร / A code shaped `BU-XXXXXXXX`, 11 chars long
 */
export function generateBusinessUnitCode(): string {
  // randomBytes ไม่ใช่ Math.random — รหัสนี้เป็น identifier ที่เดาได้ไม่ควรเดาได้
  // 256 หารด้วย 32 ลงตัว การใช้ % จึงไม่ทำให้ตัวอักษรบางตัวออกบ่อยกว่าตัวอื่น
  // 256 % 32 === 0, so the modulo below is unbiased for this exact alphabet length.
  const bytes = randomBytes(CODE_SUFFIX_LENGTH);
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `BU-${suffix}`;
}
```

- [ ] **Step 2: ทำให้ `code` เป็น optional ใน create DTO**

ใน `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts` แทนที่บล็อก `code` (บรรทัด 18–20) ของ `BusinessUnitCreateSchema` — **เฉพาะบล็อกแรก** ไม่ใช่บล็อก `code` ที่บรรทัด 201 ซึ่งเป็นของ update schema:

```ts
    code: z
      .string()
      .min(3, 'code must be at least 3 characters')
      .optional()
      .openapi({
        example: 'BU-7K3M9Q2X',
        description:
          'Business unit code — omit it and the platform allocates a unique one. Supplying a value is reserved for seeds and imports that carry their own codes.',
      }),
```

`min(3)` ยังอยู่ เพราะ seed / tenant import / preconfig import ส่ง code ของตัวเองมาและต้องถูกตรวจเหมือนเดิม

- [ ] **Step 3: ทำให้ `code` เป็น optional ใน interface ของ micro-cluster**

ใน `apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts` บรรทัด 9 เปลี่ยน `code: string;` เป็น:

```ts
  /** ไม่ส่งมา = ให้แพลตฟอร์มสุ่มให้ ดู createBusinessUnit / Omitted means the platform allocates one */
  code?: string;
```

- [ ] **Step 4: เปลี่ยนตรรกะการ insert ใน service**

ใน `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` เพิ่ม import ที่ท้ายกลุ่ม import:

```ts
import { generateBusinessUnitCode } from './business-unit-code.helper';
```

เพิ่มค่าคงที่ไว้เหนือ `@Injectable()`:

```ts
/** จำนวนครั้งที่ยอมสุ่มรหัสใหม่เมื่อชนกัน — มีขอบเขตเสมอ ไม่วนไม่จำกัด */
const MAX_CODE_ATTEMPTS = 5;
```

แทนที่ทั้งบล็อกตั้งแต่ `const findBusinessUnit = ...` (บรรทัด 132) จนถึง `return Result.ok({ id: createBusinessUnit.id, doc_version: createBusinessUnit.doc_version });` (บรรทัด 157) ด้วย:

```ts
    // code ที่ผู้เรียกส่งมาเองยังเดินด่านเดิมทุกอย่าง — seed, tenant import และ preconfig import
    // ส่งรหัสของตัวเองมา และต้องได้ข้อความ "มีอยู่แล้ว" แบบเดิมเมื่อซ้ำ
    // A caller-supplied code keeps the original duplicate gate; only the generated path is new.
    if (data.code) {
      const findBusinessUnit = await this.prismaSystem.tb_business_unit.findFirst({
        where: {
          cluster_id: data.cluster_id,
          code: data.code,
          name: data.name,
        },
      });

      if (findBusinessUnit) {
        return Result.errorFromCatalog(ERROR_CATALOG.BUSINESS_UNIT_ALREADY_EXISTS);
      }
    }

    // ชั้นที่ตัดสินการชนกันคือ P2002 จาก business_unit_code_deleted_at_u ไม่ใช่การ query ก่อน insert:
    // สองคำขอที่สุ่มได้ค่าเดียวกันในเสี้ยววินาทีเดียวกันจะผ่านการ query ทั้งคู่ แต่ฐานข้อมูลปฏิเสธคนที่สอง
    // จึงไม่มีการเช็คว่ารหัสว่างไหมก่อน insert — มันจะเป็นการเช็คที่ไว้ใจไม่ได้และเสียรอบไปเปล่า ๆ
    // The database is what settles a collision, not a pre-flight query — two requests that draw
    // the same code in the same instant both pass any such query; only the unique index rejects one.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = data.code ?? generateBusinessUnitCode();

      try {
        const createBusinessUnit = await this.prismaSystem.tb_business_unit.create({
          data: {
            cluster_id: data.cluster_id,
            code,
            name: data.name,
            alias_name: data.alias_name,
            default_currency_id: data.default_currency_id,
            is_hq: data.is_hq,
            is_active: data.is_active,
            database_pool_id: data.database_pool_id,
            db_schema: data.db_schema,
            created_by_id: user_id,
          },
        });

        return Result.ok({
          id: createBusinessUnit.id,
          doc_version: createBusinessUnit.doc_version,
        });
      } catch (error) {
        const isUniqueViolation =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

        if (!isUniqueViolation) {
          throw error;
        }

        // รหัสที่ผู้เรียกส่งมาเองชนกับ BU ตัวอื่นในฐานข้อมูล — สุ่มใหม่ไม่ได้ เพราะค่านั้นคือสิ่งที่ผู้เรียกขอ
        // ทางนี้เกิดได้แม้ผ่านด่านข้างบนมาแล้ว: ด่านนั้นดู cluster_id + code + name ส่วน index ใหม่ดู code ทั้งระบบ
        if (data.code) {
          return Result.errorFromCatalog(ERROR_CATALOG.BUSINESS_UNIT_ALREADY_EXISTS);
        }
      }
    }

    // สุ่มชนติดกันครบ MAX_CODE_ATTEMPTS รอบ ในพื้นที่สุ่ม 32^8 แปลว่ามีอย่างอื่นผิดปกติ ไม่ใช่โชคร้าย
    return Result.error(
      'Could not allocate a unique business unit code. Please try again.',
      ErrorCode.INTERNAL,
    );
```

`Prisma` และ `ErrorCode` ถูก import อยู่แล้วที่บรรทัด 6 และ 22 ตามลำดับ ไม่ต้องเพิ่ม

- [ ] **Step 5: typecheck + lint**

```bash
bun run check-types
bunx eslint apps/micro-cluster/src/cluster/business-unit/business-unit-code.helper.ts \
            apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts \
            apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts \
            apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts
```

คาดหวัง: ผ่านทั้งคู่ ห้ามใช้ `bun run lint` — มี `--fix` และเขียนทับทั้ง repo

- [ ] **Step 6: รัน jest ของ service นี้**

```bash
bunx jest apps/micro-cluster/src/cluster/business-unit --runInBand --forceExit
```

คาดหวัง: เขียว ถ้าเคสเดิมแดงเพราะ mock ของ `tb_business_unit.create` ไม่คืน `doc_version` หรือเพราะ payload ที่ assert ไว้ไม่มี `code` ให้แก้ mock/assertion นั้นให้ตรงกับพฤติกรรมใหม่ ห้ามเพิ่มไฟล์ test ใหม่

- [ ] **Step 7: Commit**

```bash
git add apps/micro-cluster/src/cluster/business-unit/business-unit-code.helper.ts \
        apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts \
        apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts \
        apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts
git commit -m "$(cat <<'MSG'
feat(business-unit): ให้แพลตฟอร์มสุ่ม code เองเมื่อผู้เรียกไม่ส่งมา

code ใน create DTO เป็น optional แล้ว ไม่ส่งมา = สุ่มรูปแบบ BU-XXXXXXXX
แล้ววน insert สูงสุด 5 รอบ โดยให้ P2002 จาก unique index เป็นผู้ตัดสินการชนกัน
ไม่ใช่การ query ก่อน insert ซึ่งสองคำขอพร้อมกันผ่านได้ทั้งคู่

code ที่ผู้เรียกส่งมาเอง (seed, tenant import, preconfig import) เดินด่านเดิมทุกอย่าง

Claude-Session: https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP
MSG
)"
```

---

### Task 4: Backend — `code` แก้ไม่ได้หลังสร้าง

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:236`

**Interfaces:**
- Consumes: ไม่มี (แยกอิสระจาก Task 3)
- Produces: สัญญาที่ Task 5 พึ่งพา — การส่ง `code` มาใน update ไม่ทำให้อะไรเปลี่ยน

- [ ] **Step 1: เลิกอ่าน `data.code` ในเส้นทาง update**

ใน `applyBusinessUnitUpdate` แทนที่บรรทัด 236:

```ts
          code: data.code ?? businessUnit.code,
```

ด้วย:

```ts
          // code เป็น identifier ที่แพลตฟอร์มเป็นผู้ตั้งตอนสร้าง และถูกอ้างด้วย "ค่า" จาก
          // tb_business_unit_interface.bu_code, endpoint interface-entitlement และ bu_codes ใน
          // micro-cronjobs การเปลี่ยนที่นี่จะไม่มี error ให้เห็น มีแต่ของสามอย่างนั้นที่เงียบหายไป
          // จึงเพิกเฉยต่อ data.code โดยตั้งใจ ไม่ใช่ลืมต่อสาย — ห้ามแก้กลับ
          // Deliberately ignores data.code: three consumers resolve this value as a key, and none
          // of them would report an error if it changed underneath them.
          code: businessUnit.code,
```

- [ ] **Step 2: typecheck + lint**

```bash
bun run check-types
bunx eslint apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts
```

คาดหวัง: ผ่านทั้งคู่

- [ ] **Step 3: รัน jest ของ service นี้**

```bash
bunx jest apps/micro-cluster/src/cluster/business-unit --runInBand --forceExit
```

คาดหวัง: เขียว ถ้ามีเคสเดิมที่ยืนยันว่าเปลี่ยน code ผ่าน update ได้ ให้แก้เคสนั้นให้ยืนยันตรงกันข้าม — ว่าส่ง code ใหม่ไปแล้วค่าที่บันทึกยังเป็นค่าเดิม

- [ ] **Step 4: Commit**

```bash
git add apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts
git commit -m "$(cat <<'MSG'
feat(business-unit): ทำให้ code แก้ไม่ได้หลังสร้าง

updateBusinessUnit เพิกเฉยต่อ data.code แล้วใช้ค่าเดิมของแถวเสมอ กติกา
"ห้ามแก้ code" จึงบังคับที่ server ไม่ใช่แค่ซ่อนช่องใน UI

Claude-Session: https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP
MSG
)"
```

---

### Task 5: Backend — เปิด PR, merge, ขึ้น DEV และยืนยันด้วย API จริง

**Files:** ไม่มีการแก้โค้ด

**Interfaces:**
- Consumes: Task 2, 3, 4
- Produces: DEV ที่รับ create โดยไม่ต้องมี `code` — Task 6 ห้ามเริ่มก่อนข้อนี้ผ่าน

- [ ] **Step 1: รันด่าน audit ทั้งชุดของ backend-v2**

```bash
bun run check-types
cd packages/prisma-shared-schema-platform && bun run db:check.api-system-permission
```

รวมถึงด่าน audit อื่นที่ repo นี้มี — `audit:api-system-permission` เป็นตัวที่ลืมง่ายที่สุดและทำ PR แดงจน merge ไม่ได้

คาดหวัง: ผ่านทุกด่าน

- [ ] **Step 2: push และเปิด PR**

```bash
git push -u origin feature/bu-auto-code
gh pr create --base main --title "feat(business-unit): ให้แพลตฟอร์มสร้าง code ของ BU เองและบังคับให้ไม่ซ้ำทั้งฐานข้อมูล" --body-file <path ไปยังไฟล์ body ใน scratchpad>
```

เขียน body ลงไฟล์ใน scratchpad แล้วใช้ `--body-file` — heredoc กับ `gh pr create` ทำ GateGuard สะดุด body ต้องลงท้ายด้วย `https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP`

- [ ] **Step 3: merge**

```bash
gh pr merge --auto --squash
```

สั่งทันที ไม่ต้องรอ CI ไม่ต้องวน until-loop

- [ ] **Step 4: ยืนยันว่า DEV รับ create ที่ไม่มี code**

หลัง auto-deploy ของ `main` เสร็จ (build.yml ขึ้น DEV อัตโนมัติ และ job migrate ลาก migration ให้เอง) ยิง:

```bash
curl -sS -X POST "https://dev.blueledgers.com:4001/api-system/business-units" \
  -H "Authorization: Bearer <token>" \
  -H "x-app-id: <app id ของ carmen-platform>" \
  -H "Content-Type: application/json" \
  -d '{"cluster_id":"<cluster ที่มีโควตา BU เหลือ>","name":"Auto Code Probe","is_hq":false,"is_active":true}'
```

คาดหวัง: HTTP 201 พร้อม `id` ใน response แล้ว `GET /api-system/business-units/<id>` คืน `code` รูปแบบ `BU-XXXXXXXX`

**ห้ามอนุมานว่า deploy สำเร็จจากการที่ workflow เขียว** — ยิง endpoint จริงตามข้างบนเท่านั้น ถ้าคืน `code field is required` แปลว่า gateway ยังเป็นของเก่า รอแล้วยิงซ้ำ

- [ ] **Step 5: ลบ BU ที่ใช้ทดสอบ**

ลบ BU ตัวที่สร้างใน Step 4 ออกจาก DEV ผ่าน `DELETE /api-system/business-units/<id>` เพื่อไม่ให้กินโควตา BU ของคลัสเตอร์นั้นค้างไว้

---

### Task 6: Frontend — ซ่อนช่อง Code ในหน้า new และล็อกในหน้า Edit

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:223`
- Modify: `src/pages/BusinessUnitEdit.tsx` (บรรทัด ~421, 448, 480)
- Modify: `src/pages/BusinessUnitEdit.test.tsx:153-188`

**Interfaces:**
- Consumes: สัญญาใหม่ของ `POST /api-system/business-units` จาก Task 3 ที่ยืนยันบน DEV แล้วใน Task 5
- Produces: ไม่มีอะไรที่งานถัดไปเรียกใช้

- [ ] **Step 1: เปลี่ยนช่อง Code ให้เป็นแถว read-only ที่ซ่อนตอน isNew**

ใน `src/pages/businessUnitEdit/BusinessUnitDocument.tsx` แทนที่บรรทัด 223:

```tsx
              {inline('code', t('common.field.code'), { mono: true, width: 'xs', validate: true, required: true, maxLength: 20 })}
```

ด้วย:

```tsx
              {/* code เป็นรหัสที่แพลตฟอร์มตั้งตอนสร้าง ไม่ใช่ช่องกรอก — หน้า new จึงไม่มีอะไรจะแสดง
                  (แถวยังไม่เกิด รหัสจึงยังไม่มี) และหน้า edit แสดงอย่างเดียวแก้ไม่ได้ เพราะ
                  backend เพิกเฉยต่อ code ที่ส่งมาใน update อยู่แล้ว การเปิดให้พิมพ์ได้จะเป็นช่อง
                  ที่รับค่าแล้วทิ้ง หน้า cluster-admin ถอดช่องนี้ออกด้วยเหตุผลเดียวกัน (BusinessUnitForm.tsx:42)
                  ไม่ใช่ InlineField: ไม่มีอะไรให้กดเข้าโหมดแก้ — รูปเดียวกับแถว maxUsers ข้างล่าง */}
              {!isNew && (
                <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[150px_1fr] sm:items-start sm:gap-3">
                  <span className="text-muted-foreground pt-2 text-xs">{t('common.field.code')}</span>
                  <div className="min-w-0">
                    <ReadOnlyText value={f.code} className="max-w-[14rem] font-mono" />
                  </div>
                </div>
              )}
```

`ReadOnlyText` ถูก import อยู่แล้วที่บรรทัด 10 และ `isNew` เป็น prop ที่ destructure ไว้แล้วที่บรรทัด 84 ไม่ต้องเพิ่มอะไร

- [ ] **Step 2: ถอด `code` ออกจาก validation ของหน้า**

ใน `src/pages/BusinessUnitEdit.tsx` ลบสองบรรทัดนี้ออกจาก `validateRequired()` (บรรทัด 448–449):

```ts
    if (!formData.code.trim()) errs.code = t('common.validation.requiredMessage', { label: t('common.field.code') });
    else errs.code = validateField('code', formData.code, undefined, t);
```

แล้วแก้คอมเมนต์เหนือฟังก์ชัน (บรรทัด 443) จาก `Backend requires cluster_id, code, name` เป็น:

```ts
    // Backend requires cluster_id + name (is_hq/is_active always sent). `code` ไม่อยู่ในนี้แล้ว —
    // แพลตฟอร์มเป็นคนตั้งให้ตอนสร้าง ผู้ใช้ไม่มีช่องให้กรอกและไม่มีอะไรให้ตรวจ
```

- [ ] **Step 3: ถอด `code` ออกจากรายการ "ยังขาดอะไร"**

ที่บรรทัด 480 ลบ:

```ts
    if (!formData.code.trim()) missing.push(t('common.field.code'));
```

แล้วแก้ dependency array ของ `useMemo` ที่บรรทัด 483 จาก `[formData.name, formData.code, formData.cluster_id, t]` เป็น:

```ts
  }, [formData.name, formData.cluster_id, t]);
```

- [ ] **Step 4: ไม่ส่ง `code` ใน payload ทั้งสองเส้นทาง**

ใน `buildPayload` (บรรทัด ~421) ต่อท้ายกลุ่ม `delete payload.*` ที่มีอยู่:

```ts
    // code ไม่เคยมาจากผู้ใช้อีกแล้ว: ตอนสร้างมันว่าง (backend เป็นคนตั้ง) ตอนแก้มันคือค่าที่โหลด
    // มาแล้วส่งกลับไปเฉย ๆ ซึ่ง backend เพิกเฉยอยู่แล้ว ตัดออกทั้งสองทางเพื่อไม่ให้ payload
    // อ้างว่ากำลังตั้งค่าที่มันตั้งไม่ได้
    delete payload.code;
```

- [ ] **Step 5: ปรับ test เดิมสองเคสที่ยึดกับ Code ที่ผู้ใช้พิมพ์**

ใน `src/pages/BusinessUnitEdit.test.tsx`:

**(ก)** ลบเคส `blocks create when the required code is missing, without calling the API` (บรรทัด 153–167) ทั้งเคส — สิ่งที่มันยืนยันไม่ใช่พฤติกรรมของระบบอีกต่อไป

**(ข)** ในเคส `creates when required fields are present` ลบสองบรรทัดที่กรอก Code (บรรทัด 179–181):

```ts
    await user.click(screen.getByRole('button', { name: /^set code…$/i }));
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'BU9');
    await user.tab();
```

แล้วแก้ assertion ของ payload (บรรทัด 186–188) จาก:

```ts
    expect(asMock(businessUnitService.create).mock.calls[0][0]).toMatchObject({
      code: 'BU9', name: 'New BU', cluster_id: 'c1',
    });
```

เป็น:

```ts
    expect(asMock(businessUnitService.create).mock.calls[0][0]).toMatchObject({
      name: 'New BU', cluster_id: 'c1',
    });
    // code ไม่อยู่ใน payload อีกแล้ว — แพลตฟอร์มเป็นคนตั้งให้ตอนสร้าง
    expect(asMock(businessUnitService.create).mock.calls[0][0]).not.toHaveProperty('code');
```

- [ ] **Step 6: typecheck + lint + test**

```bash
bun run typecheck
bun run lint
bun run test
```

คาดหวัง: ผ่านทั้งสามอย่าง ถ้า vite-plugin-checker โชว์ error ที่ขัดกับผลของ `bun run typecheck` ให้ restart dev server ก่อนเชื่อ — overlay ค้างเป็นอาการที่เคยหลอกมาแล้ว

- [ ] **Step 7: Commit**

```bash
git add src/pages/businessUnitEdit/BusinessUnitDocument.tsx \
        src/pages/BusinessUnitEdit.tsx \
        src/pages/BusinessUnitEdit.test.tsx
git commit -m "$(cat <<'MSG'
feat(business-unit): เลิกให้ผู้ใช้กรอก code ตอนสร้าง BU

หน้า /business-units/new ไม่มีช่อง Code อีกแล้ว (แถวยังไม่เกิด รหัสจึงยังไม่มี)
และหน้า Edit แสดง code แบบอ่านอย่างเดียว สอดคล้องกับ backend ที่เป็นคนตั้งรหัสให้
ตอนสร้างและเพิกเฉยต่อ code ที่ส่งมาใน update

Claude-Session: https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP
MSG
)"
```

---

### Task 7: Frontend — PR, merge, ตรวจในเบราว์เซอร์ และขึ้น production

**Files:** ไม่มีการแก้โค้ด

**Interfaces:**
- Consumes: Task 6 และ DEV ที่ยืนยันแล้วใน Task 5
- Produces: ฟีเจอร์ที่ผู้ใช้จริงใช้ได้

- [ ] **Step 1: push และเปิด PR**

```bash
git push -u origin feature/bu-auto-code
gh pr create --base main --title "feat(business-unit): เลิกให้ผู้ใช้กรอก code ตอนสร้าง BU" --body-file <path ไปยังไฟล์ body ใน scratchpad>
```

body ต้องลงท้ายด้วย `https://claude.ai/code/session_013udKVp7Mq4GnwS1qWUmjmP` และต้องระบุว่า PR นี้พึ่ง PR ฝั่ง backend ที่ขึ้น DEV แล้ว

- [ ] **Step 2: merge**

```bash
gh pr merge --auto --squash
```

- [ ] **Step 3: ตรวจในเบราว์เซอร์บน DEV (desktop)**

`deploy-dev.yml` ขึ้นให้อัตโนมัติเมื่อ push `main` เปิด `https://dev.blueledgers.com:9902/business-units/new` แล้วยืนยันทีละข้อ:

1. ในกลุ่ม Details **ไม่มี**แถว Code และไม่มีปุ่ม "Set code…"
2. แถบข้อความ "ยังขาดอะไร" ไม่พูดถึง Code
3. กรอกแค่ชื่อกับ cluster แล้วกด Create — ผ่าน ไม่มี error เรื่อง code
4. หน้าเด้งไป `/business-units/<id>/edit` และกลุ่ม Details แสดงแถว Code เป็นรหัสรูปแบบ `BU-XXXXXXXX` แบบกดแล้วไม่เข้าโหมดแก้
5. ชิป code สีน้ำเงินบนแถบ tab ที่ปักด้านบนแสดงรหัสเดียวกัน

**อย่าเชื่อ curl กับ asset hash** เพื่อยืนยันว่า build ใหม่ขึ้นแล้ว — edge cache หลอกได้ ให้ดูจากพฤติกรรมในหน้าจริงตามข้างบน

- [ ] **Step 4: ตรวจที่ viewport 390px**

ตรวจข้อ 1 และ 4 ของ Step 3 ซ้ำที่ความกว้าง 390px ด้วยวิธี iframe probe (ไม่ใช่ `resize_window` ซึ่งใช้ไม่ได้) แถว Code ที่เพิ่มเข้าไปใช้ grid แบบเดียวกับแถว maxUsers ที่ตรวจผ่านมาแล้ว — ยืนยันว่ามันยุบเป็นสองบรรทัดไม่ดันหน้าให้เลื่อนแนวนอน

- [ ] **Step 5: ลบ BU ที่ใช้ทดสอบ**

ลบ BU ที่สร้างใน Step 3 ออกจาก DEV

- [ ] **Step 6: ขึ้น production**

```bash
git push origin main:vercel
```

merge เข้า `main` ไม่ได้ทำให้อะไรขึ้น Vercel — Vercel ผูกกับกิ่ง `vercel` เท่านั้น หลัง push แล้วยืนยันว่า build ของ Vercel สำเร็จจริง ไม่ใช่แค่ push ผ่าน

---

## Self-Review

**ความครอบคลุมเทียบ spec:**

| หัวข้อใน spec | งานที่รับผิดชอบ |
|---|---|
| §4.1 รูปแบบ code | Task 3 Step 1 |
| §4.2 unique ทั้งตาราง + ด่านตรวจข้อมูลซ้ำ | Task 1 (ด่าน) + Task 2 (index) |
| §4.3 DTO optional + generator + retry | Task 3 Step 2–4 |
| §4.4 code immutable | Task 4 |
| §4.5 การเปลี่ยนฝั่ง frontend ทั้ง 5 แถว | Task 6 Step 1–5 |
| §5 ลำดับ deploy | Task 5 (BE ก่อน) → Task 7 (FE หลัง) |
| §6 การตรวจ | Task 3 Step 5–6, Task 4 Step 2–3, Task 5 Step 1+4, Task 6 Step 6, Task 7 Step 3–4 |
| §7 สิ่งที่จงใจไม่ทำ | ไม่มีงานใดในแผนแตะ endpoint generate-code, การเดา code ฝั่ง FE, code ของ BU เดิม หรือ alias_name |

**ความสอดคล้องของชื่อและชนิด:** `generateBusinessUnitCode()` (Task 3 Step 1) ถูกเรียกด้วยชื่อเดียวกันใน Task 3 Step 4 · `business_unit_code_deleted_at_u` สะกดตรงกันใน Task 2 Step 1, 2, 4 · `MAX_CODE_ATTEMPTS` ประกาศและใช้ใน Task 3 Step 4 · `ReadOnlyText` และ `isNew` ใน Task 6 Step 1 มีอยู่จริงในไฟล์แล้ว (บรรทัด 10 และ 84)

**หมายเหตุความเสี่ยงที่แผนนี้ไม่ได้ปิด:** Task 1 อาจล้ม ซึ่งจะทำให้ Task 2 เป็นโมฆะและต้องกลับไปเลือกทางใหม่กับผู้ใช้ นี่คือความไม่แน่นอนเดียวที่เหลืออยู่ในแผน และเป็นเหตุผลที่มันเป็น Task แรก
