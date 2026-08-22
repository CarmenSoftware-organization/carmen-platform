# Audit Metadata ทุกส่วนของแอป — แผน implementation (Backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ 7 controller ที่ยังไม่ส่งข้อมูล audit กลับมา ส่งกลับมาในรูป `audit: { created, updated }` ที่ resolve ชื่อผู้ใช้แล้ว

**Architecture:** gateway มีกลไกครบอยู่แล้ว — `EnrichAuditUsersContextInterceptor` อ่าน metadata จาก decorator `@EnrichAuditUsers()` แล้วเรียก `EnrichmentService` แปลง `created_by_id` (UUID) เป็นชื่อคนผ่าน `mutateToAuditShape` งานคือ **ติด decorator ให้ครบ** และทำให้ข้อมูลดิบเดินทางมาถึง gateway ได้ ซึ่งบาง microservice ยังไม่ `select` คอลัมน์ audit ออกมาจาก DB

**Tech Stack:** NestJS · Prisma · Zod · Turborepo · Jest · Bun

**Spec:** `docs/superpowers/specs/2026-08-22-audit-metadata-everywhere-design.md` (เฟส D และข้อ 4)
สำเนา spec อยู่ใน repo `carmen-platform` — เปิดอ่านจากที่นั่น

**Repo ที่ทำงาน:** `carmen-turborepo-backend-v2` (ไม่ใช่ repo ที่ spec อยู่)

---

## ตัวบล็อกก่อนเริ่ม

> **ห้ามเริ่มแผนนี้จนกว่าแผน frontend จะ merge และ deploy ขึ้น DEV เรียบร้อย**

เหตุผล (spec ข้อ 4.3): `mutateToAuditShape` ทำ `delete target[at]` ทุกครั้ง
(`apps/backend-gateway/src/common/enrichment/audit-shape.ts:101-102`) พอติด decorator
ฟิลด์แบน `created_at` จะ **หายจาก response ทันที** หน้าเว็บที่ยังอ่านฟิลด์แบนตรง ๆ จะแสดง
ข้อมูลผิดโดยไม่มี error

หน้าที่พังถ้าทำผิดลำดับ: `PlatformConfigManagement.tsx` (อ่านฟิลด์แบน 7 จุด) และ
`DatabasePoolManagement.tsx` (3 จุด)

**วิธีตรวจว่าปลดบล็อกแล้ว** — ต้องดูจากพฤติกรรมที่ตาเห็น ไม่ใช่จากชื่อไฟล์ asset
(asset hash ที่ได้จาก `curl` อาจเป็นของที่ค้างใน edge cache ไม่ใช่ของที่ผู้ใช้เห็นจริง):

1. เปิดเว็บ DEV หน้า `/clusters` **ในเบราว์เซอร์จริง** แล้วดูคอลัมน์ Created

   - เห็น `5mo ago` → FE ใหม่ขึ้นแล้ว **ปลดบล็อก ทำแผนนี้ได้**
   - เห็น `2026-03-12 14:22:07` → ยังเป็น FE เก่า **ห้ามเริ่ม**

   คอลัมน์นี้เปลี่ยนรูปเวลาเฉพาะเมื่อ `AuditMeta` ทำงานจริง จึงเป็นหลักฐานว่า
   `normalizeAudit` อยู่ใน bundle ที่รันอยู่ ไม่ใช่แค่ไฟล์ถูกอัปโหลดขึ้นไป

2. ยืนยันซ้ำว่า PR ฝั่ง FE merge แล้ว:

```bash
gh pr list --repo CarmenSoftware-organization/carmen-platform --state merged --limit 5 \
  --json title,mergedAt --jq '.[] | select(.title | contains("audit"))'
```

ต้องผ่าน **ทั้งสองข้อ** — ข้อ 2 อย่างเดียวไม่พอ เพราะ merge แล้วไม่ได้แปลว่า deploy แล้ว
(`.github/workflows/deploy-gcs.yml` ของ carmen-platform ทริกเกอร์ด้วย `workflow_dispatch`
อย่างเดียว — ไม่มีอะไร deploy อัตโนมัติ ต้องมีคนกดเอง)

