# License Feature Groups — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้สัญญาอ้างกลุ่มได้ ย้ายข้อมูลเดิมเข้ากลุ่ม และให้เส้นทางบังคับสิทธิ์อ่านจากกลุ่มโดยที่ใบเก่ายังทำงานเหมือนเดิมทุกใบ

**Architecture:** เพิ่ม `tb_subscription_bu_group` แล้ว backfill ใบทั้งหมดเข้ากลุ่มเดียวชื่อ `FULL` (ข้อมูลจริงบน DEV เป็นชุดเดียวครอบทุกใบ) จากนั้น `license.service.ts` อ่านแบบ **dual read** — มี group ใช้ group ไม่มีก็ถอยไปอ่าน `tb_subscription_bu_feature` เหมือนเดิม เพื่อให้ deploy ได้โดยไม่ต้องรอ backfill เสร็จก่อน และเพิ่ม endpoint `PUT /subscriptions/:id/groups` ให้เฟส 3 (frontend) เรียกใช้

**Tech Stack:** NestJS microservices (RPC `@MessagePattern` + gateway REST), Prisma (`prisma-shared-schema-platform`), Bun

**Spec:** `docs/superpowers/specs/2026-08-30-license-feature-groups-design.md`

**Repo:** งานทั้งหมดอยู่ใน `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` กิ่ง `feature/license-feature-groups-phase-2` (แตกจาก `main` แล้ว) — **ไม่มีงาน frontend ในเฟสนี้**

## สิ่งที่เฟส 1 ส่งมอบมาแล้ว (merged + deployed)

- `tb_license_feature_group` / `tb_license_feature_group_item` มีบน DEV แล้ว
- สิทธิ์ `license_feature_group.read` / `.manage` seed แล้ว
- 6 REST endpoints ใต้ `api-system/platform/license-feature-groups` ใช้งานได้จริง
- หน้าจอจัดกลุ่มบน production
- **กฎ "ลูกลากพ่อ"** บังคับใน `LicenseFeatureGroupService.setFeatures()` แล้ว

## ข้อมูลจริงที่วัดได้ (DEV, 2026-08-30)

| ตัวเลข | ค่า |
|---|---|
| `tb_subscription_bu` ที่ยังไม่ถูกลบ | 14 |
| **ชุด feature ที่ไม่ซ้ำกัน** | **1** |
| ขนาดของชุดนั้น | 75 keys (จาก 76 ที่ active) |
| feature ที่ไม่มีใครได้ | `configuration.chart_of_accounts` |
| กลุ่มที่มีอยู่แล้ว | 0 |

**ทุกใบถือชุดเดียวกันเป๊ะ** — backfill จึงเป็นกลุ่มเดียว ไม่ใช่ `LEGACY-01..N`

## Global Constraints

- **ข้ามขั้นเขียนเทสต์อัตโนมัติ** ตามที่เจ้าของงานกำหนด — ห้ามสร้าง `*.spec.ts` ใหม่ แต่ **static check ไม่ใช่เทสต์ ต้องรันทุกงาน**
- ก่อน commit ทุกครั้ง: `bun run check-types` และ **`bunx eslint "<ไฟล์ที่แก้>"`** — **ห้ามใช้ `bun run lint`** เพราะ script คือ `eslint ... --fix` ที่เขียนทับไฟล์ทั้งรีโป และเคยลบ `eslint-disable` ในไฟล์ที่ไม่เกี่ยวข้องมาแล้ว
- **ก่อน push ต้องรัน audit ทั้ง 9 ตัว** ไม่ใช่รอ CI แดง:
  ```bash
  for a in tcp-drift env-drift api-system-permission license-catalog app-api-catalog-drift \
           rest-contract message-pattern-literal guard-providers bu-scope-guard; do
    printf "%-28s " "$a"; bun run "audit:$a" >/dev/null 2>&1 && echo PASS || echo FAIL
  done
  ```
- **การเพิ่ม `AppIdGuard('x.y')` ต้อง regenerate catalog** — `bun run scripts/generate-app-api-catalog/run.ts` แล้ว commit ผลลัพธ์ ไม่งั้น `audit:app-api-catalog-drift` ทำ CI แดง
- **การเพิ่ม `@MessagePattern` ทำเป็น 3 ขั้นตามลำดับ**: เขียน object literal `{ cmd, service }` ชั่วคราว → `bun run gen:rpc-contract` → แทนด้วย contract reference · **`service:` คือชื่อกลุ่ม contract ไม่ใช่ชื่อ app** (ใช้ `'subscription'` สำหรับ handler ที่อยู่ในไฟล์ contract `subscription.ts`)
- **สร้าง migration ด้วย `prisma migrate diff` ไม่ใช่ `migrate dev`** — `.env` ของ package ชี้ DEV ซึ่งเป็นฐานที่ใช้ร่วมกันและมี drift ค้าง `migrate dev` จะเรียกร้อง reset ทั้ง schema
- **การ push กิ่ง feature ไม่ apply migration และไม่ deploy** — `build.yml` ทริกเกอร์จาก push `main` เท่านั้น migration ขึ้น DEV เมื่อ merge เข้า `main`
- controller ฝั่ง micro-business อ่าน payload แบบ **flat** (`payload.dto`, `payload.feature_keys`, `payload.doc_version`) **ไม่ใช่** `payload.data`
- `create` ต้องคืน `handleResult(result, HttpStatus.CREATED)` — คืน 200 ทำให้ gateway ตีเป็นล้มเหลวและส่ง `data: null` ทั้งที่เขียนสำเร็จ
- schema ใหม่ใช้แบบแผนเดิม: `deleted_at` ในทุก unique key, `doc_version`, audit columns ครบ 6 คอลัมน์

---

### Task 1: ตาราง `tb_subscription_bu_group`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (ต่อท้ายบล็อกที่เฟส 1 เพิ่มไว้ หลัง `model tb_license_feature_group_item`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260831000000_subscription_bu_group/migration.sql`

**Interfaces:**
- Consumes: `tb_subscription_bu` และ `tb_license_feature_group` ที่มีอยู่แล้ว
- Produces: Prisma model `tb_subscription_bu_group` พร้อม relation field `tb_subscription_bu_group` บนทั้ง `tb_subscription_bu` และ `tb_license_feature_group` — Task 2, 3, 4 ใช้ทั้งหมด

