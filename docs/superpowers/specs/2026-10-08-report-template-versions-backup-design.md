# ประวัติเวอร์ชัน + backup/import ไฟล์ของ Report Template

## 0. ที่มา / การตัดสินใจ (กับ user 2026-10-08)

หน้า `/report-templates` แก้ template ได้ แต่ไม่มีทางย้อนกลับไปเนื้อหาเก่า และไม่มีทางสำรอง template
ออกมาเป็นไฟล์ — ปุ่ม "ประวัติการเปลี่ยนแปลง" (`ActivityTrailSheet`, `tb_activity`) ให้ดู diff รายฟิลด์ได้
แต่กู้คืนไม่ได้ และเป็น audit log ไม่ใช่ที่เก็บข้อมูลธุรกิจ

**เป้าหมาย:** (1) ทุก save สร้างเวอร์ชันที่ดู/เทียบ/กู้คืนได้ (2) export template เป็นไฟล์ทีละตัวและทีละหลายตัว
(3) import ไฟล์นั้นกลับเข้าระบบได้ รวมถึงข้าม environment

| คำถาม | คำตอบ |
|---|---|
| "version" หมายถึง | ประวัติเวอร์ชันเต็ม + กู้คืนได้ (ไม่ใช่แค่โชว์เลข, ไม่ใช่เลข semver ที่กรอกเอง) |
| เก็บเวอร์ชันที่ไหน | ตารางใหม่ `tb_report_template_version` — **ไม่ใช้** `tb_activity` (audit log อาจถูก purge/redact, สิทธิ์ผูก `activity_log.read`) |
| เลขเวอร์ชัน | = `doc_version` ของแถวหลักหลัง save |
| backup ต้อง import กลับได้ไหม | ได้ |
| รูปแบบไฟล์ batch | JSON ไฟล์เดียว (`templates: [...]`) — ไฟล์เดี่ยวคือ array 1 ตัว; ไม่มี zip, ไม่เพิ่ม lib |
| import ทำที่ไหน | FE วน `create`/`update` เดิมทีละรายการ (ไม่ atomic) — ไม่มี endpoint import |
| จับคู่ตอน import ด้วย | `name` (unique ต่อ `deleted_at`) — `id` ข้าม environment ไม่ตรงกัน |
| diff ของ XML | `@codemirror/merge` (dependency ใหม่ — user อนุมัติแล้ว) |
| `is_default` ตอน restore/import | **ไม่แตะ** — คงค่าปลายทางเดิม; สร้างใหม่ = `false` |
| ชื่อ/คำอธิบายหลายภาษา (เพิ่มกลางทาง) | `name_i18n` / `description_i18n` `{en?, th?}` แบบเดียวกับ widget `title_i18n` — ดู §7 |
| i18n ไปถึงแอป inventory ไหม | **รอบนี้ไม่** — เก็บข้อมูลครบใน platform; micro-report + inventory FE เป็น spec ถัดไป |

### 0.1 บั๊กเดิมที่ต้องแก้ในงานนี้

`apps/micro-cluster/src/cluster/report-template/report-template.service.ts` — `create` (`:226-240`) และ
`update` (`:287-301`) **ไม่ส่ง** 6 ฟิลด์นี้เข้า Prisma `data:` จึงหายเงียบ:
`builder_key`, `source_type`, `source_name`, `source_params`, `orientation`, `signature_config`

ผลวันนี้: หน้า Edit แก้ `source_type`/`source_name`/`builder_key` แล้วไม่ถูกบันทึก (อนุมานจากโค้ด —
**ต้องยืนยันบน DEV ก่อนแก้**: แก้ `source_name` ผ่าน UI → GET กลับมาดูว่าค่าเดิมหรือไม่)
ผลต่องานนี้: import ผ่าน endpoint เดิมจะทำ 6 ฟิลด์หาย → ไฟล์ backup round-trip ไม่ได้ จึงเป็นเงื่อนไขบังคับ

## 1. Backend (`carmen-turborepo-backend-v2`)

### 1.1 ตาราง `tb_report_template_version` (platform schema)