## Global Constraints

- **ข้ามการเขียนเทสต์ใหม่** ตาม CLAUDE.md ส่วนตัวของผู้ใช้ — แต่ **เทสต์ที่มีอยู่ต้องยังผ่าน**
  **implementer subagent ไม่ได้รับ preference นี้มาเอง — ต้องบอกมันตรง ๆ ทุกครั้งที่ dispatch**
- **`bun run lint` ของ gateway มี `--fix` ติดมาด้วย** (`apps/backend-gateway/package.json:21`)
  มันเขียนทับไฟล์ทั้ง repo ไม่ใช่แค่ที่แก้ — รัน `git status` หลัง lint ทุกครั้ง และ **commit เฉพาะ
  ไฟล์ที่ตั้งใจแก้** ห้าม `git add -A`
- **jest ค้างถ้าไม่ใส่ flag** — ใช้ `--runInBand --forceExit` เสมอ (LokiTransport ไม่ปิด handle)
- **แผนนี้ไม่มี migration** ตรวจก่อน push ทุกครั้งว่าไม่มีไฟล์ใหม่ใน `prisma/migrations/`
  เพราะการ push กิ่งที่มี migration จะ apply ลง DEV ภายใน ~2 นาทีโดยไม่ต้อง merge
- **push เข้า `main` จะ auto-deploy DEV** — ทำงานบนกิ่ง `feature/audit-metadata-backend` เท่านั้น
- **ห้ามแตะ `mutateToAuditShape` หรือ interceptor** — มันทำงานถูกอยู่แล้ว งานนี้แค่เรียกใช้
- ทุก controller ต้อง import `EnrichAuditUsers` จาก `@/common` (ไม่ใช่ path ยาว)

---

## File Structure

### แก้ที่ gateway (7 controller + 7 response DTO)

| ไฟล์ | แก้อะไร |
|---|---|
| `apps/backend-gateway/src/platform/platform_email-settings/platform_email-settings.controller.ts` | ติด `@EnrichAuditUsers()` |
| `apps/backend-gateway/src/platform/platform_email-settings/swagger/response.ts` | เพิ่ม `audit?: AuditDto` |
| `apps/backend-gateway/src/platform/platform_database-pools/…` | เหมือนกัน |
| `apps/backend-gateway/src/platform/platform_configs/…` | เหมือนกัน |
| `apps/backend-gateway/src/platform/platform_cluster-licenses/…` | เหมือนกัน |
| `apps/backend-gateway/src/platform/platform_business-unit-licenses/…` | เหมือนกัน |
| `apps/backend-gateway/src/platform/platform_subscriptions/…` | เหมือนกัน |
| `apps/backend-gateway/src/platform/application-role-permissions/…` | เหมือนกัน |

### แก้ที่ microservice (4 service ที่ยังไม่ select audit)

| ไฟล์ | แก้อะไร |
|---|---|
| `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts` | เพิ่ม 4 คอลัมน์ใน `select` + interface + mapper |
| `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts` | เหมือนกัน |
| `apps/micro-business/src/subscription/subscription.service.ts` | เหมือนกัน |
| `apps/micro-business/src/authen/role_permission/role_permission.service.ts` | เหมือนกัน — select ของ mapping table อยู่บรรทัด 52-63 และอีกจุดที่ 133-140 |

**ไม่ต้องแก้ service ของ 3 ตัวนี้** — ตรวจแล้วว่า `select` มีครบอยู่แล้ว:
`email-sender-profile.service.ts:24-27` · `database-pool.service.ts` · `platform-config.service.ts`

---