- [ ] **Step 1: เพิ่ม model และ relation ปลายทางสองฝั่ง**

ต่อท้ายหลัง `model tb_license_feature_group_item { ... }`:

```prisma
/// กลุ่มที่ BU หนึ่งได้รับในสัญญาหนึ่ง — แทนที่ tb_subscription_bu_feature ที่เก็บเป็นราย feature
/// สิทธิ์ที่มีผลจริงคำนวณตอนอ่าน: union ของ feature ในทุกกลุ่มที่แถวเหล่านี้ชี้ไป
/// The groups a BU receives under one contract. Effective entitlement is computed at read time
/// as the union of the features in every referenced group.
model tb_subscription_bu_group {
  id                 String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_bu_id String @db.Uuid
  group_id           String @db.Uuid

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_subscription_bu       tb_subscription_bu       @relation(fields: [subscription_bu_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_license_feature_group tb_license_feature_group @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([subscription_bu_id, group_id, deleted_at], map: "subscription_bu_group_bu_group_deleted_at_u")
  @@index([group_id, deleted_at], map: "subscription_bu_group_group_deleted_at_idx")
}
```

จากนั้นเพิ่ม relation field ปลายทางในสอง model ที่มีอยู่แล้ว — Prisma ไม่ยอม validate ถ้าขาดข้างใดข้างหนึ่ง:

ใน `model tb_subscription_bu` เพิ่มบรรทัดถัดจาก `tb_subscription_bu_feature tb_subscription_bu_feature[]`:

```prisma
  tb_subscription_bu_group   tb_subscription_bu_group[]
```

ใน `model tb_license_feature_group` เพิ่มบรรทัดถัดจาก `tb_license_feature_group_item tb_license_feature_group_item[]`:

```prisma
  tb_subscription_bu_group      tb_subscription_bu_group[]
```

- [ ] **Step 2: validate schema**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: สร้าง migration ด้วย diff (ไม่แตะฐาน)**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
SCRATCH=$(mktemp -d)
git show HEAD:packages/prisma-shared-schema-platform/prisma/schema.prisma > "$SCRATCH/old.prisma"
DIR=prisma/migrations/20260831000000_subscription_bu_group
mkdir -p "$DIR"
{
  cat <<'HEADER'
-- สร้างด้วย `prisma migrate diff --from-schema <schema เดิมจาก git> --to-schema <schema ใหม่>`
-- ไม่ใช่ `migrate dev` เพราะ .env ของ package นี้ชี้ DEV ซึ่งเป็นฐานที่ใช้ร่วมกันและมี schema
-- drift ค้างอยู่ (เหตุผลเดียวกับ 20260818000000_license_model และ 20260830000000_license_feature_group)
--
-- CREATE ล้วน ไม่มี DROP และไม่แตะตารางอื่น

HEADER
  bunx prisma migrate diff --from-schema "$SCRATCH/old.prisma" --to-schema ./prisma/schema.prisma --script 2>/dev/null
} > "$DIR/migration.sql"
perl -i -ne 'print unless /injected env/' "$DIR/migration.sql"
grep -nE "^(DROP|ALTER TABLE)" "$DIR/migration.sql" || echo "clean: ไม่มี DROP/ALTER"
```

Expected: `clean: ไม่มี DROP/ALTER` และไฟล์มี `CREATE TABLE "tb_subscription_bu_group"` หนึ่งตัว กับ index/FK ของมัน

**ถ้ามี `DROP` หรือ `ALTER TABLE` ของตารางอื่นโผล่มา ให้หยุดแล้วรายงาน** — แปลว่า schema ในเครื่องเพี้ยนจากที่ merged ไว้

บรรทัด `perl -i -ne 'print unless /injected env/'` จำเป็น เพราะ dotenvx เขียนบรรทัดโฆษณาลง stdout ปนกับ SQL

- [ ] **Step 4: generate client แล้ว build package**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma generate && bun run build
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
```

Expected: check-types ผ่าน 17/17

**ถ้าเจอ type error ที่อ้างว่าไม่รู้จัก property ของ package ใน repo นี้ (`@repo/*`)** ให้ build package นั้นก่อน (`bun run build:package` หรือ `bun run build` ในโฟลเดอร์ของมัน) — `dist/` อยู่ใน gitignore และค้างได้ ทำให้เกิด type error ปลอมที่ดูเหมือนบั๊กของงานนี้

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations
git commit -m "feat(platform): เพิ่มตาราง tb_subscription_bu_group

สัญญาอ้างกลุ่มได้แล้ว สิทธิ์ที่มีผลจริงจะคำนวณตอนอ่านเป็น union ของ feature
ในทุกกลุ่มที่แถวเหล่านี้ชี้ไป ยังไม่มีใครเขียนหรืออ่านตารางนี้จนกว่าจะถึง task ถัดไป"
```

---

### Task 2: สคริปต์ backfill ข้อมูลเดิมเข้ากลุ่ม `FULL`

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-31-backfill-subscription-group.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json` (เพิ่ม script `db:backfill.subscription-group`)

**Interfaces:**
- Consumes: `tb_subscription_bu_group` จาก Task 1 · `tb_license_feature_group` + `_item` จากเฟส 1
- Produces: กลุ่ม `code: 'FULL'` บน DEV ที่มี feature ครบตามชุดที่ใบเดิมถืออยู่ และแถว `tb_subscription_bu_group` หนึ่งแถวต่อหนึ่ง `tb_subscription_bu` — Task 3 และ Task 5 ตรวจผลของมัน

- [ ] **Step 1: เขียนสคริปต์**

สร้าง `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-31-backfill-subscription-group.ts`:

```ts
/**
 * One-off backfill: ย้ายสิทธิ์ที่เก็บเป็นราย feature (tb_subscription_bu_feature) ไปเป็นการอ้างกลุ่ม
 * (tb_subscription_bu_group) โดยไม่เปลี่ยนสิทธิ์ที่ลูกค้าได้รับแม้แต่คีย์เดียว
 *
 * ข้อมูลที่วัดได้บน DEV เมื่อ 2026-08-30: ทั้ง 14 ใบถือชุด feature ชุดเดียวกันเป๊ะ (75 คีย์)
 * การ backfill จึงสร้าง **กลุ่มเดียว** ชื่อ FULL แล้วผูกทุกใบเข้ากับมัน
 *
 * Moves per-feature entitlements onto a single group reference without changing a single key
 * that any customer holds. On DEV all 14 rows share one identical 75-key set, so this creates
 * exactly one group named FULL.
 *
 * **สคริปต์ปฏิเสธที่จะเขียนถ้าพบมากกว่าหนึ่งชุด** — สมมติฐาน "ชุดเดียว" มาจากการวัด DEV เท่านั้น
 * บนสภาพแวดล้อมอื่นอาจต่างออกไป และการยัดหลายชุดลงกลุ่มเดียวคือการเปลี่ยนสิทธิ์ของลูกค้าเงียบ ๆ
 * Refuses to write when it finds more than one distinct set: collapsing several sets into one
 * group would silently change what customers are entitled to.
 *
 * Idempotent: รันซ้ำรายงานว่าไม่มีอะไรเปลี่ยน
 *
 * Usage — ต้องรันจากในไดเรกทอรีแพ็กเกจ ไม่ใช่จาก root ของ repo
 * (maintenance ทุกตัวอ่าน .env จาก CWD — รันจาก root แล้วจะได้ ECONNREFUSED)
 *   cd packages/prisma-shared-schema-platform
 *   bun run db:backfill.subscription-group            # สแกนอย่างเดียว ไม่เขียน
 *   bun run db:backfill.subscription-group -- --apply # เขียนจริง
 */
import { makePlatformClient } from '../_prisma-client';
import * as dotenvx from '@dotenvx/dotenvx';

dotenvx.config();

const APPLY = process.argv.includes('--apply');

/** รหัสและชื่อของกลุ่มที่ backfill สร้าง — เจ้าของงานเคาะเมื่อ 2026-08-30 */
const GROUP_CODE = 'FULL';
const GROUP_NAME = 'Full Access';
const GROUP_DESCRIPTION =
  'ชุดสิทธิ์เต็มที่ทุกสัญญาถืออยู่ก่อนย้ายมาใช้ระบบกลุ่ม — สร้างโดยสคริปต์ backfill';

async function main() {
  const prisma = makePlatformClient();

  // 1. อ่านชุด feature ของทุก subscription_bu ที่ยังไม่ถูกลบ
  const rows = await prisma.tb_subscription_bu.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      business_unit_id: true,
      tb_subscription_bu_feature: {
        where: { deleted_at: null },
        select: { feature_key: true },
      },
      tb_subscription_bu_group: {
        where: { deleted_at: null },
        select: { group_id: true },
      },
    },
  });

  const withFeatures = rows.filter((r) => r.tb_subscription_bu_feature.length > 0);
  const emptyRows = rows.filter((r) => r.tb_subscription_bu_feature.length === 0);
  const alreadyLinked = rows.filter((r) => r.tb_subscription_bu_group.length > 0);

  // 2. จัดกลุ่มตามชุดคีย์ที่เหมือนกันเป๊ะ
  const setsByKey = new Map<string, { keys: string[]; buIds: string[] }>();
  for (const r of withFeatures) {
    const keys = r.tb_subscription_bu_feature.map((f) => f.feature_key).sort();
    const signature = keys.join(' ');
    const hit = setsByKey.get(signature);
    if (hit) hit.buIds.push(r.id);
    else setsByKey.set(signature, { keys, buIds: [r.id] });
  }

  console.log(`subscription_bu ทั้งหมด        : ${rows.length}`);
  console.log(`มี feature                     : ${withFeatures.length}`);
  console.log(`ไม่มี feature เลย (ข้าม)        : ${emptyRows.length}`);
  console.log(`ผูกกลุ่มไว้แล้ว (ข้าม)          : ${alreadyLinked.length}`);
  console.log(`ชุด feature ที่ไม่ซ้ำกัน        : ${setsByKey.size}`);

  if (setsByKey.size === 0) {
    console.log('ไม่มีอะไรต้อง backfill');
    await prisma.$disconnect();
    return;
  }

  if (setsByKey.size > 1) {
    console.error('');
    console.error(`หยุด: พบ ${setsByKey.size} ชุดที่ต่างกัน แต่สคริปต์นี้รองรับชุดเดียว`);
    for (const [, s] of setsByKey) {
      console.error(`  - ${s.keys.length} คีย์ ครอบ ${s.buIds.length} แถว`);
    }
    console.error('การยัดหลายชุดลงกลุ่มเดียวคือการเปลี่ยนสิทธิ์ของลูกค้าเงียบ ๆ —');
    console.error('กลับไปตกลงกับเจ้าของงานว่าจะแบ่งกลุ่มอย่างไรก่อน');
    await prisma.$disconnect();
    process.exit(1);
  }

  const [set] = [...setsByKey.values()];
  const toLink = set.buIds.filter(
    (id) => !alreadyLinked.some((r) => r.id === id),
  );

  console.log(`ชุดที่จะย้าย                   : ${set.keys.length} คีย์`);
  console.log(`แถวที่จะผูกกลุ่ม                : ${toLink.length}`);

  // 3. หากลุ่ม FULL ที่มีอยู่ หรือรายงานว่าจะสร้าง
  const existingGroup = await prisma.tb_license_feature_group.findFirst({
    where: { code: GROUP_CODE, deleted_at: null },
    select: {
      id: true,
      tb_license_feature_group_item: {
        where: { deleted_at: null },
        select: { feature_key: true },
      },
    },
  });

  if (existingGroup) {
    const have = new Set(
      existingGroup.tb_license_feature_group_item.map((i) => i.feature_key),
    );
    const missing = set.keys.filter((k) => !have.has(k));
    console.log(`กลุ่ม ${GROUP_CODE} มีอยู่แล้ว มี ${have.size} คีย์ ขาด ${missing.length} คีย์`);
    if (missing.length > 0) console.log(`  คีย์ที่ขาด: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
  } else {
    console.log(`จะสร้างกลุ่ม ${GROUP_CODE} พร้อม ${set.keys.length} คีย์`);
  }

  if (!APPLY) {
    console.log('');
    console.log('สแกนอย่างเดียว ไม่ได้เขียนอะไร — ใส่ -- --apply เพื่อเขียนจริง');
    await prisma.$disconnect();
    return;
  }

  // 4. เขียนจริง ทั้งหมดใน transaction เดียว
  const result = await prisma.$transaction(async (tx: any) => {
    let groupId = existingGroup?.id;

    if (!groupId) {
      const created = await tx.tb_license_feature_group.create({
        data: {
          code: GROUP_CODE,
          name: GROUP_NAME,
          description: GROUP_DESCRIPTION,
          sort_order: 0,
          is_active: true,
        },
        select: { id: true },
      });
      groupId = created.id;
    }

    const have = new Set(
      (
        await tx.tb_license_feature_group_item.findMany({
          where: { group_id: groupId, deleted_at: null },
          select: { feature_key: true },
        })
      ).map((i: { feature_key: string }) => i.feature_key),
    );
    const toAdd = set.keys.filter((k) => !have.has(k));
    if (toAdd.length > 0) {
      await tx.tb_license_feature_group_item.createMany({
        data: toAdd.map((feature_key) => ({ group_id: groupId, feature_key })),
      });
    }

    let linked = 0;
    if (toLink.length > 0) {
      const res = await tx.tb_subscription_bu_group.createMany({
        data: toLink.map((subscription_bu_id) => ({ subscription_bu_id, group_id: groupId })),
        skipDuplicates: true,
      });
      linked = res.count;
    }

    return { groupId, keysAdded: toAdd.length, linked };
  });

  console.log('');
  console.log(`เขียนแล้ว: group=${result.groupId} คีย์ที่เพิ่ม=${result.keysAdded} แถวที่ผูก=${result.linked}`);
  console.log('หมายเหตุ: ไม่ได้ลบ tb_subscription_bu_feature — เฟส 4 เป็นคนถอด');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: ลงทะเบียน script ใน package.json**

