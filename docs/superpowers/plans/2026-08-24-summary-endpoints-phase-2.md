# Summary Endpoints Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม endpoint `/summary` เฉพาะทางให้ 5 resource แล้วย้าย 5 หน้าไปใช้ เพื่อตัดการดึงทั้งตาราง (`perpage: -1`) ออกทั้งหมด

**Architecture:** ทั้งห้ามี `buildXSummary(where)` อยู่แล้วในเมธอด list งานจึงเป็นการเดินสายไม่ใช่การคำนวณใหม่ — เพิ่มเมธอดใหม่ที่เรียก builder เดิมด้วย `where` ที่มีแต่ขอบเขตสิทธิ์ (หรือ `{}` เมื่อ resource ไม่ผูก scope) แล้วเปิดเป็น route ใหม่ที่ไม่รับ query ตัวกรอง **implementation ต้นแบบ merged อยู่บน `main` แล้ว** (`/api-system/clusters/summary`) ทุก task อ้างอิงมันโดยตรง

**Tech Stack:** NestJS + Prisma + turborepo + bun (backend) · React + TypeScript + Vite + Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-08-24-summary-endpoints-phase-2-design.md`

## Global Constraints

- **repo:** backend `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` · frontend `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`
- **branch:** `feature/summary-endpoints-phase-2` ทั้งสอง repo
- **ห้ามเขียนเทสต์ใหม่** — ห้ามสร้าง `*.spec.ts` / `*.test.ts(x)` ใหม่ ห้ามเพิ่ม test case (preference ของผู้ใช้ overrides TDD) ชุดเดิมต้องไม่แดงเพิ่ม
- **ห้ามแตะเมธอด list เดิมของ resource ใดๆ** — `summary` ที่แนบมากับมันคงไว้ตามการตัดสินใจ #2 ของ spec เพราะ `/user-platform` และ `/licenses` ยังต้องใช้
- **`AppIdGuard` ต้องใช้ api_name เดิมของ route รายการนั้นๆ เท่านั้น** — ชื่อใหม่ที่ไม่อยู่ใน allowlist ตอบ **401** ซึ่ง client แยกจาก token หมดอายุไม่ออก แล้วจะ logout ผู้ใช้ · ตารางชื่อที่ถูกอยู่ใน Task แต่ละอัน
- **route `/summary` ต้องประกาศเหนือ route `:id` ของ controller นั้น** เสมอ
- **route ใหม่ห้ามรับ `@Query()` ใดนอกจาก `version`**
- **ห้ามแก้ `packages/rpc-contract/src/contracts/*.ts` ด้วยมือ** — เป็นไฟล์ generated ต้องผ่าน 3 ขั้นที่หัวไฟล์บังคับ
- **`packages/rpc-contract` ถูก consume ผ่าน `dist/`** — หลังแก้ต้อง `bun run build:package` ใน package นั้นก่อน type-check ตัวที่ import ไม่งั้นได้ type error ปลอม **อย่าแก้โค้ดตาม error นั้น**
- **ห้ามรัน `bun run lint` ที่ root ของ backend** — เป็น `eslint --fix` ทั้ง repo
- **jest ของ backend ใช้ `bunx jest --runInBand --forceExit`** และ **แดงอยู่ก่อนแล้ว** บนเครื่องนี้ (micro-cluster 5 suites/41 tests จาก env `SYSTEM_DATABASE_URL` ไม่มี `schema=` · gateway crash ที่ `platform-migrations.controller.spec.ts`) เกณฑ์คือ **ไม่เพิ่มตัวแดงใหม่** ยืนยันด้วย `git stash` ถ้าชุดที่แดงเปลี่ยน
- **ห้าม merge หรือ push** — commit ลง branch แล้วหยุด
- ไม่แตะ DB / schema / migration / seed
- คอมเมนต์สองภาษาไทย-อังกฤษเป็น convention ของ backend repo · frontend ใช้ไทยเป็นหลัก

## Reference implementation — อ่านก่อนเริ่ม task ใดก็ตาม

`/api-system/clusters/summary` merged แล้วและเป็นต้นแบบของทุก task ในแผนนี้ อ่านสี่จุดนี้ให้ครบก่อนลงมือ:

| ชั้น | ไฟล์:บรรทัด |
|---|---|
| micro service | `apps/micro-cluster/src/cluster/cluster/cluster.service.ts:752` (`@TryCatch` + `async fleetSummary`) |
| micro controller | `apps/micro-cluster/src/cluster/cluster/cluster.controller.ts:128` |
| gateway service | `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts` → `getFleetSummary` |
| gateway controller | `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts:157` (`@Get('summary')`) |
| contract entry | `packages/rpc-contract/src/contracts/clusters.ts:22` |

**สิ่งที่ต้องยกมาทุกครั้ง:** `@TryCatch` บนเมธอด service · `handleResult` ไม่ใช่ `handlePaginatedResult` ที่ micro controller · gateway ส่งต่อด้วย `Result.ok(response.data)` · `@ApiStdResponse(<SummaryDto>, …)` · ไม่มี `@EnrichAuditUsers()`

---

## File Structure

### Backend — ต่อ resource แก้ 4-5 ไฟล์ รูปเดียวกันทุกตัว

| resource | contract | micro service | micro controller | gateway |
|---|---|---|---|---|
| news | `contracts/news.ts` (`News`) | `micro-cluster/src/cluster/news/news.service.ts` | `news.controller.ts` | `backend-gateway/src/application/news/` |
| application | `contracts/applications.ts` (`Applications`) | `cluster/application/application.service.ts` | `application.controller.ts` | `platform/applications/` |
| platform role | `contracts/platform-roles.ts` (`PlatformRoles`) | **`micro-business`**`/src/authen/platform_role/platform_role.service.ts` | `platform_role.controller.ts` | `platform/platform-roles/` |
| business unit | `contracts/business-units.ts` (`BusinessUnits`) | `cluster/business-unit/business-unit.service.ts` | `business-unit.controller.ts` | `platform/platform_business-units/` |
| user | `contracts/users.ts` (`Users`) | `cluster/user/user.service.ts` | `user.controller.ts` | `platform/platform-user/` |

### Frontend

| ไฟล์ | Task |
|---|---|
| `src/services/{application,businessUnit,news,role,user}Service.ts` | 6 |
| `src/pages/{Application,BusinessUnit,News,Role,User}Management.tsx` | 6 |
| `src/pages/*/[A-Z]*Summary.tsx` (ลบ `summarizeX` + เทสต์) | 7 |
| `agent-os/standards/pages/summary-band.md` | 7 |

**ทำไมแบ่งแบบนี้:** สาม resource ที่ไม่ผูก scope เป็นงานกลไกล้วน ส่วน `business-unit` และ `user` แบกความเสี่ยงด้านสิทธิ์และใช้ **predicate คนละรูป** จึงแยก task ให้ผู้รีวิวเพ่งทีละตัว · `platform_role` แยกเพราะอยู่คนละ app และ type ของมันไม่ export

---

### Task 1: `news` + `application` — endpoint สรุปสองตัวแรก (ไม่ผูก scope)

**Files:**
- Modify: `packages/rpc-contract/src/contracts/{news,applications}.ts` (ผ่าน generator)
- Modify: `apps/micro-cluster/src/cluster/news/news.{service,controller}.ts`
- Modify: `apps/micro-cluster/src/cluster/application/application.{service,controller}.ts`
- Modify: `apps/backend-gateway/src/application/news/news.{service,controller}.ts`
- Modify: `apps/backend-gateway/src/platform/applications/applications.{service,controller}.ts`
- Modify: swagger response DTO ของทั้งสอง

**Interfaces:**
- Consumes: `buildNewsSummary` (`news.service.ts:191` เรียกอยู่แล้ว) · `buildApplicationSummary` (`application.service.ts:139`) · type `NewsSummary` และ `ApplicationSummary` จาก `micro-cluster/src/common/helpers/summary.helper.ts` (:312, :261)
- Produces: route `GET /api/news/summary` และ `GET /api-system/applications/summary` · contract key — generator สร้างจาก **suffix หลังจุดของ cmd** (`clusters.find-all` → `findAll`, `clusters.fleet-summary` → `fleetSummary`) ดังนั้น `news.summary` → **`News.summary.pattern`** และ `applications.summary` → **`Applications.summary.pattern`** · **ยืนยันด้วย grep ใน Step 6 ก่อนใช้ อย่าเชื่อการอนุมานนี้**

**ค่าที่ต่างกันต่อ resource:**

| | news | application |
|---|---|---|
| cmd (literal ชั่วคราว) | `{ cmd: 'news.summary', service: 'news' }` | `{ cmd: 'applications.summary', service: 'applications' }` |
| service method | `newsSummary(): Promise<Result<NewsSummary>>` | `applicationSummary(): Promise<Result<ApplicationSummary>>` |
| builder call | `this.buildNewsSummary({})` | `this.buildApplicationSummary({})` |
| gateway `@Controller` | `/api/news` | `api-system/applications` |
| route | `@Get('summary')` | `@Get('summary')` |
| ต้องอยู่เหนือ | `@Get(':news_id')` `:153` | `@Get(':application_id')` `:176` |
| api_name (เดิม ห้ามเปลี่ยน) | `news.findAll` | `application.findAll` |
| permission decorator | *(ไม่มี — route รายการก็ไม่มี)* | `@RequirePlatformPermission('application.read')` |

**ทั้งสองไม่ผูก scope** — `where` เป็น `{}` คือคำตอบที่ถูก ไม่ใช่การละเลย

---

- [ ] **Step 1: อ่าน reference implementation ทั้งสี่จุด** (ตาราง Reference ด้านบน) — ทุก step ต่อจากนี้คือการยกรูปนั้นมาแทนค่า

- [ ] **Step 2: `news.service.ts` — เพิ่มเมธอด `newsSummary`**

วางต่อจากเมธอด list **นี่คือรูปเต็มที่ทุก task ในแผนนี้ยกไปใช้** — task หลังจากนี้จะอ้างถึง "รูปเดียวกับ Task 1 Step 2" แล้วระบุแค่ค่าที่ต่าง:

```ts
  /**
   * ค่าสรุปของทั้งชุด ไม่ขึ้นกับตัวกรองของรายการ
   * Whole-set aggregate, independent of the list's filters.
   *
   * `where` เป็น `{}` โดยตั้งใจ ไม่ใช่การละเลย — ข่าวเป็น resource ระดับแพลตฟอร์ม
   * ไม่มีขอบเขตสิทธิ์ให้รักษา ต่างจาก clusters / business-units / user ที่ต้องส่ง
   * scope ของผู้เรียกเข้าไป
   * An empty `where` is deliberate, not an omission: news is platform-wide and has no
   * caller scope to preserve, unlike clusters / business-units / user.
   *
   * ต่างจาก `summary` ที่แนบมากับเมธอด list ตรงที่ตัวนั้นผูกกับ search/advance ของคำขอ
   * (ถูกสำหรับรายการ ผิดสำหรับแถบที่อยู่เหนือตัวกรอง)
   * @returns Newsroom aggregate / ค่าสรุปของห้องข่าว
   */
  @TryCatch
  async newsSummary(): Promise<Result<NewsSummary>> {
    this.logger.debug({ function: 'newsSummary' }, NewsService.name);
    return Result.ok(await this.buildNewsSummary({}));
  }