```prisma
model tb_report_template_version {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  report_template_id    String   @db.Uuid
  version               Int      @db.Integer
  snapshot              Json     @db.JsonB
  change_type           String   @db.VarChar(20)   // create | update | restore | import
  restored_from_version Int?     @db.Integer
  note                  String?
  created_at            DateTime @default(now()) @db.Timestamptz(6)
  created_by_id         String?  @db.Uuid

  report_template tb_report_template @relation(fields: [report_template_id], references: [id])

  @@unique([report_template_id, version], map: "report_template_version_template_version_u")
  @@index([report_template_id, created_at(sort: Desc)], map: "idx_report_template_version_template_created")
}
```

- `snapshot` = ทุกฟิลด์ที่แก้ได้: `name, name_i18n, description, description_i18n, report_group, template_type, dialog, content,
  builder_key, view_name, source_type, source_name, source_params, orientation, signature_config,
  is_standard, is_default, is_active, allow_business_unit, deny_business_unit`
  — ไม่รวม `id`, `doc_version`, audit fields (`*_at`, `*_by_id`)
- `note` สงวนไว้ — ยังไม่มี UI กรอก
- retention: เก็บทั้งหมด ไม่มี purge (template ~สิบกว่า KB, แก้ไม่บ่อย)
- ไม่ soft-delete — ลบ template แล้วเวอร์ชันยังอยู่ (แถวหลักเป็น soft-delete อยู่แล้ว FK ไม่ขาด)

**Migration** สร้างตาราง + **backfill**: ทุกแถว `deleted_at IS NULL` ได้ 1 เวอร์ชัน
`version = doc_version`, `change_type = 'create'`, `created_by_id = coalesce(updated_by_id, created_by_id)`,
`created_at = coalesce(updated_at, created_at)` — เพื่อให้กู้กลับมาที่ "ตอนนี้" ได้เสมอ
(ระวัง `reference_migration_applied_without_merge`: push กิ่งที่มี migration = apply DEV ภายใน ~2 นาที)

### 1.2 การเขียน snapshot

ฟังก์ชันเดียว `buildSnapshot(row)` + `writeVersion(tx, row, change_type, user_id, restored_from?)`
ใน service — เรียกใน `$transaction` เดียวกับการเขียนแถวหลัก:

| operation | change_type |
|---|---|
| `create` | `create` หรือ `import` (ถ้า payload มี `change_type: 'import'`) |
| `update` | `update` หรือ `import` |
| `restore` | `restore` + `restored_from_version` |
| `delete` | ไม่เขียนเวอร์ชัน |

`change_type` ใน payload ของ create/update: optional, whitelist เฉพาะ `'import'` (ค่าอื่น → ignore,
ไม่ error) — เป็นป้ายกำกับเท่านั้น ไม่เปลี่ยนพฤติกรรม เพิ่มใน DTO ของ gateway ด้วย

ใช้ `version = updatedRow.doc_version` (extension ใน `prisma-shared-schema-platform/src/index.ts:74`
เพิ่มให้อัตโนมัติ) — ต้องอ่านค่าหลังเขียน ไม่ใช่คำนวณเอง

### 1.3 แก้ create/update ให้รับ 6 ฟิลด์ (§0.1)

ส่ง `builder_key, source_type, source_name, source_params, orientation, signature_config` เข้า `data:`
ทั้งสองที่ (update: `undefined` = ไม่แตะ ตามแบบฟิลด์อื่น) + เพิ่มใน DTO/zod ของ gateway ถ้ายังไม่มี
validate `source_type ∈ {view,function,procedure}`, `orientation ∈ {portrait,landscape}`

### 1.4 Endpoint ใหม่ (gateway `/api-system/report-templates`, RPC → micro-cluster)

| Method | Path | Permission | ผล |
|---|---|---|---|
| GET | `:report_template_id/versions` | `report_template.read` | `[{ version, change_type, restored_from_version, created_at, created_by_id, created_by_name }]` เรียงใหม่→เก่า **ไม่มี snapshot** |
| GET | `:report_template_id/versions/:version` | `report_template.read` | แถวเดียว + `snapshot` |
| POST | `:report_template_id/versions/:version/restore` | `report_template.update` | body `{ doc_version }` → `{ id, doc_version }` |

