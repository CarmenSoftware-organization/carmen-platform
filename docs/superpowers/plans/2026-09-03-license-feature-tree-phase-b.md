# License feature tree — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ขาย workflow แยกตามประเภทเอกสารได้ — เพิ่ม 3 feature ชั้นที่ 3
(`system_admin.workflow.purchase_request` / `.purchase_order` / `.store_requisition`)
โดยคุมเฉพาะ **การอ่านรายประเภท** ส่วนการเขียนยังตกที่พ่อ `system_admin.workflow` ตามเดิม

**Architecture:** ย้าย `config:workflows` จาก `ROUTE_RESOURCE_MAP` ไปเป็น
`SUB_PATH_RESOURCE_MAP` ที่มี 3 prefix + fallback — ท่าเดียวกับ `app:reports` ที่มีอยู่แล้ว
`resolveRouteFeature` ลองคีย์ 2 ชั้นก่อนอยู่แล้ว จึงไม่ต้องแตะโค้ด gateway เลย
งานทั้งหมดอยู่ที่ตารางแมป + permission seed + การ regenerate

**Tech Stack:** TypeScript · Bun · Prisma (seed เท่านั้น ไม่มี migration) · Jest (gateway spec)

**Spec:** `docs/superpowers/specs/2026-09-03-license-feature-tree-design.md` §5 (โดยเฉพาะ
§5.0 หนี้โพรบสด และ §5.1 ความหมายที่เคาะแล้ว)

## Global Constraints

- **Phase A ต้อง merge เข้า `main` ของทั้งสอง repo ก่อนเริ่ม** — Phase B พึ่ง
  `parent_key` แบบ longest-prefix, `LICENSE_FEATURE_ANCESTORS` และ `assert_no_gap()`
  ถ้ายังไม่ merge ให้หยุดแล้วบอกผู้ใช้ อย่าเริ่มบนกิ่งซ้อน
- **3 repo แต่ `carmen-platform` ไม่ต้องแก้โค้ดเลย** — label/key มาจาก backend และ
  Phase A ทำให้ picker/ชั้นวางรองรับ 3 ชั้นไปแล้ว · repo นี้เก็บแค่เอกสาร
- **ลำดับบังคับ:** `carmen-inventory-frontend-react` ต้อง merge เข้า `main` **ก่อน**
  ที่ PR ของ `carmen-turborepo-backend-v2` จะเขียว — `audit:fe-license-fixture`
  อ่าน `main` ของรีโปนั้นเสมอ (`FE_FIXTURE_REF ?? 'main'`) เป็นด่านใน CI job
  "Audits + type check"
- **ห้ามแก้ไฟล์ generated ด้วยมือ:** `license-catalog.generated.ts`,
  `seed.license-feature.data.ts` (BE) · `constant/__fixtures__/license-catalog.ts` (inventory)
- **BE ไม่มี eslint config ที่ root** — ใช้ `bun run lint:changed` (ตัวเดียวกับ CI)
  หรือ `bunx eslint <path>` ในเวิร์กสเปซ · **ห้าม `bun run lint`** มี `--fix` เขียนทับทั้งรีโป
- **`bun run check-types` คือตัวจริง** — อย่ารัน `tsc -p tsconfig.json` เอง เพราะ
  package script ใส่ `--rootDir .` ไว้ ไม่ใส่แล้วจะได้ TS6059 ปลอมที่
  `verify-swagger.spec.ts`
- **ทุก commit** ปิดท้ายด้วย `Claude-Session: <session url>`
- **merge ด้วย merge commit ไม่ใช่ squash** และ auto-merge ถูกปิดที่ระดับรีโป ต้องกดเอง

## File Structure

