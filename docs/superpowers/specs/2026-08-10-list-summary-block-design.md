# Summary block บน list endpoints — เลิกใช้ `perpage: -1` ฝั่ง frontend

**วันที่:** 2026-08-10
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (งานหลัก) และ `carmen-platform` (ผู้บริโภค)
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation

---

## 1. ปัญหา

หน้า Management 6 หน้าใน `carmen-platform` แสดง summary band เหนือตาราง และทั้ง 6 หน้าได้ตัวเลขมาด้วยการ
**ดึงทุกแถวในตารางลงมาที่เบราว์เซอร์แล้วนับเอง** ผ่าน `perpage: -1`

```ts
// src/pages/UserManagement.tsx:187
userService.getAll({ perpage: -1, advance: JSON.stringify({ where: { deleted_at: null } }) })
```

มาตรฐาน `agent-os/standards/pages/summary-band.md:42` ระบุไว้ตรง ๆ ว่า *"the real fix is a backend
`summary` block"* และสั่งห้ามลงแรงหาทางเลี่ยงฝั่ง client เอกสารนี้คือการทำตามข้อนั้น

### ทำไมเขียนใหม่ฝั่ง client ไม่ได้

`summary-band.md:33-40` แจกแจงไว้แล้วสองข้อ — count query ตอบ "มีกี่แถวที่ match" แต่ตอบ
**DISTINCT count** และ **SUM** ไม่ได้ แต่การสำรวจรอบนี้พบข้อที่สาม ซึ่งเป็นตัวที่ผูก `perpage: -1`
ไว้แน่นที่สุดและไม่เคยถูกบันทึก:

**4 ใน 6 หน้าไม่ได้ต้องการแค่ตัวเลข แต่ต้องการ "ตัวอย่างแถวที่คัดมา"**

| หน้า | ฟิลด์ | ความหมาย |
|---|---|---|
| User | `faces` | ผู้ใช้ใหม่สุด 6 คน พร้อม avatar / initials / ชื่อแสดงผล |
| Role | `topRoles` | 3 role ที่ถือ permission กว้างที่สุด |
| News | `latest` | บทความ published ล่าสุด พร้อมรูปและจำนวน BU ที่เผยแพร่ถึง |
| Application | `devices` | histogram นับตาม device |

---

## 2. ข้อตัดสินที่ยืนยันแล้ว

| # | ประเด็น | ข้อตัดสิน |
|---|---|---|
| 1 | semantics ของ summary | **filter-consistent** — สะท้อน `advance` / `search` ที่เปิดอยู่ ตรงกับ backend ต้นแบบ |
| 2 | ขอบเขต | ทั้ง **6 entity** — Cluster, BusinessUnit, User, Role, News, Application |
| 3 | rich fields | **backend ส่งมาด้วย** ทั้ง `newest` / `top_roles` / `latest` / `devices` |
| 4 | `deleted` (soft-delete) | ใช้ `where` ชุดเดียวกับตาราง **ยกเว้น** สลับ predicate เป็น `deleted_at != null` |
| 5 | แนวทาง | **A** — Prisma aggregate ต่อ entity ในไมโครเซอร์วิส + helper ร่วมสำหรับ 4 ฟิลด์แกน |
| 6 | test | เขียน**เฉพาะ** test กัน scope leak ข้ออื่นตรวจด้วย browser บน DEV |

### 2.1 เอกสารกับโค้ดขัดกันอยู่ — ต้องแก้เอกสาร

`summary-band.md:14` เขียนว่า band เป็น *registry-wide* คือ "อธิบายทั้งตาราง ไม่ใช่ filter ที่เปิดอยู่"
แต่ backend ต้นแบบทำตรงข้าม — `buildRegistrySummary` รับชุด `matched` ที่ผ่าน `advance`/`search`
มาแล้ว และคอมเมนต์ที่ `user_platform_role.service.ts:528` ระบุเจตนาชัดว่าให้ "scope-consistent
กับแถวที่แสดงข้างล่าง" ส่วน `UserPlatformManagement.tsx:58` เขียนคอมเมนต์ว่า "Registry-wide"
ทั้งที่ค่าจริงเปลี่ยนตาม filter

**ข้อตัดสิน 1 เลือกตามโค้ด** ดังนั้นต้องแก้ทั้งสองที่ให้ตรงกับพฤติกรรมจริง — ไม่ใช่แก้โค้ดให้ตรงเอกสาร