ไม่มี pagination ใน list (จำนวนเวอร์ชันต่อ template เล็ก) — ถ้าเกิน 200 ค่อยเพิ่ม (YAGNI)

**restore:**
1. template ไม่พบ/ถูกลบ → `REPORT_TEMPLATE_NOT_FOUND`; เวอร์ชันไม่พบ → error catalog ใหม่ `REPORT_TEMPLATE_VERSION_NOT_FOUND` (404)
2. `doc_version` ไม่ตรง → 409 (กลไกเดียวกับ update)
3. `snapshot.name` ชน template อื่นที่ยังไม่ลบ → `REPORT_TEMPLATE_NAME_ALREADY_EXISTS`
4. เขียน snapshot ทับแถวหลัก **ยกเว้น `is_default`** (คงค่าปัจจุบัน — partial unique index ต่อกลุ่ม)
5. เขียนเวอร์ชันใหม่ `change_type='restore'`, `restored_from_version=:version` — ไม่ลบประวัติ

### 1.5 ด่าน/งานตามมา

- `bun run gen:rpc-contract` (3 handler ใหม่ — ทำตาม 3 ขั้นในหัวไฟล์ contract)
- `platform-activity-registry.ts`: ลงทะเบียน `report-templates.restore` เป็น `update` ของ `tb_report_template`
  (versions list/get เป็น read ไม่ต้องลง)
- `check.api-system-permission-coverage`, app-api-catalog และ audit gates อื่นตาม
  `reference_backend_v2_audit_gates` — รันเองก่อน push
- ใช้ `bunx eslint` ไม่ใช่ `bun run lint` (เขียนทับทั้ง repo)

## 2. Frontend — ประวัติเวอร์ชันบนหน้า Edit

### 2.1 Service + types

`src/services/reportTemplateService.ts`:
- เพิ่ม `listVersions(id)`, `getVersion(id, version)`, `restoreVersion(id, version, docVersion?)`
- `ReportTemplate` เพิ่ม optional: `orientation?`, `signature_config?`, `view_name?`
- type ใหม่ `ReportTemplateVersionSummary`, `ReportTemplateVersion` (มี `snapshot`) — ไว้ในไฟล์ service
  ตามแบบ `ReportTemplate` เดิม

### 2.2 ป้ายเลขเวอร์ชัน

`PageHeader afterTitle={<Badge variant="secondary">v{docVersion}</Badge>}` เมื่อ `!isNew && docVersion != null`
— อยู่นอก `<h1>` ตามกฎ Styling; ไม่มี API call เพิ่ม

### 2.3 `ReportTemplateVersionsSheet` (`src/pages/reportTemplates/ReportTemplateVersionsSheet.tsx`)

ปุ่ม "เวอร์ชัน" ใน `PageHeader actions` ข้าง `ActivityTrailSheet`, ห่อ `<Can permission="report_template.read">`

- เปิดแผ่น → `listVersions` (ยิงครั้งเดียวต่อการเปิด, race guard ตาม `agent-os/standards/hooks/`)
- แถว: `v12` · ป้าย change_type (`restore` แสดง "กู้จาก v8") · ชื่อผู้ทำ · เวลา (`fmt` inline ตาม `AuditMeta`)
  · แถวที่ `version === docVersion` มีป้าย "ปัจจุบัน"
- คลิกแถว → กาง; `getVersion` ครั้งแรกแล้ว cache ใน `Map<version, snapshot>` (กางซ้ำ = 0 request)
- ในส่วนที่กาง:
  - รายการฟิลด์ scalar ที่ต่างจากปัจจุบัน (`name: A → B`) — เทียบกับ `templateRecord` ล่าสุด
  - `<TabStrip>` Dialog XML / Content XML (`count` = จำนวนบรรทัดที่เปลี่ยน) → `XmlDiffView`
  - ปุ่ม "ดาวน์โหลดเวอร์ชันนี้" (§3 รูปแบบเดียวกัน, `version` = เวอร์ชันนั้น)
  - ปุ่ม "กู้คืนเวอร์ชันนี้" ห่อ `<Can permission="report_template.update">` → `<ConfirmDialog>`
    "จะสร้าง v{doc+1} จากเนื้อหาของ v{n} · ค่า is_default จะไม่เปลี่ยน"; ซ่อนบนแถวปัจจุบัน
