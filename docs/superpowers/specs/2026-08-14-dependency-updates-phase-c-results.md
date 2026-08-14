# Dependency Updates เฟส C — Results

**วันที่:** 2026-08-14
**Branch:** `chore/deps-phase-c-node-24`
**สเปก:** `2026-08-14-dependency-updates-phase-c-h-design.md`
**แผน:** `../plans/2026-08-14-dependency-updates-phase-c.md`

---

## 1. สรุป

| แพ็กเกจ / ไฟล์ | ก่อน | หลัง |
|---|---|---|
| `.nvmrc` | `20` | `24` |
| `package.json` `engines.node` | `"20.x"` | `"24.x"` |
| `@types/node` | `^20.19.43` | `^24.13.3` |
| `@testing-library/user-event` | `^14.6.3` | `^14.6.4` |
| `@typescript-eslint/eslint-plugin` | `^8.66.0` | `^8.67.0` |
| `@typescript-eslint/parser` | `^8.66.0` | `^8.67.0` |

**Commits (เรียงตามเวลา):**

| hash | เนื้อหา |
|---|---|
| `e2e5cd9` | สเปกเฟส C–H |
| `359a1da` | แผนลงมือเฟส C |
| `2d1abff` | แก้แผน — คืน tree ของ bun หลัง `npm ci` |
| `5891550` | แก้ baseline เทสต์ 1081 → 1049 ในสเปกและแผน |
| `0e00cb8` | **ยก Node runtime 20 → 24 LTS** |
| `7c74cd7` | **อัป user-event 14.6.4 + typescript-eslint 8.67.0** |

**ไม่มีไฟล์ใน `src/` ถูกแตะแม้แต่ไฟล์เดียว** — ตรวจด้วย `git status --short -- src/` หลังทุกขั้นที่แก้ dependency

## 2. ผล gate

| gate | ผล |
|---|---|
| `bun run typecheck` | ผ่าน ไม่มี error — แม้ `@types/node` ข้าม 4 major |
| `bun run lint` | ผ่าน 0 error 0 warning |
| `bun run test` | **1049 passed / 1049 · 131 ไฟล์** (เท่า baseline เป๊ะ) |
| `bun run build` | ผ่าน — built in 6.02s |
| `npm ci` | ผ่าน ไม่ฟ้อง lockfile drift (added 782 packages) |
| CI run | https://github.com/CarmenSoftware-organization/carmen-platform/actions/runs/31775879887 — `verify: success` · `verify (npm clean install): success` |

**หลักฐานว่ารันบน Node 24 จริง** (ไม่ใช่แค่เช็คเขียว) — จาก log ของ job `verify (npm clean install)`:

```
Set up Node   node-version-file: .nvmrc
Set up Node   Found in cache @ /opt/hostedtoolcache/node/24.19.0/x64
Set up Node   node: v24.19.0
```

เครื่องพัฒนาไม่มี Node 24 (Node 26 ล้วน ไม่มี nvm/fnm/volta/mise) gate ทุกตัวที่รันในเครื่องจึงรัน
บน Node 26 หรือผ่าน Bun — บรรทัด `node: v24.19.0` ข้างบนคือหลักฐานชิ้นเดียวที่พิสูจน์ Node 24

**หมายเหตุจาก CI:** GitHub annotate ว่า `actions/checkout@v4` และ `actions/setup-node@v4` ยัง target
Node.js 20 แล้วถูก runner บังคับให้รันบน Node 24 — เป็นเรื่องของ **runtime ของตัว action เอง**
ไม่เกี่ยวกับเวอร์ชัน Node ที่โปรเจกต์ใช้ build เป็นหนี้แยกใบ (อัป action เป็น `@v5`) ไม่ใช่ของเฟสนี้

## 3. `bun outdated` หลังเฟส C

เหลือ 11 รายการ **เป็น major ล้วน ไม่มี patch/minor ค้าง**

| แพ็กเกจ | ปัจจุบัน | latest | สถานะ |
|---|---|---|---|
| `@types/node` | 24.13.3 | 26.2.0 | **ตรึงโดยเจตนา** — ต้องตรงกับ `engines.node` |
| `eslint` | 9.39.5 | 10.8.1 | **บล็อก upstream** — `eslint-plugin-react@7.37.5` peer สูงสุด `^9.7` |
| `@eslint/js` | 9.39.5 | 10.0.1 | **บล็อก upstream** — ต้องเดินคู่เวอร์ชันกับ ESLint core |
| `jsdom` | 29.1.1 | 30.0.1 | เฟส D |
| `@testing-library/jest-dom` | 6.10.0 | 7.0.1 | เฟส D |
| `zod` | 3.25.76 | 4.4.3 | เฟส D |
| `react-markdown` | 9.1.0 | 10.1.0 | เฟส D |
| `lucide-react` | 0.563.0 | 1.31.0 | เฟส E |
| `@tanstack/react-table` | 8.21.3 | 9.1.2 | เฟส F |
| `typescript` | 5.9.3 | 7.0.2 | เฟส G |
| `tailwindcss` | 3.4.1 | 4.3.3 | เฟส H |