## Task 1: 3 controller ที่ service พร้อมอยู่แล้ว

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform_email-settings/platform_email-settings.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_email-settings/swagger/response.ts`
- Modify: `apps/backend-gateway/src/platform/platform_database-pools/platform_database-pools.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_database-pools/swagger/response.ts`
- Modify: `apps/backend-gateway/src/platform/platform_configs/platform_configs.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_configs/swagger/response.ts`

**Interfaces:**
- Consumes: `EnrichAuditUsers` จาก `@/common` · `AuditDto` จาก `@/common/dto`
- Produces: response ของ 3 controller นี้มี `audit?: { created?: {...}; updated?: {...} }`

**แม่แบบที่ทำถูกแล้ว:** `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts:46,88,149,221,292`

- [ ] **Step 1: ติด decorator ที่ email-settings**

เพิ่ม `EnrichAuditUsers` เข้า import ที่มีอยู่แล้ว — บรรทัด 7 ปัจจุบันคือ:

```ts
import { BaseHttpController, Result, ErrorCode } from '@/common';
```

เปลี่ยนเป็น:

```ts
import { BaseHttpController, Result, ErrorCode, EnrichAuditUsers } from '@/common';
```

ติด `@EnrichAuditUsers()` บน **4 route ที่คืน record** — วางไว้ใต้ `@RequirePlatformPermission(...)`:

| route | ติดไหม |
|---|---|
| `@Get()` (list) | ✅ ติด |
| `@Get(':email_setting_id')` (detail) | ✅ ติด |
| `@Post()` (create) | ✅ ติด |
| `@Put(':email_setting_id')` (update) | ✅ ติด |
| `@Delete(':email_setting_id')` | ❌ ไม่ติด — คืนแค่ id |
| `@Post(':email_setting_id/test')` | ❌ ไม่ติด — คืนผลส่งเมล ไม่ใช่ record |

ตัวอย่างที่ `@Get()`:

```ts
  @Get()
  @UseGuards(new AppIdGuard('email-setting.list'), PlatformPermissionGuard)
  @RequirePlatformPermission('email_setting.read')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
```

> **ไม่ต้องส่ง `paths`** — ค่า default คือ `['']` ซึ่งหมายถึง root payload หรือแต่ละ element
> ของ root array ตรงกับรูป response ของ controller เหล่านี้ (`BaseHttpController` ห่อเป็น
> `response.data`) ส่ง `paths` เฉพาะเมื่อ record ซ้อนอยู่ใต้ key อื่น เช่น
> `user-platform-roles.controller.ts:94` ที่ใช้ `{ paths: ['roles'] }`

- [ ] **Step 2: เพิ่ม `audit` เข้า response DTO ของ email-settings**

เปิด `apps/backend-gateway/src/platform/platform_email-settings/swagger/response.ts`
เพิ่ม import และ property ตามแม่แบบที่ `platform_clusters/swagger/response.ts:2,53-54`:

```ts
import { AuditDto } from '@/common/dto';
```

แล้วเติมใน class ของ `EmailSettingResponseDto`:

```ts
  @ApiPropertyOptional({ description: 'Audit metadata (timestamps + resolved user names)', type: () => AuditDto })
  audit?: AuditDto;