**`carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่หลังแก้ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/permission.route-map.ts` | ย้าย `config:workflows` เข้า `SUB_PATH_RESOURCE_MAP` พร้อม 3 prefix |
| `packages/prisma-shared-schema-platform/prisma/seed.permission.data.ts` | เพิ่ม resource ใหม่ 3 ตัว action `view` อย่างเดียว |
| `packages/prisma-shared-schema-platform/prisma/seed.role-permission.ts` | เพิ่มคีย์ใหม่ให้ทุก role ตามรูปที่ `system_admin.workflow` ใช้อยู่ |
| `apps/backend-gateway/src/license/license-catalog.generated.ts` | **generated** |
| `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts` | **generated** |
| `apps/backend-gateway/src/license/license-route-resolver.spec.ts` | เพิ่ม assertion ของ 3 prefix ใหม่ (ต่อในกลุ่มเดิม ไม่สร้างไฟล์ใหม่) |

**`carmen-inventory-frontend-react`**

| ไฟล์ | หน้าที่หลังแก้ |
|---|---|
| `constant/__fixtures__/license-catalog.ts` | **generated** ด้วย `bun run gen:license-fixture` |

**`carmen-platform`** — เอกสารเท่านั้น ไม่มีโค้ด

---

### Task 1 (BE): แมป route รายประเภท + permission seed

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/permission.route-map.ts:117,197-205`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.permission.data.ts` (ท้ายบล็อก `// system admin workflow`)
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.role-permission.ts` (ทุกที่ที่มี `"system_admin.workflow": []`)
- Regenerate: `apps/backend-gateway/src/license/license-catalog.generated.ts`,
  `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts`

**Interfaces:**
- Consumes: `SubPathRule { prefixes: Record<string,string>; fallback: string }` ที่มีอยู่แล้ว ·
  `parent_of()` / `assert_no_gap()` / `build_ancestors()` จาก Phase A
- Produces: feature key ใหม่ 3 ตัว + `LICENSE_ROUTE_FEATURES` entry
  `config:workflows/purchase-request` ฯลฯ — Task 2 (fixture) และ Task 4 (โพรบ) ใช้

- [ ] **Step 1: ยืนยันว่า Phase A ลง `main` แล้ว แล้วเปิด branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
grep -c 'LICENSE_FEATURE_ANCESTORS' apps/backend-gateway/src/license/license-catalog.generated.ts
grep -c 'function parent_of' scripts/generate-license-catalog/run.ts
git checkout -b feat/license-workflow-per-type
```

Expected: `grep -c` ได้ `1` ทั้งสองบรรทัด · ถ้าได้ `0` แปลว่า Phase A ยังไม่ merge
**หยุดทันที บอกผู้ใช้ อย่าทำต่อบนกิ่งซ้อน**

- [ ] **Step 2: ย้าย `config:workflows` ออกจาก `ROUTE_RESOURCE_MAP`**

ลบบรรทัดนี้ออกจาก `ROUTE_RESOURCE_MAP` (บรรทัด 117):

```ts
  "config:workflows": "system_admin.workflow",
```

ตามแบบของ `app:reports` ซึ่ง**ไม่มี**อยู่ใน `ROUTE_RESOURCE_MAP` เลย — มันอยู่ใน
`SUB_PATH_RESOURCE_MAP` อย่างเดียว และ `build_route_features()` ปล่อยทั้ง fallback
และทุก prefix ออกมาให้เอง การทิ้งไว้ทั้งสองที่จะได้ entry ซ้ำที่ SUB_PATH เขียนทับอยู่ดี

**อย่าแตะ** `"app:workflows"` (บรรทัด 80) — คนละ group และไม่มี endpoint รายประเภท
**อย่าแตะ** `"config:workflow-comments"` ใน `SUB_RESOURCE_SEGMENTS`

- [ ] **Step 3: เพิ่มกฎ sub-path**

ใน `SUB_PATH_RESOURCE_MAP` เพิ่มต่อจาก `"app:reports"`:

```ts
  /**
   * `GET /workflows/<type>` แยก endpoint ตามประเภทเอกสารอยู่แล้ว (swagger ของ
   * config_workflows.controller.ts เขียนไว้เองว่า "Each workflow type is its own endpoint
   * so an application can be granted one type without gaining access to the others")
   *
   * fallback คือพ่อโดยตั้งใจ: `GET /workflows` (คืนทุกประเภท), `GET /workflows/:id`,
   * `POST`, `PUT`, `DELETE` ทั้งหมดตกมาที่ `system_admin.workflow` ⇒ **การเขียนคุมที่พ่อ**
   * ไม่ใช่รายประเภท ดูเหตุผลใน §5.1 ของสเปก (`workflow_type` เป็น optional ตอน update
   * และ DELETE ไม่มี body เลย interceptor จึงตัดสินรายประเภทไม่ได้)
   *
   * `:workflow_id` เป็น uuid ไม่มีวันตรง prefix ใด จึงตกมาที่ fallback ตามที่ต้องการ
   */
  "config:workflows": {
    prefixes: {
      "purchase-request": "system_admin.workflow.purchase_request",
      "purchase-order": "system_admin.workflow.purchase_order",
      "store-requisition": "system_admin.workflow.store_requisition",
    },
    fallback: "system_admin.workflow",
  },
```

- [ ] **Step 4: เพิ่ม permission resource — `view` อย่างเดียว**

ใน `seed.permission.data.ts` ต่อท้ายบล็อก `// system admin workflow`:

```ts
  // system admin workflow — per document type (read-only; writes stay on the parent resource)
  // แยกตามประเภทเอกสาร: มีแค่ view เพราะ endpoint รายประเภทมีแต่ GET
  {
    resource: "system_admin.workflow.purchase_request",
    action: "view",
    description: "View purchase request workflow",
  },
  {
    resource: "system_admin.workflow.purchase_order",
    action: "view",
    description: "View purchase order workflow",
  },
  {
    resource: "system_admin.workflow.store_requisition",
    action: "view",
    description: "View store requisition workflow",
  },
```

**เพิ่มแค่ `view`** — ใส่ `create`/`update`/`delete` จะทำให้
`check.endpoint-permission-coverage` รายงาน `EXTRA_ACTION` เพราะไม่มี endpoint รองรับ

- [ ] **Step 5: เพิ่มคีย์ใหม่ลงแมป role → permission**

ใน `seed.role-permission.ts` ทุกจุดที่มี `"system_admin.workflow": []` ให้เพิ่มสามบรรทัด
ต่อท้ายด้วยค่าเดียวกัน:

```ts
    "system_admin.workflow": [],
    "system_admin.workflow.purchase_request": [],
    "system_admin.workflow.purchase_order": [],
    "system_admin.workflow.store_requisition": [],
```

ค่าเป็น `[]` เหมือนพ่อโดยตั้งใจ — role มาตรฐานไม่ได้ถือสิทธิ์ workflow อยู่แล้ว
การให้สิทธิ์เป็นเรื่องที่ตั้งรายลูกค้า ไม่ใช่ค่า default

```bash
grep -c '"system_admin.workflow": \[\]' packages/prisma-shared-schema-platform/prisma/seed.role-permission.ts
```

ใช้ตัวเลขที่ได้ยืนยันว่าแก้ครบทุกจุด (คาดว่า 4)

- [ ] **Step 6: regenerate แล้วตรวจรูปของ catalog**

```bash
bun run generate:license-catalog
grep -A 4 '"key": "system_admin.workflow.purchase_request"' packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts
grep -A 4 '"system_admin.workflow.purchase_request":' apps/backend-gateway/src/license/license-catalog.generated.ts
grep -n 'config:workflows' apps/backend-gateway/src/license/license-catalog.generated.ts
```

Expected:
- `parent_key: "system_admin.workflow"` (**ไม่ใช่** `"system_admin"` — ถ้าได้ตัวหลัง
  แปลว่า `parent_of()` ของ Phase A ไม่ได้อยู่บน `main` จริง)
- `label: "Purchase Request"` (**ไม่ใช่** `"Workflow.purchase Request"`)
- ancestors = `["system_admin", "system_admin.workflow"]`
- `LICENSE_ROUTE_FEATURES` มี 4 entry: `config:workflows` (fallback) +
  `config:workflows/purchase-request` + `/purchase-order` + `/store-requisition`