- **disabled ระหว่าง `editing`** + tooltip "บันทึกหรือยกเลิกการแก้ไขก่อน" — กันทับงานค้าง
- restore สำเร็จ → refetch template (อัปเดต `docVersion`, `formData`, `savedFormData`) + รีเฟรช list
  + `toast.success`; `isVersionConflict` → `notifyVersionConflict()` + refetch; อื่น ๆ → `toast.error(getErrorDetail(err))`
- `listVersions` ได้ 404 (`isNotFoundError`) → ซ่อนปุ่มทั้งปุ่ม (backend ยังไม่ขึ้น) ไม่แสดง error

### 2.4 `XmlDiffView` (`src/components/XmlDiffView.tsx`)

- ห่อ `MergeView` ของ `@codemirror/merge` — side-by-side (ซ้าย = เวอร์ชันนั้น, ขวา = ปัจจุบัน), read-only ทั้งสองฝั่ง,
  `collapseUnchanged` เพื่อพับส่วนที่เหมือนกัน; ใช้ extension XML/theme ชุดเดียวกับ `XmlEditor`
- จอแคบ (< `md`) → `unifiedMergeView` แทน side-by-side
- **การติดตั้ง:** `bun add @codemirror/merge` แล้วตรวจว่าไม่ลาก `@codemirror/state`/`view` ชุดที่สอง —
  `package.json` มี overrides ของสองตัวนี้อยู่แล้ว (บรรทัด ~130/141) ต้องให้ resolve ตัวเดียว
  (`reference_bun_overrides_drift`, `reference_dependency_upgrade_traps`: lockfile 3 ชั้น — อัป
  `package-lock.json` ด้วย `npm install --package-lock-only` ด้วย ไม่งั้น verify job ที่ใช้ `npm ci` แดง)

## 3. Frontend — Backup (export) และ Import

### 3.1 รูปแบบไฟล์ — `src/utils/reportTemplateBackup.ts`

```json
{
  "format": "carmen.report-template-backup",
  "format_version": 1,
  "exported_at": "2026-10-08T04:05:00.000Z",
  "source": { "api_base_url": "https://dev.blueledgers.com:4001", "app_version": "1.1.0" },
  "templates": [ { "id": "…", "version": 12, "name": "…", "...": "ทุกฟิลด์ใน snapshot (§1.1)" } ]
}
```

- `id`, `version` = ข้อมูลอ้างอิงสำหรับคนอ่าน — **import ไม่ใช้**
- `app_version` จาก `changelog.json` (`versions[0].version`) ตามที่ `VersionBadge` อ่าน
- util export: `buildBackup(templates)`, `backupFileName(...)`, `downloadJSON(obj, name)` (Blob + `<a download>`
  ตามแบบ `downloadCSV`), `parseBackup(text) → { ok, templates, errors[] } `
- `parseBackup` ตรวจ: JSON ได้, `format` ตรง, `format_version === 1` (มากกว่า → "ไฟล์มาจากเวอร์ชันใหม่กว่า"),
  ต่อรายการ: `name`/`report_group` เป็น string ไม่ว่าง, `dialog`/`content` เป็น string (ว่างได้ — create DTO ยอมรับ และบาง template ไม่มี dialog), `template_type ∈ {form,list}`,
  XML parse ได้ (ใช้ validator ตัวเดียวกับหน้า Edit), `name` ไม่ซ้ำกันเองในไฟล์

**ชื่อไฟล์:** เดี่ยว `report-template_{name-slug}_v{version}_{YYYY-MM-DD}.json` ·
หลายตัว `report-templates_{n}_{YYYY-MM-DD}.json`

