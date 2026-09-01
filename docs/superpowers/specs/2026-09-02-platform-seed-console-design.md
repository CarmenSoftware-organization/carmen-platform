# Platform seed & drift-check console — design

วันที่ 2026-09-02 · ข้าม 2 repo: `carmen-turborepo-backend-v2` (ส่วนใหญ่) และ `carmen-platform`

## ปัญหา

`packages/prisma-shared-schema-platform` มีสคริปต์ที่ทำงานกับ **ฐานข้อมูลแพลตฟอร์ม** 15 ตัว — 9 ตัวเป็น
`db:seed.*` (ลงข้อมูลตั้งต้น) และ 6 ตัวเป็น `db:check.*` (หา drift ระหว่างโค้ดกับข้อมูลจริง) ทุกวันนี้รันได้
ทางเดียวคือเข้าเครื่องแล้วพิมพ์ `bun run db:seed.permission` ในโฟลเดอร์ที่ถูกต้อง

`carmen-inventory-god-mode` มีหน้าเดียวที่รวมงานพวกนี้ไว้ แต่เป็น Next.js ที่ spawn child process จาก route
ของตัวเอง ซึ่ง `carmen-platform` ทำไม่ได้เพราะเป็น SPA ล้วน ไม่มี server ตอน runtime

**สิ่งที่ต้องการ**: ให้ผู้ดูแลระบบสูงสุดสั่งรันงานเหล่านี้จากหน้าจอได้ พร้อมเห็น log ไหลสด

## ขอบเขต

**14 operation** = 8 seed + 6 check

| group | id | สคริปต์ | เขียน DB |
|---|---|---|---|
| seed | `seed-currency-iso` | `prisma/seed.currency-iso.ts` | ✔ |
| seed | `seed-permission` | `prisma/seed.permission.ts` | ✔ |
| seed | `seed-platform-permission` | `prisma/seed.platform-permission.ts` | ✔ |
| seed | `seed-role-permission` | `prisma/seed.role-permission.ts` | ✔ |
| seed | `seed-platform-role` | `prisma/seed.platform-role.ts` | ✔ |
| seed | `seed-platform-role-permission` | `prisma/seed.platform-role-permission.ts` | ✔ |
| seed | `seed-report-template-upload` | `prisma/seed.report-template-upload.ts` | ✔ |
| seed | `seed-license-feature` | `prisma/seed.license-feature.ts` | ✔ |
| check | `check-permission` | `prisma/check.permission-drift.ts` | — |
| check | `check-platform-permission` | `prisma/check.platform-permission-drift.ts` | — |
| check | `check-platform-role-permission` | `prisma/check.platform-role-permission-drift.ts` | — |
| check | `check-endpoint-permission` | `prisma/check.endpoint-permission-coverage.ts` | — |
| check | `check-api-system-permission` | `prisma/check.api-system-permission-coverage.ts` | — |
| check | `check-seat-pool-view` | `prisma/check.seat-pool-view.ts` | ✔ (roll back เสมอ) |

### ที่ไม่ทำและเหตุผล

**`db:seed.platform-super-admin` ถูกตัดออก** มันอ่าน `SUPER_ADMIN_USER_ID` จาก env แล้วมอบสิทธิ์ super-admin
ให้ user นั้น จากหน้าเว็บมันจะเป็น no-op ถ้า container ไม่ได้ตั้ง env และถ้าตั้งไว้ มันคือปุ่มมอบสิทธิ์สูงสุดที่
ผู้กดไม่ได้เลือกว่าให้ใคร ไม่มี audit ว่าใครถูกมอบ — งานนี้หน้า `/platform/super-admins` ทำอยู่แล้วอย่างถูกต้อง

**`check-seat-pool-view` ไม่ใช่ read-only** ต่างจาก check อีก 5 ตัว มันเขียนแถวจริง (`deleteMany` + `create`
บนใบอนุญาตของ BU ที่มีอยู่จริง) ภายใน transaction ที่ roll back เสมอ ผลสุทธิเป็นศูนย์ แต่ระหว่างรันมันถือ
row lock บนข้อมูลลูกค้า จึงถูกจัดเป็น op ที่ต้องยืนยันก่อนรัน ไม่ใช่ปุ่มกดเล่น