```

ชื่อคลาสใน `this.logger.debug` ต้องเป็นของ service นั้นจริง — อ่านจากไฟล์ อย่าลอกตามตัวอย่าง

- [ ] **Step 3: `news.controller.ts` — เพิ่ม handler ด้วย literal ชั่วคราว**

```ts
  /**
   * คืนค่าสรุปของทั้งห้องข่าว ไม่ขึ้นกับตัวกรองของรายการ
   * Returns the whole-desk aggregate, independent of the list's filters.
   * @param payload - Microservice payload / ข้อมูล payload จาก microservice
   * @returns Microservice response with the newsroom summary
   */
  @MessagePattern({ cmd: 'news.summary', service: 'news' })
  async newsSummary(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'newsSummary', payload: payload }, NewsController.name);
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () => this.newsService.newsSummary());
    // handleResult ไม่ใช่ handlePaginatedResult — payload ไม่ใช่รายการและไม่มี `paginate`
    // handlePaginatedResult รู้จักคีย์ `summary` เป็นพิเศษและยกขึ้นบน envelope ใช้ผิดจะได้รูปซ้อน
    return this.handleResult(result);
  }
```

ชื่อ service property (`this.newsService`), ชื่อคลาส และการมีอยู่ของ `createAuditContext` ต้องตรวจกับไฟล์จริงก่อน — controller แต่ละตัวตั้งชื่อไม่เหมือนกัน

- [ ] **Step 4: `application.service.ts` — เพิ่มเมธอด `applicationSummary`**

รูปเดียวกับ Step 2 ทุกบรรทัด แทนค่า: ชื่อเมธอด `applicationSummary` · return `Promise<Result<ApplicationSummary>>` · เรียก `this.buildApplicationSummary({})` · คอมเมนต์เปลี่ยน "ข่าว" เป็น "แอปพลิเคชัน" · ชื่อคลาสใน logger อ่านจากไฟล์จริง

- [ ] **Step 5: `application.controller.ts` — เพิ่ม handler**

รูปเดียวกับ Step 3 แทนค่า: literal `@MessagePattern({ cmd: 'applications.summary', service: 'applications' })` · เรียก `this.applicationService.applicationSummary()` (ตรวจชื่อ property กับไฟล์จริง) · `handleResult` เหมือนกัน

- [ ] **Step 6: รัน generator แล้วแทน literal**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
grep -n "summary" packages/rpc-contract/src/contracts/news.ts packages/rpc-contract/src/contracts/applications.ts
```

