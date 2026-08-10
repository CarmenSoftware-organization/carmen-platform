# อัปเดต dependencies เฟส A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** อัปเดต 27 แพ็กเกจที่อยู่ใน semver range เดิมให้เป็นเวอร์ชันล่าสุด ปิดช่องโหว่ที่ปิดได้ในเฟสนี้ และทบทวนบล็อก `overrides`/`resolutions` ทั้ง 8 ตัว โดยไม่แตะซอร์สโค้ดใน `src/` แม้แต่บรรทัดเดียว

**Architecture:** งานนี้ไม่มีการเขียนโค้ด — เป็น dependency update ล้วน แบ่งเป็น 3 คอมมิตใน 1 PR เรียงตามความเสี่ยง (lockfile → overrides → เอกสาร) เพื่อให้ revert ได้ตรงจุดเมื่อ verification เจอปัญหา ความเสี่ยงจริงกระจุกอยู่ที่ Radix 9 ตัวซึ่ง unit test จับไม่ได้ จึงชดเชยด้วย browser gate ที่เจาะ 4 จุดในโค้ดที่พึ่งพา internal behavior ของ Radix `DismissableLayer` โดยตรง

**Tech Stack:** Bun 1.3.14 (package manager หลัก), npm (ชั้น mirror Vercel ผ่าน `.npmrc` ที่มี `legacy-peer-deps=true`), Vite 8, Vitest 4, React 19, Radix UI

**Spec:** `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md`

## Global Constraints

- **ห้ามแก้ไฟล์ใดๆ ใน `src/`** — ถ้า `bun update` ทำให้ต้องแก้โค้ด แปลว่ามีบางอย่างไม่ใช่ minor จริง **ให้หยุดและรายงาน** ไม่ใช่แก้โค้ดตามไปเงียบๆ
- **`overrides` (npm) และ `resolutions` (bun/yarn) ต้องมีเนื้อหาเหมือนกันเป๊ะเสมอ** — ถ้าไม่ตรงกัน bun กับ npm จะได้ dependency tree คนละแบบ ซึ่งเป็นความล้มเหลวแบบเดียวกับบั๊ก `react-is` ที่เคยทำ Vercel build พังสองรอบ (commit `bef7fac`) **`npm ci` ไม่ใช่เครื่องพิสูจน์ว่าสองบล็อกตรงกัน** — npm อ่านเฉพาะ `overrides` และไม่สนใจ `resolutions` เลย ถ้าสองบล็อกหลุดจากกัน `npm ci` จะผ่านเงียบๆ (มันพิสูจน์แค่ว่า npm ติดตั้งได้จาก `overrides` และ lockfile ที่ sync กัน) ต้องตรวจว่าสองบล็อกตรงกันด้วย JSON compare ตรงๆ ต่างหาก
- **Branch:** `chore/deps-phase-a-safe-updates` (มีอยู่แล้ว มี spec commit `898b6e3` อยู่บนนั้น) → PR กลับเข้า `main` เท่านั้น **ห้าม push หรือ merge ไป `DEV` / `UAT`**
- **ห้าม cut release** — ไม่แตะ `src/data/changelog.json` และไม่รัน `bun run build:bump`
- **ห้าม deploy** — `deploy-gcs.yml` เป็น manual `workflow_dispatch` อยู่แล้ว ปล่อยไว้อย่างนั้น
- **ห้ามเขียน test ใหม่** — ไม่สร้าง `*.test.ts` / `*.test.tsx` ใดๆ ชุดเทสต์ที่มีอยู่ต้องผ่านทั้งหมด แต่ไม่เพิ่มของใหม่
- **ห้ามรัน E2E** (`../carmen-platform-e2e`) — อยู่นอกขอบเขตที่ตกลงไว้
- ทุก commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Baseline ที่วัดไว้แล้ว (2026-08-10 ก่อนเริ่มงาน)

ตัวเลขชุดนี้วัดจริงบน `main` @ `0a5f901` ใช้เป็นฐานเทียบใน Task 5 **ไม่ต้องวัดซ้ำ**

```
bun audit: 16 vulnerabilities (9 high, 7 moderate)
```

