# Cluster Fleet Summary Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม `GET /api-system/clusters/summary` ที่คืนค่าสรุปความจุทั้ง fleet โดยไม่รับตัวกรองใดๆ แล้วย้าย `/clusters` กับ `/licenses` มาใช้ endpoint นี้ ทำให้เหลือท่าเดียวจาก 3 ท่า

**Architecture:** route ใหม่เดินเต็มสายตามสถาปัตยกรรมเดิม — `backend-gateway` (`@Get('summary')`) → RPC contract → `micro-cluster` เรียก `buildFleetSummary()` ที่มีอยู่แล้วด้วย `where` ที่มีแต่ขอบเขตสิทธิ์ของผู้เรียก ฝั่ง frontend เพิ่มเมธอดเดียวใน `clusterService` แล้วให้สองหน้าเรียกมัน ลบ fallback `summarizeFleet` ทิ้ง

**Tech Stack:** NestJS + Prisma + turborepo + bun (backend) · React + TypeScript + Vite + Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-08-24-cluster-fleet-summary-endpoint-design.md`

## Global Constraints

ข้อบังคับทั้งหมดนี้ใช้กับ **ทุก task** ในแผนนี้

- **ห้ามเขียนเทสต์ใหม่** — ห้ามสร้างไฟล์ `*.spec.ts` / `*.test.ts` / `*.test.tsx` ใหม่ และห้ามเพิ่ม test case ใหม่ (preference ของผู้ใช้ overrides TDD) **แต่ชุดเทสต์เดิมทุกชุดต้องเขียว** ก่อน commit ทุกครั้ง — task ที่ทำให้เทสต์เดิมแดงต้องแก้เทสต์เดิมนั้นในงานเดียวกัน
- **ไม่แตะ DB** — ไม่มี migration ไม่มี seed ไม่มีการแก้ schema ในแผนนี้
- **`AppIdGuard` ต้องใช้ api_name เดิม `'cluster.findAll'` เท่านั้น** — ชื่อใหม่ทำให้ environment ที่ไม่ได้ตั้ง `allow_all` ตอบ 401 ซึ่ง FE ตีความว่า token เสีย → logout ผู้ใช้
- **`@Get('summary')` ต้องประกาศก่อน `@Get(':cluster_id')`** ในไฟล์ controller เสมอ
- **endpoint ต้องไม่รับ `@Query()` ใดนอกจาก `version`** — ห้ามเพิ่ม `search` / `filter` / `advance`
- **ห้ามลบ `utilization()` ใน `src/utils/capacity.ts`** — ยังมีผู้เรียก 4 จุด (`CapacityMeter`, `CapacityGauge`, `ClusterPlate`, `CapacityStrip`)
- **ห้ามถอด `summary` ออกจาก `GET /clusters` (route รายการ)** — spec ตัดสินใจไว้แล้วว่าคงไว้ (decision #2) หลัง Task 5/6 ฟิลด์นี้จะไม่มีผู้อ่านใน frontend ซึ่ง **ไม่ใช่เหตุผลให้ลบ** การถอดเป็น breaking change ที่มีลำดับ deploy ของตัวเอง แยกเป็นงานอื่น
- **`packages/rpc-contract` ถูก consume ผ่าน `dist/`** — หลังแก้ไฟล์ใน `src/` ต้องรัน `bun run build:package` ของ package นั้นก่อน type-check ตัวที่ import มัน ไม่งั้น `tsc` จะอ่าน `dist/*.d.ts` ตัวเก่าแล้วฟ้อง type error ที่ไม่มีอยู่จริง
- **ห้าม merge หรือ push เข้า `main` / `DEV` / `UAT` เอง** — commit ลง branch เท่านั้น แล้วหยุดรอผู้ใช้
- **branch:** `feature/cluster-fleet-summary-endpoint` ทั้งสอง repo
- **jest ของ backend ต้องใช้ `--runInBand --forceExit`** — LokiTransport ทำให้ jest ค้างไม่จบเอง
- **ห้ามรัน `bun run lint` ที่ root ของ backend** — สคริปต์นั้นเป็น `eslint --fix` ที่เขียนทับทั้ง repo ใช้ `bun run lint:changed` แทนถ้าจำเป็น
- **path ของ backend repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`
- **path ของ frontend repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`

---

## File Structure

### Part A — `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` | เมธอด `fleetSummary(userId)` — resolve scope แล้วเรียก `buildFleetSummary` ที่มีอยู่แล้ว | 1 |
| `apps/micro-cluster/src/cluster/cluster/cluster.controller.ts` | RPC handler สำหรับ pattern ใหม่ | 1 |
| `packages/rpc-contract/src/contracts/clusters.ts` | entry `fleetSummary` (ไฟล์ generated — ต้องผ่านสคริปต์) | 1 |
| `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts` | ส่งต่อ RPC → `Result` | 2 |
| `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts` | HTTP route `@Get('summary')` + guards + swagger | 2 |
| `apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts` | แก้ doc comment ของ `ClusterFleetSummaryDto` ให้ครอบทั้งสองการใช้งาน | 2 |

### Part B — `carmen-platform`

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/services/clusterService.ts` | `getFleetSummary()` | 4 |
| `src/pages/clusterManagement/FleetCapacity.tsx` | prop `error` + สถานะ "Capacity unavailable" | 4 |
| `src/pages/ClusterManagement.tsx` | ย้าย `loadFleet` มาใช้ endpoint ใหม่ + ลบบรรทัดที่เขียน `data.summary` ทับ | 5 |
| `src/pages/ClusterManagement.test.tsx` | เติม `getFleetSummary` เข้า mock (ไม่งั้นทุกเทสต์ในไฟล์พัง) | 5 |
| `src/pages/licenses/LicenseCenter.tsx` | ย้าย `loadFleet` มาใช้ endpoint ใหม่ | 6 |
| `src/utils/capacity.ts` | ลบ `summarizeFleet` + `isNearLimit` | 7 |
| `src/utils/capacity.test.ts` | ลบ describe ของสองฟังก์ชันนั้น | 7 |

---

# Part A — Backend (`carmen-turborepo-backend-v2`)

### Task 1: micro-cluster — เมธอด `fleetSummary` + RPC handler + contract entry

สามส่วนนี้ต้องอยู่ใน task เดียวกันเพราะ compile แยกกันไม่ได้: handler อ้าง contract ที่ยังไม่มี และ generator สร้าง contract จาก handler ที่ต้องมีอยู่ก่อน

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` (เพิ่มเมธอดต่อท้าย `listCluster` ซึ่งจบที่ราวบรรทัด 725)
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.controller.ts` (เพิ่ม handler ต่อจาก `listCluster` ที่บรรทัด 108-119)
- Modify: `packages/rpc-contract/src/contracts/clusters.ts` (generated — แก้ผ่านสคริปต์เท่านั้น)

**Interfaces:**
- Consumes: `buildFleetSummary(where): Promise<FleetSummary>` (private, `cluster.service.ts:1564`) · `this.platformScope.clusterScopeFor(userId, permission)` (ฉีดไว้แล้วที่ constructor บรรทัด 74) · `FleetSummary` จาก `@/common/helpers/summary.helper` (import อยู่แล้วบรรทัด 36-41)
- Produces: `Clusters.fleetSummary.pattern` (RPC pattern `clusters.fleet-summary`) ที่ Task 2 ใช้ · `ClusterService.fleetSummary(userId?: string): Promise<Result<FleetSummary>>`

---

- [ ] **Step 1: เพิ่มเมธอด `fleetSummary` ใน `ClusterService`**

เปิด `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` หาจุดจบของเมธอด `listCluster` (บรรทัดที่ปิดด้วย `}` หลัง `return Result.ok({ ... })` ราวบรรทัด 725) แล้วแทรกเมธอดนี้ต่อจากนั้น:

```ts
  /**
   * Fleet-wide capacity aggregate for the caller's readable scope, with no list filter applied
   * ค่าสรุปความจุทั้งกองตามขอบเขตที่ผู้เรียกอ่านได้ โดยไม่มีตัวกรองของรายการ
   *
   * Unlike the `summary` block that rides on `listCluster`, which is scoped to that request's
   * `search`/`advance` (correct for a list, wrong for a band that sits above the filter), this
   * builds the aggregate from the caller's platform scope alone.
   * ต่างจาก `summary` ที่แนบมากับ `listCluster` ซึ่งผูกกับ `search`/`advance` ของคำขอนั้น
   * (ถูกสำหรับรายการ แต่ผิดสำหรับแถบสรุปที่อยู่เหนือตัวกรอง) ที่นี่ `where` มีแต่ขอบเขตสิทธิ์
   *
   * `buildFleetSummary` handles soft-delete itself (`stripSoftDelete`, then a separate deleted
   * count), so no `deleted_at` predicate belongs here.
   * `buildFleetSummary` จัดการ soft-delete เองอยู่แล้ว จึงไม่ต้องส่ง `deleted_at` เข้าไป
   *
   * Deliberately has NO try/catch, unlike `listCluster` — there `summary` is an extra and the
   * list must survive without it; here it IS the payload, so a failed rollup must surface as an
   * error rather than an empty 200 the client has to guess about.
   * จงใจไม่มี try/catch แบบ `listCluster` — ที่นั่น `summary` เป็นของแถมและหายไปได้ ที่นี่มันคือ
   * payload ทั้งหมด การรวมยอดที่ล้มต้องเป็น error ไม่ใช่ 200 ที่ว่างเปล่าให้ client เดาเอง
   * @param userId - Requesting user id / รหัสผู้ใช้ที่ร้องขอ
   * @returns Fleet capacity totals and status counts / ยอดรวมความจุและจำนวนตามสถานะ
   */
  async fleetSummary(userId?: string): Promise<Result<FleetSummary>> {
    this.logger.debug(
      { function: 'fleetSummary', userId: userId },
      ClusterService.name,
    );

    // ขอบเขตสิทธิ์คือ `where` ทั้งหมดของคำขอนี้ — ไม่มีตัวกรองอื่นมาผสม การลืมบรรทัดนี้
    // ทำให้ผู้ดูแลระดับคลัสเตอร์เห็นตัวเลขทั้งกองโดยไม่มีอะไรพังและไม่มี log
    // The scope IS the whole where clause here. Dropping this line shows a cluster admin the
    // numbers for the entire fleet, with nothing failing and nothing logged.
    const scope = await this.platformScope.clusterScopeFor(userId, 'cluster.read');
    const where = scope.all ? {} : { id: { in: scope.clusterIds } };

    return Result.ok(await this.buildFleetSummary(where));
  }