ใน `packages/prisma-shared-schema-platform/package.json` เพิ่มบรรทัดถัดจาก `"db:backfill.bu-license"`:

```json
    "db:backfill.subscription-group": "bun prisma/maintenance/2026-08-31-backfill-subscription-group.ts",
```

- [ ] **Step 3: รันแบบสแกนอย่างเดียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.subscription-group
```

Expected (ตามข้อมูล DEV ที่วัดไว้):

```
subscription_bu ทั้งหมด        : 14
มี feature                     : 14
ไม่มี feature เลย (ข้าม)        : 0
ผูกกลุ่มไว้แล้ว (ข้าม)          : 0
ชุด feature ที่ไม่ซ้ำกัน        : 1
ชุดที่จะย้าย                   : 75 คีย์
แถวที่จะผูกกลุ่ม                : 14
จะสร้างกลุ่ม FULL พร้อม 75 คีย์
สแกนอย่างเดียว ไม่ได้เขียนอะไร — ใส่ -- --apply เพื่อเขียนจริง
```

**ถ้า "ชุด feature ที่ไม่ซ้ำกัน" มากกว่า 1 ให้หยุดแล้วรายงาน** — สคริปต์จะปฏิเสธเองอยู่แล้ว แต่ต้องกลับไปตกลงวิธีแบ่งกลุ่มกับเจ้าของงาน ไม่ใช่แก้สคริปต์ให้ยอม

- [ ] **Step 4: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
cd packages/prisma-shared-schema-platform
bunx eslint prisma/maintenance/2026-08-31-backfill-subscription-group.ts
```

หมายเหตุ: ไฟล์ใต้ `prisma/` อยู่นอก `include` ของ tsconfig จึงไม่ถูก `check-types` ตรวจ — การรัน `bun run db:backfill.subscription-group` ใน Step 3 คือการตรวจว่ามันคอมไพล์และรันได้จริง

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-31-backfill-subscription-group.ts packages/prisma-shared-schema-platform/package.json
git commit -m "feat(platform): สคริปต์ backfill สิทธิ์เดิมเข้ากลุ่ม FULL

สแกนอย่างเดียวเป็นค่าตั้งต้น ต้องใส่ --apply ถึงจะเขียน และปฏิเสธที่จะเขียน
เมื่อพบชุด feature ที่ต่างกันมากกว่าหนึ่งชุด เพราะการยัดหลายชุดลงกลุ่มเดียว
คือการเปลี่ยนสิทธิ์ของลูกค้าเงียบ ๆ

ไม่ลบ tb_subscription_bu_feature — เฟส 4 เป็นคนถอด"
```

---

### Task 3: dual read ในเส้นทางบังคับสิทธิ์

**Files:**
- Modify: `apps/backend-gateway/src/license/license.service.ts:121-141` (ส่วน select) และ `:162-175` (ส่วนประกอบ features)

**Interfaces:**
- Consumes: `tb_subscription_bu_group` จาก Task 1
- Produces: ไม่มี type ใหม่ — `BuLicense.features` ยังเป็น `string[]` เหมือนเดิม ผู้เรียกทุกรายไม่ต้องแก้

- [ ] **Step 1: อ่านโค้ดปัจจุบันให้ครบก่อนแก้**

```bash
sed -n '100,190p' apps/backend-gateway/src/license/license.service.ts
```

จุดสำคัญที่ต้องไม่ทำพัง: `catch` รอบ query คืน `state: 'unresolved'` ไม่ใช่ `'none'` โดยเจตนา และ **ไม่ cache** — ห้ามแก้ตรรกะนั้น

- [ ] **Step 2: เพิ่ม group เข้า select และประกอบ features แบบ dual read**

เปลี่ยน type ของ `rows` จาก

```ts
    let rows: Array<{
      business_unit_id: string;
      tb_subscription: { status: enum_subscription_status; end_date: Date };
      tb_subscription_bu_feature: { feature_key: string }[];
    }>;
```

เป็น

```ts
    let rows: Array<{
      business_unit_id: string;
      tb_subscription: { status: enum_subscription_status; end_date: Date };
      tb_subscription_bu_feature: { feature_key: string }[];
      tb_subscription_bu_group: {
        tb_license_feature_group: {
          tb_license_feature_group_item: { feature_key: string }[];
        };
      }[];
    }>;
```

แล้วเพิ่มใน `select` ถัดจาก `tb_subscription_bu_feature`:

```ts
          tb_subscription_bu_group: {
            where: { deleted_at: null },
            select: {
              tb_license_feature_group: {
                select: {
                  tb_license_feature_group_item: {
                    where: { deleted_at: null },
                    select: { feature_key: true },
                  },
                },
              },
            },
          },