**`tenant seed` เป็นคนละเรื่อง** `carmen-platform` มี `tenantSeedService.ts` + `TenantSeedCard.tsx` ยิง
`/api-system/tenant/seeds/:bu_id/*` อยู่แล้ว นั่นคือ seed ของ DB **ราย BU** ชุดนี้เป็นของ DB กลาง คนละฐาน
คนละ endpoint ไม่มีการรวมกัน

## ความเป็นไปได้ที่ตรวจแล้ว

สคริปต์เหล่านี้เป็นไฟล์ `.ts` ที่ต้องรันด้วย `bun` ในโฟลเดอร์ของแพ็กเกจ จึงต้องพิสูจน์ว่า image ที่ deploy จริง
มีทั้งสองอย่าง — ตรวจ `apps/micro-business/Dockerfile` แล้ว:

- `RUN npm install -g bun` อยู่ใน **runner stage** ไม่ใช่แค่ builder
- `COPY --from=builder /app/packages ./packages` ลอก `packages/` ทั้งก้อน ซึ่งรวม `prisma/*.ts` ทุกไฟล์
- `CMD ["bun", "start:prod"]` — โปรเซสหลักเองก็รันด้วย bun

`platform_migration.service.ts` spawn โปรเซสในโฟลเดอร์เดียวกันนี้อยู่แล้วและใช้งานได้จริง จึงไม่ใช่เรื่องใหม่

## สถาปัตยกรรม

```
เบราว์เซอร์
  │ POST /api-system/platform/seeds/:op_id/run/stream   (NDJSON)
  ▼
backend-gateway  PlatformSeedsController
  │ PlatformMigrationGuard  (super-admin + สวิตช์ platform_migration.api_enabled)
  │ RPC (HTTP) → Observable
  ▼
micro-business   PlatformSeedService
  │ PlatformDbLock  (ใช้ร่วมกับ PlatformMigrationService)
  │ spawn: bun prisma/seed.permission.ts   cwd = โฟลเดอร์แพ็กเกจ platform prisma
  ▼
ฐานข้อมูลแพลตฟอร์ม
```

### 1. Catalog เป็นของ backend

`apps/micro-business/src/authen/platform_seed/platform_seed.catalog.ts` ถือ 14 entry รูป

```ts
type SeedOp = {
  id: string;              // 'seed-permission'
  group: 'seed' | 'check';
  script: string;          // 'prisma/seed.permission.ts'
  writes: boolean;
  readonly: boolean;       // ห้าม true พร้อม writes
};
```

พร้อม invariant check ตอน import (ล้อ god-mode `lib/platform-migrations.ts`) ว่า `readonly` กับ `writes`
ต้องไม่จริงพร้อมกัน — ตรวจตอนโหลดโมดูล ไม่ใช่ตอนรัน

**ไม่มีฟิลด์ `label` ในทะเบียน** backend ส่งแค่ `id` ชื่อและคำอธิบายที่ผู้ใช้เห็นอยู่ใน i18n ของ frontend
โดย key ตั้งจาก `id` (`pages.platformMigration.op.seedPermission.label` / `.desc`) เพราะข้อความพวกนี้ต้อง
แปลสองภาษา ถ้าให้ backend ส่งมาจะกลายเป็นข้อความภาษาเดียวที่แปลไม่ได้ ผลข้างเคียงคือ **op ที่ backend
รู้จักแต่ frontend ยังไม่มีคีย์ ต้องแสดง `id` ดิบแทนที่จะแสดงช่องว่าง** — เป็นทางที่ทำให้ deploy สลับลำดับ
แล้วยังอ่านออก

**ทำไมทะเบียนไม่ได้อยู่ที่ frontend** เพราะหน้าจอรู้ไม่ได้ว่า image ที่ deploy อยู่มีไฟล์สคริปต์ตัวนั้นจริงไหม
backend ตรวจด้วย `fs.existsSync(path.join(prismaDir, op.script))` ตอนตอบ `/catalog` แล้วส่งธง `missing: true`
กลับมาได้ ถ้า hardcode ที่ FE เวอร์ชันที่ไม่ตรงกันจะกลายเป็นปุ่มที่กดแล้วพังโดยไม่มีสัญญาณล่วงหน้า
god-mode ทำแบบเดียวกันด้วยเหตุผลเดียวกัน (`resolveScriptInfo`)

### 2. `PlatformDbLock` — lock ที่ใช้ร่วมกัน (เป็นการแก้ของเดิม)