- generator ต้อง**ไม่โยน** `assert_no_gap` (พ่อ `system_admin.workflow` มีอยู่จริง)

- [ ] **Step 7: ด่านความครอบคลุมของ permission**

```bash
bun run packages/prisma-shared-schema-platform/prisma/check.endpoint-permission-coverage.ts
```

Expected: `VERDICT: COVERED` · ถ้าขึ้น `MISSING_PERMISSION` แปลว่า Step 4 ตกไปตัวใดตัวหนึ่ง
ถ้าขึ้น `EXTRA_ACTION` แปลว่าใส่ action เกิน (ดู Step 4) ถ้าขึ้น `ORPHAN_RESOURCE`
แปลว่า resource ที่เพิ่มไม่มี endpoint ชี้ถึง — กลับไปดู Step 3

- [ ] **Step 8: ต่อ assertion ใน spec เดิมของ resolver**

ใน `apps/backend-gateway/src/license/license-route-resolver.spec.ts` เพิ่ม `describe` ต่อ
จากกลุ่ม `sub-path features (SUB_PATH_RESOURCE_MAP)` ที่มีอยู่ (**ไม่สร้างไฟล์ใหม่**):

```ts
describe('workflow per-type features', () => {
  const WORKFLOW = {
    feature: 'system_admin.workflow',
    ancestors: ['system_admin'],
  };
  const WORKFLOW_PR = {
    feature: 'system_admin.workflow.purchase_request',
    ancestors: ['system_admin', 'system_admin.workflow'],
  };

  it('resolves the per-type read endpoint to its own three-level feature', () => {
    expect(
      resolveRouteFeature('/api/config/T02/workflows/purchase-request'),
    ).toEqual(WORKFLOW_PR);
  });

  it('falls back to the parent for the bare list route (it returns every type)', () => {
    expect(resolveRouteFeature('/api/config/T02/workflows')).toEqual(WORKFLOW);
  });

  // การเขียนคุมที่พ่อโดยตั้งใจ — `workflow_type` เป็น optional ตอน update และ DELETE
  // ไม่มี body เลย interceptor จึงตัดสินรายประเภทไม่ได้ (สเปก §5.1)
  it('falls back to the parent for a workflow id (writes are gated on the parent)', () => {
    expect(
      resolveRouteFeature('/api/config/T02/workflows/7c9e6679-uuid'),
    ).toEqual(WORKFLOW);
  });
});
```

- [ ] **Step 9: รันสวีตและ static ทั้งชุด**

```bash
cd apps/backend-gateway && bunx jest src/license --runInBand --forceExit 2>&1 | grep -E "Tests:|Test Suites:"
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
LINT_BASE_REF=$(git rev-parse main) bun run lint:changed
bun run audit:license-catalog
bun run audit:api-system-permission
bun run audit:app-api-catalog-drift
```

Expected: ทุกอย่างผ่าน · **`audit:fe-license-fixture` จะแดงตอนนี้** และนั่นถูกต้อง —
Task 2 คือตัวแก้ อย่าเพิ่งรันหรือกังวลกับมันในขั้นนี้

- [ ] **Step 10: Commit (ยังไม่ push)**

```
git add packages/prisma-shared-schema-platform/prisma apps/backend-gateway/src/license
```

ข้อความ commit:

```
feat(license): ขาย workflow แยกตามประเภทเอกสารได้ (อ่านอย่างเดียว)

ย้าย config:workflows เข้า SUB_PATH_RESOURCE_MAP พร้อม 3 prefix ท่าเดียวกับ app:reports
ได้ feature ชั้นที่ 3 สามตัว โดยไม่ต้องแตะโค้ด gateway เลย

การเขียนยังคุมที่พ่อ system_admin.workflow ตามเดิม — workflow_type เป็น optional
ตอน update และ DELETE ไม่มี body interceptor จึงตัดสินรายประเภทไม่ได้ (สเปก §5.1)

permission seed เพิ่มแค่ action view เพราะ endpoint รายประเภทมีแต่ GET
ถ้าใส่ครบสี่ check.endpoint-permission-coverage จะรายงาน EXTRA_ACTION

Claude-Session: <session url>
```