### 3.2 Export

list endpoint ไม่คืน `dialog`/`content` → ดึง `getById` ต่อรายการ, concurrency 4, `Promise.allSettled`
→ export เฉพาะที่สำเร็จ; มีพลาด → `toast.warning("ส่งออก 18, ล้มเหลว 2")`; สำเร็จหมด → `toast.success`

| ทางเข้า | การกระทำ |
|---|---|
| หน้า Edit · actions | "ดาวน์โหลด backup" — ใช้ `templateRecord` ที่โหลดอยู่ (ไม่ยิงซ้ำ); ถ้า `editing` และมีการแก้ค้าง ให้ export ค่าที่ **บันทึกแล้ว** ไม่ใช่ `formData` |
| แผ่นเวอร์ชัน · แถวที่กาง | "ดาวน์โหลดเวอร์ชันนี้" — จาก snapshot ใน cache |
| ตาราง · เมนูแถว | "ดาวน์โหลด backup" |
| ตาราง · เลือกหลายแถว | `enableRowSelection` + แถบ bulk "ดาวน์โหลด backup ({n})" — เฉพาะแถวที่เลือกในหน้าปัจจุบัน (server-side) |
| ตาราง · `PageHeader actions` | "Backup ทั้งหมด" — ดึง id ทุกหน้าตาม search/filter ปัจจุบัน แล้ว `getById` ทีละตัว; ปุ่มแสดง progress `12/40` และ disabled ระหว่างทำ |

ทุกทางเข้า export ห่อ `<Can permission="report_template.read">`

### 3.3 Import — ปุ่ม "นำเข้า" บนหน้า Management (`<Can permission="report_template.create">`)

Dialog ใหม่ `src/pages/reportTemplates/ReportTemplateImportDialog.tsx`

1. **เลือกไฟล์** `<input type=file accept=".json,application/json">`, จำกัด 10 MB → `parseBackup`;
   ไฟล์ทั้งไฟล์ใช้ไม่ได้ → `toast.error` + อยู่ที่ขั้นเลือกไฟล์
2. **พรีวิว** — โหลดชื่อ template ที่มีอยู่ทั้งหมด (วนหน้าแบบ `perpage` 100 ตาม cap, ขอเฉพาะฟิลด์ที่ list คืน)
   จับคู่ด้วย `name` (เทียบตรงตัว):

   | สถานะ | action | หมายเหตุ |
   |---|---|---|
   | ใหม่ | สร้าง | ล็อก |
   | ชื่อซ้ำ | **ข้าม** (ค่าเริ่ม) / เขียนทับ | มีปุ่ม "เขียนทับทั้งหมด" |
   | ไม่ผ่านตรวจ | ข้าม | ล็อก + แสดงเหตุผลจาก `parseBackup` |

   ตารางพรีวิวแสดง name · report_group · template_type · สถานะ · action
3. **ยืนยัน** → ยิง **ทีละรายการตามลำดับ** (sequential); ปุ่มแสดง progress, ปิด dialog ไม่ได้ระหว่างทำ
   - สร้าง: `create({...fields, is_default: false, change_type: 'import'})`
   - เขียนทับ: `getById(existingId)` เอา `doc_version` สด + `is_default` ปัจจุบัน →
     `update(existingId, {...fields, is_default: current.is_default, doc_version, change_type: 'import'})`
   - ไม่ส่ง `id` จากไฟล์
4. **สรุปผล** ใน dialog: สร้าง x · เขียนทับ y · ข้าม z · ล้มเหลว w (+เหตุผลต่อแถวจาก `getErrorDetail`)
   toast ตามความหมาย: ทั้งหมดสำเร็จ → `success`; บางส่วน → `warning`; ไม่มีอะไรให้ทำ → `info`
   แล้ว refetch ตาราง

## 4. ลำดับ deploy

1. **Backend ก่อน** (migration + 6 ฟิลด์ + endpoint) — push main → DEV deploy อัตโนมัติ (`build.yml` ไม่มีขั้น migrate;
   migration ไปทาง `deploy-gcp.yml` — ตรวจว่า apply แล้วจริงก่อน FE)