```

- [ ] **Step 2: เพิ่ม RPC handler ด้วย literal ชั่วคราว**

เปิด `apps/micro-cluster/src/cluster/cluster/cluster.controller.ts` แทรกต่อจากเมธอด `listCluster` (จบที่บรรทัด 119) ก่อน jsdoc ของ `getClusterById`:

```ts
  /**
   * Returns the fleet-wide capacity aggregate for the caller, unaffected by any list filter
   * คืนค่าสรุปความจุทั้งกองของผู้เรียก โดยไม่ขึ้นกับตัวกรองของรายการ
   * @param payload - Microservice payload carrying the requesting user / ข้อมูล payload จาก microservice ที่มีผู้ใช้ที่ร้องขอ
   * @returns Microservice response with the fleet summary / การตอบกลับ microservice พร้อมค่าสรุปทั้งกอง
   */
  @MessagePattern({ cmd: 'clusters.fleet-summary', service: 'micro-cluster' })
  async fleetSummary(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug(
      { function: 'fleetSummary', payload: payload },
      ClusterController.name,
    );
    const userId = payload.user_id;

    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.clusterService.fleetSummary(userId),
    );
    // handleResult ไม่ใช่ handlePaginatedResult — payload ไม่ใช่รายการและไม่มี `paginate`
    // handlePaginatedResult รู้จักคีย์ `summary` เป็นพิเศษและยกขึ้นบน envelope ใช้ผิดจะได้รูปซ้อน
    // handleResult, not handlePaginatedResult: this payload is not a list and carries no
    // `paginate`. The paginated helper treats a `summary` key specially and hoists it.
    return this.handleResult(result);
  }
```

**หมายเหตุ:** literal `{ cmd: ..., service: ... }` เป็นของชั่วคราวตาม 3 ขั้นที่หัวไฟล์ `packages/rpc-contract/src/contracts/clusters.ts` บังคับ จะถูกแทนที่ใน Step 4

- [ ] **Step 3: รัน generator เพื่อสร้าง contract entry**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
```

ตรวจว่าไฟล์ `packages/rpc-contract/src/contracts/clusters.ts` มีบรรทัดใหม่โผล่มา:

```bash
grep -n "fleetSummary" packages/rpc-contract/src/contracts/clusters.ts
```

Expected: เจอบรรทัดหน้าตาประมาณ `fleetSummary: rpc('clusters.fleet-summary', 'micro-cluster').restTodo(),`

- [ ] **Step 4: แทนที่ literal ด้วย contract reference**

ใน `cluster.controller.ts` เปลี่ยน:

```ts
  @MessagePattern({ cmd: 'clusters.fleet-summary', service: 'micro-cluster' })
```

เป็น:

```ts
  @MessagePattern(Clusters.fleetSummary.pattern)
```

(`Clusters` import อยู่แล้วที่บรรทัด 13)

**ห้ามแก้ `packages/rpc-contract/src/contracts/clusters.ts` ด้วยมือเด็ดขาด** — ปล่อยให้ entry เป็น `.restTodo()` ตามที่ generator เขียนให้ เหตุผล:

- generator ทำ `rmSync` ทั้งไดเรกทอรีแล้วเขียนใหม่ทุกครั้ง และค่า `.rest()` มาจาก `proposeRest(cmd, service)` ใน `scripts/rest-path-rules.ts` ซึ่งเป็นฟังก์ชันของ **ชื่อ cmd ล้วน** ไม่ได้อ่าน route ของ gateway เลย — การแก้มือจะถูกลบทิ้งเงียบๆ ครั้งถัดไปที่ใครรัน `gen:rpc-contract`
- `audit:rest-contract` ยอมรับ `.restTodo()` (ฟ้องเฉพาะ entry ที่ไม่มีทั้ง `.rest()` และ `.restTodo()` หรือ path ที่ decided แล้วชนกัน)
- 6 entry พี่น้องใน `Clusters` (`adminScope`, `createUser`, `deleteUser`, `getAllUser`, `getUserById`, `updateUser`) เป็น `.restTodo()` อยู่แล้ว หลายตัวมี route จริงบน gateway
- `.rest()` เป็นเอกสารประกอบ ไม่ใช่พฤติกรรม — endpoint ทำงานเหมือนกันทั้งสองแบบ

**ตรวจว่า diff จำกัดอยู่ที่ไฟล์เดียว:**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git diff --stat -- packages/rpc-contract/src/contracts/
```

Expected: มีแค่ `clusters.ts` เปลี่ยน และเปลี่ยนแค่ 1 บรรทัด (entry ใหม่) · ยืนยันแล้วว่า repo ตรงกับ generator อยู่ก่อนเริ่มงาน ถ้าเห็นไฟล์อื่นเปลี่ยนให้หยุดและรายงาน

- [ ] **Step 5: ตรวจว่าไม่เหลือ `@MessagePattern` แบบ literal**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:message-pattern-literal
```

Expected: PASS — สคริปต์นี้ **ไม่มี allowlist** และ baseline เป็นศูนย์ ถ้าแดงแปลว่า Step 4a ยังไม่ได้ทำ

- [ ] **Step 6: rebuild `rpc-contract` แล้ว type-check ทั้งสอง package**

**6a. rebuild package ก่อนเสมอ** — `micro-cluster` import contract ผ่าน `dist/` ไม่ใช่ `src/` ถ้าข้ามขั้นนี้ `tsc` จะอ่าน `dist/*.d.ts` ตัวเก่าที่ยังไม่มี `fleetSummary` แล้วฟ้อง error ที่ไม่มีอยู่จริง (`dist/` อยู่ใน gitignore จึงไม่มีอะไรบอกใบ้ว่าค้าง)

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/rpc-contract && bun run build:package
```

Expected: ไม่มี error

**6b. type-check contract package**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/rpc-contract && bun run check-types
```

Expected: ไม่มี error

**6c. type-check micro-cluster**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster && bun run check-types
```

Expected: ไม่มี error · ถ้าฟ้องว่า `Property 'fleetSummary' does not exist on type ...` ให้กลับไปทำ 6a ก่อน อย่าไปแก้โค้ดตาม error

- [ ] **Step 7: รันชุดเทสต์เดิมของ micro-cluster**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster && bunx jest --runInBand --forceExit
```

Expected: PASS ทุกชุด — โดยเฉพาะ `src/cluster/cluster/cluster.service.spec.ts` ที่บรรทัด 487 ทดสอบ `summary` ผ่าน `listCluster` ซึ่ง **ต้องไม่กระทบ** เพราะเราไม่ได้แตะ `listCluster` เลย ถ้าชุดนี้แดงแปลว่าเผลอแก้ `listCluster` หรือ `buildFleetSummary`

- [ ] **Step 8: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feature/cluster-fleet-summary-endpoint
git add apps/micro-cluster/src/cluster/cluster/cluster.service.ts \
        apps/micro-cluster/src/cluster/cluster/cluster.controller.ts \
        packages/rpc-contract/src/contracts/clusters.ts
git commit -m "feat(micro-cluster): เพิ่ม RPC clusters.fleet-summary ที่ไม่รับตัวกรอง

buildFleetSummary รับ where อยู่แล้ว จึงส่งเฉพาะขอบเขตสิทธิ์ของผู้เรียกเข้าไป
ต่างจาก summary ที่แนบมากับ listCluster ซึ่งผูกกับ search/advance ของคำขอนั้น

จงใจไม่มี try/catch แบบ listCluster เพราะที่นี่ summary คือ payload ทั้งหมด"
```

---

### Task 2: gateway — HTTP route `GET /api-system/clusters/summary`

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts` (เพิ่มเมธอดต่อจาก `getlistCluster` ที่จบราวบรรทัด 222)
- Modify: `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts` (แทรก route ระหว่างบรรทัด 129 กับ jsdoc ของ `@Get(':cluster_id')` ที่เริ่มราวบรรทัด 131)
- Modify: `apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts` (doc comment เหนือ `class ClusterFleetSummaryDto` บรรทัด 113-121)

**Interfaces:**
- Consumes: `Clusters.fleetSummary` (จาก Task 1) · `this.rpc.send(contract, payload)` · `Result.ok` / `Result.fromMicroserviceError` (import อยู่แล้วบรรทัด 5) · `ClusterFleetSummaryDto` (import อยู่แล้วที่ controller บรรทัด 58)
- Produces: `GET /api-system/clusters/summary` → `{ data: FleetSummary, status: 200, ... }` ที่ Task 4 ใช้

---

- [ ] **Step 1: เพิ่มเมธอด `getFleetSummary` ใน `PlatformClustersService`**

เปิด `platform_clusters.service.ts` แทรกต่อจากจุดจบของ `getlistCluster` (บรรทัดที่ปิดด้วย `}` หลัง `return Result.ok({ data: clusters, paginate: ..., ...})` ราวบรรทัด 222):

```ts
  /**
   * Fetch the fleet-wide capacity aggregate for the requesting user
   * ดึงค่าสรุปความจุทั้งกองสำหรับผู้ใช้ที่ร้องขอ
   *
   * No filter travels with this call by design — the endpoint's contract is "always the whole
   * readable fleet". Anything filter-scoped is what the list route's `summary` block is for.
   * จงใจไม่ส่งตัวกรองไปด้วย — สัญญาของ endpoint นี้คือ "ทั้ง fleet ที่อ่านได้เสมอ"
   * @param user_id - Requesting user ID / รหัสผู้ใช้ที่ร้องขอ
   * @param tenant_id - Tenant ID / รหัสผู้เช่า
   * @param version - API contract version / เวอร์ชันสัญญา API
   * @returns Result carrying the fleet summary / Result ที่มีค่าสรุปทั้งกอง
   */
  async getFleetSummary(
    user_id: string,
    tenant_id: string,
    version: string,
  ): Promise<unknown> {
    this.logger.debug(
      {
        function: 'getFleetSummary',
        user_id,
        tenant_id,
        version,
      },
      PlatformClustersService.name,
    );
    const response = await this.rpc.send(Clusters.fleetSummary, {
      user_id: user_id,
      tenant_id: tenant_id,
      version: version });

    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }

    // ไม่มี logo/avatar ให้ resolve — payload เป็นตัวเลขล้วน จึงไม่มีลูป Promise.all แบบ
    // getlistCluster · `response.data` คือ FleetSummary ที่ handleResult ฝั่ง micro-cluster วางไว้
    // No file tokens to resolve here: the payload is numbers only.
    return Result.ok(response.data);
  }
```