---

### Task 2 (inventory FE): อัปเดต fixture แล้ว merge เข้า `main` ก่อน

**Files:**
- Modify (generated): `constant/__fixtures__/license-catalog.ts` ใน
  `/Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react`

**Interfaces:**
- Consumes: `license-catalog.generated.ts` ของ BE จาก Task 1 (สคริปต์อ่านไฟล์นั้นตรงๆ)
- Produces: fixture ที่มีคีย์ใหม่ 3 ตัว — ปลดล็อก `audit:fe-license-fixture` ใน Task 3

**ทำไมต้องมาก่อน:** `scripts/audit-fe-license-fixture/run.ts:54-57` อ่าน
`https://raw.githubusercontent.com/.../carmen-inventory-frontend-react/main/constant/__fixtures__/license-catalog.ts`
คือ **`main` เสมอ** ไม่ใช่ commit ที่กำลังรีวิว ⇒ PR ของ BE จะแดงจนกว่า fixture จะลง `main`

- [ ] **Step 1: เปิด branch จาก `main`**

รีโปนี้ค้างอยู่บนกิ่งอื่น (`fix/drop-dead-legacy-frontend-refs` ตอนสำรวจ) — ต้องกลับ `main` ก่อน

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git status --short
git checkout main && git pull
git checkout -b feat/license-workflow-per-type-fixture
```

ถ้า `git status --short` ไม่ว่าง **หยุดแล้วถามผู้ใช้** อย่า stash หรือทิ้งงานค้างของเขา

- [ ] **Step 2: regenerate fixture**

**เงื่อนไขที่พลาดง่ายที่สุดของ task นี้:** `scripts/gen-license-fixture.ts:30,42` อ่าน
`license-catalog.generated.ts` จาก **sibling checkout ในเครื่อง**
(`../../carmen-turborepo-backend-v2`) ด้วย `readFileSync` ไม่ได้ดึงจาก URL
⇒ working tree ของ BE **ต้องค้างอยู่บนกิ่ง `feat/license-workflow-per-type` ของ Task 1**
ถ้ามันถูก checkout กลับ `main` ไปแล้ว fixture ที่ได้จะไม่มีคีย์ใหม่ และ `git diff`
จะว่างเปล่าโดยไม่มี error ให้เห็น

```bash
git -C ../carmen-turborepo-backend-v2 branch --show-current   # ต้องได้ feat/license-workflow-per-type
grep -c 'system_admin.workflow.purchase_request' ../carmen-turborepo-backend-v2/apps/backend-gateway/src/license/license-catalog.generated.ts
bun run gen:license-fixture
git diff --stat constant/__fixtures__/license-catalog.ts
git diff constant/__fixtures__/license-catalog.ts | grep '^-' | grep -v '^---'
```

Expected: diff มี **เฉพาะบรรทัดที่เพิ่ม** (`+`) สามคีย์ใหม่ กับบรรทัดสรุปจำนวน
(`ขนาด catalog: 76 feature` → `79`) · **ถ้ามีคีย์ไหนหายไป (`-`) ให้หยุดทันที** —
หัวไฟล์เขียนเตือนไว้เองว่าคีย์ที่หายอันตรายกว่าคีย์ที่เพิ่ม เพราะแปลว่า backend ลบหรือ
เปลี่ยนชื่อ และหน้าที่ชี้ไปคีย์นั้นจะถูกล็อกถาวรตอนเปิด enforcement โดยไม่มี admin bypass

- [ ] **Step 3: รันสวีตของรีโปนั้น**

```bash
bun run test 2>&1 | tail -15
```

Expected: ผ่าน โดยเฉพาะ `constant/module-list.license-feature.test.ts` ซึ่งเป็นตัวที่ใช้ fixture
· ถ้าแดง **ห้ามแก้ fixture ให้เทสต์ผ่าน** — หัวไฟล์ห้ามไว้ชัดเจน ให้แก้ `module-list.ts` แทน

- [ ] **Step 4: Commit, push, PR, merge เข้า `main`**

ข้อความ commit:

```
chore(license): sync fixture รับ workflow รายประเภท 3 คีย์

