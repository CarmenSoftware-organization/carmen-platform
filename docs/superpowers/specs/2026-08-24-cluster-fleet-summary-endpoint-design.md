# endpoint สรุปความจุทั้ง fleet ของ cluster

**วันที่:** 2026-08-24
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (endpoint ใหม่) และ `carmen-platform` (2 หน้าจอ) · **ไม่แตะ DB**
**สถานะ:** design รออนุมัติ
**เกี่ยวข้องกับ:** `2026-08-21-license-center-design.md` (§3.2 ที่ทำให้ `/licenses` ใช้ `perpage:1`)

---

## 1. ปัญหา

แถบ "Fleet capacity" ที่อยู่บนสุดของ `/clusters` และ `/licenses` ใช้ค่าจาก `FleetSummary`
เดียวกัน แต่ **ทั้งสองหน้าหาค่านั้นมาคนละท่า และท่าที่ `/clusters` ใช้อยู่ผิด**

### 1.1 สิ่งที่ตรวจจริง (2026-08-23, localhost + backend `:4000`)

ทุกข้อด้านล่างยืนยันด้วยการยิง API จริงและดูหน้าจอจริง ไม่ใช่การอ่านโค้ดอย่างเดียว

#### ก. `/clusters` ยิงคำขอที่ผลถูกทิ้งทุกครั้ง

`ClusterManagement.tsx:181-213` (`loadFleet`) ยิง `GET /clusters?perpage=-1` ดึงทั้งตารางมา
คำนวณ `summarizeFleet()` เอง แต่ค่านั้น **ไม่มีทางถูกใช้**:

- `fetchClusters:165` เขียน `data.summary` จาก backend ลง state แบบไม่มีเงื่อนไข
- `loadFleet:204` เขียนผ่าน guard `setFleet((current) => current ?? summarizeFleet(mapped))`

ไม่ว่า promise ไหนกลับก่อน ค่าจาก backend ชนะเสมอ — ท่า `perpage:-1` จึงเป็นการดึงทั้งตาราง
มาโยนทิ้ง 1 ครั้งต่อการเปิดหน้า (บน dev StrictMode = 2 ครั้ง)

#### ข. `loadFleet()` ใน `handleConfirmDelete` เป็น no-op สนิท

`ClusterManagement.tsx:306` เรียก `loadFleet()` หลังลบ cluster โดยตั้งใจให้แถบรีเฟรช แต่ guard
`current ?? …` ตัวเดียวกันทำให้เขียนไม่ได้ (ตอนนั้น `fleet` ไม่เป็น null แล้ว) แถบที่อัปเดตจริง
เป็นผลจาก `setPaginate(prev => ({ ...prev }))` บรรทัดก่อนหน้าซึ่งไป trigger `fetchClusters`
ต่างหาก — บรรทัด `loadFleet()` นั้นลบทิ้งได้โดยไม่มีอะไรเปลี่ยน

#### ค. แถบชื่อ "FLEET CAPACITY" เดินตาม filter ไปแล้ว

`summary` ที่ backend แนบมากับ `GET /clusters` **ผูกกับ query** ยืนยันด้วยการยิงตรง:

| คำขอ | `summary.total` | `summary.bu` | `summary.users` |
|---|---|---|---|
| ไม่มี search | 8 | 11 / 30 | 41 / 79 |
| `&search=ZEBRA` | **1** | **2 / 2** | **11 / 13** |
| `&page=2&perpage=3` | 8 | 11 / 30 | 41 / 79 |

คือผูกกับ **filter** แต่ไม่ผูกกับ **pagination** — เป็นพฤติกรรมที่ถูกต้องสำหรับ endpoint
รายการ แต่ผิดสำหรับแถบที่นั่งอยู่เหนือ filter

ตรวจในเบราว์เซอร์ (พิมพ์ `ZEBRA` ในช่องค้นหาของ `/clusters`) แถบเปลี่ยนเป็น
`2 / 2 licensed 100%` · `11 / 13 licensed 85%` · `1 clusters · 1 active · 1 near limit` จริง
ขัดกับคอมเมนต์ `ClusterManagement.tsx:179-180` ที่ประกาศเจตนาไว้เองว่า
*"summarise the whole (non-deleted) set, not just the current page"*