## 4. `bun audit` หลังเฟส C

**6 vulnerabilities (1 high, 5 moderate) — ไม่เปลี่ยนจากก่อนเริ่ม** ตามที่สเปกคาดไว้

- `undici` ×5 (1 high) ใต้ `jsdom` → มีโอกาสหลุดในเฟส D
- `uuid` ×1 (moderate) ใต้ `exceljs` → หนี้ รอ upstream

ทั้งคู่เป็น devDependency ไม่ขึ้น production bundle

## 5. สิ่งที่สเปกและแผนเดาผิด

**สี่จุด — ทุกจุดจับได้ตอนรันจริงหรือตอนตรวจสภาพแวดล้อม ไม่มีจุดไหนที่การรีวิวเอกสารจับได้**
(รูปแบบเดียวกับเฟส B เป๊ะ)

1. **จำนวนเทสต์ baseline ผิด** — สเปกและแผนเขียน `1081+` โดยคัดมาจาก handoff รอบก่อน
   ของจริงคือ **1049 ใน 131 ไฟล์** ตัวเลข 1081 เป็นของก่อน `61f6efc` ที่รื้อ `db_connection`
   ออกจาก frontend พร้อมเทสต์ของมัน **เกตที่อ้างตัวเลขสูงเกินจริงจะผ่านได้ทั้งที่จำนวนเทสต์
   ลดลงจริง** แก้โดยวัดสดบน branch เปล่า (`git stash` → รัน → `git stash pop`) แล้วตรึงตัวเลข
   ที่วัดเอง — commit `5891550`

2. **แผนขาดขั้นคืน tree ของ bun หลัง `npm ci`** — `npm ci` ลบ `node_modules` ทั้งก้อนแล้ว
   ติดตั้งใหม่ด้วย hoisting ของ npm แผนเดิมสั่ง `bun update` ต่อทันทีในทาสก์ถัดไป ซึ่งจะทำงาน
   บน tree ผิดชนิด และผลเทสต์ที่ได้จะไม่ใช่ผลของ tree ที่ dev ใช้จริง — commit `2d1abff`

3. **แผนไม่ได้คิดถึง dev server ที่รันอยู่** — ตอนเริ่มรัน มี `bun run dev:local` + vite ทำงาน
   บน `:3304` vite execute จาก `node_modules/.bin/vite` ซึ่ง `npm ci` กำลังจะลบ เพิ่มเป็น
   Global Constraint ให้ตรวจ `lsof -ti :3304` ก่อนเริ่มทุกทาสก์

4. **สเปกระบุว่ายังไม่รู้ว่า `deploy-gcs.yml` pin Node ไว้ตรงไหน** — ตรวจแล้ว **ไม่ pin เลย**
   ใช้ `oven-sh/setup-bun@v2` ล้วน ไม่มี `actions/setup-node` จึงไม่ต้องแก้

**จุดที่สเปกเดาถูก:** `verify.yml` อ่าน `.nvmrc` ผ่าน `node-version-file` จึงตามอัตโนมัติ ·
Vercel รองรับ `engines.node: "24.x"` · `@types/node` ข้าม 4 major แล้ว typecheck ยังสะอาด

## 6. ผลกระทบต่อเฟส D

**ปลดล็อกแล้ว** — `jsdom@30.0.1` ต้อง Node `^22.22.2 || ^24.15.0 || >=26.0.0` และ CI resolve
`.nvmrc` = `24` เป็น **24.19.0** ซึ่งผ่านเงื่อนไข `^24.15.0`

**ข้อควรระวังสำหรับเฟส D:** `engines.node` ที่เราประกาศคือ `"24.x"` ซึ่งกว้างกว่าที่ `jsdom@30`
ต้องการ — ในทางทฤษฎีมันอนุญาต Node 24.0–24.14 ซึ่ง `jsdom@30` ปฏิเสธ ตอนนี้ไม่เป็นปัญหาเพราะ
`.nvmrc` = `24` ทำให้ทั้ง CI และนักพัฒนาได้ตัวล่าสุดของสายเสมอ แต่ถ้าเฟส D เจอ `EBADENGINE`
บนเครื่องใครสักคน สาเหตุคือเครื่องนั้นตรึง Node 24 ไว้ต่ำกว่า 24.15 — ทางแก้คือยก Node ในเครื่อง
ไม่ใช่ผ่อน engines ของ jsdom

## 7. สิ่งที่ไม่ได้ทำ

- ไม่ deploy (`deploy-gcs.yml` เป็น manual `workflow_dispatch`) · ไม่ cut release
- ไม่แตะ `overrides` / `resolutions` — ยืนยันว่าสองบล็อกยัง `MATCH` กันหลังทุกการแก้
- ไม่อัป `actions/checkout@v4` → `@v5` และ `actions/setup-node@v4` → `@v5` (หนี้ใหม่จากข้อ 2)
