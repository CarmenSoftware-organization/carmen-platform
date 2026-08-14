# Dependency Updates เฟส E — Results

**วันที่:** 2026-08-14
**Branch:** `chore/deps-phase-e-lucide`
**สเปก:** `2026-08-14-dependency-updates-phase-c-h-design.md` §5 เฟส E
**แผน:** `../plans/2026-08-14-dependency-updates-phase-e.md`

---

## 1. สรุป

| แพ็กเกจ | ก่อน | หลัง |
|---|---|---|
| `lucide-react` | `^0.563.0` | `^1.31.0` |

| commit | เนื้อหา |
|---|---|
| `ebabc3b` | แผนลงมือเฟส E |
| `05d3041` | อัป lucide-react 0.563 → 1.31 |

**ไม่มีไฟล์ใน `src/` ถูกแตะแม้แต่ไฟล์เดียว** ทั้งที่สเปกคาดว่าจะต้องแก้ 118 ไฟล์

## 2. ผล gate

| gate | ผล |
|---|---|
| `bun run typecheck` | ผ่าน (เป็นตัวจับ `LucideIcon` type และ props ที่เปลี่ยน — ไม่มี error) |
| `bun run lint` | ผ่าน 0/0 |
| `bun run test` | **1049 passed / 131 ไฟล์** |
| `bun run build` | ผ่าน |
| `npm ci` | ผ่าน ไม่ฟ้อง lockfile drift |
| CI | run `31780498269` — success |

## 3. ผลตรวจไอคอน 86 ตัว

**วิธีตรวจ** (ทำ *ก่อน* อัป เพื่อให้แผนอิงของจริง):

1. สคริปต์ parse `import { … } from 'lucide-react'` ทั้ง `src/` แบบรองรับ import หลายบรรทัด
   และแยก `X as Y` → ได้ **86 ชื่อ unique** (+ `type LucideIcon`) กระจายใน **118 ไฟล์**
2. ติดตั้ง `lucide-react@1.31.0` แยกใน scratchpad แล้วเช็ค `name in module` ทีละชื่อ

**ผล: หายไป 0 ตัว** — ทุกชื่อที่ repo ใช้ยัง export อยู่ใน 1.31 ครบ

วิธีนี้ดีกว่าอ่าน changelog เพราะตอบคำถามที่ตรงกับ repo นี้จริง ๆ ("ไอคอน *ที่เราใช้* หายไหม")
แทนคำถามกว้าง ๆ ("upstream เปลี่ยนชื่ออะไรบ้าง") และไม่พึ่งความครบถ้วนของ release notes

## 4. ผลเทียบภาพก่อน/หลัง

เก็บภาพ 3 หน้าบน dev server (`--mode localhost`) ก่อนอัป แล้วเก็บซ้ำหน้าเดิมหลังอัป

| หน้า | ไอคอนที่ครอบคลุม | ผล |
|---|---|---|
| `/dashboard` | sidebar ~20 ตัว (LayoutDashboard, Network, Building2, Database, FileText, Users, Newspaper, Megaphone, BarChart3, MousePointerClick, AppWindow, Mail, Settings, ShieldCheck …) + ไอคอนใน timeline | **เหมือนเดิมทุกจุด** |
| `/business-units` | Download (Export), Plus, Search, Filter, MoreHorizontal + card view | **เหมือนเดิมทุกจุด** |
| `/sql-workbench` | Save, Database, ChevronsUpDown + sidebar | **เหมือนเดิมทุกจุด** |

ตรวจสี่อย่างตามแผน: ไอคอนไม่หาย/ไม่กลายเป็นกล่องว่าง · ความหนาเส้นเท่าเดิม · ขนาดเทียบกับ
ข้อความข้าง ๆ เท่าเดิม · การจัดตำแหน่งในปุ่ม (`mr-2 h-4 w-4`) ยังตรง

**นี่คือส่วนที่ไม่มีเครื่องมือ static ตัวไหนตรวจแทนได้** — 1.0 เป็น major bump ที่เปลี่ยน
default stroke หรือ viewBox ได้โดยไม่แตะ API เลย typecheck/lint/test จะเขียวหมดทั้งที่หน้าตาเพี้ยน

## 5. ขนาด bundle

| | รวมไฟล์ JS ใน `build/assets/` |
|---|---|
| ก่อน (lucide 0.563) | 2,570,687 bytes |
| หลัง (lucide 1.31) | 2,570,925 bytes |
| ต่าง | **+238 bytes (+0.01%)** |

เกณฑ์ในแผนคือ "โตเกิน 20% ให้รายงาน" — ห่างจากเกณฑ์มาก tree-shaking ไม่ถดถอย

## 6. ผลตรวจ supply chain

ระหว่างเฟสนี้มี background security review แจ้ง **supply-chain-dependency-confusion in package.json**
ตรวจแล้ว **เป็น false positive**:

| ตรวจ | 0.563.0 (เดิม) | 1.31.0 (ใหม่) |
|---|---|---|
| maintainer | `ericfennis <eric.fennis@gmail.com>` | เหมือนกัน |
| repository | `github.com/lucide-icons/lucide` | เหมือนกัน |
| publisher | — | GitHub Actions OIDC (`npm-oidc-no-reply@github.com`) = trusted publishing |
| resolved ใน lockfile | — | `https://registry.npmjs.org/lucide-react/-/lucide-react-1.31.0.tgz` + integrity hash |

`.npmrc` ของ repo มีแค่ `legacy-peer-deps=true` และ `fund=false` — ไม่มี custom registry
ที่จะถูกสวมได้ heuristic น่าจะจุดชนวนจาก major jump `0.x → 1.x` ซึ่งเป็นรูปแบบที่ package hijack
มักใช้ แต่ในกรณีนี้คือ lucide ออกจากช่วง 0.x ตามปกติของโปรเจกต์เอง

## 7. สิ่งที่สเปกเดาผิด

**หนึ่งจุด และเป็นจุดที่กำหนดรูปร่างของเฟสนี้ทั้งหมด**

สเปก §5 เฟส E เขียนว่า *"`lucide-react` 0.563→1.31 · 114 ไฟล์แต่เป็น mechanical rename ·
ทำแยกเพราะ diff ใหญ่จนกลบอย่างอื่นในรีวิว"* และแผนเดิมสั่งให้ *"ได้รายการ rename จริงจาก
upstream ก่อนแล้วจึงแก้"*

**ไม่มีอะไรต้อง rename เลย** — ไอคอนทั้ง 86 ตัวยังอยู่ครบ diff จริงคือ **1 บรรทัดใน `package.json`
บวก lockfile**

ผลตามมาคือความเสี่ยงของเฟสนี้ย้ายที่: จาก *"ชื่อไอคอนหาย"* (ซึ่ง tsc จับได้ทันที) ไปเป็น
*"ไอคอนวาดออกมาต่างจากเดิม"* (ซึ่งไม่มีเกตอัตโนมัติตัวไหนจับได้) แผนจึงถูกเขียนใหม่ให้ลงทุน
กับ visual baseline ก่อน/หลังแทนการไล่แก้ไฟล์ — **ถ้าทำตามสเปกตรง ๆ จะเสียเวลาไปกับการ
หา rename ที่ไม่มีอยู่ และไม่ได้ตรวจสิ่งที่เสี่ยงจริง**

บทเรียน: **ประมาณการขนาดงานในสเปกคือสมมติฐาน ไม่ใช่ข้อเท็จจริง** ตรวจให้จบก่อนวางแผนว่าจะแก้
กี่ไฟล์ — การตรวจครั้งนี้ใช้เวลาไม่กี่นาทีและเปลี่ยนทั้งรูปร่างของเฟส

## 8. สถานะ dependency หลังเฟส E

**`bun audit`: 1 (moderate)** — `uuid <11.1.1` ใต้ `exceljs` เท่านั้น ไม่เปลี่ยนจากเฟส D

**`bun outdated`: 7 → 6 รายการ**

| แพ็กเกจ | ปัจจุบัน | latest | สถานะ |
|---|---|---|---|
| `@types/node` | 24.13.3 | 26.2.0 | ตรึงโดยเจตนา |
| `eslint` / `@eslint/js` | 9.39.5 | 10.8.1 / 10.0.1 | บล็อก upstream |
| `@tanstack/react-table` | 8.21.3 | 9.1.2 | เฟส F |
| `typescript` | 5.9.3 | 7.0.2 | เฟส G |
| `tailwindcss` | 3.4.1 | 4.3.3 | เฟส H |

## 9. ผลกระทบต่อเฟส F

ไม่มีอะไรบล็อก เฟส F (`@tanstack/react-table` 8 → 9) เป็นเฟสที่เสี่ยงกว่าเฟส E มากเพราะ
**v9 เป็นเวอร์ชันที่ API เปลี่ยนจริง** (ต่างจาก lucide ที่แค่ขยับเลข) และแตะ
`src/components/ui/data-table.tsx` ซึ่งเป็นหัวใจของทุก Management page

สิ่งที่เฟส F ควรทำแบบเดียวกับเฟสนี้: **ตรวจ API surface ที่ repo ใช้จริงก่อนวางแผน** — จาก
การนับไว้แล้วคือ `ColumnDef` ×44 (type ล้วน), `flexRender` ×9, `getFilteredRowModel` ×4,
`getSortedRowModel`/`getPaginationRowModel`/`getCoreRowModel` ×3, `useReactTable` ×2,
`RowSelectionState` ×2 — เช็คทีละตัวว่ายังมีใน v9 ไหมก่อนตัดสินว่าเป็นงานใหญ่หรือเล็ก

## 10. สิ่งที่ไม่ได้ทำ

- ไม่ deploy · ไม่ cut release · ไม่แตะ `overrides`/`resolutions` (ยืนยัน `MATCH`)
- ไม่แก้ flakiness ของ `BusinessUnitEdit.test.tsx` (หนี้จากเฟส D)