- [ ] **Step 2: เพิ่ม HTTP route ใน `PlatformClustersController`**

เปิด `platform_clusters.controller.ts` แทรกบล็อกนี้ **หลัง** เมธอด `getListCluster` (ปิดที่บรรทัด 129 ด้วย `}`) และ **ก่อน** jsdoc ของ `@Get(':cluster_id')`:

```ts
  /**
   * Get the fleet-wide capacity summary, unaffected by any list filter
   * ดึงค่าสรุปความจุทั้งกอง โดยไม่ขึ้นกับตัวกรองของรายการ
   *
   * MUST stay above `@Get(':cluster_id')`. Nest matches routes in declaration order, so a
   * route declared below it would never run — 'summary' would be captured as a cluster_id and
   * the caller would get a "cluster not found" that looks like a data problem, not a routing one.
   * ต้องอยู่เหนือ `@Get(':cluster_id')` เสมอ — Nest จับคู่ตามลำดับที่ประกาศ ถ้าอยู่ใต้จะไม่ถูกเรียกเลย
   * เพราะ 'summary' จะถูกจับเป็น cluster_id แล้วผู้เรียกจะได้ error ที่ดูเหมือนปัญหาข้อมูล ไม่ใช่ปัญหา route
   *
   * Takes `version` and nothing else on purpose: no `@Query()` for search/filter/advance. The
   * contract is "always the whole fleet"; adding a filter would make it a duplicate of the list
   * route's `summary` block on the day it lands.
   * รับเฉพาะ `version` โดยตั้งใจ ไม่มี @Query() ของตัวกรอง — การเพิ่มตัวกรองทีหลังทำให้ซ้ำกับ
   * `summary` ในรายการทันที
   *
   * Reuses the `cluster.findAll` app-id key rather than minting a new one: a key that is not in
   * an application's allowlist fails as 401, which clients cannot tell apart from an expired
   * token, so a fresh key would log users out in any environment without `allow_all`.
   * ใช้ api_name เดิม `cluster.findAll` แทนการตั้งชื่อใหม่ — ชื่อที่ไม่อยู่ใน allowlist ตอบ 401
   * ซึ่ง client แยกจาก token หมดอายุไม่ออก จะกลายเป็นการเตะผู้ใช้ออกจากระบบ
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param version - API version / เวอร์ชัน API
   * @returns Fleet capacity summary / ค่าสรุปความจุทั้งกอง
   */
  @Get('summary')
  @UseGuards(new AppIdGuard('cluster.findAll'), PlatformPermissionGuard)
  @RequirePlatformPermission('cluster.read')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiOperation({
    summary: 'Get fleet-wide cluster capacity summary',
    description:
      'Returns business-unit and user-seat capacity totals plus status counts across every cluster the caller can read. Unlike the `summary` block on the cluster list, this endpoint accepts no search or filter parameters and always describes the whole readable fleet — it is what a capacity band sitting above a filter should read.\n\nคืนยอดรวมความจุหน่วยธุรกิจและที่นั่งผู้ใช้ พร้อมจำนวนตามสถานะ ของทุกคลัสเตอร์ที่ผู้เรียกอ่านได้ ไม่รับตัวกรองใดๆ และอธิบายทั้งกองเสมอ',
    operationId: 'platformCluster_fleetSummary',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiStdResponse(ClusterFleetSummaryDto, {
    description: 'Resource retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  async getFleetSummary(
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug(
      {
        function: 'getFleetSummary',
        version,
      },
      PlatformClustersController.name,
    );
    const { user_id, tenant_id } = ExtractRequestHeader(req);
    const result = await this.clusterService.getFleetSummary(
      user_id,
      tenant_id,
      version,
    );
    this.respond(res, result);
  }
```

**ไม่ใส่ `@EnrichAuditUsers()`** — payload ไม่มี `created_by`/`updated_by` ให้ enrich

- [ ] **Step 3: แก้ doc comment ของ `ClusterFleetSummaryDto` ให้ครอบทั้งสองการใช้งาน**

เปิด `apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts` หา doc comment เหนือ `export class ClusterFleetSummaryDto` (บรรทัด 113-121) แล้วแทนที่ทั้งบล็อกด้วย:

```ts
/**
 * Fleet capacity aggregate — used by two routes whose scoping rules differ
 * ค่าสรุปความจุทั้งกอง — ใช้กับสอง route ที่มีกฎขอบเขตต่างกัน
 *
 * On `GET /clusters` it rides alongside `data`/`paginate` and describes every cluster matching
 * the current `advance` filter, `search` AND the caller's platform scope — not the whole
 * registry and not just the current page.
 * ที่ `GET /clusters` มันมาคู่กับ `data`/`paginate` และอธิบายทุกคลัสเตอร์ที่ตรงกับตัวกรอง
 * `advance`, `search` และขอบเขตสิทธิ์ของผู้เรียก
 *
 * On `GET /clusters/summary` it is the whole payload and describes the caller's entire readable
 * fleet — that route accepts no filter at all. Same fields, different question answered: read
 * the route before comparing two numbers built from this shape.
 * ที่ `GET /clusters/summary` มันคือ payload ทั้งหมด และอธิบายทั้ง fleet ที่ผู้เรียกอ่านได้ —
 * route นั้นไม่รับตัวกรองเลย ฟิลด์เดียวกันแต่ตอบคนละคำถาม อย่าเทียบตัวเลขสองที่โดยไม่ดู route
 */
```

- [ ] **Step 4: ตรวจว่า app-api catalog ไม่ drift**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:app-api-catalog-drift
```

Expected: PASS **โดยไม่ต้องรัน generator ใดๆ** — เพราะเราใช้ `'cluster.findAll'` ที่มีอยู่ในแคตตาล็อกแล้ว ถ้าแดงแปลว่าเผลอตั้ง api_name ใหม่ ให้กลับไปแก้ Step 2 ให้เป็น `'cluster.findAll'` (ห้ามแก้ด้วยการรัน generator เพิ่ม entry — นั่นเปลี่ยนข้อกำหนดใน Global Constraints)

- [ ] **Step 5: ตรวจ REST contract และ swagger**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:rest-contract
bun run swagger:verify
```

Expected: PASS ทั้งคู่ · `audit:rest-contract` เทียบ `.rest('GET', '/clusters/summary')` ใน contract กับ route จริง ถ้าแดงแปลว่า path ในสองที่ไม่ตรงกัน

