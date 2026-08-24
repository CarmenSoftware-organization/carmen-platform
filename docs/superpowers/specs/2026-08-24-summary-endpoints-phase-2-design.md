# เฟส 2 — endpoint สรุปเฉพาะทางของ 5 resource แทนการดึงทั้งตาราง

**วันที่:** 2026-08-24
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (endpoint ใหม่ 5 ตัว) และ `carmen-platform` (5 หน้า) · **ไม่แตะ DB**
**สถานะ:** design รออนุมัติ
**ต่อยอดจาก:** `2026-08-24-summary-band-follows-filter-five-pages-design.md` (เฟส 1 — merged ใน PR #149) · `2026-08-24-cluster-fleet-summary-endpoint-design.md` (ต้นแบบ — merged ใน PR #150 / backend #404)

---

## 1. ปัญหา

เฟส 1 ทำให้แถบสรุปของ 5 หน้าหยุดเดินตาม filter ด้วยการเลิกใช้ `summary` ที่ endpoint รายการส่งมา แล้วหันไปพึ่ง `summarizeX()` ที่คำนวณเองจากคำขอ `perpage: -1`

นั่นถูกต้อง แต่แลกมาด้วยการ**ดึงทั้งตารางทุกครั้ง** และเป็นหนี้ที่เฟส 1 ประกาศไว้เองว่าจะใช้คืนที่นี่

### 1.1 ต้นทุนปัจจุบัน

| หน้า | คำขอใน `loadSummary` | จุดที่เรียก `loadSummary()` |
|---|---|---|
| `/applications` | 1 | 2 (mount + 1 หลัง mutation) |
| `/business-units` | 2 (`perpage:-1` + นับ deleted) | 2 |
| `/news` | 1 | 3 |
| `/platform/roles` | 1 | 2 |
| `/users` | 2 (`perpage:-1` + นับ deleted) | 6 |

รวม **7 คำขอต่อการเปิดครบ 5 หน้า** และยิงซ้ำทุกครั้งที่แก้ข้อมูล — `/users` หนักสุดที่ 5 จุดหลัง mutation × 2 คำขอ

แต่ละคำขอดึงทุกแถวของตารางมาให้ browser คำนวณสิ่งที่ฐานข้อมูลนับได้เร็วกว่ามาก และจำนวนแถวจะโตตามการใช้งานจริงโดยไม่มีเพดาน

### 1.2 ข้อเท็จจริงที่กำหนดรูปงาน (ตรวจจากซอร์สจริง 2026-08-24)

**ทั้งห้าใช้รูปเดียวกันอยู่แล้ว** — มี `buildXSummary(<where>)` อยู่ในเมธอด list ห่อ try/catch แล้วแนบเป็น `summary` แบบ optional:

| resource | app | ไฟล์:บรรทัด | builder รับ |
|---|---|---|---|
| `user` | micro-cluster | `cluster/user/user.service.ts:315` | `stripSoftDelete(where)` |
| `business-unit` | micro-cluster | `cluster/business-unit/business-unit.service.ts:671` | `summaryWhere` |
| `news` | micro-cluster | `cluster/news/news.service.ts:191` | `stripSoftDelete(where)` |
| `application` | micro-cluster | `cluster/application/application.service.ts:139` | `stripSoftDelete(where)` |
| `platform_role` | **micro-business** | `authen/platform_role/platform_role.service.ts:165` | `q.where()` |

**สองในห้าผูกกับขอบเขตสิทธิ์ อีกสามไม่ผูก** — และสองตัวนั้นใช้กลไกคนละตัว:

- `user` → `this.platformScope.clusterScopeFor(userId, 'user.read')` (`user.service.ts:85`) · **permission key คือ `user.read` ไม่ใช่ `cluster.read`**
- `business-unit` → `this.clusterAdminAuthz.readableClusterScope(user_id)` (`business-unit.service.ts:620`) · **คนละ service คนละรูปผลลัพธ์**

`news` / `application` / `platform_role` เป็น resource ระดับแพลตฟอร์ม ไม่มี scope ให้รักษา

**นี่คือความเสี่ยงหลักของเฟสนี้** — สำหรับ `user` และ `business-unit` การ "ตัด filter ออกแต่เก็บ scope ไว้" คือกับดักตัวเดียวกับที่ `/clusters/summary` เพิ่งเจอ และเป็นข้อที่ V2 ของงานนั้น **ยังพิสูจน์ไม่ได้จนถึงตอนนี้**

---

## 2. การตัดสินใจที่เคาะแล้ว

| # | ประเด็น | เคาะ | เหตุผล |
|---|---|---|---|
| 1 | ท่าที่ backend คืน aggregate ที่ไม่ผูก filter | **endpoint `/summary` แยก 5 ตัว** | สอดคล้องกับ `/clusters/summary` ที่เพิ่ง ship · endpoint หนึ่งตอบคำถามเดียว · ทางเลือก flag บน endpoint เดิม (`?summary=unscoped`) แก้น้อยกว่าและไม่มีความเสี่ยง 401 แต่ทำให้ endpoint เดียวตอบสองคำถาม ซึ่ง `/clusters` ตัดสินไม่เอาไปแล้ว |
| 2 | `summary` ที่แนบมากับ route รายการ | **คงไว้** | `/user-platform` และ `/licenses` ต้องการค่าที่ผูก filter จริงๆ (ดู `agent-os/standards/pages/summary-band.md`) · การถอดเป็นงานคนละชิ้น |
| 3 | ลำดับ deploy | **backend ทั้ง 5 ก่อน → พิสูจน์ทีละตัว → frontend** | เหมือน `/clusters/summary` |

---

## 3. Design — Backend

### 3.1 ตารางประกอบของทั้งห้า

ทุกช่องตรวจจากซอร์สจริงแล้ว

| resource | `@Controller` | route ใหม่ | ต้องอยู่เหนือ | ใช้ api_name เดิม | permission | scope |
|---|---|---|---|---|---|---|
| user | `api-system` | `@Get('user/summary')` | `@Get('user/:user_id')` `:180` | `platform-user.list` | `user.read` | **ใช่** |
| business-unit | `api-system/business-units` | `@Get('summary')` | `@Get(':business_unit_id')` `:144` | `businessUnit.findAll` | *(ไม่มี)* | **ใช่** |
| news | `/api/news` | `@Get('summary')` | `@Get(':news_id')` `:153` | `news.findAll` | *(ไม่มี)* | ไม่ |
| application | `api-system/applications` | `@Get('summary')` | `@Get(':application_id')` `:176` | `application.findAll` | `application.read` | ไม่ |
| platform role | `api-system/platform/roles` | `@Get('summary')` | `@Get(':role_id')` `:123` | `platform-role.findAll` | `platform_role.read` | ไม่ |

**ข้อดีที่ไม่คาด:** `news` และ `applications` **มีแบบอย่างอยู่แล้ว** — `@Get('tags')` (`:127`) และ `@Get('api-catalog')` (`:123`) วางก่อน route `:id` ของตัวเองอยู่แล้ว จึงไม่ต้องอธิบายรูปแบบใหม่ให้ผู้รีวิว

**`user` ต่างจากอีกสี่ตัว** — controller เป็น `@Controller('api-system')` เฉยๆ และ route เป็น `@Get('user')` / `@Get('user/:user_id')` ดังนั้น route ใหม่คือ `@Get('user/summary')` ไม่ใช่ `@Get('summary')`

### 3.2 รูปของแต่ละชั้น (เหมือน `/clusters/summary` ทุกประการ)

**micro service** — เมธอดใหม่ที่เรียก builder ที่มีอยู่แล้ว ด้วย `where` ที่มีแต่ขอบเขต:

```ts
// news / application / platform_role — ไม่มี scope, where ว่างคือคำตอบที่ถูก
@TryCatch
async newsSummary(): Promise<Result<NewsSummary>> {
  return Result.ok(await this.buildNewsSummary({}));
}

// business-unit — scope เป็นคอลัมน์ตรง
@TryCatch
async businessUnitSummary(user_id?: string): Promise<Result<BuSummary>> {
  const scope = await this.clusterAdminAuthz.readableClusterScope(user_id);
  const where = scope.all ? {} : { cluster_id: { in: scope.clusterIds } };
  return Result.ok(await this.buildBuSummary(where));
}

// user — scope เป็น RELATION FILTER ซ้อน ไม่ใช่คอลัมน์ตรง (ดู §3.4)
@TryCatch
async userSummary(userId?: string): Promise<Result<UserSummary>> {
  const scope = await this.platformScope.clusterScopeFor(userId, 'user.read');
  const where = scope.all
    ? {}
    : {
        tb_cluster_user_tb_cluster_user_user_idTotb_user: {
          some: { cluster_id: { in: scope.clusterIds }, deleted_at: null },
        },
      };
  return Result.ok(await this.buildUserSummary(where));
}
```

- **ห่อด้วย `@TryCatch`** เหมือนทุกเมธอดพี่น้อง — มันแปลง throw เป็น `Result.error` → HTTP error จริง ไม่ใช่การกลืน error
- **ใช้ `handleResult` ไม่ใช่ `handlePaginatedResult`** ที่ controller ของ microservice — payload ไม่ใช่รายการ
- **ห้ามแตะเมธอด list เดิม** — `summary` ที่แนบมากับมันคงไว้ตามการตัดสินใจ #2

**gateway** — route ใหม่ที่:

- วางเหนือ route `:id` ตามตาราง §3.1
- ใช้ decorator ชุดเดียวกับ route รายการของตัวเอง รวมถึง **api_name เดิม**
- **ไม่รับ `@Query()` ใดนอกจาก `version`** — บังคับสัญญาที่ระดับ signature
- ประกาศ `@ApiResponse` 400/401 และ 403 เฉพาะ route ที่มี `PlatformPermissionGuard`

**rpc-contract** — 4 entry ใน `clusters.ts` (micro-cluster) และ 1 ใน `platform-roles.ts` (micro-business) ผ่านขั้นตอน 3 ขั้นที่หัวไฟล์บังคับ

### 3.3 ⚠️ news ต้อง presign รูปของ lead story

`news.summary` มี `latest` ซึ่งมี `image_url` และ gateway ของ route รายการเรียก `attachNewsImageUrl(this.rpc, summary.latest, user_id)` (`news.service.ts:130`)

**route ใหม่ต้องทำเหมือนกัน** ไม่งั้นภาพในแถบ masthead พังเงียบๆ — ตัวเลขถูกทุกตัว มีแต่รูปที่หาย ซึ่งไม่มีเทสต์ไหนจับ

### 3.4 ⚠️ ความเสี่ยงหลัก — scope ของ user และ business-unit

สองตัวนี้คือที่ที่ความผิดพลาดจะไม่ส่งเสียง: ส่ง `where` ที่ไม่มี scope แล้ว cluster admin จะเห็นจำนวนผู้ใช้/BU ทั้งระบบ **โดยไม่มีอะไรพัง ไม่มี log และตัวเลขดูปกติ**

และสองตัวใช้กลไกคนละแบบ ห้ามลอกกันเอง:

| | service | เมธอด | permission key |
|---|---|---|---|
| user | `platformScope` | `clusterScopeFor` | `'user.read'` |
| business-unit | `clusterAdminAuthz` | `readableClusterScope` | *(ไม่รับ key)* |

### รูปของ predicate ต่างกันทั้งสามตัวในโค้ดเบสนี้ — และนี่คือจุดที่การลอกจะพัง

| resource | predicate ที่ถูก | ที่มา |
|---|---|---|
| cluster *(ทำไปแล้ว)* | `{ id: { in: scope.clusterIds } }` | `cluster.service.ts` |
| business-unit | `{ cluster_id: { in: scope.clusterIds } }` | `business-unit.service.ts:640` |
| **user** | `{ tb_cluster_user_tb_cluster_user_user_idTotb_user: { some: { cluster_id: { in: scope.clusterIds }, deleted_at: null } } }` | `user.service.ts:86-91` |

`user` ไม่มีคอลัมน์ `cluster_id` บนตัวเอง — ความสัมพันธ์อยู่ผ่านตารางกลาง predicate จึงเป็น **relation filter ซ้อน** ไม่ใช่คอลัมน์ตรง

**สองวิธีที่จะเขียนผิดแล้วไม่มี error:**
- เขียนเป็น `{ id: { in: scope.clusterIds } }` (ลอกจาก cluster) → เทียบ user id กับ cluster id ไม่ match อะไรเลย → แถบขึ้น 0 ทุกช่อง ซึ่งดูเหมือน "ยังไม่มีผู้ใช้" มากกว่าดูเหมือนบั๊ก
- เขียนเป็น `{}` เพราะเห็นว่า `scope.all` จริงในบัญชีที่ทดสอบ → cluster admin เห็นจำนวนผู้ใช้ทั้งระบบ

**ห้ามเขียน predicate เอง — คัดลอกจากเมธอด list ของ resource นั้นโดยตรง** `listUser` และ `listBusinessUnit` ประกอบมันไว้แล้วและผ่านการใช้งานจริง การประกอบใหม่จากความเข้าใจคือทางที่ทั้งสองความผิดพลาดข้างบนเกิดขึ้น

---

## 4. Design — Frontend

แต่ละหน้าแก้จุดเดียว: `loadSummary` เปลี่ยนจาก `getAll({ perpage: -1, … })` (+ คำขอนับ deleted สำหรับ BU/User) เป็นการเรียก endpoint ใหม่ตัวเดียว แล้วอ่าน `response.data.data || response.data` ตาม convention

| หน้า | เดิม | ใหม่ |
|---|---|---|
| `/applications` | 1 คำขอ + `summarizeApplications` | 1 คำขอ |
| `/business-units` | 2 คำขอ + `summarizeBus` | 1 คำขอ |
| `/news` | 1 คำขอ + `summarizeNews` | 1 คำขอ |
| `/platform/roles` | 1 คำขอ + `summarizeRoles` | 1 คำขอ |
| `/users` | 2 คำขอ + `summarizeUsers` | 1 คำขอ |

**`summarizeX` ทั้งห้าตัวและเทสต์ของมันถูกลบ** เมื่อไม่มีผู้เรียกเหลือ — พร้อมคอมเมนต์ที่เฟส 1 เพิ่งเขียนไว้ว่ามันเป็นแหล่งเดียวจนกว่าจะถึงเฟส 2 ซึ่งตอนนี้ถึงแล้ว

**`agent-os/standards/pages/summary-band.md` ต้องแก้ตาม** — หัวข้อ *"Band sits above the filter … aggregate client-side"* จะไม่จริงอีกต่อไปสำหรับห้าหน้านี้ กลายเป็น "อ่านจาก endpoint สรุปเฉพาะทาง" ส่วนหัวข้ออีกฝั่ง (`/user-platform`, `/licenses`) ไม่เปลี่ยน

**`error` prop และสถานะ "Capacity unavailable"** ที่เฟส 1 เพิ่มไว้คงเดิมทุกหน้า — ไม่มี fallback ยังเป็นการตัดสินใจเดิม

---

## 5. ลำดับ deploy และการพิสูจน์

1. **backend ทั้ง 5 ขึ้นก่อน** (PR เดียวหรือแยกก็ได้ แต่ต้องขึ้นครบก่อน frontend)
2. **พิสูจน์ทีละ endpoint ด้วยคู่เทียบ — ห้ามใช้ `/version`** ทั้งห้า controller ใช้ `ParseUUIDPipe({version:'4'})` บน param ของตัวเอง คู่เทียบจึงใช้ได้ครบ:

   | ยิง | ต้องได้ |
   |---|---|
   | `GET <path>/summary` | 200 + payload |
   | `GET <path>/summary-typo` | 400 จาก `ParseUUIDPipe` |

   ถ้าสองอันตอบเหมือนกัน = route นั้นยังไม่ขึ้น หรือถูก `:id` กลืน

3. **frontend ทีหลัง**

### 5.1 การตรวจด้วยมือ

| # | ตรวจ | เกณฑ์ผ่าน |
|---|---|---|
| V1 | ตัวเลขจาก endpoint ใหม่ vs ที่แถบเคยแสดง | เท่ากันทุกฟิลด์ทั้ง 5 หน้า |
| V2 | ลักลอบใส่ `?search=…` เข้า endpoint ใหม่ | ค่าไม่ขยับ (ท่านี้จับบั๊กได้จริงตอนทำ `/clusters`) |
| **V3** | **ยิง `user/summary` และ `business-units/summary` ด้วย token ของบัญชีที่ scope จำกัด** | ได้เลขน้อยกว่าที่ super admin ได้ · **ข้อนี้ข้ามไม่ได้** |
| V4 | พิมพ์ค้นหาทั้ง 5 หน้า | แถบไม่ขยับ (พฤติกรรมเฟส 1 ต้องไม่ถอย) |
| V5 | ลบข้อมูลสักรายการ | แถบอัปเดต |
| V6 | `/news` แถบยังมีรูป lead story | รูปไม่หาย (§3.3) |
| V7 | DevTools Network | ไม่เหลือ `perpage=-1` ในทั้ง 5 หน้า |

**V3 คือข้อเดียวกับ V2 ของงาน `/clusters` ที่ยังค้างอยู่** — ถ้ายังหาบัญชีที่เข้าเกณฑ์ไม่ได้ ทั้งสองงานจะค้างที่จุดเดียวกัน ควรแก้ปัญหาบัญชีทดสอบก่อนเริ่มเฟสนี้ ไม่ใช่หลัง

---

## 6. เทสต์

**ไม่เขียนเทสต์ใหม่** ตาม preference ชุดเดิมต้องเขียว

**สิ่งที่จะเปลี่ยน:** การลบ `summarizeX` ทั้งห้าตัวจะลบ unit test ของมันไปด้วย (`ApplicationRegistrySummary.test.tsx` 5 · `BuSummary.test.tsx` 4 · `NewsroomSummary.test.tsx` 7 · `RolesAccessSummary.test.tsx` 6 · `UserDirectorySummary.test.tsx` 7) — จำนวนเทสต์ต้อง**ลดลง** ถ้าเท่าเดิมแปลว่าลบไม่สำเร็จ

**⚠️ ข้อที่ต้องรู้:** เฟส 1 เปลี่ยนแถบไปพึ่ง `summarizeX` ซึ่ง**มีเทสต์ครอบ** เฟสนี้เปลี่ยนกลับไปพึ่งค่าจาก backend ซึ่ง**ฝั่ง frontend ไม่มีเทสต์ครอบเลย** — เป็นการลดความครอบคลุมโดยตั้งใจ แลกกับการตัดการดึงทั้งตาราง ต้องชดเชยด้วย V1/V3 ที่ §5.1

---

## 7. ความเสี่ยง

| ความเสี่ยง | ความรุนแรง | กัน |
|---|---|---|
| ลืม scope ใน `user` หรือ `business-unit` | **สูง** — ไม่มี error ไม่มี log ตัวเลขดูปกติ | §3.4 + **V3 เป็นเกณฑ์ผ่านบังคับ** |
| ลอกกลไก scope ข้ามกันระหว่างสองตัว | **สูง** — คนละ service คนละ key | §3.4 ระบุแยกไว้ชัด |
| `@Get('summary')` วางใต้ route `:id` | กลาง — endpoint ใช้ไม่ได้แต่ error ดูเหมือนหาไม่เจอ | §5 ขั้น 2 ยิงคู่เทียบทีละตัว |
| ตั้ง api_name ใหม่ใน `AppIdGuard` | **สูง** — 401 → เตะผู้ใช้ออก × 5 จุด | §3.1 ระบุชื่อเดิมของทุกตัว |
| `user` ใช้ `@Get('summary')` แทน `@Get('user/summary')` | กลาง — จะไปชนกับ path อื่นใต้ `api-system` | §3.1 ระบุแยกไว้ |
| news ลืม presign lead story | กลาง — ตัวเลขถูก รูปหาย ไม่มีเทสต์จับ | §3.3 + V6 |
| แก้ contract file ด้วยมือ | กลาง — ถูกลบทิ้งครั้งถัดไปที่รัน generator | ทำตาม 3 ขั้นที่หัวไฟล์ |
| ความครอบคลุมของเทสต์ลดลงโดยไม่มีใครสังเกต | กลาง | §6 ระบุตรงๆ ว่าเป็นการแลก ไม่ใช่ผลข้างเคียง |