| แพ็กเกจ | เวอร์ชัน baseline |
|---|---|
| `postcss` | 8.5.16 |
| `nanoid` | 3.3.15 |
| `brace-expansion` | 2.1.1 |
| `@radix-ui/react-dialog` | 1.1.18 |
| `js-yaml` | 4.1.1 |
| `minimatch` | 3.1.5 |
| `picomatch` | 2.3.2 |
| `follow-redirects` | 1.16.0 |
| `yaml` | 2.9.0 |
| `flatted` | 3.4.2 |
| `path-to-regexp` | ไม่มีใน tree |

ช่องโหว่ทั้ง 16 รายการแยกตามต้นตอ:

| ต้นตอ | ระดับ | ปิดได้ในเฟส A? |
|---|---|---|
| `postcss` ≤8.5.22 — path traversal ผ่าน `sourceMappingURL` (GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp) | high + moderate | ✅ ใช่ |
| `nanoid` <3.3.16 — infinite loop ×2 (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8) | high ×2 | ✅ ใช่ (ขยับตาม postcss) |
| `brace-expansion` — DoS ×3 (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-3jxr-9vmj-r5cp) | high ×3 | ✅ ใช่ |
| `js-yaml` 4.0.0–4.1.1 — quadratic DoS ×3 (GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj) ผ่าน `eslint › @eslint/eslintrc › js-yaml` | high ×2 + moderate | ❌ ไม่ — ติดใต้ ESLint 8 ต้องรอเฟส B |

---

### Task 1: อัปเดต lockfile ด้วย `bun update`

**Files:**
- Modify: `bun.lock`
- Modify: `package.json` (เฉพาะ semver range ใน `dependencies` / `devDependencies` — **ห้ามแตะบล็อก `overrides` / `resolutions`** นั่นเป็นงานของ Task 2)

> **แก้ระหว่างทาง (2026-08-10):** แผนฉบับแรกเขียนว่า task นี้เป็น lockfile-only ซึ่ง **ผิด** — `bun update` ของ bun 1.3.14 เขียน `package.json` ด้วยเสมอ (`--save` เป็น default) โดยไล่ bump caret range ให้ตรงเวอร์ชันที่ resolve ได้ (`^19` → `^19.2.8`, `^1.1.18` → `^1.1.23`) `--no-save` ใช้แทนไม่ได้เพราะมันไม่เขียน lockfile ด้วย ผู้ใช้ตัดสินให้ **ยอมรับและคอมมิต `package.json` ไปด้วย** ด้วยเหตุผลเดียวกับที่ยก `brace-expansion` pin: floor ที่ต่ำกว่าความจริงคือสิ่งที่ปล่อยให้เวอร์ชันมีช่องโหว่กลับมาได้เงียบ ๆ ตอน lockfile ถูกสร้างใหม่

**Interfaces:**
- Consumes: baseline ในหัวข้อด้านบน
- Produces: เวอร์ชันจริงหลังอัปของ `postcss`, `nanoid`, `brace-expansion`, `@radix-ui/react-dialog` ซึ่ง Task 2 ใช้ตัดสินว่าต้องยก pin `brace-expansion` และ `postcss` หรือไม่ และ Task 5 ใช้เขียนตารางก่อน/หลัง

- [ ] **Step 1: ยืนยันว่าอยู่บน branch ที่ถูกต้องและ working tree สะอาดพอ**

```bash
git branch --show-current
git status --short
```

Expected: branch คือ `chore/deps-phase-a-safe-updates` และไม่มีไฟล์ใน `src/` หรือ `package.json` / `bun.lock` ค้าง staged อยู่
(ถ้ามี `M CLAUDE.md` หรือ `?? .claude/skills/` ค้างอยู่ ไม่เป็นไร — ปล่อยไว้ ห้าม stage เข้าคอมมิตนี้)

- [ ] **Step 2: รัน `bun update`**

```bash
bun update
```

- [ ] **Step 3: ตรวจว่าเปลี่ยนแค่ `bun.lock` กับ semver range ใน `package.json`**

```bash
git diff --name-only
git diff package.json | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | head -80
```

Expected: มีแค่ `bun.lock` และ `package.json`

ใน diff ของ `package.json` ต้องเห็นเฉพาะการ bump semver range ใน `dependencies` / `devDependencies` เท่านั้น