```

ถ้า DTO เดิมประกาศ `created_at` / `updated_at` เป็น property ไว้ **ให้ลบทิ้ง** เพราะ
`mutateToAuditShape` ลบฟิลด์เหล่านั้นออกจาก response จริง การคาไว้ใน swagger จะโกหกผู้อ่าน

- [ ] **Step 3: ทำแบบเดียวกันกับ database-pools**

route ที่ต้องติด: `@Get()` · `@Get(':database_pool_id')` · `@Post()` · `@Put(':database_pool_id')`
ไม่ติด: `@Delete(':database_pool_id')`

- [ ] **Step 4: ทำแบบเดียวกันกับ platform-configs**

route ที่ต้องติด: `@Get()` · `@Get(':config_key')` · `@Put(':config_key')` · `@Patch(':config_key')`

- [ ] **Step 5: static check**

รัน:

```bash
cd apps/backend-gateway && bun run check-types
```

คาดหวัง: ไม่มี error

- [ ] **Step 6: lint แล้วตรวจว่ามันไม่ไปแก้ไฟล์อื่น**

รัน:

```bash
cd apps/backend-gateway && bun run lint
cd ../.. && git status --short
```

คาดหวัง: `git status` ต้องแสดง **เฉพาะ 6 ไฟล์ที่ตั้งใจแก้**
ถ้ามีไฟล์อื่นโผล่มา นั่นคือผลงานของ `--fix` — ให้ `git checkout` ไฟล์เหล่านั้นคืน

- [ ] **Step 7: รันเทสต์ที่มีอยู่**

รัน:

```bash
cd apps/backend-gateway && bun run test --runInBand --forceExit
```

คาดหวัง: PASS — โดยเฉพาะ `platform_configs.controller.spec.ts` ที่มีอยู่แล้ว
ถ้าค้างเกิน 2 นาที ให้ Ctrl-C แล้วตรวจว่าใส่ `--forceExit` แล้วจริง

- [ ] **Step 8: commit**

```bash
git add apps/backend-gateway/src/platform/platform_email-settings \
        apps/backend-gateway/src/platform/platform_database-pools \
        apps/backend-gateway/src/platform/platform_configs
git commit -m "feat(audit): ติด @EnrichAuditUsers ให้ email-settings, database-pools, platform-configs"
```

---

## Task 2: ใบ license สองชนิด (ต้องแก้ select ด้วย)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts`
- Modify: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts`
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/swagger/response.ts`
- Modify: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_business-unit-licenses/swagger/response.ts`

**Interfaces:**
- Consumes: `EnrichAuditUsers`, `AuditDto` (Task 1)
- Produces: response ของสองใบนี้มี `audit`

**กับดักที่ต้องระวัง — select อย่างเดียวไม่พอ**

`cluster-license.service.ts:492-505` มี `select` ที่เลือก `created_at: true` อยู่แล้วแต่ขาดอีก 3
คอลัมน์ **และที่สำคัญกว่านั้น** บรรทัด 509 มี `.map()` ที่แปลงแถวดิบเป็น
`IClusterLicenseListRow` — ถ้าเพิ่ม select แต่ไม่เพิ่มใน interface กับ mapper
**ข้อมูลจะหายเงียบ ๆ ตรงนั้น** ไม่มี error ให้เห็น

- [ ] **Step 1: เพิ่ม 3 คอลัมน์ที่ขาดใน select ของ cluster-license**

ที่ `cluster-license.service.ts:492-505` เปลี่ยนบล็อก select เป็น:

```ts
        select: {
          id: true,
          cluster_id: true,
          license_number: true,
          licensed_bus: true,
          start_date: true,
          end_date: true,
          reference_no: true,
          note: true,
          doc_version: true,
          created_at: true,
          created_by_id: true,
          updated_at: true,
          updated_by_id: true,
          tb_cluster: { select: { code: true, name: true } },
        },
```

ทำแบบเดียวกันกับบล็อก select ที่บรรทัด 564 (route detail)

- [ ] **Step 2: เพิ่มฟิลด์เข้า interface และ mapper**

หา interface `IClusterLicenseListRow` (typecheck จะชี้ให้เองว่าอยู่ไฟล์ไหน) แล้วเพิ่ม:

```ts
  created_at?: Date | string | null;
  created_by_id?: string | null;
  updated_at?: Date | string | null;
  updated_by_id?: string | null;
```

แล้วในบล็อก `.map((r) => ({ ... }))` ที่บรรทัด 509 เพิ่ม:

```ts
        created_at: r.created_at,
        created_by_id: r.created_by_id,
        updated_at: r.updated_at,
        updated_by_id: r.updated_by_id,