วันนี้ `PlatformMigrationService` มี `private isRunning` ของตัวเอง ถ้า `PlatformSeedService` มี lock แยก
จะเปิดช่องให้ `prisma migrate deploy` กับ `seed.permission` วิ่งพร้อมกันบนฐานข้อมูลเดียวกันได้ ซึ่งเป็นสิ่งที่
lock เดิมตั้งใจกันตั้งแต่แรก

จึงดึงออกมาเป็น provider เล็ก ๆ `PlatformDbLock` (`withLock<T>(fn)`) แล้วให้ทั้งสอง service ใช้ instance
เดียวกัน — เป็น singleton ของ Nest จึงเป็น lock ต่อโปรเซส เท่ากับขอบเขตเดิมของ `isRunning` ไม่ได้อ้างว่าเป็น
lock ข้ามหลาย instance (ของเดิมก็ไม่ใช่ และถ้ามีหลาย replica ทั้งคู่ก็ยังกันกันไม่ได้)

นี่คือการแก้โค้ดเดิมที่งานนี้ไปแตะพอดี ไม่ใช่ refactor ลอย ๆ — ถ้าไม่ทำ ฟีเจอร์นี้จะสร้างช่องที่ของเดิมปิดไว้

### 3. `PlatformSeedService` (micro-business)

ประกอบจากสองไฟล์ที่มีอยู่แล้ว

**จาก `platform_migration.service.ts`** — `resolvePrismaDir()` (เดินขึ้นหา `prisma/schema.prisma` แทนการเดา
ระดับโฟลเดอร์ เพราะ layout ต่างกันระหว่าง dist กับ source), `sanitize()` ที่ปิดบัง connection string ก่อนส่ง
ออกนอกระบบ, และรูปของ timeout

**จาก `tenant_seed.service.ts`** — คืน `Observable<SeedRunEvent>` จาก `@MessagePattern`
ต่างกันตรงที่ tenant seed รัน Prisma ในโปรเซสตัวเอง แต่ตัวนี้ต้อง spawn โปรเซสลูกแล้วอ่าน stdout/stderr

```ts
export type SeedRunEvent =
  | { type: 'start'; op_id: string; command: string }
  | { type: 'log'; line: string; stream: 'out' | 'err' }
  | { type: 'done'; success: boolean; exit_code: number }
  | { type: 'error'; message: string };
```

- spawn `bun <script>` ด้วย `cwd = prismaDir` และ env ที่ประกอบเอง (ไม่ส่ง `process.env` ทั้งก้อน)
- อ่าน stdout/stderr แบบทีละบรรทัด (บัฟเฟอร์จนเจอ `\n`) แต่ละบรรทัดผ่าน `sanitize()` ก่อนกลายเป็น event
- timeout จาก env ใหม่ `PLATFORM_SEED_TIMEOUT_MS` (default 300000 — สูงกว่า migration เพราะ seed
  หลายตัวเขียนหลายร้อยแถว) หมดเวลาแล้ว kill โปรเซสและส่ง `error`
- **`PLATFORM_SEED_TIMEOUT_MS` อยู่ที่ env ถูกต้องแล้ว** ต่างจากสวิตช์ `platform_migration.api_enabled` ที่
  เพิ่งย้ายออกจาก env ไป `tb_platform_config` — timeout คือสายไฟของการ deploy ไม่ใช่ค่าที่ผู้ดูแลปรับ

### 4. `PlatformSeedsController` (gateway)

`@Controller('api-system/platform/seeds')` ใช้ `PlatformMigrationGuard` ตัวเดิม — super-admin **หรือ**
`x-deploy-token` และต้องเปิดสวิตช์ `platform_migration.api_enabled` สวิตช์เดียวคุมทั้งคอนโซล

| endpoint | ตอบ |
|---|---|
| `GET /catalog` | 14 op พร้อมธง `missing` |
| `POST /:op_id/run/stream` | `application/x-ndjson` ของ `SeedRunEvent` |

**กับดักที่ต้องไม่เหยียบซ้ำ** `tenant-seeds.controller.ts` มีคอมเมนต์เตือนไว้ว่า **ห้ามใส่ `req.on('close')`
เพื่อ unsubscribe** — POST ที่มี body จะยิง `close` เกือบทันทีที่อ่าน body จบ ไม่ใช่ตอนไคลเอนต์หลุด ผลคือ
NDJSON ถูกตัดกลางคัน teardown ต้องลอกจากไฟล์นั้นมาทั้งก้อนรวมคอมเมนต์ รวมถึง `settleOnce` ที่กันการยิงซ้ำ