**ผลที่ตามมาที่ร้ายที่สุด:** ปุ่มสถิติ "quota expiring" มีไว้ *เปิด* filter (`FleetCapacity.tsx:99-107`)
แต่ตัวเลขของมันมาจากผลที่ filter แล้ว ถ้าผู้ใช้ค้นอะไรที่ไม่รวม cluster ที่โควตาใกล้หมด ตัวเลข
จะเป็น 0 และปุ่มดับ ทั้งที่ fleet มีอยู่จริง — ทางตันชนิดเดียวกับที่คอมเมนต์บรรทัดนั้นอุตส่าห์
เขียนกันไว้

#### ง. `/licenses` แยกคำขอถูกแล้ว แต่ต้องใช้ท่าอ้อม

`LicenseCenter.tsx:63-76` ยิงคำขอแยกที่ **ไม่มี filter** (`perpage:1` + `deleted_at:null`) เพื่อเอา
`summary` อย่างเดียว และคอมเมนต์ `:43-44` ระบุชัดว่า *"แถบสรุปเองยังนับทั้ง fleet เสมอ ไม่ถูกกรอง
ตามนี้"* — ความหมายถูกต้อง แต่ต้องขอ 1 แถวที่ไม่ได้ใช้เลยเพื่อให้ backend คำนวณ `summary` แนบมา

**สรุป:** วันนี้มี 3 ท่าหาค่าเดียวกัน — `perpage:-1` + คำนวณเอง (ทิ้ง), `summary` ที่ผูก filter,
และ `perpage:1` แล้วหยิบ `summary`

#### จ. คณิตศาสตร์ฝั่ง backend มีอยู่แล้ว

`apps/micro-cluster/src/cluster/cluster/cluster.service.ts:1564` มี
`buildFleetSummary(where): Promise<FleetSummary>` ที่คืนรูปเดียวกับที่ FE ใช้ครบทุกฟิลด์
รับ `where` เป็นพารามิเตอร์ จึงรองรับได้ทั้ง "ทั้ง fleet" และ "ตาม filter" อยู่แล้ว —
ทางแยกอยู่ที่ *ใครส่ง where อะไรเข้าไป* ไม่ใช่ที่ตัวคำนวณ

---

## 2. การตัดสินใจที่เคาะแล้ว

| # | ประเด็น | เคาะ | เหตุผล |
|---|---|---|---|
| 1 | endpoint รับ filter ไหม | **ไม่รับเลย** | ถ้ารับ filter ได้ก็ซ้ำกับ `summary` ในรายการทันที endpoint นี้เกิดมาเพื่อตอบคำถามที่อีกอันตอบไม่ได้ |
| 2 | `summary` ที่แนบมากับ `GET /clusters` | **คงไว้เฉยๆ** | ถอดหรือทำ opt-in เป็นการเปลี่ยนสัญญาของ endpoint เดิม มีลำดับ deploy ของตัวเอง รวมเข้ามาจะทำให้ rollout มี 2 จุดพังแทน 1 |
| 3 | สถาปัตยกรรม | **route ใหม่เต็มสาย** (gateway → RPC → micro-cluster) | ทางเลือกที่ทำแค่ gateway (เรียก `findAll` ด้วย `perpage:1` แล้วหยิบ `summary`) เป็นการย้ายท่าเดิมไปซ่อนในเซิร์ฟเวอร์ หนี้ย้ายที่ ไม่ได้หาย และสร้าง route ที่หน้าตาเป็น aggregate แต่ข้างในเป็น list query ปลอมตัว ซึ่งเป็นรูปแบบเดียวกับบั๊กที่กำลังแก้อยู่ |

**ผลลัพธ์ที่ต้องการ:** ลดจาก 3 ท่าเหลือ **1**

---

## 3. Design — Backend (`carmen-turborepo-backend-v2`)

### 3.1 สัญญา RPC

`packages/rpc-contract/src/contracts/clusters.ts` เป็นไฟล์ **generated** หัวไฟล์บังคับลำดับ 3 ขั้น
ทำผิดลำดับจะ compile ไม่ผ่าน:

1. เขียน handler ด้วย literal ชั่วคราว `@MessagePattern({ cmd: 'clusters.fleet-summary', service: 'micro-cluster' })`
2. `bun run gen:rpc-contract`
3. แทนที่ literal ด้วย `Clusters.fleetSummary.pattern`

entry ที่ได้:
```ts
fleetSummary: rpc('clusters.fleet-summary', 'micro-cluster').rest('GET', '/clusters/summary'),
```

### 3.2 `micro-cluster`

**`ClusterService.fleetSummary(userId?: string): Promise<Result<FleetSummary>>`**

```ts
const scope = await this.platformScope.clusterScopeFor(userId, 'cluster.read');
const where = scope.all ? {} : { id: { in: scope.clusterIds } };
return Result.ok(await this.buildFleetSummary(where));
```

- `buildFleetSummary` เป็น `private` แต่เรียกจากในคลาสเดียวกัน — **ไม่ต้องเปลี่ยน visibility**
- `buildFleetSummary` จัดการ `deleted_at` เองอยู่แล้ว (`stripSoftDelete` แล้วแยกนับ deleted)
  จึงไม่ต้องส่ง `deleted_at: null` เข้าไป
- **จงใจไม่ใส่ try/catch แบบ `listCluster:703-710`** — ที่นั่น `summary` เป็นของแถม ล้มแล้วตาราง
  ต้องรอด (ฟิลด์เป็น optional บนสาย และ "ไม่มี summary" มีความหมายนิยามไว้แล้วฝั่ง client)
  ที่นี่ summary **คือ** payload ทั้งหมด ถ้าล้มต้องเป็น error จริง ไม่ใช่ 200 ที่ว่างเปล่าให้ FE เดา

**`ClusterController`** — handler ใหม่วางถัดจาก `listCluster`

```ts
@MessagePattern(Clusters.fleetSummary.pattern)
async fleetSummary(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> { … }
```

ใช้ **`handleResult`** ไม่ใช่ `handlePaginatedResult` — payload ไม่ใช่รายการ ไม่มี `paginate`
(`handlePaginatedResult` รู้จักคีย์ `summary` เป็นพิเศษและยกขึ้นมาบน envelope ใช้ผิดที่นี่จะได้
`data.summary.summary` หรือฟิลด์หายเงียบ)

### 3.3 `backend-gateway`

**`PlatformClustersService.getFleetSummary(user_id, tenant_id, version)`**
→ `rpc.send(Clusters.fleetSummary, {...})` → `Result.ok(response.data)`
ไม่มี logo/avatar ให้ resolve จึงไม่มีลูป `Promise.all` แบบ `getlistCluster`

**`PlatformClustersController`**

- `@Get('summary')` **ต้องประกาศก่อน `@Get(':cluster_id')` (บรรทัด 147)** ไม่งั้น Nest จับ
  `summary` เป็น `cluster_id`
- decorator ชุดเดียวกับ route รายการ:
  `@UseGuards(new AppIdGuard('cluster.findAll'), PlatformPermissionGuard)` +
  `@RequirePlatformPermission('cluster.read')` + `@HttpCode(HttpStatus.OK)` + `@ApiVersionMinRequest()`
- **ไม่ใส่ `@EnrichAuditUsers()`** — payload ไม่มี `created_by`/`updated_by` ให้ enrich
- swagger: `@ApiStdResponse(ClusterFleetSummaryDto, …)` ใช้ DTO เดิมที่
  `swagger/response.ts:122` ไม่ต้องเขียนใหม่
- **ไม่รับ `@Query()` ใดๆ นอกจาก `version`** — บังคับสัญญา "ไม่รับ filter" ที่ระดับ signature
  ไม่ใช่แค่ในเอกสาร คนเพิ่ม `@Query('search')` ทีหลังต้องตั้งใจทำ ไม่ใช่เผลอ

#### ทำไมใช้ api_name เดิม `'cluster.findAll'` ใน `AppIdGuard`

`app-allowlist.store.ts:51-57`:
```ts
if (entry.allow_all) return true;
return entry.apis.has(apiName);   // ชื่อต้องตรงเป๊ะ
```