**ถ้าบล็อก `overrides` หรือ `resolutions` เปลี่ยน → หยุดทันที** อย่าคอมมิต รายงานว่า `bun update` แตะ pin ที่เป็นงานของ Task 2 แล้วรอคำสั่ง
**ถ้ามีไฟล์ใน `src/` โผล่มา → หยุดทันที** เช่นกัน

- [ ] **Step 4: ตรวจเวอร์ชันจริงตามเกณฑ์ทั้ง 4 ข้อ**

```bash
bun pm ls --all 2>/dev/null | grep -E "postcss@|nanoid@|brace-expansion@|@radix-ui/" | sed 's/^[^a-z@]*//' | sort -u
```

เกณฑ์ผ่าน:

| แพ็กเกจ | ต้องได้ | ถ้าไม่ได้ |
|---|---|---|
| `postcss` | > 8.5.22 (คาด 8.5.26) | บันทึกไว้ → Task 2 จะยก pin `postcss` ให้ |
| `nanoid` | ≥ 3.3.16 | ตรวจว่ามี postcss เก่าค้างใน tree จากที่อื่นหรือไม่ แล้วบันทึกไว้ |
| `brace-expansion` | 2.1.4 | บันทึกไว้ → Task 2 จะยก pin เป็น `^2.1.4` ให้ |
| `@radix-ui/react-dialog` | 1.1.23 (และ Radix ตัวอื่นขยับตามตาราง 2.1 ของ spec) | ตรวจว่ามี transitive pin กดไว้หรือไม่ แล้วรายงาน |

**บันทึกผลจริงของทั้ง 4 ตัวไว้ส่งต่อ Task 2 และ Task 5** — ตัวเลขเหล่านี้คือ input ของสองงานนั้น

- [ ] **Step 5: เก็บผล audit หลังอัป**

```bash
bun audit 2>&1 | tail -40
```

บันทึกจำนวนช่องโหว่ที่เหลือ (รูปแบบ `N vulnerabilities (X high, Y moderate)`) และรายชื่อแพ็กเกจที่ยังค้าง — Task 5 ต้องใช้

- [ ] **Step 6: Commit**