```

> ต้องเป็นชื่อ **`created_by_id`** ไม่ใช่ `created_by` — `mutateToAuditShape` มองหาชื่อนี้เป๊ะ
> (`audit-shape.ts:2` `AUDIT_BY_ID_FIELDS`)

- [ ] **Step 3: ทำแบบเดียวกันกับ business-unit-license.service.ts**

บล็อก select อยู่ที่บรรทัด 455 และ 537 — โครงสร้างซ้อนลึกกว่า (มี `tb_cluster` ซ้อนสองชั้น)
ให้เพิ่ม 4 คอลัมน์ **ที่ระดับบนสุดของ select เท่านั้น** ไม่ต้องเพิ่มในบล็อกซ้อน

- [ ] **Step 4: ติด decorator ที่ gateway ทั้งสอง controller**

`platform_cluster-licenses.controller.ts` — route ที่ต้องติด:
`@Get()` (มีสองอัน — ติดทั้งคู่) · `@Get(':id')` · `@Post()` · `@Patch(':id')`
ไม่ติด: `@Delete(':id')`

`platform_business-unit-licenses.controller.ts` — route เดียวกันทุกประการ

- [ ] **Step 5: เพิ่ม `audit` เข้า response DTO ทั้งสอง**

pattern เดียวกับ Task 1 Step 2

- [ ] **Step 6: static check ทั้ง monorepo**

รัน:

```bash
bun run check-types
```

คาดหวัง: ไม่มี error
> **ระวัง:** `check-types` ที่ root ข้ามบางแอป — ถ้าไม่แน่ใจ ให้รันตรงในแอปที่แก้ด้วย:
> `cd apps/micro-cluster && bun run check-types`

- [ ] **Step 7: lint และตรวจไฟล์ที่ถูกแก้**

```bash
cd apps/backend-gateway && bun run lint
cd ../micro-cluster && bun run lint
cd ../.. && git status --short
```

คาดหวัง: เฉพาะ 6 ไฟล์ที่ตั้งใจแก้

- [ ] **Step 8: รันเทสต์ที่มีอยู่**

```bash
cd apps/backend-gateway && bun run test --runInBand --forceExit
cd ../micro-cluster && bun run test --runInBand --forceExit
```

คาดหวัง: PASS — `platform_business-unit-licenses.controller.spec.ts` มีอยู่แล้ว

- [ ] **Step 9: commit**

```bash
git add apps/micro-cluster/src/cluster/cluster-license \
        apps/micro-cluster/src/cluster/business-unit-license \
        apps/backend-gateway/src/platform/platform_cluster-licenses \
        apps/backend-gateway/src/platform/platform_business-unit-licenses
git commit -m "feat(audit): ใบ license สองชนิดส่ง audit กลับมา (select + mapper + decorator)"
```

---

## Task 3: subscriptions

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts`
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/swagger/response.ts`

**Interfaces:**
- Consumes: `EnrichAuditUsers`, `AuditDto` (Task 1)
- Produces: response ของ subscription มี `audit`

- [ ] **Step 1: เพิ่ม 4 คอลัมน์ใน select ของ subscription.service.ts**

หาบล็อก `select` ของ `tb_subscription` ด้วย:

```bash
grep -n "tb_subscription.findMany\|tb_subscription.findUnique\|tb_subscription.findFirst" -A 25 \
  apps/micro-business/src/subscription/subscription.service.ts
```

เพิ่มในทุกบล็อกที่คืน record ให้ผู้ใช้เห็น:

```ts
          created_at: true,
          created_by_id: true,
          updated_at: true,
          updated_by_id: true,