แล้วแทน literal ทั้งสองด้วย contract reference **ตามชื่อ key ที่ grep แสดงจริง** — คาดว่าเป็น `News.summary.pattern` และ `Applications.summary.pattern` ตามกฎ suffix แต่ถ้า grep แสดงชื่ออื่นให้ใช้ตามนั้น **อย่าแก้ contract ให้ตรงกับที่แผนคาด**

**ปล่อยค่า `.rest()`/`.restTodo()` ตามที่ generator เขียน ห้ามแก้มือ**

- [ ] **Step 7: gateway — เพิ่มเมธอดใน service ทั้งสอง**

ยกรูปจาก `platform_clusters.service.ts` → `getFleetSummary` แทนค่า contract

**⚠️ news ต้อง presign รูป lead story** — `news.service.ts:130` ของ gateway เรียก `await attachNewsImageUrl(this.rpc, summary.latest, user_id)` สำหรับ route รายการ **เมธอดใหม่ต้องทำเหมือนกันก่อนคืนค่า** ไม่งั้นภาพในแถบ masthead หายเงียบๆ ตัวเลขถูกทุกตัว และไม่มีเทสต์ไหนจับ

- [ ] **Step 8: gateway — เพิ่ม route ทั้งสอง**

ยกรูปจาก `platform_clusters.controller.ts:157` แทนค่าตามตารางด้านบน

**ทั้งสอง controller มีแบบอย่างอยู่แล้ว** — `news.controller.ts` มี `@Get('tags')` ที่ `:127` และ `applications.controller.ts` มี `@Get('api-catalog')` ที่ `:123` วางก่อน route `:id` ของตัวเอง วางตัวใหม่ในตำแหน่งเดียวกัน

swagger: `@ApiStdResponse(<SummaryDto>, { description: 'Resource retrieved successfully' })` + `@ApiResponse` 400/401 (และ 403 เฉพาะ applications ที่มี `PlatformPermissionGuard`) — ลอกถ้อยคำจาก route รายการของ controller เดียวกัน

- [ ] **Step 9: audits**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:message-pattern-literal
bun run audit:app-api-catalog-drift
bun run audit:rest-contract
bun run swagger:verify
```

Expected: PASS ทุกตัว · `audit:message-pattern-literal` **ไม่มี allowlist** จะแดงถ้า Step 6 ยังไม่แทน literal · `audit:app-api-catalog-drift` ต้องผ่าน **โดยไม่ต้องรัน generator ใดๆ** เพราะใช้ api_name เดิม ถ้าแดงแปลว่าเผลอตั้งชื่อใหม่ — แก้ชื่อ อย่ารัน generator เพิ่ม entry

- [ ] **Step 10: build package แล้ว type-check**

```bash
cd packages/rpc-contract && bun run build:package
cd ../../apps/micro-cluster && bun run check-types
cd ../backend-gateway && bun run check-types
```

ถ้าฟ้องว่าไม่รู้จัก pattern ใหม่ ให้ build package ก่อน **อย่าแก้โค้ดตาม error**

- [ ] **Step 11: jest — ไม่เพิ่มตัวแดงใหม่**

```bash
cd apps/micro-cluster && bunx jest --runInBand --forceExit
```

Expected: ชุดที่แดงเหมือนเดิมทุกประการ ถ้าเปลี่ยน ให้เทียบด้วย `git stash` / `git stash pop` แล้วรายงาน

- [ ] **Step 12: ยืนยันลำดับ route ด้วยตา**

```bash
grep -n "@Get(" apps/backend-gateway/src/application/news/news.controller.ts
grep -n "@Get(" apps/backend-gateway/src/platform/applications/applications.controller.ts
```

Expected: บรรทัดของ `@Get('summary')` ต้องมีเลขน้อยกว่าบรรทัดของ `@Get(':news_id')` / `@Get(':application_id')`

- [ ] **Step 13: Commit**

```bash
git checkout -b feature/summary-endpoints-phase-2 2>/dev/null || git checkout feature/summary-endpoints-phase-2
git add -A && git commit -m "feat(news,applications): เพิ่ม endpoint /summary ที่ไม่รับตัวกรอง