---

## 3. สถาปัตยกรรม

### 3.1 ท่อส่งมีอยู่แล้วทั้งเส้น

งาน user-platform registry (BE PR #310) วางท่อไว้ครบแล้ว รอบนี้ **ไม่ต้องแตะ shared plumbing เลย**

| ชั้น | สถานะ | ที่อยู่ |
|---|---|---|
| microservice service | คืน `Result.ok({ paginate, data, summary })` | ต้นแบบ `user_platform_role.service.ts:511` |
| microservice controller | `handlePaginatedResult` ส่ง `summary` ต่อแบบ opt-in | `packages/nest-result/src/base-microservice-controller.ts:143` |
| gateway service | conditional spread 1 บรรทัด | ต้นแบบ `user-platform-roles.service.ts:184` |
| HTTP envelope | `StdResponse.fromResult` ตั้ง `summary` เมื่อพบบน Result value | — |
| Swagger | รับพารามิเตอร์ `summaryModel: <Dto>` | ต้นแบบ `user-platform-roles.controller.ts:104` |

`handlePaginatedResult` ใช้ conditional spread `...(value.summary !== undefined && { summary: value.summary })`
ผู้เรียกอีกหลายสิบที่ที่ไม่เคยตั้ง `summary` จึงไม่ได้รับผลกระทบ

### 3.2 list handler ทั้ง 6 อยู่คนละไมโครเซอร์วิส

| entity | command | ไมโครเซอร์วิส | service file |
|---|---|---|---|
| Cluster | `clusters.find-all` | micro-cluster | `cluster/cluster/cluster.service.ts` |
| BusinessUnit | `business-units.find-all` | micro-cluster | `cluster/business-unit/business-unit.service.ts` |
| User | `users.find-all` | micro-cluster | `cluster/user/user.service.ts` |
| Application | `applications.find-all` | micro-cluster | `cluster/application/application.service.ts` |
| News | `news.find-all` | micro-cluster | `cluster/news/news.service.ts` |
| Role | `platform-roles.find-all` | micro-**business** | `authen/platform_role/platform_role.service.ts` |

ทั้งสองแอปใช้ `packages/nest-result` ร่วมกัน ท่อจึงพร้อมทั้งคู่

### 3.3 การวางโค้ด

- แต่ละ list service เพิ่ม **private method เดียว** `buildXSummary(where)` วางท้ายคลาส
  ตามรอย `buildRegistrySummary` — ไม่สร้างไฟล์ใหม่ ไม่สร้าง service ใหม่ ไม่สร้าง module ใหม่
- 4 ฟิลด์แกนที่ทุก entity ใช้เหมือนกันดึงเป็น helper รับ `(delegate, where)`
  ยิง `groupBy({ by: ['is_active'] })` 1 นัด + `count` ของ `deleted` อีก 1 นัด
- gateway เพิ่ม conditional spread 1 บรรทัด + Swagger DTO 1 คลาสต่อ entity

**helper วางที่ไหน** — 5 ใน 6 service อยู่ใน micro-cluster ตัวที่เหลืออยู่ micro-business
สร้าง helper ตัวจริงที่ `apps/micro-cluster/src/common/helpers/` ให้ 5 service ใช้ร่วมกัน
ส่วน `platform_role.service.ts` เขียน 4 ฟิลด์นั้นเองในที่ (ราว 10 บรรทัด)

**ไม่สร้าง workspace package ใหม่** สำหรับโค้ด 10 บรรทัดที่มีผู้ใช้ข้ามแอปแค่รายเดียว —
ต้นทุนของ package (build order, dist ที่ build ค้าง, tsconfig reference) แพงกว่าการเขียนซ้ำ
ครั้งเดียว repo นี้เคยมี suite แดงทั้งชุดเพราะ `dist` ของ shared package เก่ากว่า `src`
โดยที่โค้ดไม่ได้ผิดเลย

### 3.4 ต้นทุน DB — ห้ามลอกท่าต้นแบบตรง ๆ

`buildRegistrySummary` โหลด `matched` ทั้งชุดขึ้น memory ได้เพราะผู้ถือสิทธิ์ platform
มีน้อยโดยโครงสร้าง `tb_user` ไม่ใช่ ทุก aggregate จึงต้องให้ DB คำนวณผ่าน
`groupBy` / `count` / `aggregate` ยกเว้นสองที่ที่มีเหตุผลรองรับ:

**ก. Cluster/FleetCapacity — ต้องมีค่าต่อ cluster จริง ๆ**

`near_limit` และการแยก capped/uncapped ยุบเป็น scalar aggregate ไม่ได้ ต้องรู้ ratio ของแต่ละ cluster
แผนคือ **4 query** แล้วพับใน JS:

1. `tb_cluster.findMany({ where: mergedWhere, select: { id, is_active, max_license_bu } })`
2. `tb_business_unit.groupBy({ by: ['cluster_id'], where: { cluster_id: { in: ids }, deleted_at: null }, _count: true })`
   → `bu_count` ต่อ cluster
3. `tb_business_unit.groupBy({ by: ['cluster_id'], where: { cluster_id: { in: ids }, deleted_at: null, is_active: true }, _sum: { max_license_users } })`
   → `total_max_license_users` ต่อ cluster
4. `tb_cluster_user.groupBy({ by: ['cluster_id'], where: { cluster_id: { in: ids }, deleted_at: null }, _count: true })`
   → `users_count` ต่อ cluster

query 2 กับ 3 **ยุบรวมกันไม่ได้** เพราะใช้ `where` คนละชุด — `bu_count` นับ BU ทุกตัวที่ยังไม่ถูกลบ
ส่วน `total_max_license_users` รวมเฉพาะตัวที่ `is_active: true` ด้วย (`cluster.service.ts:406` กับ `:425`)

รับได้เพราะ cluster มีหลักสิบแถว และ select แค่ 3 คอลัมน์ — ต่างจาก `perpage: -1` ที่ดึงทุกคอลัมน์
ทุกแถวข้ามเครือข่ายมาที่เบราว์เซอร์

**ข. rich fields — `findMany` ที่มี `take` จำกัดตายตัว**

`newest` take 6 · `top_roles` take 3 · `latest` take 1 ขอบเขตคงที่ ไม่โตตามข้อมูล

---

## 4. Contract ของ summary ทั้ง 6

ตั้งชื่อฟิลด์แบบ `snake_case` ตาม convention ของ API

### 4.1 แกนร่วม

```ts
{ total: number, active: number, inactive: number, deleted: number }
```

- `total` = จำนวนแถวที่ match `where` เดียวกับตาราง (ต้องเท่ากับ `paginate.total`)
- `deleted` = `where` ชุดเดียวกัน แต่สลับ predicate เป็น `deleted_at != null`

**ทำไมใช้ `deleted` ไม่ใช่ `archived`** — คำว่า archived ถูกใช้สองความหมายในโค้ดปัจจุบัน:
`UserDirectorySummary` / `BuSummary` ใช้หมายถึงแถวที่ถูก soft-delete ส่วน `NewsroomSummary`
ใช้หมายถึง **ค่า status** `'archived'` ของบทความที่ยังไม่ถูกลบ ถ้าตั้งชื่อฟิลด์ใน DTO ว่า `archived`
ทั้งคู่ News จะได้ contract ที่คำเดียวกันแปลคนละเรื่องกับอีก 5 entity โดยไม่มีอะไรฟ้อง —
ค่าเป็น integer เหมือนกัน ผ่าน type check เหมือนกัน แสดงผลได้เหมือนกัน

จึงสงวน `deleted` = soft-delete เสมอ และ `archived` ให้ News ใช้ในความหมาย status เท่านั้น
ชื่อ prop ฝั่ง component ไม่ต้องแก้ ให้แมปที่ขอบ

### 4.2 ต่อ entity

```ts
// clusters.find-all
{ ...core,
  near_limit: number,                                          // ≥90% ของ cap ใด cap หนึ่ง
  bu:    { used, cap, uncapped_count, uncapped_used },
  users: { used, cap, uncapped_count, uncapped_used } }

// users.find-all
{ ...core,
  business_units: number,                                      // DISTINCT bu id ของผู้ใช้ที่ match
  newest: [{ id, username, email, firstname, lastname, avatar_url }] }   // take 6, created_at desc

// business-units.find-all
{ ...core, clusters: number }                                  // DISTINCT cluster_id

// platform-roles.find-all
{ ...core, top_roles: [{ id, name, permission_count }] }       // take 3, orderBy _count desc

// news.find-all
{ ...core,
  draft: number, published: number, archived: number,          // archived = status ไม่ใช่ soft-delete
  latest: { id, title, image_url, published_at, bu_count } | null }

// applications.find-all
{ ...core,
  full_access: number,                                         // allow_all = true
  scoped: number,
  devices: [{ device, count }] }
```

### 4.3 ตัดออกโดยตั้งใจ

- `RolesSummaryData.maxCount` ฝั่ง FE คือ `topRoles[0].count` อยู่แล้ว — ให้ FE derive
- `+N` ของ faces คือ `total - newest.length` — ไม่ต้องส่งฟิลด์แยก
- `avatar_url` ใน `newest` ต้อง**ใช้ serialization ตัวเดียวกับแถวในตาราง** ห้ามสร้างเส้นทางที่สอง

---

## 5. กับดัก

### 5.1 scope leak — อันตรายที่สุดของงานนี้

`cluster.service.ts:365` สร้าง `mergedWhere` ที่ผสม `platformScope.clusterScopeFor(userId, 'cluster.read')`
เข้ากับ `where` ของผู้ใช้ ถ้า `buildFleetSummary` รับ `qArgs.where` (ตัวก่อนผสม scope) แทน `mergedWhere`
cluster admin ที่เห็นตารางแค่ 1 cluster จะเห็น band บอกตัวเลขทั้ง fleet

เป็นการรั่วข้อมูลข้ามผู้เช่าที่ **ไม่ทำให้อะไรพัง** ไม่มี test เดิมจับ และดูเหมือนตัวเลขปกติทุกประการ

**สัญญาที่ต้องบังคับ:** `buildXSummary` รับ `where` ตัวเดียวกับที่ `findMany` ใช้จริงเสมอ และต้องเป็น
ตัวเดียวกับที่ให้ `paginate.total` ด้วย

**invariant ที่ตรวจได้:** `summary.total === paginate.total` เมื่อไม่เปิด `showDeleted`

### 5.2 device `null` → `'web'`

`ApplicationRegistrySummary.tsx:45` ทำ `a.device || 'web'` แต่ `groupBy(['device'])` จะได้ bucket
`null` แยกออกมา ต้อง normalize ให้ตรงกัน ไม่งั้น histogram เพี้ยนโดยไม่มี error

### 5.3 cap `0` / `null` / `undefined` = "ไม่จำกัด"

`src/utils/capacity.ts:20` ใช้ `cap && cap > 0 ? cap : null` — cluster ที่ `max_license_bu = 0`
ต้องไปอยู่ `uncapped_count` ไม่ใช่ cap 0 ซึ่งจะทำให้ ratio หารศูนย์แล้วกลายเป็น `over` ทุกตัว

และ `total_max_license_users` ต้องนับเฉพาะ BU ที่ `is_active: true` **และ** `deleted_at: null`
คอมเมนต์ที่ `cluster.service.ts:422` อธิบายไว้แล้วว่า BU ที่ถูก soft-delete แต่ `is_active` ยังจริง
จะยังกินโควตาถ้าลืมเงื่อนไขข้อหลัง

### 5.4 `handleResult` กับ `handlePaginatedResult`

route ที่คืนผ่าน `handleResult` จะห่อ payload ทั้งก้อนไว้ใต้ `response.data` ต่างจาก
`handlePaginatedResult` ที่แผ่ `paginate` / `data` / `summary` ขึ้นมาเป็นพี่น้องระดับบนสุด
ถ้าลอก pattern ผิดตัว `summary` จะหายเงียบ ๆ — ต้องยืนยัน handler ของแต่ละ route ก่อนเขียน
(เคยพลาดมาแล้วใน BE PR #309 กับ `clusters.admin-scope`)

---

## 6. Error handling — ข้อกำหนดเดิมข้อหนึ่งต้องเปลี่ยน

`summary-band.md:56` เขียนว่า *"band ล้มแยกจากตาราง — ถ้า aggregate พัง ตารางต้องยังทำงาน"*
ข้อนี้เป็นจริงได้เพราะปัจจุบัน band ยิง request ของตัวเอง แต่พอ `summary` มากับ list response
เดียวกัน มันจะไม่มี failure mode แยกอีกต่อไป

**ย้ายการแยกล้มไปอยู่ฝั่ง backend แทน:**

```
buildXSummary() พังด้วยเหตุใดก็ตาม → catch → ไม่ใส่ summary ลง Result → log
                                    → list ยังคืน 200 พร้อมข้อมูลครบ
```

aggregate ที่ล้มจึงไม่มีวันทำให้ตารางล่ม ซึ่งคือเจตนาจริงของกฎข้อนั้น

ฝั่ง FE `summary` ที่หายไปมีความหมายเดียว = "ไม่มีค่าสรุปให้" ไม่ว่าจะเพราะ backend ยังไม่ deploy
หรือ aggregate พัง ทั้งสองกรณี band แสดง headline ที่คำนวณเองได้จาก `paginate.total`
ตามที่ `summary-band.md:16` กำหนดไว้แล้ว — ไม่ต้องมี error state แยก

**ผลที่ตามมา:** prop ของ component ไม่เปลี่ยนรูป แต่ความหมายเปลี่ยน — `loading` / `error` /
`onRetry` ผูกกับการโหลด **ตาราง** แทนการโหลด band และ state slot `summaryLoading` /
`summaryError` กลายเป็นของตายที่ต้องลบ

**ข้อยกเว้น: `FleetCapacity` ไม่ได้ใช้ contract 4 prop นั้น** — มันรับแค่ `{ summary, loading }`
ไม่มี `error` / `onRetry` เลย และ `ClusterManagement` ตั้งชื่อ state ว่า `fleet` / `fleetLoading`
ไม่ใช่ `summary*` (`ClusterManagement.tsx:431`) มาตรฐาน `summary-band.md:55` ที่เขียนว่า
*"Props are always `{ summary, loading, error, onRetry }`"* จึงผิดมาตั้งแต่ต้น — component
ที่ทำตามจริงมี 6 ตัว ไม่ใช่ 7 ต้องแก้ประโยคนั้นด้วย

ต้องแก้หัวข้อ "Page wiring" ใน `summary-band.md` ทั้งหัวข้อ

---

## 7. Testing

ตามความชอบถาวรของผู้ใช้ แผน implementation จะ**ไม่**มีขั้นตอนเขียน test และต้องสั่ง implementer
subagent ให้ข้ามด้วย — static check (`tsc`, `lint`) ยังรันตามปกติ และ suite เดิมของ backend
ต้องผ่านก่อน merge

**ข้อยกเว้นเดียวที่ผู้ใช้อนุมัติให้เขียน: test กัน scope leak (5.1)**

ครอบคลุม `clusters.find-all` เป็นอย่างน้อย — ยืนยันว่า `buildFleetSummary` ได้รับ `mergedWhere`
ที่ผสม scope แล้ว และผู้ใช้ที่ scope แคบไม่เห็นตัวเลขนอก scope

อีกสองข้อ (`summary.total === paginate.total` ทุก entity, device/cap normalization) ปล่อยไป
ตรวจด้วย browser บน DEV แทน

**หมายเหตุการรัน jest:** repo backend มีอาการ `bunx jest <file> -t "<name>"` ค้างเกิน 10 นาที
ให้รันทั้งไฟล์ spec ไม่ใช้ `-t` และรันแบบ foreground ที่ scope แคบ

---

## 8. ลำดับ deploy

**ไม่มี endpoint ใหม่ ไม่มี permission ใหม่ ไม่มี api_name ใหม่** จึงไม่ต้องแตะ application record
และไม่ชนกับดัก `AppIdGuard` ตอบ 401 แทน 403 ที่เคยเจอตอนทำ analytics

```
1. micro-cluster + micro-business   ส่ง summary ออกมา — ยังไม่มีใครอ่าน ไม่กระทบใคร
2. backend-gateway                   ส่งต่อ summary — FE เก่าไม่อ่าน ไม่กระทบ
3. FE ก้าวที่ 1                       อ่าน summary เมื่อมี แต่ยังคง fallback perpage:-1 ไว้
4. ยืนยันบน DEV                       band ตรงกับตารางจริงทั้ง 6 หน้า
5. FE ก้าวที่ 2                       ลบ fallback + ลบ summarize*() ทิ้ง
```

**ที่ต้องแยกก้าว 3 กับ 5** — repo นี้ deploy ด้วยมือ (`deploy-gcs.yml` เป็น `workflow_dispatch`)
และมีของที่ merge แล้วค้างไม่ deploy อยู่หลายสิบรายการนับตั้งแต่ release 0.2.0 ถ้ารวมสองก้าว
เป็นก้าวเดียวแล้ว FE ขึ้นก่อน backend band ทั้ง 6 หน้าจะว่างพร้อมกันโดยไม่มี error ให้เห็น
เป็น regression เงียบที่ไม่มีอะไรจับได้นอกจากคนเปิดดู

---

## 9. สิ่งที่ถูกลบฝั่ง FE (ก้าวที่ 5)

| ลบ | เก็บ |
|---|---|
| `summarizeUsers` `summarizeBus` `summarizeRoles` `summarizeNews` `summarizeApplications` `summarizeFleet` | `utilization` — `CapacityGauge` / `CapacityMeter` ใช้ render ราย row |
| `loadSummary` + `summaryLoading` + `summaryError` ทั้ง 6 หน้า | prop signature ของทั้ง 7 component |
| unit test ของ `summarize*` ทั้งหมด | `capacity.test.ts` เฉพาะส่วน `utilization` |
| `isNearLimit` — หลังลบ `summarizeFleet` เหลือแค่ test อ้างถึง | |
| `perpage: -1` ใน 6 หน้า Management | `perpage: -1` ใน `BusinessUnitEdit` / `ClusterEdit` / `UserEdit` / `SqlWorkbench` / `BusinessUnitMultiSelect` — เป็นการโหลด dropdown ไม่ใช่ band คนละเรื่อง |

`FleetSummary` / `CapacityTotals` ย้ายจาก `src/utils/capacity.ts` ไป `src/types/index.ts`
เพราะกลายเป็น API response type (rule 10)

---

## 10. สิ่งที่ต้องยืนยันตอนเขียนแผน

1. `tb_platform_role` / `tb_application` / `tb_news` มีคอลัมน์ `deleted_at` ครบทั้งสามหรือไม่ —
   ตารางไหนไม่มี soft-delete ให้**ตัด**ฟิลด์ `deleted` ของ entity นั้นออก อย่าส่ง `0` หลอก
2. handler ของทั้ง 6 route เป็น `handlePaginatedResult` จริงหรือไม่ (กับดัก 5.4)
3. `orderBy: { tb_platform_role_tb_permission: { _count: 'desc' } }` ใช้ได้กับ Prisma เวอร์ชันในโปรเจกต์
   หรือไม่ — `permission_count` เป็นค่า computed จาก `_count` ไม่ใช่คอลัมน์
4. list service ของ BusinessUnit / User / Application / News มีการผสม scope แบบ `mergedWhere`
   เหมือน cluster หรือไม่ — ถ้ามี ต้องใช้ตัวหลังผสมทุกที่
5. `news.latest.bu_count` ดึงจากความสัมพันธ์ใด และ `0` แปลว่า global จริงตามที่ FE สมมติหรือไม่

---

## 11. การแบ่งเฟสของแผน

งานนี้ใหญ่ (6 service + 6 gateway passthrough + 6 DTO + 6 หน้า FE + แก้เอกสาร 1 ไฟล์) แต่แต่ละ
entity เป็นอิสระต่อกันและใช้ pattern เดียวกันหมด จึงแตกเป็น task ต่อ entity ได้ตรง ๆ

**ทำ Cluster ให้จบ end-to-end ก่อนเป็น entity แรก** — มันเป็นตัวที่ยากที่สุด (4 query, capped/uncapped,
near_limit, และเป็นตัวเดียวที่มี `mergedWhere` ยืนยันแล้วว่าผสม scope) เมื่อมันผ่านครบทั้งเส้น
ตั้งแต่ Prisma ถึง band บนหน้าจอ อีก 5 ตัวจะเหลือแค่งานลอกแบบ

ลำดับที่เหลือเรียงตามความยากลง: User (DISTINCT + newest) → News (status counts + latest) →
Application (devices histogram) → BusinessUnit (DISTINCT ล้วน) → Role (top_roles)

## 12. นอกขอบเขต

- ไม่แตะ `user_platform_role` ที่มี summary อยู่แล้ว นอกจากแก้คอมเมนต์ที่บอกว่า registry-wide
- ไม่เพิ่ม endpoint `/summary` แยก
- ไม่แตะ `perpage: -1` ที่ใช้โหลด dropdown
- ไม่แก้ปัญหา `UserPlatformRoleService.assign` ไม่เช็ค scope ผู้เรียก (ติดตามแยกเป็น ticket)