2. **FE** — ทำงานได้กับ backend เก่าบางส่วน: แผ่นเวอร์ชันซ่อนตัว (404), export ใช้ได้, import ใช้ได้แต่ 6 ฟิลด์หาย
   → **ห้าม ship FE ไป production (`vercel`) ก่อน backend ขึ้น** เพราะ import จะทำข้อมูลหายเงียบ
3. production: `git push origin main:vercel` หลังตรวจเบราว์เซอร์บน DEV ผ่าน

## 5. การตรวจ

ตาม `~/.claude/CLAUDE.md`: ไม่เขียนเทสต์ใหม่ระหว่างทำตามแผน — รัน typecheck + lint + test suite เดิมให้เขียว
(FE: `bun run typecheck`, `bun run lint`, `bun run test`; BE: check-types + jest ของ micro-cluster/gateway + audit gates)

**ตรวจมือ (เบราว์เซอร์ localhost:3304 กับ backend local):**
1. §0.1 ก่อนแก้: แก้ `source_name` → GET → ยืนยันว่าหาย; หลังแก้ → ค่าอยู่
2. save template 2 ครั้ง → แผ่นเวอร์ชันมี v ใหม่ 2 แถว, ป้าย `v{n}` บนหัวตรงกับแถว "ปัจจุบัน"
3. กางเวอร์ชันเก่า → diff XML แสดงถูกฝั่ง, กางซ้ำ = 0 request
4. restore → ได้ v ใหม่ "กู้จาก v{n}", `is_default` ไม่เปลี่ยน; เปิดสองแท็บแล้ว restore แท็บเก่า → 409 toast + refetch
5. export: เดี่ยวจาก Edit, เดี่ยวจากแถว, เลือก 3 แถว, ทั้งหมดพร้อม filter → เปิดไฟล์ดูว่าครบ 6 ฟิลด์
6. import ไฟล์จากข้อ 5: ทุกตัวขึ้น "ชื่อซ้ำ/ข้าม" → เปลี่ยนชื่อในไฟล์ 1 ตัว → ขึ้น "ใหม่"; เขียนทับ 1 ตัว →
   ได้เวอร์ชัน `change_type=import` และ 6 ฟิลด์ตรงกับไฟล์
7. import ไฟล์เสีย (JSON พัง, format ผิด, XML พัง 1 รายการ) → ข้อความถูก, รายการพังถูกล็อกข้าม
8. ผู้ใช้ที่มีแค่ `report_template.read` → เห็นแผ่นเวอร์ชัน/export แต่ไม่เห็นปุ่มกู้คืน/นำเข้า
9. จอ 390px (iframe probe ตาม `reference_iframe_viewport_probe`) → diff เป็น unified, แผ่นเวอร์ชันไม่ล้น

## 7. ชื่อ/คำอธิบายหลายภาษา (`name_i18n`, `description_i18n`)

เพิ่มกลางทางตามคำขอ user (2026-10-08) — แบบเดียวกับ widget `title_i18n`
(`apps/micro-cluster/src/cluster/dashboard-template/dashboard-template-title.ts`, FE commit `e13ab10` + `50fa243`)

### 7.1 Backend

- **migration แยก** `…_report_template_name_description_i18n` — **timestamp ก่อน** migration ตารางเวอร์ชัน (§1.1)
  เพื่อให้ snapshot ที่ backfill มีฟิลด์ i18n:
  ```sql
  ALTER TABLE "tb_report_template" ADD COLUMN IF NOT EXISTS "name_i18n" JSONB;
  ALTER TABLE "tb_report_template" ADD COLUMN IF NOT EXISTS "description_i18n" JSONB;
  UPDATE "tb_report_template" SET "name_i18n" = jsonb_build_object('en', btrim("name"))
   WHERE "name_i18n" IS NULL AND btrim("name") <> '';
  UPDATE "tb_report_template" SET "description_i18n" = jsonb_build_object('en', btrim("description"))
   WHERE "description_i18n" IS NULL AND "description" IS NOT NULL AND btrim("description") <> '';
  ```