```bash
git add bun.lock package.json
git commit -m "$(cat <<'EOF'
chore(deps): bun update ทั้ง 27 แพ็กเกจในช่วง semver เดิม

Radix 9 ตัว, react/react-dom 19.2.8, axios 1.19.0, vite 8.2.1,
vitest 4.1.10, postcss 8.5.26 และอื่นๆ

bun update เขียน package.json ด้วย (--save เป็น default) — ยก caret range
ให้ตรงเวอร์ชันที่ resolve ได้จริง ทำให้ floor สะท้อนความจริงและกันการถอย
กลับไปเวอร์ชันเก่าตอน lockfile ถูกสร้างใหม่ ไม่แตะ overrides/resolutions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**หมายเหตุที่ต้องรู้ก่อนไป Task 2:** `bun update` เพียงลำพัง **ปิดช่องโหว่ไม่ได้เลยสักตัว** — วัดแล้วได้ 16 vulnerabilities เท่า baseline เป๊ะ เพราะ `postcss@8.5.16` และ `nanoid@3.3.15` ยังค้างอยู่ในทรีคู่กับตัวใหม่ (override `^8.5.6` อนุญาตให้ตัวเก่าอยู่ได้) และ `brace-expansion` ไม่ขยับจาก 2.1.1 เลย ตัวที่ปิดช่องโหว่จริงคือการยก override ใน Task 2 — สลับกับที่ spec ฉบับแรกเข้าใจ

---

### Task 2: ทบทวน `overrides` / `resolutions` ทั้ง 8 ตัว

**Files:**
- Modify: `package.json:140-159` (บล็อก `overrides` และ `resolutions`)
- Modify: `bun.lock` (เปลี่ยนตามหลัง `bun install`)

**Interfaces:**
- Consumes: เวอร์ชันจริงของ `brace-expansion` และ `postcss` จาก Task 1 Step 4
- Produces: บล็อก `overrides`/`resolutions` ชุดใหม่ที่ npm และ bun อ่านตรงกัน — Task 3 Step 5 (`npm ci`) พิสูจน์ว่า npm ติดตั้งได้จาก `overrides` และ lockfile ที่ sync กัน (npm ไม่อ่าน `resolutions` เลย จึงพิสูจน์สองบล็อกตรงกันไม่ได้ด้วยตัวเอง) — ความตรงกันของสองบล็อกต้องตรวจด้วย JSON compare ตรงๆ

- [ ] **Step 1: ตัดสินใจต่อ `brace-expansion` จากผล Task 1**

**ยก pin เป็น `^2.1.4` ทั้งใน `overrides` และ `resolutions` ไม่ว่า Task 1 จะได้เวอร์ชันอะไร** — ต่างกันแค่ผลข้างเคียง:

- ถ้า Task 1 ได้ 2.1.4 อยู่แล้ว → การยก pin ไม่เปลี่ยน lockfile แต่ทำให้ floor สะท้อนความจริง
- ถ้ายังค้าง 2.1.1 → การยก pin จะดัน lockfile ขึ้นตอน `bun install` ใน Step 4

เหตุผลที่ต้องยกแม้ lockfile ถูกแล้ว: จุดประสงค์ของ security pin คือกำหนด **floor ที่ปลอดภัย** การปล่อย `^2.0.2` ไว้แปลว่า floor ยังอยู่ที่เวอร์ชันที่มีช่องโหว่ ครั้งหน้าที่ lockfile ถูกสร้างใหม่ก็ตกกลับไปที่เดิมได้เงียบๆ — ซึ่งคือสิ่งที่เพิ่งเกิดขึ้นรอบนี้ (dist-tag `maintenance-v2` ชี้ที่ 2.1.4 ซึ่งอยู่ในช่วง `^2.0.2` อยู่แล้ว แต่ lockfile ตรึงไว้ที่ 2.1.1 มาตลอด)

- [ ] **Step 2: ตัดสินใจต่อ `postcss` จากผล Task 1**

- ถ้า Task 1 ได้ `postcss` 8.5.26 → **ยก pin จาก `^8.5.6` เป็น `^8.5.26`** เพื่อไม่ให้ pin ต่ำกว่าเวอร์ชันจริงที่ใช้อยู่ (pin ที่ต่ำกว่าของจริงไม่ได้กดเวอร์ชันลง แต่มันโกหกคนอ่านว่า floor อยู่ตรงไหน)
- ถ้า Task 1 ได้ต่ำกว่า 8.5.22 → **ยก pin เป็น `^8.5.26`** แล้วรัน `bun install` ให้ tree ขยับตาม

- [ ] **Step 3: แก้บล็อก `overrides` และ `resolutions` ให้เป็นชุดใหม่**

ลบ `path-to-regexp` ออกทั้งสองบล็อก (ยืนยันแล้วว่าไม่มีใน dependency tree — หลุดไปตอนอัป `react-router` เป็น v7 ใน commit `1dce1e4`) และใส่คอมเมนต์กำกับทุก pin

ผลลัพธ์ที่ต้องได้ (สมมติ Task 1 พา `brace-expansion` ขึ้น 2.1.4 และ `postcss` ขึ้น 8.5.26 — ถ้าไม่ใช่ ปรับตัวเลขตาม Step 1–2):

```jsonc
  "overrides": {
    "brace-expansion": "^2.1.4",
    "minimatch": "^3.1.2",
    "picomatch": "^2.3.1",
    "postcss": "^8.5.26",
    "follow-redirects": "^1.15.6",
    "yaml": "^2.3.4",
    "flatted": "^3.3.2"
  },
  "resolutions": {
    "brace-expansion": "^2.1.4",
    "minimatch": "^3.1.2",
    "picomatch": "^2.3.1",
    "postcss": "^8.5.26",
    "follow-redirects": "^1.15.6",
    "yaml": "^2.3.4",
    "flatted": "^3.3.2"
  }
```

**`package.json` เป็น JSON ธรรมดา ใส่คอมเมนต์ในไฟล์ไม่ได้** — เอาคำอธิบายไปไว้ใน commit message ของ Step 6 แทน ห้ามพยายามใส่ `//` ลงในไฟล์

- [ ] **Step 4: ติดตั้งใหม่ให้ lockfile สอดคล้องกับ overrides ชุดใหม่**

```bash
bun install
```

- [ ] **Step 5: ยืนยันว่า pin ที่คงไว้ยังไม่มีช่องโหว่ และ dead pin หายไปแล้ว**