ทั้งสอง resource ไม่ผูกกับขอบเขตสิทธิ์ where ว่างจึงเป็นคำตอบที่ถูก
ไม่ใช่การละเลย — ต่างจาก business-unit กับ user ที่ตามมาในแผนนี้

news: gateway ต้อง presign รูป lead story เหมือน route รายการ ไม่งั้นภาพหาย
เงียบ ๆ โดยตัวเลขยังถูก"
```

---

### Task 2: `platform_role` — endpoint สรุปใน micro-business

แยก task เพราะอยู่**คนละ app** จาก 4 ตัวที่เหลือ และมี wrinkle เรื่อง type

**Files:**
- Modify: `packages/rpc-contract/src/contracts/platform-roles.ts` (ผ่าน generator)
- Modify: `apps/micro-business/src/authen/platform_role/platform_role.{service,controller}.ts`
- Modify: `apps/backend-gateway/src/platform/platform-roles/platform-roles.{service,controller}.ts`
- Modify: swagger response DTO ของ platform-roles

**Interfaces:**
- Consumes: `buildRolesSummary` (`platform_role.service.ts:165` เรียกอยู่แล้ว) · **`interface RolesSummary` ที่ `platform_role.service.ts:29` ไม่ได้ export**
- Produces: route `GET /api-system/platform/roles/summary` · contract key ตามกฎ suffix เดียวกัน: `platform-roles.summary` → **`PlatformRoles.summary.pattern`** · ยืนยันด้วย grep ก่อนใช้

**ค่าเฉพาะ:**

| | ค่า |
|---|---|
| cmd (literal ชั่วคราว) | `{ cmd: 'platform-roles.summary', service: 'platform-roles' }` |
| builder call | `this.buildRolesSummary({})` |
| gateway `@Controller` | `api-system/platform/roles` |
| ต้องอยู่เหนือ | `@Get(':role_id')` `:123` |
| api_name (เดิม) | `platform-role.findAll` |
| permission | `@RequirePlatformPermission('platform_role.read')` |

**ไม่ผูก scope** — `where` เป็น `{}`

---

- [ ] **Step 1: จัดการ type `RolesSummary` ก่อน**

`platform_role.service.ts:29` ประกาศ `interface RolesSummary` แบบ **ไม่ export** เมธอดใหม่ต้องประกาศ return type ให้ได้ เลือกทางใดทางหนึ่ง แล้วบันทึกเหตุผลไว้ในรายงาน:

- **ทางที่แนะนำ:** เติม `export` หน้า `interface RolesSummary` — เปลี่ยนแค่ visibility ไม่แตะรูป และ type นี้ก็ถูกใช้เป็นรูปบนสายอยู่แล้ว
- ทางเลือก: ให้เมธอดใหม่คืน `Promise<Result<Awaited<ReturnType<typeof this.buildRolesSummary>>>>` — ทำงานได้แต่อ่านยากกว่ามาก

**ห้ามคัดลอกรูป interface ไปประกาศซ้ำที่อื่น** — สองแหล่งจะเพี้ยนจากกันทันทีที่ backend เพิ่มฟิลด์

- [ ] **Step 2-3: service + controller ของ micro-business**

รูปเดียวกับ **Task 1 Step 2 และ Step 3** แทนค่าตามตารางด้านบน · เรียก `this.buildRolesSummary({})` · return `Promise<Result<RolesSummary>>` (หลัง export ใน Step 1) · `handleResult` ไม่ใช่ `handlePaginatedResult`

**ระวัง:** app นี้อาจไม่มี `createAuditContext` แบบเดียวกับ micro-cluster — ตรวจกับ controller เดิมของไฟล์ ถ้าไม่มีก็ไม่ต้องใส่ อย่าเพิ่มขึ้นมาเอง

- [ ] **Step 4: generator + แทน literal**

```bash
bun run gen:rpc-contract
grep -n "summary" packages/rpc-contract/src/contracts/platform-roles.ts
```

แทนด้วย key จริงที่ generator สร้าง

- [ ] **Step 5-6: gateway service + route** — ยกรูปจาก reference · ไม่มี presign ให้ทำสำหรับ resource นี้

- [ ] **Step 7: audits + build package + type-check**

```bash
bun run audit:message-pattern-literal && bun run audit:app-api-catalog-drift && bun run audit:rest-contract && bun run swagger:verify
cd packages/rpc-contract && bun run build:package
cd ../../apps/micro-business && bun run check-types
cd ../backend-gateway && bun run check-types
```

- [ ] **Step 8: jest ของ micro-business**

```bash
cd apps/micro-business && bunx jest --runInBand --forceExit
```

Expected: ไม่เพิ่มตัวแดงใหม่ · **หมายเหตุ: baseline ของ app นี้ยังไม่เคยวัดในแผนนี้** ให้รันบน tree สะอาดก่อน (`git stash`) เพื่อบันทึก baseline แล้วค่อยเทียบ

- [ ] **Step 9: ยืนยันลำดับ route**

```bash
grep -n "@Get(" apps/backend-gateway/src/platform/platform-roles/platform-roles.controller.ts
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(platform-roles): เพิ่ม endpoint /summary ที่ไม่รับตัวกรอง

