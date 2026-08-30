# License Feature Groups — Phase 4 Implementation Plan (ยังไม่เริ่ม — มีเงื่อนไขต้องผ่านก่อน)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ถอดระบบสิทธิ์ราย feature ทิ้งให้หมด เหลือกลุ่มเป็นแหล่งความจริงเดียว

**Architecture:** ถอด dual read ใน `license.service.ts` · เปลี่ยน `feature_keys` ใน subscription detail ให้คำนวณจากกลุ่ม · ถอด `setFeatures` · แล้วจึง `DROP TABLE tb_subscription_bu_feature` เป็น migration ตัวสุดท้าย

**Tech Stack:** NestJS microservices, Prisma (`prisma-shared-schema-platform`), Bun · frontend มีงานเล็กน้อย (ถอด `setFeatures` ออกจาก service)

**Spec:** `docs/superpowers/specs/2026-08-30-license-feature-groups-design.md`

---

## ⛔ เงื่อนไขที่ต้องผ่านก่อนเริ่มเฟสนี้

เฟสนี้ **ทำลายข้อมูลถาวร** — `DROP TABLE` ไม่มีทางย้อนกลับนอกจากกู้จาก backup **ห้ามเริ่มจนกว่าทุกข้อจะเป็นจริง:**

1. **PR เฟส 2 (#436), เฟส 3 backend (#437) และเฟส 3 frontend (#189) merge และ deploy ครบแล้ว**
2. **ระบบเดินด้วยกลุ่มบน production มาแล้วอย่างน้อยหนึ่งรอบการใช้งานจริง** — ไม่ใช่แค่ deploy ผ่าน แต่มีคนขายสัญญาด้วยกลุ่มจริงและลูกค้าใช้งานได้
3. **ทุก `tb_subscription_bu` ที่ยังไม่ถูกลบ มีอย่างน้อยหนึ่งกลุ่ม** — ตรวจด้วย query ใน Task 0 ข้างล่าง ถ้ามีแถวไหนไม่มีกลุ่ม การ DROP จะทำให้ลูกค้ารายนั้นสิทธิ์ว่างทันที
4. **มี backup ของ `tb_subscription_bu_feature` ที่กู้คืนได้จริง** ไม่ใช่แค่ "น่าจะมี snapshot"
5. **เจ้าของงานอนุมัติโดยรู้ว่านี่คือการลบข้อมูลถาวร**

> เหตุผลที่ผมไม่ implement เฟสนี้ล่วงหน้าตอนเขียนเฟส 2-3: การเขียนโค้ดที่ **ทดสอบไม่ได้จนกว่าจะ DROP จริง** แล้วทิ้งไว้ในกิ่งพร้อม merge คือการวางกับดัก — ใครมา merge ต่อจะเห็นว่า "CI เขียว" โดยไม่รู้ว่าไม่มีใครเคยรันมันกับฐานที่ไม่มีตารางนั้นเลย

---

## Global Constraints

- **ข้ามขั้นเขียนเทสต์อัตโนมัติ** ตามที่เจ้าของงานกำหนด แต่ **static check ต้องรันทุกงาน**
- ก่อน commit: `bun run check-types` และ **`bunx eslint "<ไฟล์ที่แก้>"`** — **ห้าม `bun run lint`** (มี `--fix` เขียนทับทั้งรีโป)
- **ก่อน push ต้องรัน audit ทั้ง 9 ตัว** (`tcp-drift`, `env-drift`, `api-system-permission`, `license-catalog`, `app-api-catalog-drift`, `rest-contract`, `message-pattern-literal`, `guard-providers`, `bu-scope-guard`)
- **migration DROP ต้องอยู่คนละกิ่งกับ migration CREATE ของเฟสก่อน** — `prisma migrate deploy` ลง migration ทั้งชุดที่ค้างพร้อมกัน การมี CREATE กับ DROP ในกิ่งเดียวเคยทำให้ของหายมาแล้ว เฟส 2 ใช้กิ่ง `feature/license-feature-groups-phase-2` ไปแล้ว เฟสนี้ต้องแตกกิ่งใหม่จาก `main` **หลังจาก** เฟสก่อน merge ครบ
- **สร้าง migration ด้วย `prisma migrate diff` ไม่ใช่ `migrate dev`** — `.env` ชี้ DEV ซึ่งเป็นฐานร่วมและมี drift
- การเพิ่ม/ลบ `AppIdGuard` ต้อง regenerate `app-api-catalog.generated.ts`
- การลบ `@MessagePattern` ต้อง `bun run gen:rpc-contract` แล้ว commit ผลลัพธ์

---

### Task 0: ประตูข้อมูล — ทุกใบต้องมีกลุ่มก่อน

**Files:** ไม่มี — เป็น query และการตัดสิน

- [ ] **Step 1: ตรวจว่ามีใบไหนไม่มีกลุ่มบ้าง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
set -a && . ./.env && set +a
CLEAN=$(printf '%s' "$SYSTEM_DIRECT_URL" | sed -E 's/[?&]schema=[^&]*//g')
psql "$CLEAN" -c "SET search_path TO \"$SYSTEM_SCHEMA_NAME\";
SELECT
  (SELECT count(*) FROM tb_subscription_bu WHERE deleted_at IS NULL) AS total_rows,
  (SELECT count(DISTINCT sb.id) FROM tb_subscription_bu sb
     JOIN tb_subscription_bu_group g ON g.subscription_bu_id = sb.id AND g.deleted_at IS NULL
   WHERE sb.deleted_at IS NULL) AS rows_with_group,
  (SELECT count(*) FROM tb_subscription_bu sb
   WHERE sb.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM tb_subscription_bu_group g
                     WHERE g.subscription_bu_id = sb.id AND g.deleted_at IS NULL)) AS rows_without_group;"