```bash
bun pm ls --all 2>/dev/null | grep -E "brace-expansion@|minimatch@|picomatch@|follow-redirects@|yaml@|flatted@|path-to-regexp@" | sed 's/^[^a-z@]*//' | sort -u
bun audit 2>&1 | tail -30
```

เกณฑ์ผ่าน:
- ไม่มี `path-to-regexp` ปรากฏ (ยืนยันว่าลบ pin แล้วไม่มีใครพากลับมา)
- `brace-expansion` ≥ 2.1.4
- `minimatch`, `picomatch`, `follow-redirects`, `yaml`, `flatted` ไม่ปรากฏใน `bun audit`
- `js-yaml` **ยังปรากฏอยู่** — ถูกต้องแล้ว มันติดใต้ ESLint 8 เฟสนี้แก้ไม่ได้ (อย่าพยายามเพิ่ม pin `js-yaml` เพื่อไล่มันออก — การ pin transitive dep ของ ESLint ข้าม major อาจทำให้ ESLint ทำงานผิดโดยไม่มีอะไรเตือน)

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
chore(deps): ทบทวน overrides/resolutions ทั้ง 8 ตัว

- ลบ path-to-regexp: dead pin ไม่มีใน dependency tree แล้วตั้งแต่อัป react-router v7
- ยก brace-expansion เป็น ^2.1.4: pin เดิม ^2.0.2 ปล่อยให้ lockfile ค้างที่ 2.1.1 ซึ่งยังโดน DoS ×3
- ยก postcss ให้ตรงกับเวอร์ชันจริงที่ใช้อยู่ ไม่ให้ pin โกหกว่า floor ต่ำกว่าความจริง
- คงอีก 5 ตัวไว้: minimatch, picomatch, follow-redirects, yaml, flatted

หมายเหตุ: pin ชื่อ `yaml` ไม่เกี่ยวกับช่องโหว่ของ `js-yaml` — คนละแพ็กเกจ
ช่องโหว่ js-yaml ห้อยอยู่ใต้ eslint@8 ต้องรอเฟส ESLint

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Static verification gate

**Files:** ไม่มีไฟล์เปลี่ยน — task นี้ผลิต *หลักฐาน* ไม่ใช่โค้ด

**Interfaces:**
- Consumes: dependency tree หลัง Task 1 + Task 2
- Produces: ผลผ่าน/ไม่ผ่านของทั้ง 5 คำสั่ง ซึ่ง Task 4 จะไม่เริ่มจนกว่าชุดนี้เขียวหมด

- [ ] **Step 1: Type check**

```bash
bun run typecheck
```

Expected: จบด้วย exit code 0 ไม่มี error

- [ ] **Step 2: Lint**

```bash
bun run lint
```

Expected: จบด้วย exit code 0
(warning ยอมรับได้ — repo นี้ตั้ง `@typescript-eslint/no-unused-vars` เป็น `warn` — แต่ error ไม่ได้)

- [ ] **Step 3: ชุดเทสต์เต็ม**

```bash
bun run test
```

Expected: ผ่านทั้งหมด ไม่มี failed
**ถ้ามีเทสต์ล้ม → หยุดและรายงานชื่อเทสต์ที่ล้มพร้อม error จริง** ห้ามแก้เทสต์ให้ผ่าน และห้ามแก้ `src/` (ดู Global Constraints)

- [ ] **Step 4: Build ด้วย bun**

```bash
bun run build
```

Expected: build สำเร็จ ได้ output ที่ `build/`
(คำสั่งนี้รัน ESLint + tsc ผ่าน `vite-plugin-checker` อีกรอบระหว่าง build)

- [ ] **Step 5: Build ด้วย npm — ชั้น mirror Vercel**

```bash
rm -rf node_modules
npm ci
npm run build
```

Expected: ทั้ง `npm ci` และ `npm run build` สำเร็จ

ชั้นนี้พิสูจน์ว่า npm ติดตั้งได้จาก `overrides` และ `package-lock.json` ที่ sync กัน — **ไม่ใช่**
ตัวพิสูจน์ว่า `overrides` (npm อ่าน) กับ `resolutions` (bun อ่าน) ตรงกัน เพราะ npm ไม่อ่าน
`resolutions` เลย ถ้าสองบล็อกหลุดจากกัน `npm ci` จะผ่านเงียบๆ ความตรงกันของสองบล็อกต้องตรวจ
ด้วย JSON compare ตรงๆ ต่างหาก (ดู Task 2 Step 5)
**ถ้า `npm ci` พังแต่ bun ผ่าน → ปัญหาอยู่ที่ Task 2 ให้กลับไปตรวจว่า `overrides` กับ `package-lock.json` sync กันหรือไม่**