อยู่คนละ app จาก resource อื่นในแผนนี้ (micro-business) และ RolesSummary เดิม
ไม่ได้ export จึงเติม export ให้ แทนการประกาศรูปซ้ำที่อื่นซึ่งจะเพี้ยนจากกัน
ทันทีที่มีการเพิ่มฟิลด์"
```

---

### Task 3: `business-unit` — endpoint สรุปที่ผูกขอบเขตสิทธิ์ (ตัวแรก)

**Files:**
- Modify: `packages/rpc-contract/src/contracts/business-units.ts` (ผ่าน generator)
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.{service,controller}.ts`
- Modify: `apps/backend-gateway/src/platform/platform_business-units/platform_business-units.{service,controller}.ts`
- Modify: swagger response DTO

**Interfaces:**
- Consumes: `buildBuSummary` (`business-unit.service.ts:671`) · `this.clusterAdminAuthz.readableClusterScope(user_id)` (`:620`) · type `BuSummary` (`summary.helper.ts:215`)
- Produces: route `GET /api-system/business-units/summary`

**ค่าเฉพาะ:**

| | ค่า |
|---|---|
| cmd | `{ cmd: 'business-units.summary', service: 'business-units' }` |
| gateway `@Controller` | `api-system/business-units` |
| ต้องอยู่เหนือ | `@Get(':business_unit_id')` `:144` |
| api_name (เดิม) | `businessUnit.findAll` |
| permission | *(ไม่มี — route รายการก็ไม่มี)* |

---

- [ ] **Step 1: เมธอด service — นี่คือจุดที่ความผิดพลาดจะไม่ส่งเสียง**

```ts
@TryCatch
async businessUnitSummary(user_id?: string): Promise<Result<BuSummary>> {
  const scope = await this.clusterAdminAuthz.readableClusterScope(user_id);
  const where = scope.all ? {} : { cluster_id: { in: scope.clusterIds } };
  return Result.ok(await this.buildBuSummary(where));
}
```

**`cluster_id` เป็นคอลัมน์ตรงบน `tb_business_unit`** — predicate จึงเป็นรูปนี้ **ห้ามลอกจาก `/clusters/summary`** ซึ่งใช้ `{ id: { in: scope.clusterIds } }` เพราะที่นั่น cluster คือตัวมันเอง

คอมเมนต์ต้องระบุว่าการละ scope ทิ้งจะทำให้ cluster admin เห็นจำนวน BU ทั้งระบบ **โดยไม่มี error ไม่มี log และตัวเลขดูปกติ**

- [ ] **Step 2-8:** controller (รูปเดียวกับ Task 1 Step 3, เรียก `this.businessUnitService.businessUnitSummary(payload.user_id)` — **ต้องส่ง user_id ต่อ ไม่งั้น scope หาย**), generator + แทน literal, gateway service + route, audits, build package + type-check, jest, ยืนยันลำดับ route — รูปเดียวกับ Task 1 Steps 3, 6, 7-8, 9-12

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(business-units): เพิ่ม endpoint /summary ที่ไม่รับตัวกรองแต่ยังผูกสิทธิ์

ตัด filter ออกแต่ต้องเก็บ scope ไว้ — cluster_id เป็นคอลัมน์ตรงบน
tb_business_unit predicate จึงเป็น { cluster_id: { in: … } } ไม่ใช่รูปของ
/clusters/summary ที่ใช้ { id: { in: … } } เพราะที่นั่น cluster คือตัวมันเอง