```

Expected: `rows_without_group = 0`

**ถ้าไม่เป็นศูนย์ ให้หยุด** แล้วรัน `bun run db:backfill.subscription-group -- --apply` ก่อน จากนั้นตรวจซ้ำ ถ้ายังไม่เป็นศูนย์อีกแปลว่ามีใบที่ไม่มี feature เลยมาแต่ต้น — ต้องตัดสินกับเจ้าของงานว่าจะให้กลุ่มอะไรกับใบเหล่านั้น ไม่ใช่ปล่อยผ่าน

- [ ] **Step 2: ตรวจว่าสิทธิ์จากกลุ่มยังตรงกับของเดิมทุกแถว**

```bash
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
SELECT count(*) FILTER (WHERE old.keys = new.keys) AS same,
       count(*) FILTER (WHERE old.keys IS DISTINCT FROM new.keys) AS differ
FROM old FULL OUTER JOIN new USING (bu_row);"
```

Expected: `differ = 0`

**ถ้า `differ` ไม่เป็นศูนย์ ให้หยุดแล้วรายงาน** — มีคนแก้กลุ่มหลัง backfill จนสิทธิ์ต่างจากเดิม ต้องตัดสินว่าอันไหนถูกก่อน ไม่ใช่ DROP ทับ

- [ ] **Step 3: สำรองตารางก่อน DROP**

```bash
psql "$CLEAN" -c "SET search_path TO \"$SYSTEM_SCHEMA_NAME\";
CREATE TABLE tb_subscription_bu_feature_backup_20260901 AS
SELECT * FROM tb_subscription_bu_feature;
SELECT count(*) FROM tb_subscription_bu_feature_backup_20260901;"
```

ตารางสำรองนี้อยู่ในฐานเดียวกัน กู้ได้ทันทีถ้าพบปัญหา และลบทิ้งได้เมื่อมั่นใจแล้ว (แนะนำให้ทิ้งไว้อย่างน้อยหนึ่งเดือน)

---

### Task 1: `feature_keys` คำนวณจากกลุ่ม

`buildDetail` อ่าน `tb_subscription_bu_feature` อยู่ ต้องเปลี่ยนก่อน DROP ไม่งั้นหน้าจอจะพัง

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts` (`buildDetail`, ราวบรรทัด 800-830)

**Interfaces:**
- Consumes: `tb_subscription_bu_group` → `tb_license_feature_group_item`
- Produces: `SubscriptionBuDetail.feature_keys` ที่มาจากกลุ่ม — รูปข้อมูลไม่เปลี่ยน frontend ไม่ต้องแก้

- [ ] **Step 1: เปลี่ยน select และการ map**

ใน `buildDetail` ถอด `tb_subscription_bu_feature` ออกจาก select (เก็บ `tb_subscription_bu_group` ที่เฟส 3 เพิ่มไว้แล้ว) แล้วเปลี่ยนบรรทัดที่ประกอบ `feature_keys` จาก

```ts
          feature_keys: bu.tb_subscription_bu_feature.map((f) => f.feature_key).sort(),
```

เป็น

```ts
          // สิทธิ์มาจากกลุ่มล้วนแล้ว — union ของ feature ในทุกกลุ่มที่ใบนี้ถือ ตัดซ้ำด้วย Set
          // เพราะสองกลุ่มมี feature ตัวเดียวกันได้
          feature_keys: Array.from(
            new Set(
              bu.tb_subscription_bu_group.flatMap((g) =>
                g.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key),
              ),
            ),
          ).sort(),
```