ถ้าใช้ชื่อใหม่ (เช่น `'cluster.fleetSummary'`) environment ที่ไม่ได้ตั้ง `allow_all` จะตอบ **401**
ซึ่งฝั่ง FE ตีความว่า token เสีย → **logout ผู้ใช้ทิ้งกลางทาง** กลายเป็น deploy backend สำเร็จ
แต่ผู้ใช้เข้าไม่ได้ ทั้งที่หน้าอื่นปกติดี และ 401 สองความหมายนี้แยกกันไม่ออกที่ฝั่ง client

route ใหม่อ่าน resource เดียวกัน ใช้สิทธิ์เดียวกัน (`cluster.read`) การใช้ชื่อเดิมทำให้ใช้ได้ทันที
ในทุก environment ที่รายการใช้ได้อยู่แล้ว โดยไม่ต้องแก้ข้อมูล allowlist — แลกกับ audit ที่หยาบลง
หนึ่งขั้น ซึ่งรับได้สำหรับ aggregate แบบอ่านอย่างเดียวของข้อมูลชุดเดิม

### 3.4 รูป response

```
GET /api-system/clusters/summary
→ {
    "data": { "total": 8, "active": 7, "inactive": 1, "deleted": 0,
              "near_limit": 2, "expiring_soon": 0,
              "bu":    { "used": 11, "cap": 30, "uncapped_count": 0, "uncapped_used": 0 },
              "users": { "used": 41, "cap": 79, "uncapped_count": 2, "uncapped_used": 0 } },
    "status": 200, …
  }
```

`handleResult` วาง value ลง `data` — FE อ่าน `data.data` (**ต่างจาก** route รายการที่อ่าน `data.summary`)

### 3.5 ด่านสิทธิ์ — จุดเสี่ยงเดียวของงานนี้

`buildFleetSummary` เขียนเตือนไว้เองที่ `:1546-1552`:

> ต้องเรียกด้วย `where` ตัวเดียวกับที่ `findMany` ใช้ … การส่งตัวก่อนผสมทำให้ผู้ดูแลระดับคลัสเตอร์
> เห็นตัวเลขทั้งกอง **โดยไม่มีอะไรพัง ไม่มี log และตัวเลขดูปกติทุกประการ**

ที่ endpoint ใหม่เราไม่ merge กับ query ใดเลย โหมดพังจึงแคบลงเหลือแบบเดียว: **ลืมเรียก
`clusterScopeFor`** ซึ่งตรวจได้ตรงๆ — ดู §7 แถวที่เป็นตัวหนา คำเตือนข้อนี้ผูกกับวิธีตรวจที่ระบุไว้
ไม่ปล่อยเป็นแค่ข้อความเตือน

---

## 4. Design — Frontend (`carmen-platform`)

### 4.1 Service

`src/services/clusterService.ts` เพิ่มเมธอดเดียว ตาม convention ที่ `src/services/CLAUDE.md:24`
กำหนด (`response.data.data || response.data`):

```ts
getFleetSummary: async (): Promise<FleetSummary> => {
  const response = await api.get('/api-system/clusters/summary');
  return response.data.data || response.data;
},
```

### 4.2 `/clusters` — `ClusterManagement.tsx`

| แก้ | ผล |
|---|---|
| `loadFleet` เรียก `getFleetSummary()` | ทิ้ง `perpage:-1`, ทิ้ง map 6 ฟิลด์, ทิ้ง `summarizeFleet` |
| ทิ้ง guard `setFleet(c => c ?? …)` → `setFleet(summary)` | `loadFleet()` ใน `handleConfirmDelete:306` **กลับมาทำงานจริงเป็นครั้งแรก** |
| **ลบ `if (data.summary) setFleet(data.summary)` (`:165`)** | บรรทัดนี้คือตัวบั๊ก §1.1.ค |

คอมเมนต์ `:179-180` ที่ประกาศเจตนา fleet-wide จะกลายเป็นจริงตามที่เขียนไว้เป็นครั้งแรก

การลบ guard ไม่ใช่การ "ทำความสะอาด" แต่เป็นการ**ซ่อมฟีเจอร์ที่ไม่เคยทำงาน** (§1.1.ข)

### 4.3 `/licenses` — `LicenseCenter.tsx`