ละ scope ทิ้งแล้ว cluster admin จะเห็นจำนวน BU ทั้งระบบโดยไม่มีอะไรพัง"
```

---

### Task 4: `user` — endpoint สรุปที่ผูกขอบเขตสิทธิ์ (predicate รูปต่างจากทุกตัว)

**Files:**
- Modify: `packages/rpc-contract/src/contracts/users.ts` (ผ่าน generator)
- Modify: `apps/micro-cluster/src/cluster/user/user.{service,controller}.ts`
- Modify: `apps/backend-gateway/src/platform/platform-user/platform-user.{service,controller}.ts`
- Modify: swagger response DTO

**Interfaces:**
- Consumes: `buildUserSummary` (`user.service.ts:315`) · `this.platformScope.clusterScopeFor(userId, 'user.read')` (`:85`) · type `UserSummary` (`summary.helper.ts:276`)
- Produces: route `GET /api-system/user/summary`

**ค่าเฉพาะ — สองข้อที่ต่างจากทุก task ก่อนหน้า:**

| | ค่า |
|---|---|
| cmd | `{ cmd: 'users.summary', service: 'users' }` |
| gateway `@Controller` | **`api-system`** (ไม่ใช่ `api-system/user`) |
| route | **`@Get('user/summary')`** ไม่ใช่ `@Get('summary')` |
| ต้องอยู่เหนือ | `@Get('user/:user_id')` `:180` |
| api_name (เดิม) | `platform-user.list` |
| permission | `@RequirePlatformPermission('user.read')` |

---

- [ ] **Step 1: เมธอด service — predicate เป็น relation filter ซ้อน ไม่ใช่คอลัมน์ตรง**

> ### แก้แผน 2026-08-24 — บล็อกด้านล่างนี้คือฉบับที่ถูกต้อง
>
> ฉบับแรกของ Task 4 ส่ง `where` ที่มี **แค่ scope** ซึ่งผิด docblock ของ `buildUserSummary`
> (`user.service.ts:1017-1019`) ระบุว่า *"MUST be called with the list's finalised `where` minus its
> soft-delete predicate, so the cluster scope, the search OR and the `email_verified_at` gate all
> still apply. Passing an earlier clause silently widens the population beyond what the table shows."*
> `listUser` ตั้ง `where.email_verified_at = { not: null }` ที่ `:129` ก่อนสร้างค่าสรุปเสมอ ถ้าละไว้
> `/user/summary` จะนับบัญชีที่ยังไม่ยืนยันอีเมล ซึ่งตารางไม่เคยแสดง ทำให้ยอดของแถบ **สูงกว่ายอดของ
> ตารางเอง** โดยไม่มีอะไรพัง — ความผิดพลาดชนิดเดียวกับที่แผนนี้ตั้งขึ้นมาเพื่อกำจัด
>
> `deleted_at` **ไม่ต้องใส่** — list ส่ง `stripSoftDelete(where)` และ `buildUserSummary` ประกอบ
> `liveWhere` ให้เองข้างใน การใส่กลับเข้าไปจะทำให้ช่อง `deleted` เป็น 0 เสมอ

```ts
@TryCatch
async userSummary(userId?: string): Promise<Result<UserSummary>> {
  const scope = await this.platformScope.clusterScopeFor(userId, 'user.read');

  // รูปเดียวกับ `where` ของ listUser ณ จุดที่มันเรียก buildUserSummary: ด่าน email_verified_at
  // เป็นคีย์ระดับบน ส่วนขอบเขตคลัสเตอร์อยู่ใน AND — ต่างกันแค่ไม่มีตัวกรองจากคำค้นหา
  // และไม่มี deleted_at ซึ่ง stripSoftDelete ตัดออกที่เส้นทางรายการ
  const where: Record<string, unknown> = { email_verified_at: { not: null } };
  if (!scope.all) {
    where.AND = {
      tb_cluster_user_tb_cluster_user_user_idTotb_user: {
        some: { cluster_id: { in: scope.clusterIds }, deleted_at: null },
      },
    };
  }

  return Result.ok(await this.buildUserSummary(where));
}
```

**ยกมาจาก `user.service.ts:86-91` โดยตรง อย่าประกอบใหม่จากความเข้าใจ** — `tb_user` ไม่มีคอลัมน์ `cluster_id` ความสัมพันธ์อยู่ผ่านตารางกลาง

**สองวิธีที่จะเขียนผิดแล้วไม่มี error:**
- `{ id: { in: scope.clusterIds } }` (ลอกจาก cluster) → เทียบ user id กับ cluster id ไม่ match อะไรเลย → แถบขึ้น **0 ทุกช่อง** ซึ่งดูเหมือน "ยังไม่มีผู้ใช้" มากกว่าดูเหมือนบั๊ก
- `{}` เพราะบัญชีที่ทดสอบเป็น super admin แล้ว `scope.all` เป็นจริงอยู่แล้ว → cluster admin เห็นผู้ใช้ทั้งระบบ
- ละด่าน `email_verified_at` → นับบัญชีที่ยังไม่ยืนยันอีเมล แถบขึ้นสูงกว่ายอดของตารางเอง เทียบกับ `?perpage=1` แล้วไม่ตรง

**permission key คือ `'user.read'` ไม่ใช่ `'cluster.read'`**

- [ ] **Step 2-8:** เหมือน Task 3 Steps 2-8 แต่ระวังสองข้อในตารางด้านบน (`@Controller` และรูป route) · controller เรียก `this.userService.userSummary(payload.user_id)` — **ต้องส่ง user_id ต่อ ไม่งั้น `clusterScopeFor` ได้ undefined แล้วคืน `{all: true}` ซึ่งเปิดข้อมูลทั้งระบบโดยไม่มี error**

- [ ] **Step 9: ยืนยันลำดับ route — task นี้ต่างจากตัวอื่น**

```bash
grep -n "@Get(" apps/backend-gateway/src/platform/platform-user/platform-user.controller.ts
```

Expected: `@Get('user/summary')` ต้องมีเลขบรรทัดน้อยกว่า `@Get('user/:user_id')` · ถ้าเห็น `@Get('summary')` เฉยๆ แปลว่าเขียนผิด path — controller นี้ผูกที่ `api-system` ไม่ใช่ `api-system/user`

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(user): เพิ่ม endpoint /summary ที่ไม่รับตัวกรองแต่ยังผูกสิทธิ์

predicate ของ user เป็น relation filter ซ้อนผ่านตารางกลาง ไม่ใช่คอลัมน์ตรง
เพราะ tb_user ไม่มี cluster_id บนตัวเอง ยกมาจาก listUser โดยตรง

route เป็น user/summary ไม่ใช่ summary เพราะ controller ผูกที่ api-system
เฉย ๆ ต่างจาก controller อื่นในแผนนี้"
```

---

### Task 5 (GATE — ไม่ใช่งานเขียนโค้ด): deploy แล้วพิสูจน์ทั้ง 5 endpoint

**หยุดที่นี่ ส่งกลับให้ผู้ใช้** — ผู้ช่วยห้าม merge หรือ push เอง

หลัง deploy ต้องพิสูจน์**ทีละตัว**ด้วยคู่เทียบ ทั้งห้า controller ใช้ `ParseUUIDPipe({version:'4'})` คู่เทียบจึงใช้ได้ครบ:

| endpoint | ต้องได้ 200 | ตัวเทียบต้องได้ 400 |
|---|---|---|
| `/api/news/summary` | ✓ | `/api/news/summary-typo` |
| `/api-system/applications/summary` | ✓ | `…/summary-typo` |
| `/api-system/platform/roles/summary` | ✓ | `…/summary-typo` |
| `/api-system/business-units/summary` | ✓ | `…/summary-typo` |
| `/api-system/user/summary` | ✓ | `…/summary-typo` |

**ถ้าคู่ไหนตอบเหมือนกัน = endpoint นั้นยังไม่ขึ้น หรือถูก `:id` กลืน** — ห้ามเริ่ม Task 6 จนกว่าจะผ่านครบทั้งห้า