```

จากนั้นเปลี่ยนบรรทัดที่ประกอบ `features` จาก

```ts
      const features = new Set(row.tb_subscription_bu_feature.map((f) => f.feature_key));
```

เป็น

```ts
      // dual read — มีกลุ่มใช้กลุ่ม ไม่มีก็ถอยไปอ่านสิทธิ์ราย feature แบบเดิม
      //
      // ระหว่างเฟสย้ายข้อมูล ใบที่ backfill แล้วกับใบที่ยังไม่ backfill อยู่ปนกันในฐานเดียวกัน
      // การอ่านทางเดียวจะทำให้ฝั่งใดฝั่งหนึ่งได้สิทธิ์ว่างทันทีที่ deploy — ซึ่งแปลว่าลูกค้าถูก
      // ปฏิเสธทั้งที่จ่ายเงินแล้ว การถอย fallback นี้จึงอยู่จนกว่าเฟส 4 จะ DROP ตารางเดิม
      //
      // ไม่รวมสองแหล่งเข้าด้วยกัน: กลุ่มเป็นแหล่งความจริงเมื่อมี การ union กับของเก่าจะทำให้การ
      // ถอด feature ออกจากกลุ่มไม่มีผล เพราะคีย์เดิมยังค้างอยู่ในตารางเก่า
      const groupKeys = row.tb_subscription_bu_group.flatMap((g) =>
        g.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key),
      );
      const features = new Set(
        groupKeys.length > 0
          ? groupKeys
          : row.tb_subscription_bu_feature.map((f) => f.feature_key),
      );
```

- [ ] **Step 3: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
cd apps/backend-gateway && bunx eslint "src/license/license.service.ts"
```

Expected: ผ่านทั้งคู่ (`bunx eslint` ไม่มี `--fix` จึงไม่เขียนทับไฟล์)

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/license/license.service.ts
git commit -m "feat(license): อ่านสิทธิ์จากกลุ่มก่อน ถอยไปราย feature เมื่อยังไม่มีกลุ่ม

ระหว่างเฟสย้ายข้อมูล ใบที่ backfill แล้วกับที่ยังไม่ backfill อยู่ปนกัน การอ่านทางเดียว
จะทำให้ฝั่งหนึ่งได้สิทธิ์ว่างทันทีที่ deploy

เลือกอย่างใดอย่างหนึ่งไม่ union กัน — union จะทำให้การถอด feature ออกจากกลุ่มไม่มีผล
เพราะคีย์เดิมยังค้างในตารางเก่า"
```

---

### Task 4: endpoint `PUT /subscriptions/:id/groups`

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts` (เพิ่มเมธอด `setGroups`)
- Modify: `apps/micro-business/src/subscription/subscription.controller.ts` (เพิ่ม handler)
- Modify: `packages/rpc-contract/src/contracts/subscription.ts` (generate ไม่ใช่เขียนมือ)
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.service.ts`
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.controller.ts`
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/swagger/request.ts`
- Modify: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` (generate)

**Interfaces:**
- Consumes: `tb_subscription_bu_group` จาก Task 1
- Produces: `PUT /api-system/platform/subscriptions/:id/groups` รับ `{ group_ids: string[], doc_version: number }` — เฟส 3 (frontend) เรียกใช้ · `setFeatures` เดิม **ยังอยู่ไม่ถูกลบ** เพราะหน้าขายปัจจุบันยังใช้อยู่

- [ ] **Step 1: เพิ่ม `setGroups` ใน micro-business service**

เพิ่มเมธอดต่อจาก `setFeatures` ใน `apps/micro-business/src/subscription/subscription.service.ts`:

```ts
  /**
   * แทนที่ชุด "กลุ่ม" ทั้งชุดของสัญญา — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff
   * setFeatures เดิมยังอยู่และยังใช้งานได้ เพราะหน้าขายปัจจุบันยังเรียกมัน
   * Replaces a contract's whole group set. `setFeatures` remains for the current sales UI.
   * @param id - Subscription id / รหัสสัญญา
   * @param groupIds - Desired group ids / ชุด id ของกลุ่มที่ต้องการ
   * @param userId - Acting user / ผู้กระทำ
   * @param docVersion - Mandatory optimistic lock / ตัวล็อกที่บังคับส่ง
   * @returns Subscription detail after the change / รายละเอียดสัญญาหลังเปลี่ยน
   */
  @TryCatch
  async setGroups(
    id: string,
    groupIds: string[],
    userId: string,
    docVersion: number,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'setGroups', id, groupIds, docVersion },
      SubscriptionService.name,
    );

    if (typeof docVersion !== 'number') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);
    }

    const wanted = [...new Set(groupIds ?? [])];

    // ตรวจว่าทุก group id มีจริงและยังไม่ถูกลบ — group_id มี FK ก็จริง แต่ FK ไม่รู้จัก soft delete
    // การอ้างกลุ่มที่ถูกลบไปแล้วจะผ่าน FK แต่ให้สิทธิ์ว่าง ซึ่งแย่กว่า error
    const valid = new Set(
      (
        await this.prismaSystem.tb_license_feature_group.findMany({
          where: { id: { in: wanted }, deleted_at: null },
          select: { id: true },
        })
      ).map((g) => g.id),
    );
    const unknown = wanted.filter((g) => !valid.has(g));
    if (unknown.length > 0) {
      return Result.error(
        `กลุ่มที่ไม่รู้จักหรือถูกลบไปแล้ว: ${unknown.sort().join(', ')}`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }

    const outcome = await this.prismaSystem.$transaction(async (tx: any) => {
      const current = await tx.tb_subscription.findFirst({
        where: { id, deleted_at: null },
        select: { id: true },
      });
      if (!current) return Result.error('ไม่พบสัญญา', ErrorCode.NOT_FOUND);

      const bu = await tx.tb_subscription_bu.findFirst({
        where: { subscription_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!bu) {
        return Result.error(
          'สัญญานี้ไม่มีหน่วยธุรกิจผูกอยู่ — ข้อมูลผิดรูปจากยุคก่อน migration',
          ErrorCode.VALIDATION_FAILURE,
        );
      }

      await tx.tb_subscription.update({
        where: { id, doc_version: docVersion },
        data: { updated_by_id: userId, updated_at: new Date() },
      });

      const existing = await tx.tb_subscription_bu_group.findMany({
        where: { subscription_bu_id: bu.id, deleted_at: null },
        select: { id: true, group_id: true },
      });
      const existingIds = new Set(existing.map((e: { group_id: string }) => e.group_id));
      const desired = new Set(wanted);

      const toRemove = existing
        .filter((e: { group_id: string }) => !desired.has(e.group_id))
        .map((e: { id: string }) => e.id);
      const toAdd = wanted.filter((g) => !existingIds.has(g));

      if (toRemove.length > 0) {
        await tx.tb_subscription_bu_group.updateMany({
          where: { id: { in: toRemove } },
          data: { deleted_at: new Date(), deleted_by_id: userId },
        });
      }
      if (toAdd.length > 0) {
        await tx.tb_subscription_bu_group.createMany({
          data: toAdd.map((group_id) => ({
            subscription_bu_id: bu.id,
            group_id,
            created_by_id: userId,
            updated_by_id: userId,
          })),
        });
      }

      return null;
    });

    if (outcome) return outcome;
    return this.get(id);
  }
```