- [ ] **Step 6: rebuild `rpc-contract` แล้ว type-check gateway**

**6a.** gateway ก็ import `Clusters` ผ่าน `dist/` เหมือนกัน และ `dist/` อยู่ใน gitignore จึงไม่ติดมากับ commit ของ Task 1 — ถ้า task นี้รันในเซสชันใหม่หรือเครื่องอื่น ต้อง build ซ้ำ

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/rpc-contract && bun run build:package
```

**6b.**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway && bun run check-types
```

Expected: ไม่มี error · ถ้าฟ้องว่าไม่รู้จัก `Clusters.fleetSummary` ให้ทำ 6a ก่อน อย่าแก้โค้ดตาม error

- [ ] **Step 7: รันชุดเทสต์เดิมของ gateway**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway && bunx jest --runInBand --forceExit
```

Expected: PASS ทุกชุด รวม `platform_clusters.controller.spec.ts` และ `platform_clusters.service.spec.ts`

- [ ] **Step 8: ยืนยันลำดับ route ด้วยตา**

```bash
grep -n "@Get(" apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts
```

Expected: บรรทัดของ `@Get('summary')` ต้องมีเลขบรรทัด **น้อยกว่า** บรรทัดของ `@Get(':cluster_id')` ถ้ากลับกันให้ย้ายบล็อกขึ้น

- [ ] **Step 9: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feature/cluster-fleet-summary-endpoint 2>/dev/null || git checkout feature/cluster-fleet-summary-endpoint
git add apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts \
        apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts \
        apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts
git commit -m "feat(gateway): เพิ่ม GET /api-system/clusters/summary

route ต้องอยู่เหนือ @Get(':cluster_id') ไม่งั้น Nest จับ summary เป็น cluster_id
ใช้ AppIdGuard('cluster.findAll') เดิม ไม่ตั้งชื่อใหม่ เพราะชื่อที่ไม่อยู่ใน
allowlist ตอบ 401 ซึ่ง client แยกจาก token หมดอายุไม่ออก = เตะผู้ใช้ออกจากระบบ

ไม่รับ @Query() ของตัวกรองเลย เป็นการบังคับสัญญาที่ระดับ signature"
```

---

### Task 3 (GATE — ไม่ใช่งานเขียนโค้ด): deploy backend แล้วพิสูจน์ว่า route มีจริง

**หยุดที่นี่ ส่งกลับให้ผู้ใช้** — ผู้ช่วยห้าม merge หรือ push เข้า `main` เอง

ผู้ใช้เป็นคน merge branch `feature/cluster-fleet-summary-endpoint` ของ backend เข้า `main` (push `main` จะ auto-deploy DEV)

หลัง deploy แล้ว **ต้องพิสูจน์ว่า route มีจริง — ห้ามใช้ `/version` เป็นหลักฐาน** ยิงคู่เทียบ:

```bash
# ต้องได้ 200 พร้อม data ที่เป็น FleetSummary
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$BASE/api-system/clusters/summary"

# ต้องได้ error ของ :cluster_id (invalid uuid / not found) — คนละแบบกับอันบน
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$BASE/api-system/clusters/summary-typo"
```

**ถ้าสองคำสั่งตอบเหมือนกัน = route ใหม่ยังไม่ขึ้น** — `summary` กำลังถูกจับเป็น `cluster_id` อยู่ ห้ามเริ่ม Part B

Part B เริ่มได้ก็ต่อเมื่อคำสั่งแรกตอบ 200 และคำสั่งที่สองตอบต่างจากคำสั่งแรก

---

# Part B — Frontend (`carmen-platform`)

### Task 4: `clusterService.getFleetSummary()` + สถานะ error ของ `FleetCapacity`

สองส่วนนี้เป็นการต่อท่อล้วน ยังไม่มีใครเรียก จึงไม่เปลี่ยนพฤติกรรมของหน้าใดเลย — ทำให้ Task 5/6 เป็นการสลับแหล่งข้อมูลอย่างเดียว

**Files:**
- Modify: `src/services/clusterService.ts`
- Modify: `src/pages/clusterManagement/FleetCapacity.tsx`

**Interfaces:**
- Consumes: `api` จาก `./api` · `FleetSummary` จาก `../types`
- Produces: `clusterService.getFleetSummary(): Promise<FleetSummary>` และ prop `error?: boolean` บน `<FleetCapacity>` ที่ Task 5/6 ใช้

---

- [ ] **Step 1: เพิ่ม `getFleetSummary` ใน `clusterService`**

เปิด `src/services/clusterService.ts` เพิ่ม `FleetSummary` เข้า import ที่บรรทัด 3:

```ts
import type { PaginateParams, Cluster, ClustersResponse, FleetSummary } from '../types';
```

แล้วแทรกเมธอดนี้ต่อจาก `getAll` (จบที่บรรทัด 13 ด้วย `},`):

```ts
  /**
   * ค่าสรุปความจุทั้ง fleet — endpoint นี้ไม่รับตัวกรองใดๆ ตัวเลขจึงไม่ขยับตามช่องค้นหาของตาราง
   * ต่างจาก `summary` ที่แนบมากับ `getAll` ซึ่งผูกกับ query ของคำขอนั้น (ถูกสำหรับรายการ
   * แต่ผิดสำหรับแถบสรุปที่อยู่เหนือตัวกรอง) อย่าสลับสองแหล่งนี้แทนกัน
   */
  getFleetSummary: async (): Promise<FleetSummary> => {
    const response = await api.get('/api-system/clusters/summary');
    return response.data.data || response.data;
  },
```

- [ ] **Step 2: เพิ่ม prop `error` และสถานะ "Capacity unavailable" ใน `FleetCapacity`**

เปิด `src/pages/clusterManagement/FleetCapacity.tsx` เพิ่ม `error` เข้า destructure ของ props (ในบล็อก `export function FleetCapacity({ ... })` ที่เริ่มบรรทัด 54) และเข้า type annotation ของ props:

```tsx
  error = false,
```

และในบล็อก type:

```tsx
  /**
   * true = โหลดค่าสรุปไม่สำเร็จ (ต่างจาก loading ที่แปลว่ากำลังโหลด)
   * ไม่มี fallback สำหรับ endpoint นี้โดยตั้งใจ ความล้มเหลวจึงต้องมองเห็นได้ ไม่ใช่ปลอมตัวเป็น
   * skeleton ที่หมุนไม่จบ ซึ่งบอกผู้ใช้ว่า "กำลังโหลด" ทั้งที่จริงคือ "โหลดไม่ได้"
   */
  error?: boolean;
```

แล้วแทนที่เงื่อนไข render ที่บรรทัด 80 จาก:

```tsx
      {loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-28" />
        </div>
      ) : (
```

เป็น:

```tsx
      {error && !summary ? (
        <p className="text-muted-foreground text-xs">Capacity unavailable</p>
      ) : loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-28" />
        </div>
      ) : (
```

**ลำดับเงื่อนไขสำคัญ:** `error && !summary` ต้องมาก่อน `loading` — ถ้าเคยโหลดสำเร็จมาก่อนแล้วครั้งถัดไปพัง ให้คงตัวเลขเดิมไว้ดีกว่าล้างทิ้ง

- [ ] **Step 3: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ไม่มี error ทั้งสองคำสั่ง

- [ ] **Step 4: รันชุดเทสต์เดิมทั้งหมด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test
```

Expected: PASS ทุกชุด — task นี้เป็นการเพิ่มล้วน ไม่มีผู้เรียกใหม่ จึงไม่ควรมีอะไรแดง

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/services/clusterService.ts src/pages/clusterManagement/FleetCapacity.tsx
git commit -m "feat(cluster): ต่อท่อ getFleetSummary + สถานะ Capacity unavailable

endpoint ใหม่ไม่รับตัวกรอง ตัวเลขจึงไม่ขยับตามช่องค้นหา
สถานะ error แยกจาก loading เพราะเราจงใจไม่มี fallback ความล้มเหลวจึงต้องมองเห็นได้
แทนที่จะเป็น skeleton ที่หมุนไม่จบ

ยังไม่มีหน้าไหนเรียก — พฤติกรรมยังไม่เปลี่ยน"
```

---

### Task 5: `/clusters` ย้ายมาใช้ endpoint ใหม่

นี่คือ task ที่ปิดบั๊กจริง 2 ตัว: แถบเดินตาม filter และ `loadFleet()` ใน `handleConfirmDelete` ที่เป็น no-op

**Files:**
- Modify: `src/pages/ClusterManagement.tsx` (บรรทัด 26, 165, 179-213, 306, 487-493)
- Modify: `src/pages/ClusterManagement.test.tsx` (บรรทัด 47-49 และ `beforeEach` ราวบรรทัด 62-66)

**Interfaces:**
- Consumes: `clusterService.getFleetSummary()` และ prop `error` ของ `<FleetCapacity>` (Task 4)
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

---

- [ ] **Step 1: เพิ่ม state `fleetError` และเขียน `loadFleet` ใหม่**

เปิด `src/pages/ClusterManagement.tsx`

1a. **ลบทั้งบรรทัด 26** — ตรวจแล้วว่าบรรทัดนี้ import แค่ตัวเดียว ไม่มีอย่างอื่นติดมา:

```ts
import { summarizeFleet } from '../utils/capacity';
```

1b. เพิ่ม state ใหม่ต่อจากบรรทัด 71 (`const [fleetLoading, setFleetLoading] = useState(true);`):

```ts
  const [fleetError, setFleetError] = useState(false);
```

1c. แทนที่ `loadFleet` ทั้งก้อน (บรรทัด 179-213 ตั้งแต่คอมเมนต์ `// Fleet-capacity strip:` ถึง `}, []);`) ด้วย:

```ts
  // แถบความจุอ่านจาก endpoint เฉพาะทางที่ไม่รับตัวกรองเลย ตัวเลขจึงเป็นของทั้ง fleet เสมอ
  // ไม่ขยับตามช่องค้นหาหรือ filter ของตารางด้านล่าง — ซึ่งเป็นสิ่งที่ปุ่มสถิติ "quota expiring"
  // ต้องการ เพราะมันมีไว้ *เปิด* filter ถ้าตัวเลขมาจากผลที่ filter แล้วปุ่มจะดับเมื่อค้นหาอย่างอื่น
  //
  // The band reads a dedicated endpoint that takes no filter, so the numbers always describe
  // the whole fleet. That is what the "quota expiring" stat needs: it exists to APPLY a filter,
  // so a count derived from an already-filtered set makes the button a dead end.
  //
  // จงใจไม่มี fallback ไปที่ `getAll({ perpage: 1 })` — fallback แบบนั้นคือสิ่งที่ทำให้หน้านี้
  // มีสามแหล่งข้อมูลตั้งแต่แรก ถ้า endpoint ยังไม่ deploy ให้แถบบอกตรงๆ ว่าโหลดไม่ได้
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const summary = await clusterService.getFleetSummary();
      setFleet(summary);
      setFleetError(false);
    } catch (err: unknown) {
      devLog('Error loading fleet summary:', err);
      setFleetError(true);
    } finally {
      setFleetLoading(false);
    }
  }, []);
```

**สังเกต:** ไม่มี guard `setFleet((current) => current ?? …)` อีกแล้ว — guard ตัวนั้นทำให้ `loadFleet()` ใน `handleConfirmDelete` เป็น no-op มาตลอด การเอาออกคือการซ่อมฟีเจอร์ที่ไม่เคยทำงาน ไม่ใช่การทำความสะอาด

**สังเกต 2:** ไม่ `setFleet(null)` ตอน error — ถ้าเคยโหลดสำเร็จมาก่อนให้คงตัวเลขเดิมไว้ ดีกว่าล้างทิ้งแล้วโชว์ error ทั้งที่มีค่าเก่าอยู่

- [ ] **Step 2: ลบบรรทัดที่เอา `summary` ของรายการมาเขียนทับแถบ**

ใน `fetchClusters` ลบ 3 บรรทัดนี้ (บรรทัด 163-165):

```ts
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadFleet` below still fills the gap in the meantime.
      if (data.summary) setFleet(data.summary);
```

**นี่คือบรรทัดที่ทำให้แถบเดินตาม filter** — `summary` ที่มากับ `GET /clusters` ผูกกับ `search`/`advance` ของคำขอนั้น

- [ ] **Step 3: ส่ง prop `error` ให้ `<FleetCapacity>`**

หา `<FleetCapacity` ที่บรรทัด 487 เพิ่ม prop ต่อจาก `loading={fleetLoading}`:

```tsx
          error={fleetError}
```

- [ ] **Step 4: ตรวจว่า `handleConfirmDelete` ยังเรียก `loadFleet()` อยู่**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -n "loadFleet()" src/pages/ClusterManagement.tsx
```

Expected: เจอ 2 จุด — ใน `useEffect` และใน `handleConfirmDelete` · **ห้ามลบจุดใดจุดหนึ่ง** ตอนนี้ทั้งสองทำงานจริงแล้ว

- [ ] **Step 5: เติม `getFleetSummary` เข้า mock ของเทสต์เดิม**

เปิด `src/pages/ClusterManagement.test.tsx` เปลี่ยนบรรทัด 47-49 จาก:

```ts
vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn(), delete: vi.fn() },
}));
```

เป็น:

```ts
vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn(), delete: vi.fn(), getFleetSummary: vi.fn() },
}));
```

แล้วใน `beforeEach` เพิ่มค่าเริ่มต้นต่อจากบรรทัด `asMock(clusterService.getAll).mockResolvedValue({ ... });`:

```ts
  asMock(clusterService.getFleetSummary).mockResolvedValue({
    total: 2, active: 2, inactive: 0, deleted: 0, near_limit: 0, expiring_soon: 0,
    bu: { used: 14, cap: 20, uncapped_count: 0, uncapped_used: 0 },
    users: { used: 105, cap: 250, uncapped_count: 0, uncapped_used: 0 },
  });
```

**ทำไมต้องทำ:** mock เป็นแบบระบุคีย์ ถ้าไม่เติม หน้าจะเรียก `undefined()` แล้ว **ทุกเทสต์ในไฟล์พังพร้อมกัน** โดย error จะชี้ไปที่ render ไม่ใช่ที่ mock

- [ ] **Step 6: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ไม่มี error · ถ้า `summarizeFleet` ยังถูก import อยู่จะแดงที่นี่

- [ ] **Step 7: รันชุดเทสต์เดิมทั้งหมด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test
```

Expected: PASS ทุกชุด · `capacity.test.ts` ยังเขียวอยู่เพราะ `summarizeFleet` ยังไม่ถูกลบ (ลบใน Task 7)

- [ ] **Step 8: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b feature/cluster-fleet-summary-endpoint 2>/dev/null || git checkout feature/cluster-fleet-summary-endpoint
git add src/pages/ClusterManagement.tsx src/pages/ClusterManagement.test.tsx
git commit -m "fix(clusters): แถบ Fleet capacity เลิกเดินตามช่องค้นหา

summary ที่มากับ GET /clusters ผูกกับ search/advance ของคำขอนั้น การเอามาเขียนทับ
แถบทำให้ค้น ZEBRA แล้วแถบกลายเป็น 1 cluster และปุ่ม quota expiring ที่มีไว้เปิด
filter นับจากผลที่ filter แล้ว = ทางตัน

ย้ายมาใช้ GET /clusters/summary ที่ไม่รับตัวกรอง และเอา guard current ?? ออก
ซึ่งทำให้ loadFleet() ใน handleConfirmDelete ทำงานจริงเป็นครั้งแรก"
```

---

### Task 6: `/licenses` ย้ายมาใช้ endpoint ใหม่

**Files:**
- Modify: `src/pages/licenses/LicenseCenter.tsx` (บรรทัด 41-42, 56-81, 93-99)

**Interfaces:**
- Consumes: `clusterService.getFleetSummary()` และ prop `error` ของ `<FleetCapacity>` (Task 4)
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

---

- [ ] **Step 1: เพิ่ม state `fleetError` และเขียน `loadFleet` ใหม่**

เปิด `src/pages/licenses/LicenseCenter.tsx`

1a. เพิ่ม state ต่อจากบรรทัด 42 (`const [fleetLoading, setFleetLoading] = useState(true);`):

```ts
  const [fleetError, setFleetError] = useState(false);
```

1b. แทนที่บล็อก `loadFleet` ทั้งหมด (ตั้งแต่คอมเมนต์ `// แถบสรุปต้องเห็นภาพรวมทั้ง fleet` ราวบรรทัด 56 ถึง `}, []);` ราวบรรทัด 76) ด้วย:

```ts
  // แถบสรุปอ่านจาก endpoint เฉพาะทางที่ไม่รับตัวกรองเลย จึงเป็นตัวเลขทั้ง fleet เสมอ
  // ตัวกรอง "โควตาใกล้หมดอายุ" ด้านล่างกรองแค่ตาราง ไม่แตะแถบนี้ — พฤติกรรมเดิมไม่เปลี่ยน
  // เปลี่ยนแค่แหล่งที่มา (เดิมขอ `perpage: 1` แล้วหยิบ `summary` ที่แนบมา ซึ่งต้องขอ 1 แถว
  // ที่ไม่ได้ใช้เลยเพื่อให้ backend คำนวณให้)
  //
  // The band reads a dedicated no-filter endpoint. The expiring-soon toggle below filters only
  // the table; it never touched this band and still does not.
  const loadFleet = useCallback(async () => {
    setFleetLoading(true);
    try {
      const summary = await clusterService.getFleetSummary();
      setFleet(summary);
      setFleetError(false);
    } catch {
      setFleetError(true); // แถบบอกว่าโหลดไม่ได้ — ตารางด้านล่างยังทำงานได้ตามปกติ
    } finally {
      setFleetLoading(false);
    }
  }, []);
```

- [ ] **Step 2: ส่ง prop `error` ให้ `<FleetCapacity>`**

หา `<FleetCapacity` ที่บรรทัด 93 เพิ่ม prop ต่อจาก `loading={fleetLoading}`:

```tsx
          error={fleetError}
```

- [ ] **Step 3: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ไม่มี error · ถ้า import ของ `clusterService` หรือ `FleetSummary` ไม่ได้ใช้แล้วจะแดงที่นี่ (ยังใช้ทั้งคู่ จึงไม่ควรแดง)

- [ ] **Step 4: รันชุดเทสต์เดิมทั้งหมด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test
```

Expected: PASS ทุกชุด · หน้านี้ไม่มีเทสต์ระดับหน้า (มีแค่ `SubscriptionForm.test.tsx` และ `SubscriptionTable.test.tsx` ซึ่งไม่แตะแถบสรุป)

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/licenses/LicenseCenter.tsx
git commit -m "refactor(licenses): แถบสรุปอ่านจาก GET /clusters/summary

ความหมายเดิมถูกอยู่แล้ว (ทั้ง fleet ไม่ถูกกรอง) เปลี่ยนแค่แหล่งที่มา —
เลิกท่าขอ perpage:1 เพื่อให้ backend แนบ summary มากับแถวที่ไม่ได้ใช้"
```

---

### Task 7: ลบโค้ดตาย

ทำหลัง Task 5 และ 6 เท่านั้น — ทั้งสองเป็นผู้เรียกตัวสุดท้าย

**Files:**
- Modify: `src/utils/capacity.ts` (ลบ `isNearLimit` บรรทัด 31-35 และ `summarizeFleet` บรรทัด 76-131 พร้อม `ClusterLike` ที่ใช้เฉพาะมัน)
- Modify: `src/utils/capacity.test.ts` (ลบ `describe('isNearLimit')` บรรทัด 24-31 และ `describe('summarizeFleet')` บรรทัด 33-64)

**Interfaces:**
- Consumes: ไม่มี
- Produces: ไม่มี

---