`loadFleet` → `getFleetSummary()` แทน `perpage:1` + `data.summary`
ลบคอมเมนต์ §3.2 ที่อธิบายท่า `perpage:1` ทิ้ง — ไม่จริงแล้ว และคอมเมนต์ที่ไม่จริงอันตรายกว่าไม่มี

### 4.4 ลบโค้ดตาย

- `summarizeFleet()` และ `isNearLimit()` ใน `src/utils/capacity.ts` — ไม่มีผู้เรียกเหลือ
- `utilization()` **ยังอยู่** — `CapacityMeter` / `CapacityGauge` / `ClusterPlate` / `CapacityStrip`
  ยังเรียกอยู่ **ห้ามลบตาม**

---

## 5. Error handling — จงใจไม่มี fallback

ไม่ทำ fallback กลับไป `perpage:1` เมื่อ endpoint ยังไม่ deploy เพราะ fallback แบบนั้นคือสิ่งที่
สร้างปัญหาใน §1.1.ก/ข ตั้งแต่แรก แต่การไม่มี fallback ต้องแลกด้วยการทำให้ความล้มเหลว
**มองเห็นได้** ไม่ใช่ซ่อนไว้:

- catch → `setFleet(null)` (เหมือนที่ `LicenseCenter` ทำอยู่)
- **แก้ `FleetCapacity` ไม่ให้ค้างที่ skeleton ตลอดกาล** — ปัจจุบัน `:83` เรนเดอร์
  `loading || !summary → Skeleton` แปลว่าเมื่อโหลดไม่สำเร็จ แถบเต้นเป็น skeleton ไม่จบ
  บอกผู้ใช้ว่า "กำลังโหลด" ทั้งที่จริงคือ "โหลดไม่ได้"
  เพิ่ม prop `error?: boolean` แล้วเรนเดอร์บรรทัด `Capacity unavailable` แทน (~6 บรรทัด)

นี่ไม่ใช่งานแถม — มันคือครึ่งหลังของการตัดสินใจไม่มี fallback

---

## 6. เทสต์

ตาม preference ของผู้ใช้: **ไม่เขียนเทสต์ใหม่** แต่ชุดเดิมต้องเขียวครบก่อน merge

| ไฟล์ | จะแดงเพราะ | ต้องทำ |
|---|---|---|
| `src/pages/ClusterManagement.test.tsx:48` | mock เป็น `{ getAll, delete }` เท่านั้น พอหน้าเรียก `getFleetSummary` จะเป็น `undefined()` → **ทุกเทสต์ในไฟล์พังพร้อมกัน** และ error จะชี้ไปที่ render ไม่ใช่ที่ mock | เติม `getFleetSummary: vi.fn()` เข้า mock + `mockResolvedValue` ค่าเริ่มต้น |
| `src/utils/capacity.test.ts` | `describe('summarizeFleet')` และเคส `isNearLimit` อ้างฟังก์ชันที่ถูกลบ | ลบ describe ทั้งสองตามฟังก์ชัน (เคสของ `utilization` และ `seatUtilization` **คงไว้**) |
| `apps/micro-cluster/.../cluster.service.spec.ts:487` | — | **ไม่กระทบ** ทดสอบ summary ผ่าน `listCluster` ซึ่งเราคงไว้ตามการตัดสินใจ #2 |

คำสั่งที่ต้องเขียว: FE `bun run typecheck` + `bun run lint` + `bun run test` ·
BE ตามสคริปต์ของ repo นั้น (jest ต้องใช้ `--runInBand --forceExit` — LokiTransport ทำให้ค้าง)

---

## 7. ลำดับ deploy และวิธีพิสูจน์

1. **BE ก่อน** — merge เข้า `main` ของ `carmen-turborepo-backend-v2` (push `main` auto-deploy DEV)
2. **พิสูจน์ว่า route มีจริง — ห้ามใช้ `/version` เป็นหลักฐาน** ยิงคู่เทียบ:

   | ยิง | ต้องได้ |
   |---|---|
   | `GET /api-system/clusters/summary` | **200 + summary** |
   | `GET /api-system/clusters/summary-typo` | error ของ `:cluster_id` (invalid uuid / not found) |

   **ถ้าสองอันตอบเหมือนกัน = route ใหม่ยังไม่ขึ้น** — `summary` กำลังถูกจับเป็น `cluster_id`
   (นี่คือวิธีตรวจที่ผูกกับกับดัก §3.3 โดยตรง)