- [ ] **Step 6: คืน `node_modules` ให้เป็นของ bun**

```bash
bun install
```

จำเป็นก่อนไป Task 4 — `node_modules` ที่ npm ติดตั้งไว้มีโครงต่างจากของ bun และ dev server อาจทำงานผิดปกติ

- [ ] **Step 7: ยืนยันว่าไม่มีไฟล์เปลี่ยนโดยไม่ตั้งใจ**

```bash
git status --short
```

Expected: ไม่มี `bun.lock` หรือ `package.json` โผล่มาใหม่
(ถ้า `bun.lock` เปลี่ยนหลัง `npm ci` → `bun install` แปลว่าสองตัวจัดการ tree ไม่ตรงกัน ให้ตรวจ diff ก่อนตัดสินใจ)

---

### Task 4: Browser verification gate

**Files:** ไม่มีไฟล์เปลี่ยน — task นี้ผลิตรายงานสิ่งที่เห็นจริงในเบราว์เซอร์

**Interfaces:**
- Consumes: static gate ที่เขียวแล้วจาก Task 3
- Produces: ผลตรวจ 4 จุดเปราะ + 10 Radix primitives ซึ่ง Task 5 บันทึกลงเอกสารและใส่ใน PR description

**เหตุผลที่ task นี้มีอยู่:** Radix minor bump เปลี่ยน internal behavior ของ `DismissableLayer` ได้โดยไม่ถือเป็น breaking change และโค้ดในรีโปนี้พึ่งพาพฤติกรรมนั้นอยู่ 4 จุด ซึ่ง unit test ไม่ครอบคลุมเพราะเป็นเรื่อง focus/keyboard จริง

- [ ] **Step 1: เปิด dev server**

```bash
bun run dev:dev
```

รันแบบ background แล้วรอจน Vite พิมพ์ URL — เซิร์ฟเวอร์อยู่ที่ `http://localhost:3304` ต่อ backend DEV ผ่าน `.env.dev`

- [ ] **Step 2: ล็อกอิน**

เปิดเบราว์เซอร์ไปที่ `http://localhost:3304` แล้วล็อกอิน

**ถ้าล็อกอินไม่ได้ → หยุดและถามผู้ใช้** อย่าพยายามเดา credential และอย่าข้ามไป Step ถัดไป — บน DEV มีผู้ใช้เพียงไม่กี่คนที่เข้าแอปนี้ได้ การล็อกอินไม่ผ่านอาจไม่ใช่ผลจากการอัปเดต

- [ ] **Step 3: ตรวจกลุ่ม 1 — 4 จุดที่พึ่งพา Radix internals**

ไล่ตามลำดับนี้ แต่ละข้อต้องเห็นผลจริงก่อนติ๊ก:

| # | ที่ | วิธีทำ | ต้องเห็นอะไร |
|---|---|---|---|
| 1 | `/platform/super-admins` (`SuperAdminManagement.tsx:366`) | เปิด dialog เพิ่ม super admin → คลิกช่อง typeahead ให้ dropdown เปิด → กด **Escape ครั้งเดียว** | ปิดแค่ typeahead **dialog ต้องยังเปิดอยู่** — ถ้า dialog ปิดไปด้วย = ref guard ไม่ทำงานแล้ว |
| 2 | `/platform/user-platform` → Grant Access (`GrantAccessDialog.tsx:114`) | เปิด dialog → เปิด user picker ข้างใน → Escape ครั้งเดียว | เหมือนข้อ 1 — ปิดทีละชั้น |
| 3 | `/tenant-imports` → เปิด StepPanel dialog (`StepPanel.tsx:435`) | เลือก BU แล้วเปิด dialog ของ step ใดก็ได้ | โฟกัสต้องไปที่ element ที่ตั้งใจ **ไม่กระโดดไปที่ container ของ dialog** ตาม `onOpenAutoFocus` guard |
| 4 | `UserPicker` ในทั้งสองที่ข้างบน (`UserPicker.tsx:78`) | เปิด picker → พิมพ์ค้นหา → Escape | ปิดแค่ picker ไม่ทะลุไปปิด dialog แม่ |