- [ ] **Step 1: ยืนยันว่าไม่มีผู้เรียกเหลือจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -rn "summarizeFleet\|isNearLimit" src/
```

Expected: เจอเฉพาะใน `src/utils/capacity.ts` (นิยาม + การเรียกกันเองภายใน `summarizeFleet`) และ `src/utils/capacity.test.ts` **ถ้าเจอที่อื่นให้หยุดและรายงาน** — แปลว่า Task 5/6 ยังไม่เสร็จ

- [ ] **Step 2: ลบ `isNearLimit` และ `summarizeFleet` ออกจาก `capacity.ts`**

เปิด `src/utils/capacity.ts` แล้วลบ:

1. ฟังก์ชัน `isNearLimit` พร้อม jsdoc เหนือมัน (บรรทัด 31-35)
2. `interface ClusterLike` พร้อม comment (บรรทัด 66-74) — ใช้เฉพาะ `summarizeFleet`
3. ฟังก์ชัน `summarizeFleet` พร้อม jsdoc ยาวเหนือมัน (บรรทัด 76-131)
4. `import type { FleetSummary } from '../types';` ที่บรรทัด 7 — ใช้เฉพาะ `summarizeFleet`

**ห้ามลบ:** `utilization()`, `Utilization`, `CapLevel`, `NEAR`, `seatUtilization()`, `SeatUtilization` — ยังมีผู้เรียกอยู่ 4 จุด

หลังลบแล้วแก้คอมเมนต์หัวไฟล์ (บรรทัด 1-5) ที่อ้างถึง "TEMPORARY FALLBACK" ให้ตรงความจริงใหม่ และแก้ jsdoc ของ `seatUtilization` ที่บรรทัด 40-42 ซึ่งเขียนว่า `utilization()` มีผู้เรียกคือ `summarizeFleet` ให้ตัดชื่อนั้นออก (เหลือ `CapacityMeter`, `CapacityGauge`, `ClusterPlate`, `CapacityStrip`)

- [ ] **Step 3: ลบ describe ที่คู่กันออกจาก `capacity.test.ts`**

เปิด `src/utils/capacity.test.ts` แล้วลบ:

1. `describe('isNearLimit', () => { ... });` ทั้งบล็อก (บรรทัด 24-31)
2. `describe('summarizeFleet', () => { ... });` ทั้งบล็อก (บรรทัด 33-64) พร้อมตัวแปร `clusters` ที่ประกาศไว้ใช้เฉพาะในนั้น
3. แก้ import ที่บรรทัด 2 ให้เหลือเฉพาะสิ่งที่ยังใช้:

```ts
import { utilization, seatUtilization } from './capacity';
```

**ห้ามลบ:** `describe('utilization')` (บรรทัด 4-22) และ `describe('seatUtilization')` (บรรทัด 66-99)

- [ ] **Step 4: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ไม่มี error · import ที่ค้างจะแดงที่นี่

- [ ] **Step 5: รันชุดเทสต์เดิมทั้งหมด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test
```

Expected: PASS ทุกชุด และจำนวนเทสต์ที่รันต้อง **ลดลง** จากรอบก่อน (เพราะลบ describe ไป 2 บล็อก)

- [ ] **Step 6: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/utils/capacity.ts src/utils/capacity.test.ts
git commit -m "chore(capacity): ลบ summarizeFleet และ isNearLimit ที่ไม่มีผู้เรียกแล้ว

fallback ฝั่ง frontend หมดหน้าที่เมื่อ GET /clusters/summary รับงานไป
utilization() ยังอยู่ — ยังมีผู้เรียก 4 จุด"
```

---

## Final Verification (หลังทุก task เสร็จ)

รันด้วยมือ ไม่ใช่อัตโนมัติ — ตารางนี้มาจาก §7.1 ของ spec

ตัวแปรที่ใช้ใน curl ด้านล่าง: `$BASE` = ค่า `REACT_APP_API_BASE_URL` และ `$APP_ID` = ค่า `REACT_APP_API_APP_ID` จากไฟล์ env ที่ตรงกับ environment ที่ทดสอบ (`.env.localhost` / `.env.dev` / `.env.uat` — ทุกไฟล์ gitignored) · `$TOKEN` อ่านจาก `localStorage.getItem('token')` ในเบราว์เซอร์ที่ล็อกอินอยู่

- [ ] **V1: เทียบตัวเลขกับแหล่งเดิม (token super admin)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$BASE/api-system/clusters/summary" | jq .data

curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$BASE/api-system/clusters?perpage=1" | jq .summary
```

Expected: สอง object เท่ากันทุกฟิลด์

- [ ] **V2 (ข้ามไม่ได้): ยิงด้วย token ของ cluster admin**

```bash
curl -s -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  "$BASE/api-system/clusters/summary" | jq '.data.total'
```

Expected: เท่ากับจำนวน cluster ที่ผู้ใช้คนนั้นดูแล **ไม่ใช่จำนวนทั้ง fleet** · ถ้าได้จำนวนทั้ง fleet แปลว่า `clusterScopeFor` ไม่ได้ถูกเรียก — เป็นช่องโหว่ที่ไม่มี error และไม่มี log ให้เห็น ต้องกลับไปแก้ Task 1 Step 1

- [ ] **V3: `/clusters` พิมพ์ค้นหาแล้วแถบต้องไม่ขยับ**

เปิด `http://localhost:3304/clusters` จดตัวเลขในแถบ แล้วพิมพ์ชื่อ cluster ตัวใดตัวหนึ่งในช่องค้นหา

Expected: ตารางกรองเหลือแถวเดียว แต่ตัวเลขในแถบ Fleet capacity **เท่าเดิมทุกช่อง** (ก่อนแก้: แถบจะเปลี่ยนตาม)

- [ ] **V4: `/clusters` ลบ cluster แล้วแถบต้องอัปเดต**

ลบ cluster ที่ไม่มี business unit

Expected: จำนวน `clusters` ในแถบลดลง 1

- [ ] **V5: `/licenses` ตัวเลขเท่าเดิม**

เปิด `http://localhost:3304/licenses`

Expected: ตัวเลขทุกช่องเท่ากับก่อนแก้ และกดปุ่ม "BU quota expiring" แล้วแถบยังไม่ขยับ (ตารางกรอง)

- [ ] **V6: ไม่เหลือคำขอเก่าใน Network**

เปิด DevTools → Network แล้วโหลดทั้งสองหน้าใหม่

Expected: ไม่มีคำขอ `clusters?...perpage=-1` และไม่มี `clusters?...perpage=1` ที่ยิงเพื่อเอา summary · เห็น `clusters/summary` หน้าละ 1 ครั้ง (dev StrictMode อาจเห็น 2 — ปกติ)

---

## หมายเหตุสำหรับผู้ execute

- **Task 1-2** อยู่ใน repo `carmen-turborepo-backend-v2` · **Task 4-7** อยู่ใน repo `carmen-platform` · **Task 3 เป็น gate ที่ต้องหยุดรอผู้ใช้** ห้ามข้าม
- ถ้าถูก dispatch เป็น subagent: **ห้ามเขียนเทสต์ใหม่** ตาม Global Constraints — implement แล้ว type-check/lint แล้ว commit เท่านั้น ข้อนี้ไม่ได้ inherit มาเอง ต้องอ่านจากที่นี่
- ทุก task จบด้วย commit ของตัวเอง ห้ามรวบ commit ข้าม task