3. **FE ทีหลัง** — branch `feature/cluster-fleet-summary-endpoint` (ชื่อเดียวกันทั้งสอง repo)

### 7.1 วิธีตรวจด้วยมือ (ไม่ข้าม)

| ตรวจ | เกณฑ์ผ่าน |
|---|---|
| ยิงด้วย token super admin | ทุกฟิลด์เท่ากับที่ `GET /clusters?perpage=1` (ไม่ส่ง `search`/`filter`/`advance` ใดๆ) ให้ใน `summary` เป๊ะ |
| **ยิงด้วย token ของ cluster admin** | `total` = จำนวน cluster ที่เขาดูแล **ไม่ใช่จำนวนทั้ง fleet** ← ผูกกับความเสี่ยง §3.5 โดยตรง ข้อนี้ข้ามไม่ได้ |
| `/clusters` พิมพ์ค้นหา | แถบ **ไม่ขยับ** (วันนี้ขยับ — §1.1.ค) |
| `/clusters` ลบ cluster | แถบอัปเดต |
| `/licenses` | ตัวเลขเท่าเดิมทุกช่อง |
| DevTools Network ทั้งสองหน้า | ไม่เหลือทั้ง `perpage=-1` และ `perpage=1` ที่ยิงเพื่อเอา summary |

---

## 8. สิ่งที่จงใจไม่ทำในงานนี้

| ไม่ทำ | เหตุผล | ติดตามต่อ |
|---|---|---|
| ถอด `summary` ออกจาก `GET /clusters` | breaking change มีลำดับ deploy ของตัวเอง (การตัดสินใจ #2) | หลัง FE เลิกอ่านแล้ว ฟิลด์นี้จะไม่มีผู้อ่านใน FE เลย แต่ backend ยังคำนวณทุก request (`findMany` + `count` + `groupBy` 3 ตัว ต่อทุกการเปลี่ยนหน้า ทุกครั้งที่พิมพ์ค้นหา) — เป็นงาน DB ที่เสียฟรี ควรทำเป็น opt-in (`?summary=true`) ในงานถัดไป |
| แก้ `seat cap 0 = ศูนย์ที่นั่ง` | คนละเรื่อง มี design ของตัวเองที่ยังไม่อนุมัติ | ค้างอยู่ — มิติ user ยังแสดง `0 / ∞` ที่ 7 จุด |
| ทำ `expiring_soon` ให้ `/licenses` กับ `/clusters` นับเหมือนกัน | ทั้งคู่ใช้ค่าเดียวกันจาก backend อยู่แล้ว ต่างแค่ป้าย | — |

---

## 9. ความเสี่ยง

| ความเสี่ยง | ความรุนแรง | กัน |
|---|---|---|
| ลืม `clusterScopeFor` → cluster admin เห็นตัวเลขทั้ง fleet เงียบๆ | **สูง** — ไม่มี error ไม่มี log ตัวเลขดูปกติ | §7.1 แถวตัวหนา เป็นเกณฑ์ผ่านบังคับ |
| `@Get('summary')` วางหลัง `@Get(':cluster_id')` | กลาง — endpoint ใช้ไม่ได้แต่ error ดูเหมือน cluster ไม่พบ | §7 ขั้น 2 ยิงคู่เทียบ |
| ใช้ api_name ใหม่ใน `AppIdGuard` | **สูง** — 401 → logout ผู้ใช้ | §3.3 ใช้ `'cluster.findAll'` เดิม |
| FE deploy ก่อน BE | กลาง — แถบขึ้น `Capacity unavailable` | §5 ทำให้มองเห็นได้ + §7 ลำดับ deploy |
| `handlePaginatedResult` แทน `handleResult` | กลาง — ฟิลด์ซ้อนหรือหายเงียบ | §3.2 ระบุไว้ชัด |
| ลืมเติม `getFleetSummary` ใน mock | ต่ำ — เทสต์แดงทันที แต่ error ชี้ผิดที่ | §6 ระบุไว้ล่วงหน้า |