**และต้องรัน V3 ของ spec (§5.1) ก่อนถือว่างานนี้เสร็จ** — ยิง `user/summary` และ `business-units/summary` ด้วย token ของบัญชีที่ scope จำกัด แล้วต้องได้เลข**น้อยกว่า**ที่ super admin ได้ · ข้อนี้เป็นข้อเดียวกับ V2 ของงาน `/clusters` ที่ยังค้าง ถ้าหาบัญชีไม่ได้ ให้รายงานว่าค้าง อย่าทำเครื่องหมายว่าผ่าน

---

### Task 6: frontend — ย้าย 5 หน้าไปใช้ endpoint ใหม่

**Files:**
- Modify: `src/services/{application,businessUnit,news,role,user}Service.ts` — เพิ่มเมธอดละหนึ่ง
- Modify: `src/pages/{Application,BusinessUnit,News,Role,User}Management.tsx` — `loadSummary` เรียกเมธอดใหม่

**Interfaces:**
- Consumes: endpoint ทั้งห้าจาก Task 1-4
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

---

- [ ] **Step 1: เพิ่มเมธอดใน service ทั้งห้า**

รูปเดียวกันทุกไฟล์ ตาม convention ที่ `src/services/CLAUDE.md:24` กำหนด (`response.data.data || response.data`) — ดูตัวอย่างที่ merged แล้วที่ `src/services/clusterService.ts` → `getFleetSummary`

| service | path | return type |
|---|---|---|
| `applicationService` | `/api-system/applications/summary` | `ApplicationSummaryData` |
| `businessUnitService` | `/api-system/business-units/summary` | `BuSummaryData` |
| `newsService` | `/api/news/summary` | `NewsSummaryData` |
| `roleService` | `/api-system/platform/roles/summary` | `RolesSummaryData` |
| `userService` | `/api-system/user/summary` | `UserSummaryData` |

ชื่อ type ฝั่ง frontend อยู่ใน `src/types/index.ts` แล้วทั้งหมด — **อย่าประกาศใหม่**

- [ ] **Step 2: `loadSummary` ทั้งห้าหน้า — เรียกเมธอดใหม่แทนการดึงทั้งตาราง**

แต่ละหน้าเปลี่ยน body ของ `loadSummary` ให้เหลือคำขอเดียว โครงเดิมคงไว้ทุกอย่าง: `setSummaryLoading(true)` → try → `setSummary(<ผลลัพธ์>)` + `setSummaryError(false)` → catch → `setSummary(null)` + `setSummaryError(true)` → finally → `setSummaryLoading(false)`

**BusinessUnit และ User เดิมยิงสองคำขอ** (`Promise.all` กับคำขอนับ deleted) — ทั้งคู่ยุบเหลือคำขอเดียว เพราะ backend ส่ง `deleted` มาใน summary อยู่แล้ว **ตรวจว่าฟิลด์ `deleted` มาจริงก่อนลบคำขอที่สอง** ถ้าไม่มา ให้หยุดและรายงาน อย่าปล่อยให้เป็น 0 เงียบๆ — สองหน้านี้ render ฟิลด์นั้น

**ห้ามลบจุดเรียก `loadSummary()` จุดใดจุดหนึ่ง** — มี 15 จุด (App 2, BU 2, News 3, Role 2, User 6) ทุกจุดต้องอยู่ครบ

- [ ] **Step 3: ยืนยันว่าไม่เหลือ `perpage: -1` และจุดเรียกครบ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
echo "--- ต้องไม่เหลือใน 5 หน้านี้ ---"
grep -n "perpage: -1" src/pages/{Application,BusinessUnit,News,Role,User}Management.tsx || echo CLEAN
echo "--- ต้องได้ 15 ---"
eval grep -cE "'^\s+loadSummary\(\);'" src/pages/{Application,BusinessUnit,News,Role,User}Management.tsx | awk -F: '{s+=$2} END {print "TOTAL:", s}'
```

Expected: `CLEAN` และ `TOTAL: 15` · หมายเหตุ: `*.test.tsx` ของหน้าเหล่านี้ยังมี `perpage === -1` ใน mock — Task 7 จัดการ

- [ ] **Step 4: typecheck + lint + test**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: ผ่านครบ · **เทสต์อาจแดง** เพราะ mock ของ 3 หน้าแยกกรณี `perpage === -1` และหน้าเหล่านั้นไม่ยิงคำขอนั้นแล้ว ถ้าแดงให้แก้ mock เดิมให้ตรงกับคำขอใหม่ (การซ่อม mock เดิมไม่ใช่การเขียนเทสต์ใหม่) และรายงานว่าแก้อะไรบ้าง

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pages): 5 หน้าอ่านแถบสรุปจาก endpoint เฉพาะทางแทนการดึงทั้งตาราง

ตัด perpage:-1 ออกครบทั้งห้าหน้า BusinessUnit กับ User ยุบจากสองคำขอเหลือหนึ่ง
เพราะ backend ส่ง deleted มาใน summary อยู่แล้ว

จุดเรียก loadSummary() ทั้ง 15 จุดคงไว้ครบ"
```

---

### Task 7: ลบ `summarizeX` + เทสต์ + แก้มาตรฐาน

ทำหลัง Task 6 เท่านั้น — เป็น task ที่ทำให้จำนวนเทสต์ลดลง

**Files:**
- Modify: `src/pages/*/[A-Z]*Summary.tsx` ทั้งห้า — ลบฟังก์ชัน `summarizeX`
- Modify: `src/pages/*/[A-Z]*Summary.test.tsx` ทั้งห้า — ลบ describe ของ `summarizeX`
- Modify: `src/pages/{Application,BusinessUnit,News,Role,User}Management.test.tsx` — mock ที่ยังแยกกรณี `perpage === -1`
- Modify: `agent-os/standards/pages/summary-band.md`

---

- [ ] **Step 1: ยืนยันว่าไม่มีผู้เรียกเหลือ**

```bash
grep -rn "summarizeApplications\|summarizeBus\|summarizeNews\|summarizeRoles\|summarizeUsers" src/ | grep -v "\.test\."
```