- [ ] **Step 4: ตรวจกลุ่ม 2 — กวาด 10 Radix primitives ด้วย 3 หน้า**

| หน้า | ต้องกดอะไร | primitives ที่ครอบ |
|---|---|---|
| หน้าใดก็ได้ | เปิด user menu มุมขวาบน, ย่อ sidebar แล้ว hover ไอคอน | `dropdown-menu`, `avatar`, `tooltip`, `slot` |
| `/clusters` | เปิด filter Sheet, เปลี่ยนค่าใน Select, กดลบสัก 1 แถวให้ ConfirmDialog เด้ง (**กด Cancel ไม่ต้องลบจริง**) | `dialog`, `select`, `separator` |
| `/report-templates/:id/edit` (เปิด template ใดก็ได้จาก `/report-templates`) | สลับ tab Dialog XML ↔ Content XML ↔ Preview แล้วลองพิมพ์ใน editor | `tabs`, `label` + CodeMirror ใน `<div hidden>` ต้องยังพิมพ์ได้ |

- [ ] **Step 5: จ้องอาการที่ Radix minor bump ชอบทำพัง**

ระหว่างทำ Step 3–4 ให้สังเกต 4 อาการนี้เป็นพิเศษ:

| อาการ | วิธีสังเกต |
|---|---|
| focus trap หลุด | กด Tab วนใน dialog แล้วโฟกัสหลุดออกไปโดนอะไรข้างหลัง |
| scroll lock ค้าง | ปิด dialog แล้ว scroll หน้าหลักไม่ได้ |
| z-index portal ผิดชั้น | dropdown/tooltip โผล่ *ใต้* dialog หรือใต้ sticky bar |
| keyboard nav ใน Select | ลูกศรขึ้น/ลง, Enter, พิมพ์ตัวอักษรเพื่อ jump — ต้องทำงานครบ |

- [ ] **Step 6: ปิด dev server แล้วรายงานผล**

รายงานเป็นรายการว่าแต่ละข้อใน Step 3–5 **ผ่าน / ไม่ผ่าน** พร้อมสิ่งที่เห็นจริง

**ถ้ามีข้อใดไม่ผ่าน → หยุด ไม่ต้องไป Task 5** รายงานว่าข้อไหนพัง แล้วเสนอให้ revert Task 1 แล้วอัป Radix ทีละตัวเพื่อหาตัวที่ผิด

---

### Task 5: เอกสารช่องโหว่ค้าง + เปิด PR

**Files:**
- Create: `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-results.md`

**Interfaces:**
- Consumes: เวอร์ชันจริงจาก Task 1 Step 4, ผล audit จาก Task 1 Step 5 และ Task 2 Step 5, ผล browser จาก Task 4 Step 6
- Produces: PR พร้อมรีวิว

- [ ] **Step 1: เขียนเอกสารผลลัพธ์**

สร้าง `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-results.md` โดยใช้โครงนี้ **แล้วเติมด้วยตัวเลขจริงที่วัดได้ ไม่ใช่ตัวเลขที่คาดไว้ในแผน**:

```markdown
# ผลการอัปเดต dependencies เฟส A

**วันที่:** 2026-08-10
**Branch:** `chore/deps-phase-a-safe-updates`
**Spec:** `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md`

## 1. ผล bun audit ก่อน/หลัง

| | ก่อน | หลัง |
|---|---|---|
| รวม | 16 | _(เติมตัวเลขจริง)_ |
| high | 9 | _(เติม)_ |
| moderate | 7 | _(เติม)_ |

## 2. เวอร์ชันของแพ็กเกจที่เป็นเกณฑ์

| แพ็กเกจ | ก่อน | หลัง | ปิดช่องโหว่ได้ไหม |
|---|---|---|---|
| `postcss` | 8.5.16 | _(เติม)_ | _(เติม)_ |
| `nanoid` | 3.3.15 | _(เติม)_ | _(เติม)_ |
| `brace-expansion` | 2.1.1 | _(เติม)_ | _(เติม)_ |
| `@radix-ui/react-dialog` | 1.1.18 | _(เติม)_ | — |

## 3. ช่องโหว่ที่ยังค้าง และเหตุผล

_(เติมรายการจริงจาก bun audit ครั้งสุดท้าย)_

`js-yaml` 4.1.1 — high ×2 + moderate ×1 (GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m,
GHSA-5p4m-2wfm-xmqj) ห้อยอยู่ใต้ `eslint@8.57.1 › @eslint/eslintrc › js-yaml`
ปลดล็อกได้ก็ต่อเมื่อขึ้น ESLint 9+ ซึ่งบังคับให้ย้ายจาก `eslintConfig` ใน `package.json`
ไปเป็น flat config `eslint.config.js` → **เฟส B ตาม roadmap ในเอกสาร design หัวข้อ 7**

## 4. การเปลี่ยนแปลงบล็อก overrides/resolutions

_(เติมสรุปว่าตัวไหนลบ ตัวไหนยก ตัวไหนคงไว้ พร้อมเวอร์ชันที่ resolve ได้จริง)_

## 5. ผล verification

**Static gate:** _(เติมผลทั้ง 5 คำสั่ง พร้อมจำนวนเทสต์ที่ผ่าน)_

**Browser gate:** _(เติมผล 4 จุดเปราะ + 3 หน้ากวาด primitives + 4 อาการที่จ้อง)_
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-results.md
git commit -m "$(cat <<'EOF'
docs(deps): บันทึกผล audit ก่อน/หลัง และช่องโหว่ที่ยังค้าง

js-yaml (high ×2 + moderate) ยังค้างเพราะห้อยใต้ eslint@8 — ปลดได้ในเฟส B
ที่ต้องย้ายไป flat config

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push branch**

```bash
git push -u origin chore/deps-phase-a-safe-updates
```

- [ ] **Step 4: เปิด PR เข้า `main`**

```bash
gh pr create --base main --title "chore(deps): อัปเดต dependencies เฟส A — 27 แพ็กเกจในช่วง semver เดิม" --body "$(cat <<'EOF'
## สรุป

อัปเดต 27 แพ็กเกจที่อยู่ใน semver range เดิม (lockfile-only) ทบทวนบล็อก `overrides`/`resolutions`
ทั้ง 8 ตัว และบันทึกช่องโหว่ที่ยังค้าง **ไม่แตะซอร์สโค้ดใน `src/` เลยแม้แต่บรรทัดเดียว**

นี่คือเฟสแรกของแผนหลายเฟส — major อีก 14 ตัว (Tailwind v4, ESLint 10, TS 7, react-table v9,
lucide v1 ฯลฯ) อยู่ใน roadmap ของเอกสาร design ไม่รวมใน PR นี้

## คอมมิต

1. `bun update` — lockfile-only 27 แพ็กเกจ
2. ทบทวน `overrides`/`resolutions` — ลบ dead pin, ยก pin ที่ยังปล่อยช่องโหว่
3. เอกสารผล audit ก่อน/หลัง

## ช่องโหว่

_(เติมตัวเลขจริง ก่อน 16 (9 high, 7 moderate) → หลัง N)_

ที่ยังค้าง: `js-yaml` ใต้ `eslint@8` — ต้องรอเฟส B ที่ย้ายไป flat config

## Verification

- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run test` — _(เติมจำนวนเทสต์)_
- [x] `bun run build`
- [x] `npm ci && npm run build` (mirror Vercel — พิสูจน์ว่า npm ติดตั้งได้จาก `overrides` และ lockfile ที่ sync กัน; ไม่ได้พิสูจน์ว่า `overrides`/`resolutions` ตรงกัน เพราะ npm ไม่อ่าน `resolutions` — ตรวจด้วย JSON compare ตรงๆ ต่างหาก)
- [x] Browser: 4 จุดที่พึ่งพา Radix `DismissableLayer` + กวาด 10 primitives ใน 3 หน้า

_(เติมผลที่เห็นจริงจาก browser gate)_

## Rollback

ทั้ง 3 คอมมิตไม่แตะ `src/` — revert คอมมิตใดคอมมิตหนึ่งได้อิสระ

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: รายงาน URL ของ PR ให้ผู้ใช้**

**ห้าม merge เอง** — ผู้ใช้เป็นคนตัดสินใจ merge
