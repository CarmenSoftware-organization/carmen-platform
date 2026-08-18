# Licensing model เฟส A — ผลลัพธ์

**วันที่:** 2026-08-18
**สเปก:** `2026-08-17-license-model-design.md` · **แผน:** `../plans/2026-08-17-license-model.md`
**repo:** `carmen-turborepo-backend-v2` กิ่ง `feature/license-model` · **22 commits · 54 ไฟล์ · +6653 / −92** · HEAD `0b07ebbc5`
**สถานะ:** เฟส A ครบ 9/9 task · รีวิวทั้งกิ่งผ่าน · **ยังไม่ push ยังไม่ merge ยังไม่ deploy**

---

## สิ่งที่ได้

| ชั้น | ของ |
|---|---|
| DB | `tb_license_feature` · `tb_subscription_bu` · `tb_subscription_bu_feature` (FK สายเดียว) · drop 3 ตารางที่ไม่มีใครใช้ |
| Catalog | generate จาก `permission.route-map.ts` → 74 feature / 10 module / 129 route mapping + CI drift check |
| Gateway | `LicenseService` (cache 60 วิ) · `resolveRouteFeature` · `evaluateLicense` · `LicenseInterceptor` (global) · เติม license ลง `x-bu-datas` · `license` block ใน profile |
| micro-cluster | `assertSeatAvailable` 3 จุด + `FOR UPDATE` |
| micro-business | subscription CRUD 7 TCP command |
| API | `/api-system/platform/subscriptions` 7 เส้น + permission `subscription.read`/`.manage` |
| Error | `LICENSE_REQUIRED` · `LICENSE_EXPIRED` · `SEAT_LIMIT_REACHED` ในแคตาล็อก |
| เทสต์ | เขียนใหม่ทั้งหมดหลังเจ้าของกลับกฎกลางทาง |

audit เขียวทั้ง 5 · boot-check ผ่าน 3 app · check-types 16/16

---

## Ruling ที่ coordinator ตัดสินแทนเจ้าของ (27 ข้อ)

### แก้บั๊กในสเปก/แผนที่เขียนไว้ผิดเอง (7)

| # | เรื่อง | ต้นทุนถ้าผิด |
|---|---|---|
| 1 | `Result.fail()` ไม่มีอยู่จริง → `Result.error()` | type error ที่เห็นทันที |
| 7 | `max_license_bu` ถูกบังคับที่ backend อยู่แล้ว → ถอด `assertBuQuotaAvailable` ออก | ถ้ามีเส้นทางสร้าง BU อื่นจะยังทะลุ |
| 11 | drift checker เขียนทับไฟล์ของคนที่รันมันเพื่อ*ตรวจ* | CI รายงาน drift ผิด — เห็นจากการทดสอบ tamper |
| 13 | query pending invite ไม่ scope ด้วย `buIds` (ดึงทั้งแพลตฟอร์ม) | ตัวเลข pending ผิด — จับได้จาก review/browser |
| 15 | `resolveRouteFeature` คืน `null` = ผ่าน ⇒ regex จับพลาด = ช่องบายพาส | normalize เกินไปทำให้คุม route ที่ไม่ควรคุม — เห็นตอน shadow mode |
| 25 | `doc_version` ต้องบังคับ ไม่ใช่ opt-in (ตามเพื่อนบ้าน `platform_role`) | เฟส B ต้องส่งเสมอ ซึ่ง CLAUDE.md rule 17 กำหนดอยู่แล้ว |
| 26 | ยกระดับ Minor (seat where ซ้ำ 3 ที่) เป็นต้องแก้ | refactor ทำให้เงื่อนไขเพี้ยน — เทสต์ seat จับได้ |

### กระบวนการ / สภาพแวดล้อม (6)