- [ ] **Step 2: เพิ่ม handler ด้วย MessagePattern ชั่วคราว**

ใน `apps/micro-business/src/subscription/subscription.controller.ts` เพิ่มต่อจาก handler `setFeatures`:

```ts
  /**
   * Replace a subscription's entire group set
   * แทนที่ชุดกลุ่มทั้งชุดของสัญญา
   * @param payload - Contains id + group_ids + doc_version / ประกอบด้วย id, group_ids และ doc_version
   * @returns Subscription detail after the change / รายละเอียดสัญญาหลังเปลี่ยน
   */
  @MessagePattern({ cmd: 'subscription.set-groups', service: 'subscription' })
  async setGroups(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'setGroups', payload }, SubscriptionController.name);

    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.subscriptionService.setGroups(
        payload.id as string,
        (payload.group_ids as string[]) ?? [],
        payload.user_id as string,
        payload.doc_version as number,
      ),
    );
    return this.handleResult(result);
  }
```

- [ ] **Step 3: generate contract แล้วแทน literal**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
grep -n "setGroups" packages/rpc-contract/src/contracts/subscription.ts
```

Expected: มีบรรทัด `setGroups: rpc('subscription.set-groups', 'micro-business')...`

จากนั้นแทนใน controller:

```ts
  @MessagePattern(Subscription.setGroups.pattern)
```

แล้ว build package contract เพื่อให้ gateway เห็น type ใหม่:

```bash
cd packages/rpc-contract && bun run build:package
```

- [ ] **Step 4: เพิ่ม DTO + service + controller ฝั่ง gateway**

ใน `apps/backend-gateway/src/platform/platform_subscriptions/swagger/request.ts` เพิ่ม:

```ts
/**
 * Request body for replacing a subscription's whole group set — replace semantics, not a diff.
 * เนื้อหาคำขอสำหรับแทนที่ชุดกลุ่มทั้งชุดของสัญญา — ส่งชุดที่ต้องการทั้งหมด ไม่ใช่ diff
 */
export class SetSubscriptionGroupsDto {
  @ApiProperty({
    type: [String],
    example: ['019638a6-2a00-7c4f-8e46-9b7a52c80c4e'],
    description:
      'The complete desired set of licence feature group ids / ชุด id ของกลุ่มสิทธิ์ที่ต้องการทั้งชุด',
  })
  group_ids: string[];

  @ApiProperty({ example: 3, description: 'Mandatory optimistic lock / ตัวล็อกที่บังคับส่ง' })
  doc_version: number;
}
```

ใน `platform_subscriptions.service.ts` เพิ่มเมธอดต่อจาก `setFeatures`:

```ts
  /**
   * Replace a subscription's entire group set. `doc_version` is mandatory (see class doc).
   * แทนที่ชุดกลุ่มทั้งชุดของสัญญา — `doc_version` บังคับ
   * @param id - Subscription id / รหัสสัญญา
   * @param group_ids - Desired full group set / ชุดกลุ่มที่ต้องการทั้งชุด
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param doc_version - Version the client holds — required / เวอร์ชันที่ client ถืออยู่ — บังคับ
   * @returns The saved subscription detail / สัญญาหลังบันทึก
   */
  async setGroups(
    id: string,
    group_ids: string[],
    user_id: string,
    doc_version: number,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'setGroups', id, group_ids, doc_version },
      PlatformSubscriptionsService.name,
    );

    return this.rpc.call(Subscription.setGroups, { id, group_ids, user_id, doc_version });
  }