- helper เดียว `report-template-i18n.ts` (`normalizeI18n`, `resolveNameWrite`, `resolveDescriptionWrite`) ใช้ใน create/update/restore:

  | | `name_i18n` | `description_i18n` |
  |---|---|---|
  | `en` | บังคับ (= `name`, unique) | ไม่บังคับ |
  | มี `th` ไม่มี `en` | 400 | ได้ — `description = null` |
  | เขียนคอลัมน์เดิม | `name = en` | `description = en ?? null` |
  | client เก่าส่งแค่คอลัมน์เดิม | merge `en` ลง i18n เดิม (TH รอด) | เหมือนกัน |
  | ค่า i18n ว่างทั้งก้อน | ใช้ไม่ได้ (name บังคับ) | `description = null`, `description_i18n = NULL` |

- **unique/เช็คชื่อซ้ำ/ค้นหา/จับคู่ import ผูกกับ `name` (EN) ตัวเดียว** — ไม่เปลี่ยน
- DTO: `name_i18n: { en: string.min(1), th?: string }` optional; `description_i18n: { en?: string, th?: string }`
  nullable optional; create ต้องมี `name` หรือ `name_i18n.en` (refine)
- restore: snapshot ที่ไม่มีฟิลด์ i18n → สร้างจากคอลัมน์เดิม (`{en: name}`)

### 7.2 Frontend

- `ReportTemplate` + `LocalizedText = { en?: string; th?: string }` (ใน `src/types/index.ts` ตาม rule 10)
- หน้า Edit: Name (EN)* + Name (TH), Description (EN) + Description (TH) — grid 2 คอลัมน์ที่ `lg`, ซ้อนบนมือถือ;
  save ส่งทั้ง `name`/`description` และ `name_i18n`/`description_i18n` (เผื่อ backend เก่า ตาม `50fa243`)
- เลือกภาษาแสดงด้วย util เดียว `pickLocalized(i18n, fallback, lang)` = `(lang==='th' && th) || en || th || fallback`
  ใช้ที่: หัวหน้า Edit (`PageHeader title`), คอลัมน์ name/description ในตาราง (อีกภาษาเป็นบรรทัดรอง `text-xs text-muted-foreground`),
  พรีวิว import, แผ่นเวอร์ชัน
- CSV export เพิ่ม `name_th`, `description_th`
- ไฟล์ backup มีทั้งสองฟิลด์; diff ฟิลด์ในแผ่นเวอร์ชันแสดง `name.th`, `description.th` แยก

### 7.3 ข้อจำกัดที่รู้แล้ว

- ช่องค้นหายังค้น `name` (EN)/`description`/`report_group` — **พิมพ์ภาษาไทยไม่เจอ** (paginate ค้นใน JSON ไม่ได้)
- micro-report + carmen-inventory-frontend-react ยังแสดง `name` (EN) — spec ถัดไป
- §5 เพิ่มตรวจ: กรอก TH ทั้งสองฟิลด์ → สลับภาษา → ตาราง/หัวเปลี่ยน; description มีแค่ TH → save ผ่าน;
  name มีแค่ TH → ถูกปฏิเสธฝั่ง FE ก่อนยิง; client เก่า (curl ส่งแค่ `name`) → `name_i18n.th` ไม่หาย

## 6. นอกขอบเขต

- import แบบ atomic / endpoint import ฝั่ง backend
- ช่อง `note` ต่อเวอร์ชัน, ตั้งชื่อ/ติดแท็กเวอร์ชัน
- retention/purge เวอร์ชัน
- export/import ไฟล์แบบ zip หรือแยก XML
- diff ระหว่างสองเวอร์ชันเก่า (เทียบได้เฉพาะ เวอร์ชันนั้น ↔ ปัจจุบัน)
- ค้นหาชื่อ/คำอธิบายภาษาไทยในตาราง
- แสดง `name_i18n`/`description_i18n` ใน micro-report และแอป inventory (spec ถัดไป)