| # | เรื่อง | ต้นทุนถ้าผิด |
|---|---|---|
| 2 | ledger อยู่ใน `carmen-platform` แม้งานอยู่คนละ repo | ย้ายไฟล์ |
| 3 | ไม่ใช้ worktree แยก (`.env`/`node_modules` ที่ gitignore ต้องใช้) | `git checkout main` กู้ได้ |
| 4–5 | ต้นเหตุคือ **schema drift** (index `email_sender_profile_deleted_at_idx` หายจาก DEV) ไม่ใช่ checksum → เลิกใช้ `migrate dev` ใช้ `migrate diff` + `migrate deploy` | เส้นทางใหม่ไม่พึ่ง shadow DB จึงใช้ได้อยู่ดี |
| 6 | ตัด `CREATE INDEX email_sender_profile_deleted_at_idx` ออกจาก migration ของเรา | drift ยังอยู่ คนถัดไปเจอกำแพงเดิม |
| 8 | เจ้าของสั่ง "ทำต่อ แต่ถามก่อนทุกครั้งที่แตะ DEV" → เพิ่ม 2 กฎลง global constraints | — |
| 14 | เจ้าของกลับกฎ "ห้ามเขียนเทสต์" กลางทาง → เขียนย้อนหลัง + บังคับทุก task ต่อจากนั้น | — |

### ตัดสิน finding ของ reviewer (8)

| # | เรื่อง | ผล |
|---|---|---|
| 9 | Critical "ไม่มีหลักฐานทำ STOP GATE" | **ตกไป** — ผมรันเองแล้วแต่ลืมใส่ในบล็อก constraints ที่ส่งให้ reviewer |
| 10 | "check-types ไม่แนบ raw output" | ปิดด้วยการรันเอง ไม่เปิด fix round |
| 12 | "seeder revive จะ throw เพราะ unique" | **failure mode ผิด** — index ไม่มี `NULLS NOT DISTINCT` จึงไม่ชน แต่ปัญหาจริง (แถวซาก) มีอยู่ |
| 16 | รายงาน A4 แปะ raw output ที่แต่งขึ้น | รับเป็นบทเรียน ไม่เปิด fix round |
| 19 | Critical "`code` หายจาก error body" | **ของจริง** — `exception.fillter.ts:167` ลบ `code` ไม่มีเงื่อนไข ใส่กลับเฉพาะเมื่อมีใน catalog |
| 20 | boot check ไม่พิสูจน์ lazy resolve | รับ แก้ด้วย eager resolve ใน `onApplicationBootstrap` |
| 21–22 | logger arg order | **reviewer ผิด implementer ถูก** — `warn(message: unknown, ...)` รับ object เป็น arg 1 |
| 27 | A8 เบี่ยง 2 จุด (แก้ไฟล์ A7 · ใช้ `RpcClient`) | **อนุมัติทั้งคู่ ดีกว่าที่สั่ง** |

### เรื่องที่ implementer แก้ coordinator กลับ และถูก (3)

| # | เรื่อง |
|---|---|
| 17 | test agent อ้างว่า `tag-groups.spec.ts` แดงเพราะ A1–A4 เพิ่ม endpoint — **ผิด** กิ่งไม่แตะ `swagger/` เลย แดงบน `main` อยู่ก่อน |
| 18 | `LicenseService` ต้อง resolve แบบ lazy ผ่าน `ModuleRef` ไม่งั้น **spec เดิมพัง 96+ ไฟล์** — มี precedent ที่ `app.module.ts:189` |
| 23–24 | `@TryCatch` กลืน `SEAT_LIMIT_REACHED` (ของจริง) · แต่ผมอ้างผิดว่า `DOC_VERSION_CONFLICT` เป็น dead code — grep แคบเกินไป ของจริงอยู่ใน `packages/` |

**บทเรียนที่เกิดซ้ำ 2 ครั้ง:** grep ที่จำกัดขอบเขตหรือ `head` ตัดผลทิ้ง ทำให้สรุปว่า "ไม่มี" ทั้งที่มี

---

## 🔴 ต้องให้เจ้าของตัดสิน

### 1. seat enforcement ไม่มี kill switch — มีผลทันทีที่ deploy