`:op_id` ต้องถูกตรวจกับ catalog ก่อนเสมอ ไม่เอาไปประกอบ path ตรง ๆ — id ที่ไม่รู้จักตอบ 404

โมดูลใหม่ต้องประกาศ `PlatformMigrationGuard` **และ** `PlatformSuperAdminGuard` (ที่ guard ตัวแรกฉีดเข้าไป)
ไว้ใน `providers` ของตัวเอง ตามที่ `platform-migrations.module.ts` ทำ — Nest ไม่แชร์ provider ข้ามโมดูลที่
ไม่ได้ export และ `audit:guard-providers` จะจับข้อนี้ก่อน merge

### 5. rpc-contract

`packages/rpc-contract/src/contracts/platform-seeds.ts` เป็นไฟล์ **generated** ห้ามเขียนมือ ลำดับที่ไฟล์ในนั้น
สั่งไว้เองคือ

1. เขียน handler ด้วย `@MessagePattern({ cmd: '...', service: '...' })` เป็น object literal ชั่วคราว
2. `bun run gen:rpc-contract`
3. แทน literal ด้วย contract reference ที่ generate ได้

สลับลำดับแล้วจะกลายเป็นการ import ของที่ยังไม่มี

### 6. Frontend — ขยายหน้า `/platform/migrations`