```

ใน `platform_subscriptions.controller.ts` เพิ่ม handler — ลอกโครงจากเมธอด `setFeatures` ที่อยู่ในไฟล์เดียวกัน เปลี่ยนเฉพาะ path, DTO, ชื่อเมธอด และ `operationId`:

```ts
  /**
   * Replace a subscription's entire group set
   * แทนที่ชุดกลุ่มทั้งชุดของสัญญา
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @param id - Subscription ID / รหัสสัญญา
   * @param body - Desired group ids plus doc_version / ชุด id ของกลุ่มพร้อม doc_version
   * @returns Subscription detail after the change / รายละเอียดสัญญาหลังเปลี่ยน
   */
  @Put('subscriptions/:id/groups')
  @UseGuards(new AppIdGuard('subscription.set-groups'), PlatformPermissionGuard)
  @RequirePlatformPermission('subscription.manage')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace a subscription\'s group set',
    description:
      'Replace semantics — send the complete desired set, not a diff. Requires the doc_version optimistic-lock token from the last read.\n\nแทนที่ทั้งชุด — ส่งชุดที่ต้องการทั้งหมด ไม่ใช่ diff ต้องระบุ doc_version จากการอ่านครั้งล่าสุด',
    operationId: 'platformSubscription_setGroups',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the subscription (UUID v4)', example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d' })
  @ApiBody({ type: SetSubscriptionGroupsDto })
  @ApiStdResponse(SubscriptionDetailDto, { description: 'Group set replaced successfully' })
  @ApiResponse({ status: 400, description: 'Unknown group id, or doc_version missing/non-numeric' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Missing subscription.manage permission' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  @ApiResponse({ status: 409, description: 'doc_version mismatch — the subscription was changed by someone else' })
  async setGroups(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SetSubscriptionGroupsDto,
  ): Promise<void> {
    this.logger.debug({ function: 'setGroups', id, body }, PlatformSubscriptionsController.name);

    const result = await this.platformSubscriptionsService.setGroups(
      id,
      body?.group_ids ?? [],
      req.user?.user_id,
      body?.doc_version,
    );
    this.respond(res, result);
  }
```

อย่าลืมเพิ่ม `SetSubscriptionGroupsDto` เข้ารายการ import จาก `./swagger/request`

- [ ] **Step 5: regenerate app-api-catalog**

การเพิ่ม `AppIdGuard('subscription.set-groups')` ทำให้ catalog drift — ต้อง regenerate:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
git diff --stat apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
```

Expected: มี `+  'subscription.set-groups',` เพิ่มเข้ามา

- [ ] **Step 6: รัน audit ทั้ง 9 ตัว + check-types**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
for a in tcp-drift env-drift api-system-permission license-catalog app-api-catalog-drift \
         rest-contract message-pattern-literal guard-providers bu-scope-guard; do
  printf "%-28s " "$a"; bun run "audit:$a" >/dev/null 2>&1 && echo PASS || echo FAIL
done
cd apps/micro-business && bunx eslint "src/subscription/**/*.ts"
cd ../backend-gateway && bunx eslint "src/platform/platform_subscriptions/**/*.ts"
```

Expected: check-types 17/17 · audit ทุกตัว PASS · eslint ไม่มี finding

- [ ] **Step 7: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/subscription apps/backend-gateway/src/platform/platform_subscriptions packages/rpc-contract/src/contracts/subscription.ts apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
git commit -m "feat(subscriptions): endpoint PUT /:id/groups สำหรับผูกสัญญากับกลุ่มสิทธิ์

setFeatures เดิมยังอยู่ครบ เพราะหน้าขายปัจจุบันยังเรียกมันจนกว่าเฟส 3 จะเปลี่ยน

ตรวจ group id กับตารางเองแทนที่จะพึ่ง FK — FK ไม่รู้จัก soft delete การอ้างกลุ่ม
ที่ถูกลบไปแล้วจะผ่าน FK แต่ให้สิทธิ์ว่าง ซึ่งแย่กว่า error"
```

---

### Task 5: apply บน DEV แล้วตรวจด้วยมือ

ไม่มีเทสต์อัตโนมัติในเฟสนี้ตามที่เจ้าของงานกำหนด การตรวจด้วยมือจึงเป็นด่านเดียว — ห้ามข้ามข้อใด และห้ามรายงานว่าผ่านโดยไม่ได้ทำจริง

**Files:** ไม่มี

- [ ] **Step 1: apply migration ลง DEV**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma migrate status
```

Expected: มี `20260831000000_subscription_bu_group` ตัวเดียวที่ยังไม่ apply

**ถ้ามี migration ของคนอื่นค้างอยู่ด้วย ให้หยุดแล้วรายงาน** — `migrate deploy` ลง migration ทั้งชุดที่ค้าง ไม่ใช่เฉพาะของเรา

```bash
bunx prisma migrate deploy
```

- [ ] **Step 2: ยืนยันตารางเกิดจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
set -a && . ./.env && set +a
CLEAN=$(printf '%s' "$SYSTEM_DIRECT_URL" | sed -E 's/[?&]schema=[^&]*//g')
psql "$CLEAN" -c "SET search_path TO \"$SYSTEM_SCHEMA_NAME\";
SELECT table_name FROM information_schema.tables
WHERE table_schema='$SYSTEM_SCHEMA_NAME' AND table_name='tb_subscription_bu_group';"
```

Expected: หนึ่งแถว

- [ ] **Step 3: รัน backfill แบบสแกน แล้วรันจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.subscription-group
bun run db:backfill.subscription-group -- --apply
```

Expected รอบ `--apply`: `เขียนแล้ว: group=<uuid> คีย์ที่เพิ่ม=75 แถวที่ผูก=14`

- [ ] **Step 4: รันซ้ำเพื่อพิสูจน์ว่า idempotent**

```bash
bun run db:backfill.subscription-group -- --apply
```

Expected: `คีย์ที่เพิ่ม=0 แถวที่ผูก=0` และ `ผูกกลุ่มไว้แล้ว (ข้าม) : 14`

- [ ] **Step 5: ยืนยันสิทธิ์ที่คำนวณได้ตรงกับของเดิมทุกคีย์**

นี่คือข้อที่สำคัญที่สุดของเฟสนี้ — พิสูจน์ว่า **ไม่มีลูกค้ารายไหนได้สิทธิ์ต่างจากเดิมแม้แต่คีย์เดียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
set -a && . ./.env && set +a
CLEAN=$(printf '%s' "$SYSTEM_DIRECT_URL" | sed -E 's/[?&]schema=[^&]*//g')
psql "$CLEAN" -c "SET search_path TO \"$SYSTEM_SCHEMA_NAME\";
WITH old AS (
  SELECT sb.id AS bu_row, array_agg(DISTINCT f.feature_key ORDER BY f.feature_key) AS keys
  FROM tb_subscription_bu sb
  JOIN tb_subscription_bu_feature f ON f.subscription_bu_id = sb.id AND f.deleted_at IS NULL
  WHERE sb.deleted_at IS NULL GROUP BY sb.id
),
new AS (
  SELECT sb.id AS bu_row, array_agg(DISTINCT i.feature_key ORDER BY i.feature_key) AS keys
  FROM tb_subscription_bu sb
  JOIN tb_subscription_bu_group g ON g.subscription_bu_id = sb.id AND g.deleted_at IS NULL
  JOIN tb_license_feature_group_item i ON i.group_id = g.group_id AND i.deleted_at IS NULL
  WHERE sb.deleted_at IS NULL GROUP BY sb.id
)
SELECT count(*) FILTER (WHERE old.keys = new.keys) AS ตรงกัน,
       count(*) FILTER (WHERE old.keys IS DISTINCT FROM new.keys) AS ไม่ตรงกัน
FROM old FULL OUTER JOIN new USING (bu_row);"
```

Expected: `ตรงกัน = 14` และ `ไม่ตรงกัน = 0`

**ถ้า "ไม่ตรงกัน" ไม่เป็นศูนย์ ให้หยุดทันทีแล้วรายงาน** — แปลว่า backfill เปลี่ยนสิทธิ์ของใครบางคน อย่าเดินหน้าต่อ

- [ ] **Step 6: ตรวจ dual read ด้วย endpoint จริง**

รัน gateway + micro-business ในเครื่อง (ชี้ DEV DB) แล้ว:

1. ยิง endpoint ที่บังคับ license ด้วย BU ที่ backfill แล้ว → ต้องได้สิทธิ์เหมือนเดิม
2. ลบแถว `tb_subscription_bu_group` ของ BU หนึ่งชั่วคราว (soft delete) → รอเกิน 60 วินาที (cache TTL) → ยิงซ้ำ → **ยังต้องได้สิทธิ์เหมือนเดิม** เพราะ fallback ไปอ่านตารางเก่า
3. คืนแถวนั้นกลับ (`deleted_at = NULL`)

ข้อ 2 คือการพิสูจน์ว่า dual read ทำงานจริง ไม่ใช่แค่ compile ผ่าน

- [ ] **Step 7: ตรวจ endpoint `PUT /:id/groups`**

ใช้ token ของผู้ใช้ที่มี `subscription.manage` แล้วตรวจ:

| กรณี | คาดหวัง |
|---|---|
| ส่ง `group_ids` ที่มีจริง + `doc_version` ถูก | 200 พร้อม detail |
| ส่ง `group_ids` ที่ไม่มีจริง | 422 `กลุ่มที่ไม่รู้จักหรือถูกลบไปแล้ว: …` |
| ไม่ส่ง `doc_version` | 400 `ต้องระบุ doc_version` |
| ส่ง `doc_version` เก่า | 409 |
| id สัญญาที่ไม่มี | 404 |

- [ ] **Step 8: เก็บกวาดและรายงานผล**

ลบข้อมูลทดสอบที่สร้างระหว่างตรวจ (ถ้ามี) แล้วยืนยันว่า DEV กลับสู่สภาพที่ควรเป็น: 1 กลุ่ม (`FULL`) และ 14 แถวใน `tb_subscription_bu_group`

รายงานผลทั้ง 7 ข้อพร้อมสิ่งที่เห็นจริง ข้อไหนไม่ผ่าน รายงานตามจริงพร้อม output

---

## สิ่งที่เฟสนี้ **ไม่** ทำ

- เปลี่ยนหน้าขายเป็นเลือก group (`GroupSelectionCard`) — **เฟส 3**
- ย้าย `FeatureSelectionCard` ออกจากโฟลเดอร์ `subscriptionEdit/` — เฟส 3
- ด่าน 409 ตอนลบกลุ่มที่มีสัญญาอ้างอยู่ — **ควรอยู่เฟส 3** เพราะตอนนี้ `subscription_count` ยังคืน 0 คงที่
- audit log ของการแก้กลุ่ม — เฟส 3
- `DROP tb_subscription_bu_feature` และถอด dual read — **เฟส 4 และต้องอยู่คนละกิ่งกับเฟสนี้** เพราะ `prisma migrate deploy` ลง migration ทั้งชุดที่ค้างพร้อมกัน การมี CREATE กับ DROP ในกิ่งเดียวเคยทำให้ของหายมาแล้ว
- ทำให้ `subscription_count` ในหน้ารายการกลุ่มนับจริง — เฟส 3 (ตอนนี้ backend คืน 0 คงที่ และ frontend แสดงตามนั้น)

---

## ผลการตรวจ Task 5 (2026-08-30)

ตรวจบน gateway + micro-business ที่รันในเครื่อง ชี้ DEV DB (migration apply แล้ว)
`license.enforcement_enabled` = **true** บน DEV จึงทดสอบเส้นทางบังคับสิทธิ์ได้จริง

| ข้อ | ผล |
|---|---|
| migration apply | ✅ มีเฉพาะ `20260831000000_subscription_bu_group` ค้าง ไม่มีของคนอื่นปน |
| ตาราง `tb_subscription_bu_group` เกิดจริง | ✅ |
| backfill สแกน | ✅ 1 ชุด · 75 คีย์ · 14 แถว — ตรงกับที่แผนคาดไว้เป๊ะ |
| backfill `--apply` | ✅ สร้างกลุ่ม `FULL` (`70016ad3-…`) คีย์ที่เพิ่ม=75 แถวที่ผูก=14 |
| รันซ้ำ (idempotent) | ✅ คีย์ที่เพิ่ม=0 แถวที่ผูก=0 |
| **สิทธิ์ก่อน/หลัง backfill ตรงกัน** | ✅ **same=14 differ=0** — ไม่มีลูกค้ารายไหนได้สิทธิ์ต่างจากเดิมแม้แต่คีย์เดียว |
| **dual read — เส้นทาง group** | ✅ `GET /api/config/DEMO/currencies` → 200 (BU มี group link) |
| **dual read — เส้นทาง fallback** | ✅ soft-delete group link ของ DEMO → รอเกิน 60 วิ (cache TTL) → ยิงซ้ำ → **ยัง 200** เพราะถอยไปอ่าน `tb_subscription_bu_feature` |
| คืนสภาพหลังทดสอบ | ✅ 14 links · 1 กลุ่ม |
| `PUT /:id/groups` สำเร็จ | ✅ 200 · `doc_version` 2 → 3 · `feature_keys` ยังเป็น 75 |
| group id ที่ไม่มีจริง | ✅ 422 `กลุ่มที่ไม่รู้จักหรือถูกลบไปแล้ว: …` |
| ไม่ส่ง `doc_version` | ✅ 400 `ต้องระบุ doc_version` |
| `doc_version` เก่า | ✅ 409 |
| id สัญญาที่ไม่มี | ✅ 404 |
| audit ทั้ง 9 ตัว | ✅ PASS ทุกตัว (รันก่อน push ไม่ใช่รอ CI แดง) |
| `check-types` | ✅ 17/17 |

### ข้อผิดพลาดของแผนที่พบระหว่างรัน

แผนวาง Task 2 Step 3 (รันสคริปต์ backfill แบบสแกน) ไว้ **ก่อน** Task 5 Step 1 (apply migration)
สคริปต์จึงล้มด้วย Prisma P2021 "table does not exist" — ต้อง apply migration ก่อนถึงจะรันสคริปต์ได้
ลำดับจริงที่ใช้: Task 1 → apply migration → Task 2 → Task 3 → Task 4 → ตรวจ