และเพิ่ม `tb_license_feature_group_item` เข้า select ของ `tb_license_feature_group` ที่เฟส 3 เพิ่มไว้:

```ts
        tb_subscription_bu_group: {
          where: { deleted_at: null },
          select: {
            tb_license_feature_group: {
              select: {
                id: true,
                code: true,
                name: true,
                sort_order: true,
                tb_license_feature_group_item: {
                  where: { deleted_at: null },
                  select: { feature_key: true },
                },
              },
            },
          },
        },
```

- [ ] **Step 2: ตรวจว่า detail ยังคืน feature_keys ชุดเดิม**

รัน backend ในเครื่องชี้ DEV แล้วยิง `GET /api-system/platform/subscriptions/<id>` เทียบ `bu.feature_keys` กับก่อนแก้ — ต้องได้ 75 คีย์ชุดเดิม

- [ ] **Step 3: check-types + eslint + commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
cd apps/micro-business && bunx eslint "src/subscription/**/*.ts"
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/subscription/subscription.service.ts
git commit -m "refactor(subscriptions): feature_keys คำนวณจากกลุ่ม ไม่ใช่ตารางราย feature

ขั้นแรกของการถอดตารางเก่า — รูปข้อมูลที่ frontend เห็นไม่เปลี่ยน"
```

---

### Task 2: ถอด dual read

**Files:**
- Modify: `apps/backend-gateway/src/license/license.service.ts`

- [ ] **Step 1: ถอด fallback**

เปลี่ยนบล็อก dual read กลับเป็นการอ่านจากกลุ่มอย่างเดียว:

```ts
      // กลุ่มเป็นแหล่งความจริงเดียวแล้ว — ตารางราย feature ถูก DROP ในเฟสนี้
      const features = new Set(
        row.tb_subscription_bu_group.flatMap((g) =>
          g.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key),
        ),
      );
```

แล้วถอด `tb_subscription_bu_feature` ออกจากทั้ง type ของ `rows` และ `select`

- [ ] **Step 2: check-types + eslint + commit**

```bash
bun run check-types
cd apps/backend-gateway && bunx eslint "src/license/license.service.ts"
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/license/license.service.ts
git commit -m "refactor(license): ถอด fallback ไปตารางราย feature — กลุ่มเป็นแหล่งความจริงเดียว"
```

---

### Task 3: ถอด `setFeatures` ทั้งสาย

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts` (ลบเมธอด `setFeatures`)
- Modify: `apps/micro-business/src/subscription/subscription.controller.ts` (ลบ handler)
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.service.ts` (ลบเมธอด)
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.controller.ts` (ลบ handler + `AppIdGuard('subscription.set-features')`)
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/swagger/request.ts` (ลบ `SetSubscriptionFeaturesDto`)
- Modify: `packages/rpc-contract/src/contracts/subscription.ts` (regenerate)
- Modify: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` (regenerate)
- Modify (frontend): `src/services/subscriptionService.ts` (ลบ `setFeatures`)
- Modify (frontend): `src/pages/licenses/SubscriptionForm.test.tsx` (ลบ mock ของ `setFeatures` และ assertion ที่อ้างถึงมัน)

- [ ] **Step 1: ลบฝั่ง backend แล้ว regenerate**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
bun run scripts/generate-app-api-catalog/run.ts
bun run check-types
```

- [ ] **Step 2: ลบฝั่ง frontend**

`setFeatures` ใน `subscriptionService.ts` ไม่มีใครเรียกแล้วตั้งแต่เฟส 3 — ลบได้ทันที แล้วลบ mock กับ assertion ที่อ้างถึงมันในเทสต์

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run test
```

Expected: 1222 tests ผ่าน (จำนวนอาจลดถ้าลบ assertion)

- [ ] **Step 3: audit ครบ 9 ตัว + commit**

---

### Task 4: ปลดระวางสคริปต์ที่อ่านตารางเก่า

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-19-backfill-subscription.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-31-backfill-subscription-group.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json`

สคริปต์ทั้งสองอ่าน/เขียน `tb_subscription_bu_feature` — หลัง DROP มันจะพังทันทีที่รัน

- [ ] **Step 1: ตัดสินว่าจะทำอย่างไรกับแต่ละตัว**

| สคริปต์ | สิ่งที่ควรทำ |
|---|---|
| `2026-08-19-backfill-subscription.ts` | เขียน `tb_subscription_bu_feature` ตอนอุดช่องว่างแบบที่ 4 — ต้องเปลี่ยนให้ผูกกลุ่มแทน หรือปลดระวางถ้าไม่ใช้แล้ว **ตัดสินกับเจ้าของงาน อย่าเดา** |
| `2026-08-31-backfill-subscription-group.ts` | หมดหน้าที่แล้ว — ย้ายไป `maintenance/retired/` หรือใส่ guard ที่แจ้งว่าใช้ไม่ได้อีกแล้ว |

- [ ] **Step 2: ลบ script entry ที่ปลดระวางออกจาก `package.json`**

---

### Task 5: DROP ตาราง

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (ลบ model + relation field บน `tb_subscription_bu`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/<timestamp>_drop_subscription_bu_feature/migration.sql`