หน้าเดิม (merged ใน PR #245) มี 3 การ์ด: สถานะ · Deploy · Resolve เพิ่มอีกสองการ์ดใต้ลงมา

- **Seeds** — 8 แถว ปุ่ม Run ต่อแถว มี `ConfirmDialog` ทุกตัวเพราะทุกตัวเขียน DB · แถวที่ `missing` แสดง
  ป้ายและปิดปุ่ม
- **Checks** — 6 แถว 5 ตัวกดได้ทันทีไม่ต้องยืนยัน (อ่านอย่างเดียว) ส่วน `check-seat-pool-view` ต้องยืนยัน
  พร้อมข้อความที่บอกตรง ๆ ว่ามันล็อกแถวข้อมูลลูกค้าระหว่างรันแม้ผลสุทธิเป็นศูนย์

**คอนโซล log — ต้องเขียนใหม่ ไม่ใช่ใช้ซ้ำ** ระหว่างคุยกันเคยเสนอว่าจะใช้ `DeployConsole` เดิม **ซึ่งผิด**: มัน
รับ prop เป็น type `BatchProgress` ที่ import จาก `TenantMigrationManagement` และเรียกคีย์ i18n ของหน้านั้น
ตรง ๆ (`pages.tenantMigration.deployingAll`) ใช้ซ้ำไม่ได้โดยไม่บิดความหมาย

จึงสร้าง `src/pages/platformMigration/RunConsole.tsx` ขึ้นใหม่ (หัวเรื่อง = ชื่อ op ที่กำลังรัน, log ไหล,
สถานะจบ) และย้าย `lineTone()` จาก `DeployConsole.tsx` ไปไว้ที่ `src/utils/logLineTone.ts` ให้ทั้งสองไฟล์ใช้ —
นี่เป็นการแตะไฟล์นอกฟีเจอร์เพียงจุดเดียวของงานนี้ และแตะเพราะทางเลือกอีกทางคือ copy-paste ฟังก์ชันเดียวกัน
ไว้สองที่

**`platformSeedService.ts`** ลอกโครง `tenantSeedService.deployStream` ทั้งก้อน รวม

- `fetch` ไม่ใช่ axios (ต้องส่ง bearer + `x-app-id` เอง และ axios อ่าน stream ไม่ได้)
- `refreshAccessToken()` แบบ best-effort ก่อนเริ่ม เพราะสตรีมยาวเกินอายุ token ได้ และ `fetch` ไม่ผ่าน
  response interceptor จึงไม่มี retry 401 อัตโนมัติ
- ตัวแยกบรรทัด NDJSON ที่ทนบรรทัดถูกแบ่งครึ่งระหว่าง chunk

ปุ่มทุกตัวบนหน้า (รวม Deploy/Resolve ของเดิม) ถูก disable ระหว่างมี op ใด ๆ วิ่ง เพราะ backend มี lock เดียว
— ถ้าไม่ disable ผู้ใช้จะได้ 409 ที่อธิบายไม่ได้ แทนที่จะเห็นว่ามีงานค้างอยู่

## error

| กรณี | ผล |
|---|---|
| สวิตช์ปิด / ไม่ใช่ super-admin | 403 ข้อความเดียวกับหน้าเดิม แสดงในการ์ดพร้อมปุ่มลองใหม่ |
| มี op อื่นวิ่งอยู่ | 409 → `toast.warning` ยิงใหม่ทีหลังได้ |
| `op_id` ไม่รู้จัก | 404 |
| สคริปต์ไม่มีใน image | ปุ่มถูกปิดตั้งแต่แรกจากธง `missing` ไม่ปล่อยให้กดแล้วค่อยพัง |
| exit code ≠ 0 | สตรีมจบด้วย `done` ที่ `success: false` — log ที่ได้มาแล้วยังอยู่บนจอ ไม่ถูกล้าง |
| timeout | kill โปรเซส ส่ง `error` พร้อมบอกว่าหมดเวลาที่กี่วินาที |

การ sanitize ต้องเกิดกับ **ทุกบรรทัด** ก่อนออกจาก micro-business ไม่ใช่แค่ตอนจบ — สคริปต์ seed พิมพ์ DSN
ออก stdout ได้

## เทสต์

ตามที่ผู้ใช้ตั้งไว้: **ไม่เขียนเทสต์ใหม่** แต่

- spec ฝั่ง backend ที่มีอยู่ต้องยังเขียว โดยเฉพาะของ `platform_migration` ที่จะถูกแก้จาก lock ที่ย้ายออก
- audit gate ต้องเขียวครบ: `audit:env-drift` (มี env ใหม่), `audit:guard-providers` (guard ในโมดูลใหม่),
  `audit:api-system-permission` (endpoint ใหม่ใต้ `api-system`), `audit:rest-contract`
- `check-types` ทั้ง `backend-gateway` และ `micro-business` · `bunx eslint` เฉพาะไฟล์ที่แตะ (ห้ามใช้
  `bun run lint` — มันมี `--fix` และเขียนทับทั้ง repo)
- ฝั่ง frontend: `typecheck` · `lint` · `vitest` ชุดเดิมต้องผ่านครบ

## ลำดับ deploy

1. **backend ก่อน** merge → DEV auto-deploy
2. พิสูจน์บน DEV ด้วย **`check-permission` เป็น op แรก** — อ่านอย่างเดียว ปลอดภัยที่สุด และเป็นหลักฐานว่า
   `bun` กับไฟล์ `prisma/*.ts` อยู่ใน image ที่รันจริง ไม่ใช่แค่ในไฟล์ Dockerfile
3. frontend ตามหลัง
4. ทั้งคอนโซลจะเงียบจนกว่าสวิตช์ `platform_migration.api_enabled` จะเปิด — DEV เปิดอยู่แล้ว ส่วน production
   ยังไม่เคยตรวจสถานะเลย เพราะยิง backend production จากเครื่องพัฒนาไม่ถึง

## สิ่งที่จงใจไม่ทำ

- **ไม่มี job store / ไม่มีการดู log ต่อหลังปิดเบราว์เซอร์** ปิดหน้าจอระหว่างรัน = โปรเซสฝั่ง server ยังวิ่งจนจบ
  (เหมือน tenant migration) แต่ผู้ใช้จะไม่เห็น log ที่เหลือ ยอมรับ trade-off นี้เพราะที่เก็บสถานะ job ยังไม่มี
  ในระบบเลย และการสร้างขึ้นมาเพื่อฟีเจอร์นี้ตัวเดียวแพงเกินกว่าที่ได้
- **ไม่มีการเลือก schema ปลายทาง** god-mode เลือกได้ แต่ที่นี่ปลายทางมาจาก DSN ของ micro-business เสมอ
  การเปิดให้เลือกจะกลายเป็นช่องยิงข้อมูลลงฐานอื่น
- **ไม่มี `migrate reset` และ tenant-views apply/revert** ของ god-mode สองอย่างนั้นทำลายข้อมูล และ
  tenant-views ยังต้องมี `psql` ใน image ซึ่งไม่มี
