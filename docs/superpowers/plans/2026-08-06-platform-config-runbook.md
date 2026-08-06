# Platform Config — Deploy Runbook

ทำตามลำดับนี้ **ทุก environment** (DEV → UAT → PROD) ห้ามสลับขั้น

| # | ขั้นตอน | ถ้าข้าม |
|---|---|---|
| 1 | apply migration สร้าง `tb_platform_config` | micro-cluster query แล้วได้ 42P01 |
| 2 | seed **permission ก่อน** แล้วค่อย role-permission — ลำดับสำคัญมาก ดู §2 | ไม่มีใครได้สิทธิ์ และ**ล้มเหลวแบบเงียบ** |
| 3 | **INSERT ค่าจริง** ของ environment นั้น ดู §3 | **ลิงก์คำเชิญชี้ `localhost:3000` โดยไม่มี error ใด ๆ** |
| 4 | ตรวจ `allow_all` ของแอปแอดมิน ดู §4 | เปิดหน้าแล้วได้ **401** ซึ่งอ่านว่า "token เสีย" ทำให้ไล่หาสาเหตุผิดทาง |
| 5 | deploy micro-cluster | — |
| 6 | deploy backend-gateway | หน้า FE ได้ 404 |
| 7 | deploy frontend | — |

---

## §2 ลำดับ seed สำคัญ — ผิดแล้วเงียบ

```bash
cd packages/prisma-shared-schema-platform
bun prisma/seed.platform-permission.ts        # ต้องรันตัวนี้ก่อน
bun prisma/seed.platform-role-permission.ts   # แล้วจึงรันตัวนี้
```

**ทำไมสลับไม่ได้:** `expandPatterns()` ขยาย pattern โดยอ้าง **catalog สดจาก DB** และตัว seeder
(`seed.platform-role-permission.ts:36`) เมื่อหา permission ไม่เจอจะแค่ `console.warn` แล้ว `continue`
ไม่ throw ดังนั้นถ้ารัน role-permission ก่อน:

- `platform_config.*` ของ `platform_admin` → `byResource` ไม่มี `platform_config` → ขยายได้ศูนย์รายการ
- `platform_config.read` ของ `support_manager` → เป็น exact key จึงถูกใส่ในลิสต์ แต่ `byKey.get()` คืน
  `undefined` → warn แล้วข้าม

ผลคือ**ไม่มีใครได้สิทธิ์เลย** และสัญญาณเดียวคือ warn ที่จมอยู่ใน log ของ deploy หน้าจอจะตอบ 403
โดยไม่มีใครเดาสาเหตุถูก

ตรวจหลัง seed:

```bash
bun prisma/check.platform-permission-drift.ts        # ต้องไม่มี platform_config ใน MISSING_IN_DB
bun prisma/check.platform-role-permission-drift.ts   # platform_admin ต้องได้ platform_config.read/manage
```

---

## §3 INSERT ค่าจริง (ต้องทำก่อน deploy micro-cluster)

หา `INVITATION_BASE_URL` ที่ environment นั้นใช้อยู่จริง — จาก config ของ environment ไม่ใช่จาก
`.env.example` เพราะค่าที่นั่นเป็น `localhost`

```sql
INSERT INTO "CARMEN_SYSTEM"."tb_platform_config" ("key", "value", "created_at")
VALUES ('invitation', '{"base_url":"<ค่าจริงของ environment นี้>","expiry_days":7}'::jsonb, NOW());
```

ตรวจก่อนไปขั้นถัดไป:

```sql
SELECT "key", "value" FROM "CARMEN_SYSTEM"."tb_platform_config" WHERE "deleted_at" IS NULL;
```

**ทำไมขั้นนี้ห้ามข้าม:** `config.env.ts` เดิมมี `.default('http://localhost:3000/invitations')` แต่
environment จริงตั้งค่าทับไว้ พอ env ถูกลบทิ้งและ DB ยังไม่มีแถว ระบบจะใช้ default ในโค้ด — อีเมลเชิญ
ทุกฉบับจะมีลิงก์ `localhost:3000` **โดยไม่มี error ไม่มี log** จะรู้ตัวก็ตอนมีคนบ่นว่ากดลิงก์ไม่ได้

`expiry_days` ไม่เสี่ยงเท่า เพราะ default ในโค้ด (7) ตรงกับ default เดิมของ env

---

## §4 ตรวจ `allow_all` ของแอปแอดมิน