- [ ] **Step 1: ลบ model และ relation**

ลบ `model tb_subscription_bu_feature { ... }` ทั้งบล็อก และลบบรรทัด `tb_subscription_bu_feature tb_subscription_bu_feature[]` ออกจาก `model tb_subscription_bu`

- [ ] **Step 2: สร้าง migration ด้วย diff**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
SCRATCH=$(mktemp -d)
git show HEAD:packages/prisma-shared-schema-platform/prisma/schema.prisma > "$SCRATCH/old.prisma"
DIR=prisma/migrations/$(date +%Y%m%d)000000_drop_subscription_bu_feature
mkdir -p "$DIR"
{
  cat <<'HEADER'
-- ถอดระบบสิทธิ์ราย feature ทิ้ง — กลุ่มเป็นแหล่งความจริงเดียวแล้ว
--
-- ก่อน apply migration นี้ต้องผ่านประตูใน Task 0 ของแผนเฟส 4 ครบทุกข้อ:
-- ทุกใบมีกลุ่ม · สิทธิ์จากกลุ่มตรงกับของเดิมทุกแถว · มีตารางสำรอง
-- tb_subscription_bu_feature_backup_<วันที่> อยู่ในฐานเดียวกัน
--
-- migration นี้ทำลายข้อมูลถาวร ย้อนกลับได้ทางเดียวคือกู้จากตารางสำรอง

HEADER
  bunx prisma migrate diff --from-schema "$SCRATCH/old.prisma" --to-schema ./prisma/schema.prisma --script 2>/dev/null
} > "$DIR/migration.sql"
perl -i -ne 'print unless /injected env/' "$DIR/migration.sql"
cat "$DIR/migration.sql"
```

**ตรวจว่า SQL มีแต่ `DROP TABLE "tb_subscription_bu_feature"` และ constraint ของมันเท่านั้น** ถ้ามี DROP ของตารางอื่นโผล่มา ให้หยุดทันที

- [ ] **Step 3: check-types + build + audit ครบ 9 ตัว**

- [ ] **Step 4: Commit — แต่ยังไม่ push**

การ push กิ่งนี้ไม่ apply migration (workflow ทริกเกอร์จาก push `main` เท่านั้น) แต่การ **merge** จะ apply ทันทีผ่าน `build.yml` ดังนั้นให้เปิด PR แล้วรอเจ้าของงานกดเอง

---

### Task 6: ตรวจหลัง apply บน DEV

- [ ] **Step 1: ยืนยันว่าตารางหายจริง และสิทธิ์ยังทำงาน**

```bash
psql "$CLEAN" -c "SET search_path TO \"$SYSTEM_SCHEMA_NAME\";
SELECT to_regclass('tb_subscription_bu_feature') AS should_be_null,
       to_regclass('tb_subscription_bu_feature_backup_20260901') AS backup_should_exist;"
```

- [ ] **Step 2: ยิง endpoint ที่บังคับ license**

```
GET /api/config/DEMO/currencies  → ต้อง 200
```

ถ้าได้ 403 แปลว่า `license.service.ts` อ่านกลุ่มไม่ได้ — **กู้ทันที** จากตารางสำรอง แล้วสอบสวนก่อนลองใหม่

- [ ] **Step 3: ยืนยันว่า subscription detail ยังคืน feature_keys ครบ**

```
GET /api-system/platform/subscriptions/<id> → bu.feature_keys ต้องมี 75 คีย์
```

- [ ] **Step 4: ตรวจหน้าขายในเบราว์เซอร์** — เลือกกลุ่ม บันทึก แล้วดูว่าสิทธิ์เปลี่ยนตาม

---

## แผนกู้คืนถ้าพลาด

```sql
SET search_path TO "CARMEN_SYSTEM";
CREATE TABLE tb_subscription_bu_feature AS
SELECT * FROM tb_subscription_bu_feature_backup_20260901;
-- แล้ว revert commit ของ Task 1-3 และ deploy ย้อน
```

ตารางที่กู้มาจะไม่มี constraint และ index เดิม — ต้องสร้างใหม่จาก migration `20260818000000_license_model` ก่อนใช้งานจริง