regenerate ด้วย gen:license-fixture — ไม่มีคีย์ไหนหาย มีแต่เพิ่ม

ต้องลง main ก่อน PR ของ carmen-turborepo-backend-v2 จึงจะเขียว เพราะ
audit:fe-license-fixture อ่าน main ของรีโปนี้เสมอ ไม่ใช่ commit ที่กำลังรีวิว

Claude-Session: <session url>
```

**ต้อง merge เข้า `main` ให้เสร็จก่อนไป Task 3** — ไม่ใช่แค่เปิด PR ทิ้งไว้

---

### Task 3 (BE): push, PR, ยืนยันด่าน fixture

**Files:** ไม่แก้ไฟล์ — เป็นขั้นตรวจและเปิด PR

**Interfaces:**
- Consumes: Task 1 (commit ในเครื่อง) + Task 2 (fixture ที่ลง `main` แล้ว)

- [ ] **Step 1: ยืนยันว่า fixture ลง `main` จริงแล้ว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:fe-license-fixture
```

Expected: ผ่าน · ถ้ายังแดง แปลว่า Task 2 ยังไม่ merge หรือ merge ผิดกิ่ง — **กลับไปทำ Task 2
ให้จบก่อน อย่า push**

- [ ] **Step 2: push + เปิด PR**

เขียน body ลงไฟล์ก่อนแล้วใช้ `--body-file` (heredoc ตรงๆ ทำให้ GateGuard ตีกลับ)
เนื้อ PR ต้องมี:

- ขายอะไรได้เพิ่ม: เห็น workflow เฉพาะประเภทที่ซื้อ
- **การเขียนยังคุมที่พ่อ** พร้อมเหตุผล (`workflow_type` optional / DELETE ไม่มี body)
- ลิงก์ PR ของ `carmen-inventory-frontend-react` ที่ merge ไปแล้ว
- ผลของด่านทุกตัวที่รัน
- **บอกให้ชัดว่าโพรบสดของ Task 4 ทำแล้วหรือยัง** — ถ้ายัง ต้องเขียนว่ายัง

```bash
gh pr create --base main --title "feat(license): ขาย workflow แยกตามประเภทเอกสาร (Phase B)" --body-file <path>
```

**อย่าสั่ง `gh pr merge --auto`** — auto-merge ถูกปิดที่ระดับรีโปทั้งคู่ (ยืนยัน 2026-09-03)
รายงานว่า "ต้องกด merge เอง" แล้วรายงานสถานะ CI ครั้งเดียว ไม่ต้องวน poll

---

### Task 4: ใช้หนี้โพรบสดจาก Phase A §5.0 คืน

นี่คือด่านที่ Phase A ติดค้างไว้ และเป็น**เหตุผลที่ยอมเลื่อนมา** — เฟสนี้มีคีย์ 3 ชั้น
ของจริงแล้ว โพรบจึงเป็นการตรวจ feature ที่ต้องตรวจอยู่แล้ว ไม่ใช่คีย์ปลอมที่ต้องตามลบ

**ต้องทำหลัง Task 3 merge และ deploy DEV เสร็จ** (push เข้า `main` = deploy DEV อัตโนมัติ)

**Files:** ไม่มีไฟล์ถาวร

- [ ] **Step 1: เตรียมกลุ่มสิทธิ์ที่ "ชั้นกลางหาย"**

ที่ `/license-feature-groups/:id/edit` บน DEV — **UI สร้างสถานะนี้ไม่ได้แล้ว** (Phase A
บังคับเติมบรรพบุรุษครบสาย) จึงต้องแก้แถวใน `tb_license_feature_group_item` ตรงๆ ให้กลุ่ม
ทดสอบถือ `[system_admin, system_admin.workflow.purchase_request]` โดย **ไม่มี**
`system_admin.workflow`

**นั่นคือประเด็นของการทดสอบ** — ด่านนี้มีไว้กันสถานะที่เกิดจากการแก้ DB ด้วยมือ