Expected: เจอเฉพาะในไฟล์ `*Summary.tsx` ที่นิยามมันเอง · **ถ้าเจอในหน้าใดหน้าหนึ่งให้หยุดและรายงาน** แปลว่า Task 6 ทำไม่ครบ

- [ ] **Step 2: ลบ `summarizeX` ทั้งห้าตัว** พร้อม doc comment และ type ช่วย (`AppLike`, `BuLike`, `NewsLike`, `RoleLike`, `UserLike`) ที่ใช้เฉพาะมัน

**ห้ามลบ component หรือ props type** — `<ApplicationRegistrySummary>` ฯลฯ ยังถูก render อยู่ทุกหน้า ลบเฉพาะฟังก์ชันรวมยอด

- [ ] **Step 3: ลบ describe ของ `summarizeX` ในไฟล์เทสต์ทั้งห้า** และตัด import ให้เหลือเฉพาะที่ยังใช้ · เก็บ describe ที่ทดสอบตัว component ไว้ครบ

- [ ] **Step 4: แก้ mock ของหน้าที่ยังแยก `perpage === -1`**

`ApplicationManagement.test.tsx`, `NewsManagement.test.tsx`, `RoleManagement.test.tsx` ใช้รูป `mockImplementation((p) => p?.perpage === -1 ? summaryResponse : mainResponse)` สาขาแรกไม่มีผู้เรียกแล้ว — แทนด้วย mock ของเมธอด summary ตัวใหม่ ตามรูปที่ `ClusterManagement.test.tsx` ใช้กับ `getFleetSummary`

- [ ] **Step 5: แก้ `agent-os/standards/pages/summary-band.md`**

หัวข้อ `## Band sits above the filter and describes the whole set: aggregate client-side` ไม่จริงอีกต่อไปสำหรับห้าหน้านี้ — เปลี่ยนเป็นการอ่านจาก endpoint สรุปเฉพาะทาง พร้อมระบุ path ทั้งห้า และชี้ที่ spec ของเฟสนี้

**หัวข้ออีกฝั่ง (`/user-platform`, `/licenses`) ไม่เปลี่ยน** และคำเตือนเรื่อง `/broadcasts` ที่ยังไม่ได้ตรวจต้องอยู่ครบ

- [ ] **Step 6: typecheck + lint + test**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: ผ่านครบ และ **จำนวนเทสต์ต้องลดลง** จาก baseline (ลบ describe ไป 29 assertion รวม: App 5 · BU 4 · News 7 · Role 6 · User 7) **ถ้าเท่าเดิมแปลว่าลบไม่สำเร็จ**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore(summary): ลบ summarizeX ทั้งห้าตัวที่ไม่มีผู้เรียกแล้ว + แก้มาตรฐาน

เฟส 1 เขียนไว้เองว่าฟังก์ชันพวกนี้เป็นแหล่งเดียวจนกว่าจะถึงเฟส 2 ซึ่งตอนนี้ถึงแล้ว
summary-band.md ฝั่ง above-the-filter เปลี่ยนจาก aggregate client-side เป็น
อ่านจาก endpoint เฉพาะทาง ส่วนฝั่ง filtered-result-set ไม่เปลี่ยน"
```

---

## Final Verification (หลังทุก task และหลัง deploy)

ตารางนี้มาจาก §5.1 ของ spec — ด่านจริง เพราะไม่มีเทสต์อัตโนมัติตัวไหนครอบเส้นทางนี้

- [ ] **V1** ตัวเลขจาก endpoint ใหม่เท่ากับที่แถบเคยแสดง — ทั้ง 5 หน้า
- [ ] **V2** ลักลอบใส่ `?search=…` เข้า endpoint ใหม่ ค่าต้องไม่ขยับ (ท่านี้จับบั๊กได้จริงตอนทำ `/clusters`)
- [ ] **V3 (ข้ามไม่ได้)** ยิง `user/summary` และ `business-units/summary` ด้วย token ของบัญชีที่ scope จำกัด ต้องได้เลขน้อยกว่า super admin
- [ ] **V4** พิมพ์ค้นหาทั้ง 5 หน้า แถบต้องไม่ขยับ (พฤติกรรมเฟส 1 ต้องไม่ถอย)
- [ ] **V5** ลบข้อมูลสักรายการ แถบต้องอัปเดต
- [ ] **V6** `/news` แถบยังมีรูป lead story
- [ ] **V7** DevTools Network ไม่เหลือ `perpage=-1` ในทั้ง 5 หน้า
- [ ] **V8** ล้างช่องค้นหาทุกหน้าที่ทดสอบ (ค่า persist ลง `localStorage` แยกต่อหน้า)

---

## หมายเหตุสำหรับผู้ execute

- **Task 1-4** อยู่ใน `carmen-turborepo-backend-v2` · **Task 5 เป็น gate ต้องหยุดรอผู้ใช้** · **Task 6-7** อยู่ใน `carmen-platform`
- ถ้าถูก dispatch เป็น subagent: **ห้ามเขียนเทสต์ใหม่** ตาม Global Constraints — ข้อนี้ไม่ inherit มาเอง
- เลขบรรทัดทั้งหมดเป็นของ ณ เวลาที่เขียนแผน และจะเลื่อนทันทีที่แก้จุดแรกในไฟล์ — ให้ค้นด้วยข้อความ ไม่ใช่กระโดดตามเลข
- ทุก task จบด้วย commit ของตัวเอง ห้ามรวบข้าม task
- **V3 คือข้อเดียวกับ V2 ของงาน `/clusters` ที่ยังค้างอยู่** ถ้ายังหาบัญชีทดสอบไม่ได้ เฟสนี้จะเพิ่มพื้นผิวที่พิสูจน์ไม่ได้อีกสองจุด — ควรแก้ปัญหาบัญชีก่อน ไม่ใช่หลัง