```

**อย่าลืม mapper** — ถ้ามี `.map()` แปลงเป็น interface ต้องเพิ่ม 4 ฟิลด์ทั้งใน interface
และใน mapper เหมือน Task 2 Step 2 (typecheck จะไม่เตือน ถ้า interface ใช้ optional field)

- [ ] **Step 2: ติด decorator**

route ที่ต้องติด: `@Get('subscriptions')` · `@Get('subscriptions/:id')` · `@Post('subscriptions')` ·
`@Patch('subscriptions/:id')` · `@Put('subscriptions/:id/features')`
ไม่ติด: `@Get('license-features')` (เป็น catalog ไม่ใช่ record ของผู้ใช้) · `@Delete('subscriptions/:id')`

- [ ] **Step 3: เพิ่ม `audit` เข้า response DTO**

pattern เดียวกับ Task 1 Step 2

- [ ] **Step 4: static check**

```bash
cd apps/micro-business && bun run check-types
cd ../backend-gateway && bun run check-types
```

คาดหวัง: ไม่มี error

- [ ] **Step 5: lint และตรวจไฟล์**

```bash
cd apps/backend-gateway && bun run lint
cd ../micro-business && bun run lint
cd ../.. && git status --short
```

คาดหวัง: เฉพาะ 3 ไฟล์ที่ตั้งใจแก้

- [ ] **Step 6: รันเทสต์**

```bash
cd apps/backend-gateway && bun run test --runInBand --forceExit
cd ../micro-business && bun run test --runInBand --forceExit
```

คาดหวัง: PASS — `platform_subscriptions.controller.spec.ts` มีอยู่แล้ว
> micro-business มี 355 test suite — ใช้เวลานาน ให้รอจนจบ อย่า Ctrl-C

- [ ] **Step 7: commit**

```bash
git add apps/micro-business/src/subscription apps/backend-gateway/src/platform/platform_subscriptions
git commit -m "feat(audit): subscription ส่ง audit กลับมา"
```

---

## Task 4: application-role-permissions

**Files:**
- Modify: `apps/micro-business/src/authen/role_permission/role_permission.service.ts`
- Modify: `apps/backend-gateway/src/platform/application-role-permissions/application-role-permissions.controller.ts`
- Modify: `apps/backend-gateway/src/platform/application-role-permissions/swagger/response.ts`

**Interfaces:**
- Consumes: `EnrichAuditUsers`, `AuditDto` (Task 1)
- Produces: response ของสองเส้นทาง GET มี `audit` ต่อรายการสิทธิ์

**ทำไมต้องทำทั้งที่เป็น mapping table:** "ใครให้สิทธิ์ใครเมื่อไหร่" คือคำถามความปลอดภัยตัวจริง
และ `tb_application_role_tb_permission` มี audit column ครบทั้ง 4 อยู่แล้วใน schema

- [ ] **Step 1: เพิ่ม 4 คอลัมน์ใน select ของ mapping table**

เปิด `apps/micro-business/src/authen/role_permission/role_permission.service.ts`
บล็อกที่บรรทัด 52-63 ปัจจุบันเป็น:

```ts
          tb_application_role_tb_permission: {
            select: {
              permission_id: true,
              tb_permission: {
                select: {
                  action: true,
                  resource: true,
                  description: true,
                },
              }
            }
          }
```

เปลี่ยนเป็น:

```ts
          tb_application_role_tb_permission: {
            select: {
              permission_id: true,
              created_at: true,
              created_by_id: true,
              updated_at: true,
              updated_by_id: true,
              tb_permission: {
                select: {
                  action: true,
                  resource: true,
                  description: true,
                },
              }
            }
          }