- [ ] **Step 2: ยืนยันว่าสวิตช์ enforcement เปิดอยู่จริง**

ถ้า `LICENSE_ENFORCEMENT` ปิด request จะผ่านเพราะ shadow mode **ไม่ใช่เพราะโค้ดถูก**
ตรวจค่าสวิตช์ก่อนสรุปผลทุกครั้ง — ผลที่ได้ตอนปิดสวิตช์ไม่มีความหมายเลย

- [ ] **Step 3: ยิงจริง — นี่คือข้อที่พิสูจน์ทั้ง Phase A และ B**

```bash
curl -i -X GET 'https://<dev-gateway>/api/config/<bu_code>/workflows/purchase-request' \
  -H "Authorization: Bearer <token>" -H "x-app-id: <app-id>"
```

Expected: **`403` พร้อม `{"code":"LICENSE_REQUIRED"}`**

ถ้าได้ `200` = evaluator ยังข้ามชั้นกลาง → เป็นบั๊กของ Phase A ที่หลุด production ไปแล้ว
ต้องรายงานทันที ไม่ใช่แก้เงียบ ๆ

- [ ] **Step 4: เติมชั้นกลางกลับแล้วยิงซ้ำ**

เพิ่ม `system_admin.workflow` เข้ากลุ่ม แล้วยิง URL เดิม

Expected: `200` · คู่กับ Step 3 นี่คือหลักฐานว่าด่านทำงานทั้งสองทิศ ไม่ใช่บล็อกทุกอย่าง

- [ ] **Step 5: ตรวจว่าการเขียนคุมที่พ่อจริง (D3′)**

ด้วยกลุ่มที่ถือ `[system_admin, system_admin.workflow.purchase_request]` **โดยไม่มีพ่อ**:

```bash
curl -i -X DELETE 'https://<dev-gateway>/api/config/<bu_code>/workflows/<some-id>' \
  -H "Authorization: Bearer <token>" -H "x-app-id: <app-id>"
```

Expected: `403 LICENSE_REQUIRED` — เพราะ DELETE ตกที่ fallback = พ่อ ซึ่งไม่ได้ถือ
นี่คือการยืนยัน §5.1 ว่า "เขียนคุมที่พ่อ" ทำงานจริง ไม่ใช่แค่ทฤษฎี

- [ ] **Step 6: ตรวจหน้าจอ**

`/license-catalog` — `Purchase Request` / `Purchase Order` / `Store Requisition`
ต้องเยื้องอยู่**ใต้** `Workflow` และไม่ไปกองท้ายชั้นวาง `System Admin`
· `/license-feature-groups/:id/edit` — ติ๊กตัวใดตัวหนึ่งแล้วคีย์ที่ได้ต้องครบ 3 ชั้น
· ตรวจที่ desktop และ 390px

- [ ] **Step 7: คืนค่าข้อมูลทดสอบ**

คืนกลุ่มสิทธิ์ที่แก้ไว้ใน Step 1/4 ให้กลับเป็นของเดิม แล้วบันทึกผลโพรบลงสเปก §5.0
เปลี่ยนจาก "หนี้ที่ต้องใช้คืน" เป็น "ตรวจแล้วเมื่อ <วันที่> ผลเป็น <อะไร>"

---

## สิ่งที่จงใจไม่ทำในเฟสนี้

- **ไม่คุมการเขียนรายประเภท** — ดู §5.1 ของสเปก ถ้าจะทำต้องเพิ่มด่านที่ resolve
  `workflow_id` → type ซึ่งเพิ่ม RPC ในเส้นทางร้อนของทุกการเขียน และต้องตอบก่อนว่า
  RPC ล้มแล้ว fail-open หรือ fail-closed
- **ไม่แตะ `app:workflows`** (group `app`) — ไม่มี endpoint รายประเภท
- **ไม่แตะ `carmen-platform`** — Phase A ทำให้ UI รองรับ 3 ชั้นไปแล้ว
- **ไม่แตะ `accounting.*`** — เป็น Phase C