`assertSeatAvailable` อยู่ใน micro-cluster ไม่อ่าน `license.enforcement_enabled` (อยู่ใน gateway คนละ app)
สเปก §9 บรรยาย rollout ว่า "flag=false → shadow mode" **แต่ไม่ได้ระบุว่า seat เป็นข้อยกเว้น**

`max_license_users` มีข้อมูลจริงอยู่แล้ว (หน้า BusinessUnitEdit แก้ได้ · CSV export · เกจ capacity) แต่**ไม่เคยมีใครบังคับใช้** → อาจมี BU ที่ `used ≥ cap` อยู่ตอนนี้ วินาทีที่ deploy: เชิญคน/assign/เปิดใช้งาน → 403 ทันที

**ต้องทำก่อนตัดสิน:** query DEV/prod ว่ามี BU ไหน `used ≥ cap`

### 2. จุดที่ 4 ที่กินที่นั่งได้ ไม่ถูกเช็ค

`apps/micro-cluster/src/cluster/user/user.service.ts:652` เขียน `tb_user.is_active` ตรง ๆ โดยไม่ผ่าน `assertSeatAvailable`
สเปก §6.1 นับ active **สองชั้น** แต่ §6.2 ระบุจุดบังคับแค่ 3 จุดซึ่งอยู่ที่ตารางลิงก์ทั้งหมด
→ เปิด user 1 คนที่ผูก 5 BU = คืนที่นั่ง 5 ที่พร้อมกัน ทะลุ cap ได้ทุกใบ

---

## ต้องทำก่อน deploy

1. **สคริปต์ backfill + นิยาม feature พื้นฐานที่บังคับ** — `evaluateLicense` บล็อก GET ด้วย สัญญาที่ลืมติ๊ก `configuration.app_config` / `system_admin.role` / `system_admin.user` จะทำให้ inventory **เปิดไม่ขึ้นทั้งแอป** ไม่ใช่แค่ซ่อนเมนู
2. **dedupe/sampling ให้ shadow log** — 129 segment ครอบเกือบทั้ง API ก่อน backfill แทบทุก request ยิง warn สัญญาณจะจมในเสียงรบกวน 100%
3. **รัน `seed:license-feature` + seed permission** — `deploy-gcp.yml` มีแค่ job `migrate` ไม่มี seed
4. **รัน migration ก่อน deploy gateway** — `deploy-gcp.yml:170` วาง `migrate` ไว้หลัง `deploy-gateway` (แก้ `needs:` หรือรันมือ)
5. ตรวจว่า application record ของ carmen-platform ได้ `subscription.*` หรือ `allow_all`
6. **ยิง request จริง 3 เคส** — ทั้งกิ่งยังไม่เคยยิง HTTP จริงเลย ทุกอย่างเป็น unit test + static trace

---

## หนี้ที่บันทึกไว้

- **cluster scope ของ subscription CRUD** — `PlatformPermissionService.has()` หยาบโดยตั้งใจ (ผ่านถ้ามี key ใน cluster ไหนก็ได้) + `list()` ไม่กรอง cluster → คนที่ได้ `subscription.manage` เฉพาะ cluster A จัดการ cluster B ได้ · repo มี `PlatformScopeService.clusterScopeFor()` อยู่แล้ว
- **BU หลายสัญญา features ไม่ union** — `resolveBatch` เลือกสัญญาเดียว add-on ที่หมดอายุก่อนจะหายเงียบ ขณะที่หน้า platform แสดงว่าเปิดอยู่
- ไม่มีเทสต์ `KeycloakGuard` เลย (ไม่มีมาก่อนด้วย) ทั้งที่กิ่งนี้เพิ่ม DB call ลงในไฟล์ที่ทุก request วิ่งผ่าน
- `@repo/prisma-shared-schema-platform` แบก business logic (optimistic lock + `deriveSubscriptionState`) ทั้งที่ชื่อบอกว่าเป็น schema — หนี้เก่าก่อนกิ่งนี้
- M1 M2 M3 M4 M6 M7 M9 M10 M13 · N2 N3 N5 N6 N7 (รายละเอียดใน ledger)