```

> 4 คอลัมน์ต้องอยู่ในระดับของ `tb_application_role_tb_permission` **ไม่ใช่** ใน
> `tb_permission` ที่ซ้อนอยู่ข้างใน — เพราะ audit ที่เราต้องการคือ "ใครผูกสิทธิ์นี้เข้ากับ role นี้"
> ไม่ใช่ "ใครสร้าง permission" (ซึ่งเป็น seed data)

ทำแบบเดียวกันกับบล็อก select อีกจุดที่บรรทัด 133-140

- [ ] **Step 2: เพิ่ม 4 ฟิลด์เข้า mapper**

ที่บรรทัด 74 มี mapper:

```ts
      permissions: response.tb_application_role_tb_permission.map((item) => ({
        permission_id: item.permission_id,
```

เพิ่มลงในนั้น:

```ts
        created_at: item.created_at,
        created_by_id: item.created_by_id,
        updated_at: item.updated_at,
        updated_by_id: item.updated_by_id,
```

**ถ้าไม่เพิ่มตรงนี้ ข้อมูลจะหายเงียบ ๆ** — select มาแล้วแต่ mapper ไม่ส่งต่อ ไม่มี error ให้เห็น

- [ ] **Step 3: ติด decorator พร้อม `paths`**

route ที่ต้องติด — **สองอันนี้ต้องส่ง `paths` ไม่ใช่ค่า default**:

```ts
  @Get('role/:roleId/permissions')
  @EnrichAuditUsers({ paths: ['permissions'] })
```

เพราะ service คืนรูป `{ id, application_role_name, permissions: [...] }` (บรรทัด 71-75)
record ที่มี audit อยู่ใต้ key `permissions` ไม่ใช่ที่ root ถ้าใช้ค่า default `['']`
interceptor จะไปมองหา `created_by_id` ที่ตัว role แทนที่จะเป็นแต่ละรายการสิทธิ์ แล้วไม่เจออะไรเลย

`@Get('permission/:permissionId/roles')` — เปิดอ่าน service ที่ตอบ route นี้ว่าคืน record
ไว้ใต้ key ชื่ออะไร แล้วใส่ `paths` ให้ตรง (คาดว่าเป็น `['roles']` แต่ต้องยืนยันก่อน)

ไม่ติด: `@Post('assign-permissions')` · `@Post('assign-permission')` ·
`@Delete('remove-permissions')` · `@Delete('remove-permission')` — คืนผลการกระทำ ไม่ใช่ record

- [ ] **Step 4: เพิ่ม `audit` เข้า response DTO**

pattern เดียวกับ Task 1 Step 2

- [ ] **Step 5: static check + lint + test**

```bash
cd apps/micro-business && bun run check-types
cd ../backend-gateway && bun run check-types
cd ../backend-gateway && bun run lint && bun run test --runInBand --forceExit
cd ../micro-business && bun run lint && bun run test --runInBand --forceExit
cd ../.. && git status --short
```

คาดหวัง: เขียวหมด และ `git status` แสดงเฉพาะไฟล์ที่ตั้งใจแก้
> micro-business มี 355 test suite — ใช้เวลานาน ให้รอจนจบ อย่า Ctrl-C

- [ ] **Step 6: commit**

```bash
git add apps/backend-gateway/src/platform/application-role-permissions
git commit -m "feat(audit): application-role-permissions ส่ง audit ต่อรายการสิทธิ์"
```

---

## Task 5: ตรวจงานรวมและ deploy

**Files:** ไม่แก้ไฟล์ — เป็น task ตรวจอย่างเดียว

- [ ] **Step 1: ยืนยันว่าครบทั้ง 7 controller**

```bash
for c in platform_email-settings platform_database-pools platform_configs \
         platform_cluster-licenses platform_business-unit-licenses \
         platform_subscriptions application-role-permissions; do
  f=$(find apps/backend-gateway/src/platform/$c -name "*.controller.ts" | head -1)
  echo "$(grep -c 'EnrichAuditUsers' "$f")  $c"
done
```

คาดหวัง: ทุกบรรทัดต้องมากกว่า 0

- [ ] **Step 2: ยืนยันว่าไม่มี migration หลุดเข้ามา**

```bash
git diff main --name-only | grep -i "migrations/" || echo "ไม่มี migration — ปลอดภัย"
```

คาดหวัง: `ไม่มี migration — ปลอดภัย`
ถ้ามี **หยุดทันที** — การ push กิ่งที่มี migration จะ apply ลง DEV ภายใน ~2 นาที

- [ ] **Step 3: ยืนยันว่า lint ไม่ได้เขียนทับไฟล์อื่น**

```bash
git diff main --name-only | wc -l
git diff main --name-only
```

คาดหวัง: ประมาณ 18-20 ไฟล์ ตรงกับที่ระบุใน File Structure
ถ้ามากกว่านั้นมาก ให้ตรวจว่าไฟล์ส่วนเกินคือผลงานของ `eslint --fix` แล้ว checkout คืน

- [ ] **Step 4: build ทั้ง monorepo**

```bash
bun run build
```

คาดหวัง: สำเร็จทุกแอป

- [ ] **Step 5: เปิด PR**

```bash
git push -u origin feature/audit-metadata-backend
gh pr create --title "feat(audit): 7 controller ส่ง audit metadata กลับมา" \
  --body "$(cat <<'BODY'
ทำตาม docs/superpowers/specs/2026-08-22-audit-metadata-everywhere-design.md เฟส D
(spec อยู่ใน repo carmen-platform)

ติด @EnrichAuditUsers() ให้ 7 controller ที่ยังไม่มี และเพิ่ม 4 คอลัมน์ audit เข้า select
ของ 4 microservice ที่ยังไม่ได้ดึงมา

**ต้อง deploy หลังจาก FE ขึ้นแล้วเท่านั้น** — mutateToAuditShape ลบฟิลด์แบน created_at
ออกจาก response หน้าที่ยังอ่านฟิลด์แบนตรง ๆ จะแสดงข้อมูลผิดโดยไม่มี error
PR ฝั่ง FE ที่ต้องขึ้นก่อน: carmen-platform "feat(audit): แสดง created/updated by+date ทุกส่วนของแอป"

ไม่มี migration ในกิ่งนี้

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0158iPRxEcTEQQMu7eKeyKQ9
BODY
)"
```

- [ ] **Step 6: ตรวจบน DEV หลัง merge**

หลัง merge เข้า main แล้ว backend จะ auto-deploy ลง DEV รอ deploy จบแล้วเปิดเว็บ DEV

| หน้า | ต้องเห็น |
|---|---|
| `/licenses` | คอลัมน์ Created / Updated ที่เคยว่างในเฟส C **เต็มขึ้นมาเอง** |
| `/email-settings` | บรรทัด compact ท้ายการ์ดมีข้อมูล |
| `/database-pools` | คอลัมน์ audit มีข้อมูล |
| `/platform-configs` | ข้อมูล audit **ยังอยู่ ไม่หายไป** — ถ้าหาย แปลว่า FE ที่ deploy อยู่ยังไม่มี `normalizeAudit` |

- [ ] **Step 7: ตรวจ response ดิบว่ารูปเปลี่ยนจริง**

ใน DevTools ที่หน้า `/licenses` ดู response ของ endpoint license

คาดหวัง: มี `audit: { created: { at, id, name } }` และ **ไม่มี** `created_at` แบน ๆ แล้ว
ถ้ายังมี `created_at` แบน แปลว่า decorator ไม่ทำงาน — ตรวจว่าติดถูก route ไหม

---

## สรุปการครอบคลุม spec

| หัวข้อ spec | Task ที่ทำ |
|---|---|
| 4.1 ตัดออก 5 controller | ไม่ทำอะไร — เป็นการตัดสินใจ ไม่ใช่งาน |
| 4.2 ระดับ "ง่าย" 3 ตัว | Task 1 |
| 4.2 ระดับ "ต้องแก้ select" — licenses 2 ตัว | Task 2 |
| 4.2 ระดับ "ต้องแก้ select" — subscriptions | Task 3 |
| 4.2 ระดับ "ต้องแก้ select" — application-role-permissions | Task 4 |
| 4.3 ลำดับ deploy FE ก่อน BE | ตัวบล็อกก่อนเริ่ม + Task 5 Step 5/6 |
| เฟส D — audit เต็มเองโดยไม่แตะ FE | Task 5 Step 6 |
| เฟส A, B, C | **ไม่อยู่ในแผนนี้** — อยู่ในแผน frontend |