endpoint ทั้งสามถูกคุมด้วย `AppIdGuard` ซึ่งเป็น fail-closed และปฏิเสธด้วย **401 ไม่ใช่ 403**

**ผลตรวจบน DEV เมื่อ 2026-08-06:** แอป `platform-web-management`
(`bc1ade0a-a189-48c4-9445-807a3ea38253` — ค่าใน `REACT_APP_API_APP_ID` ของ `.env.dev`) มี
**`allow_all = TRUE`** จึงผ่าน guard อยู่แล้วโดยไม่ต้องมีแถว `tb_application_api`
**ไม่ต้องทำอะไรเพิ่มบน DEV**

**UAT และ PROD ยังไม่ได้ตรวจ** ก่อน deploy ให้รันบน environment นั้น:

```sql
SELECT "name", "id", "allow_all" FROM "CARMEN_SYSTEM"."tb_application"
 WHERE "deleted_at" IS NULL;
```

ถ้าแอปแอดมินของ environment นั้นมี `allow_all = false` ต้องเพิ่มแถวให้ 3 api_name ก่อน deploy gateway:

```sql
INSERT INTO "CARMEN_SYSTEM"."tb_application_api" ("id", "application_id", "api_name", "created_at", "updated_at")
SELECT gen_random_uuid(), '<application_id ของแอปแอดมิน>', needed."api_name", NOW(), NOW()
  FROM (VALUES ('platform-config.list'), ('platform-config.get'), ('platform-config.update'))
       AS needed("api_name")
 WHERE NOT EXISTS (
       SELECT 1 FROM "CARMEN_SYSTEM"."tb_application_api" a
        WHERE a."application_id" = '<application_id ของแอปแอดมิน>'
          AND a."api_name" = needed."api_name"
          AND a."deleted_at" IS NULL);
```

> เคยเขียนเป็น migration อัตโนมัติแล้วถอนออก (commit `01eca2a3e` → revert) เพราะ migration นั้นเลือก
> แอปจากเงื่อนไข "มี `email-setting.list` อยู่แล้ว" แต่ตรวจพบว่า**ไม่มีแอปไหนถือ api_name นั้นเลย**
> migration จึง insert ศูนย์แถวในทุก environment — เป็น no-op ที่คอมเมนต์อ้างว่าป้องกันบางอย่าง
> ซึ่งทำให้เข้าใจผิดมากกว่าไม่มี จึงเปลี่ยนมาเป็นการตรวจด้วยมือตรงนี้แทน

---

## หลัง deploy ครบ — ตรวจ end-to-end

1. เปิด `/platform/configs` ด้วยบัญชี platform admin → ต้องเห็นการ์ด Invitation พร้อมค่าที่ INSERT ไว้
2. กด Edit เปลี่ยน `expiry_days` เป็น 14 แล้ว Save → toast สำเร็จ ค่าที่แสดงเปลี่ยนเป็น 14
3. ใส่ `base_url` เป็น `not a url` แล้ว Save → เห็น error ใต้ช่อง และ**ไม่**ยิง request
4. ส่งคำเชิญจริง 1 ฉบับ แล้วตรวจ **สองอย่างพร้อมกัน**
   - host ในลิงก์ตรงกับ `base_url` ที่ตั้งไว้
   - จำนวนวันที่เขียนในอีเมลตรงกับ `expires_at` ใน `tb_user_invitation` (14 วันนับจากตอนนั้น)
5. เปิดหน้าเดิมด้วยบัญชีที่ไม่มี `platform_config.read` → ต้องเจอหน้า 403

ข้อ 4 คือหัวใจ — พิสูจน์พร้อมกันว่า config ถูกอ่านจาก DB จริง และว่าการส่ง `expiry_days` ลงไปเป็น
พารามิเตอร์แทนการอ่านซ้ำ (ดู `user-invitation.service.ts`) ทำงานถูกต้อง

---

## ย้อนกลับ

ถอย deploy ทั้ง 3 service กลับเวอร์ชันก่อนหน้า — ตาราง `tb_platform_config` ทิ้งไว้ได้ ไม่มีใครอ่าน
โค้ดเวอร์ชันเก่ากลับไปอ่าน env เหมือนเดิม จึงไม่ต้อง rollback migration

**ข้อควรระวัง:** ถ้าถอย micro-cluster กลับ แต่ลบ `INVITATION_BASE_URL` ออกจาก environment ไปแล้ว
โค้ดเก่าจะกลับไปใช้ default `localhost:3000` — เก็บ env เดิมไว้จนกว่าจะมั่นใจว่าไม่ต้องถอย
