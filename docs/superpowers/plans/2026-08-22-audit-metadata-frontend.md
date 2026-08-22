# Audit Metadata ทุกส่วนของแอป — แผน implementation (Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ทุกหน้าของ carmen-platform แสดงได้ว่า record นี้ใครสร้างเมื่อไหร่ ใครแก้ล่าสุดเมื่อไหร่ ด้วยรูปแบบเดียวกันทั้งแอป

**Architecture:** สร้าง anti-corruption layer จุดเดียว (`normalizeAudit()`) ที่อ่าน response ได้ทั้งรูปแบบ nested (`audit.created.at`) และรูปแบบแบน (`created_at`) แล้ววาดผลผ่าน component กลาง `<AuditMeta>` เสียบเข้าหน้าเว็บสองทาง — prop `audit` บน `PageHeader` สำหรับหน้า Edit และ factory `auditColumns()` สำหรับตาราง **ไม่แตะ** `src/components/ui/data-table.tsx`

**Tech Stack:** React 19 + TypeScript · Vite · Tailwind v4 · TanStack Table · Vitest (jsdom) · Bun

**Spec:** `docs/superpowers/specs/2026-08-22-audit-metadata-everywhere-design.md`

**ขอบเขตแผนนี้:** เฟส A, B, C ของ spec (repo `carmen-platform` เท่านั้น)
เฟส D (backend 7 controller) อยู่ในแผนแยก — และตามกฎ "FE ขึ้นก่อน BE" ในข้อ 4.3 ของ spec
แผนนี้ต้องเสร็จและ deploy ก่อนแผน backend เสมอ

## Global Constraints

ข้อกำหนดทั้งหมดนี้ใช้กับ **ทุก task** ในแผน

- **ข้ามขั้นตอนเทสต์ทุก task ยกเว้น Task 1** — ตาม CLAUDE.md ส่วนตัวของผู้ใช้ ("Skip Automated Tests During Plan Execution") และข้อตกลงข้อ 7 ใน spec ห้ามสร้าง `*.test.tsx` ใหม่นอกจากที่ Task 1 ระบุ **implementer subagent ไม่ได้รับ preference นี้มาเอง — ต้องบอกมันตรง ๆ ทุกครั้งที่ dispatch**
- **static check ไม่ใช่เทสต์ ต้องรันเสมอ** — `bun run typecheck` และ `bun run lint` ต้องเขียวก่อน commit ทุก task
- **ห้ามแตะ `src/components/ui/`** — โดยเฉพาะ `data-table.tsx` (CLAUDE.md ข้อ 2 + spec ข้อ 3.5)
- **ข้อความ UI เป็นภาษาอังกฤษ** — `5mo ago`, `Unknown user`, `Created`, `Updated` ให้เข้ากับ UI ที่เหลือทั้งแอป
- **CSV ต้องเป็น absolute ISO เสมอ** ห้ามใส่ relative time ลงไฟล์ export
- **ห้ามใช้** `alert()` / `window.confirm()` (CLAUDE.md ข้อ 3)
- **ห้ามเพิ่ม library ใหม่** (CLAUDE.md ข้อ 6) — ใช้ `relativeTime()` ที่มีอยู่แล้วใน `src/utils/relativeTime.ts:39`
- **column def ต้องห่อ `useMemo`** พร้อม deps ที่ถูกต้อง (CLAUDE.md ข้อ 8)
- **`'Unknown'` เป็นสตริงตรงตัวจาก backend** — เทียบด้วย `===` เท่านั้น ห้ามใช้ `includes`
- ทุก commit ลงกิ่ง `feature/audit-metadata-everywhere` (สร้างไว้แล้ว)

---

## File Structure

### สร้างใหม่ (4 ไฟล์)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/utils/audit.ts` | แปลง response ทุกรูปแบบเป็น `NormalizedAudit` + helper สำหรับ CSV — จุดเดียวที่รู้เรื่องรูปร่างข้อมูล |
| `src/utils/audit.test.ts` | เทสต์ 6 รูปแบบ input ของ `normalizeAudit()` |
| `src/components/AuditMeta.tsx` | วาดผล 3 variant — ไม่รู้เรื่องรูปร่าง response เลย รับ `NormalizedAudit` มาแล้ว |
| `src/components/auditColumns.tsx` | factory คืน `ColumnDef[]` สำเร็จรูปให้ตาราง |

### แก้ (1 ไฟล์ในเฟส A)

| ไฟล์ | แก้อะไร |
|---|---|
| `src/components/PageHeader.tsx` | เพิ่ม prop `audit?: NormalizedAudit` |

### แก้ในเฟส B (26 ไฟล์) และเฟส C (15 ไฟล์)

รายชื่อครบอยู่ใน Task 5–12 ด้านล่าง

**เหตุผลที่แยก `audit.ts` ออกจาก `AuditMeta.tsx`:** ตัวแปลงเป็น pure function ที่ต้องเทสต์
ส่วนตัววาดผลเป็น React ที่ข้ามเทสต์ตามข้อตกลง ถ้ารวมไฟล์เดียวจะเทสต์ครึ่งไฟล์ไม่ได้

---

## เฟส A — รากฐาน

### Task 1: `src/utils/audit.ts` + เทสต์

**Files:**
- Create: `src/utils/audit.ts`
- Test: `src/utils/audit.test.ts`

**Interfaces:**
- Consumes: `Audit` / `AuditEntry` จาก `src/types/index.ts:758-769` (อ่านเพื่อเข้าใจรูปร่าง ไม่ต้อง import)
- Produces:
  - `interface AuditActor { at?: string; id?: string; name?: string; avatar?: string }`
  - `interface NormalizedAudit { created?: AuditActor; updated?: AuditActor; deleted?: AuditActor }`
  - `function normalizeAudit(record: unknown): NormalizedAudit`
  - `function isUnknownActor(name?: string): boolean`
  - `function auditCsvFields(a: NormalizedAudit): { created_at: string; created_by: string; updated_at: string; updated_by: string }`

**บริบทที่ต้องรู้ก่อนเขียน:**

backend คืนข้อมูลได้ 2 รูปแบบ ขึ้นกับว่า route นั้นติด `@EnrichAuditUsers()` หรือยัง

```jsonc
// รูปแบบ nested (route ที่ติด decorator แล้ว)
{ "id": "...", "audit": { "created": { "at": "2026-03-12T14:22:07Z", "id": "u1", "name": "สมชาย" } } }

// รูปแบบแบน (route ที่ยังไม่ติด)
{ "id": "...", "created_at": "2026-03-12T14:22:07Z", "created_by_name": "สมชาย" }
```

กฎจาก `apps/backend-gateway/src/common/enrichment/audit-shape.ts` ของ repo backend:
- ถ้าทั้ง `at` และ `by_id` เป็น null → **key นั้นหายไปทั้งก้อน**
- ถ้ามี id แต่ resolve ชื่อไม่ได้ → `name` เป็นสตริง `"Unknown"` ตรงตัว
- `updated_at` มี `@default(now())` แต่ `updated_by_id` ไม่มี → record ที่ไม่เคยแก้จะมี
  `updated_at === created_at` และไม่มีชื่อคนแก้

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `src/utils/audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeAudit, isUnknownActor, auditCsvFields } from './audit';

const CREATED_AT = '2026-03-12T14:22:07.000Z';
const UPDATED_AT = '2026-08-22T09:15:00.000Z';

describe('normalizeAudit — รูปแบบ nested', () => {
  it('อ่าน audit.created / audit.updated ครบทุกฟิลด์', () => {
    const a = normalizeAudit({
      audit: {
        created: { at: CREATED_AT, id: 'u1', name: 'สมชาย', avatar: 'http://x/a.png' },
        updated: { at: UPDATED_AT, id: 'u2', name: 'ธมนูญ' },
      },
    });
    expect(a.created).toEqual({ at: CREATED_AT, id: 'u1', name: 'สมชาย', avatar: 'http://x/a.png' });
    expect(a.updated).toEqual({ at: UPDATED_AT, id: 'u2', name: 'ธมนูญ', avatar: undefined });
  });

  it('เก็บเวลาไว้แม้ไม่มีชื่อคน (record เก่าที่ไม่ได้บันทึก actor)', () => {
    const a = normalizeAudit({ audit: { created: { at: CREATED_AT } } });
    expect(a.created?.at).toBe(CREATED_AT);
    expect(a.created?.name).toBeUndefined();
  });

  it("คง 'Unknown' ไว้ตามที่ backend ส่งมา ไม่แปลงเป็น undefined", () => {
    const a = normalizeAudit({ audit: { created: { at: CREATED_AT, id: 'gone', name: 'Unknown' } } });
    expect(a.created?.name).toBe('Unknown');
    expect(isUnknownActor(a.created?.name)).toBe(true);
  });
});

describe('normalizeAudit — รูปแบบแบน', () => {
  it('ประกอบจาก created_at / created_by_name เมื่อไม่มี audit', () => {
    const a = normalizeAudit({
      created_at: CREATED_AT, created_by_name: 'สมชาย',
      updated_at: UPDATED_AT, updated_by_name: 'ธมนูญ',
    });
    expect(a.created).toEqual({ at: CREATED_AT, name: 'สมชาย' });
    expect(a.updated).toEqual({ at: UPDATED_AT, name: 'ธมนูญ' });
  });

  it('ใช้ได้เมื่อมีแค่เวลา ไม่มีชื่อ', () => {
    const a = normalizeAudit({ created_at: CREATED_AT });
    expect(a.created).toEqual({ at: CREATED_AT, name: undefined });
  });

  it('nested ชนะ flat เมื่อมีทั้งคู่', () => {
    const a = normalizeAudit({
      created_at: '1999-01-01T00:00:00.000Z', created_by_name: 'เก่า',
      audit: { created: { at: CREATED_AT, name: 'ใหม่' } },
    });
    expect(a.created?.at).toBe(CREATED_AT);
    expect(a.created?.name).toBe('ใหม่');
  });
});

describe('normalizeAudit — กฎ "เคยแก้จริงหรือยัง"', () => {
  it('ตัด updated ทิ้งเมื่อไม่มีชื่อคนแก้ และเวลาเท่ากับตอนสร้าง', () => {
    const a = normalizeAudit({ created_at: CREATED_AT, updated_at: CREATED_AT });
    expect(a.created).toBeDefined();
    expect(a.updated).toBeUndefined();
  });

  it('เก็บ updated ไว้เมื่อมีชื่อคนแก้ แม้เวลาจะเท่ากับตอนสร้าง', () => {
    const a = normalizeAudit({
      created_at: CREATED_AT, updated_at: CREATED_AT, updated_by_name: 'ธมนูญ',
    });
    expect(a.updated?.name).toBe('ธมนูญ');
  });

  it('เก็บ updated ไว้เมื่อเวลาต่างจากตอนสร้าง แม้ไม่รู้ว่าใครแก้', () => {
    const a = normalizeAudit({ created_at: CREATED_AT, updated_at: UPDATED_AT });
    expect(a.updated?.at).toBe(UPDATED_AT);
    expect(a.updated?.name).toBeUndefined();
  });
});

describe('normalizeAudit — input ที่ไม่ใช่ record', () => {
  it('คืน object ว่างและไม่ throw', () => {
    expect(normalizeAudit(null)).toEqual({});
    expect(normalizeAudit(undefined)).toEqual({});
    expect(normalizeAudit(42)).toEqual({});
    expect(normalizeAudit([])).toEqual({});
    expect(normalizeAudit({})).toEqual({});
  });
});

describe('isUnknownActor', () => {
  it("เป็นจริงเฉพาะสตริง 'Unknown' เป๊ะ ๆ", () => {
    expect(isUnknownActor('Unknown')).toBe(true);
    expect(isUnknownActor('Unknown user')).toBe(false);
    expect(isUnknownActor('unknown')).toBe(false);
    expect(isUnknownActor(undefined)).toBe(false);
  });
});

describe('auditCsvFields', () => {
  it('คืน ISO เต็มไม่ใช่ relative และเติมสตริงว่างเมื่อไม่มีข้อมูล', () => {
    const a = normalizeAudit({ created_at: CREATED_AT, created_by_name: 'สมชาย' });
    expect(auditCsvFields(a)).toEqual({
      created_at: CREATED_AT, created_by: 'สมชาย', updated_at: '', updated_by: '',
    });
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่ามันแดง**

รัน: `bun run test src/utils/audit.test.ts`
คาดหวัง: FAIL — `Failed to resolve import "./audit"`

- [ ] **Step 3: เขียน implementation**

สร้าง `src/utils/audit.ts`:

```ts
// จุดเดียวของแอปที่รู้ว่า backend ส่ง audit มาได้กี่รูปแบบ — หน้าเว็บทุกหน้าอ่านผ่านที่นี่
// เท่านั้น เพราะ gateway ติด `@EnrichAuditUsers()` ไม่ครบทุก route: route ที่ติดแล้วจะคืน
// `audit.created.at` ส่วนที่ยังไม่ติดจะคืนฟิลด์แบน `created_at` การอ่านได้ทั้งสองรูปแบบทำให้
// deploy FE กับ BE สลับลำดับกันได้โดยหน้าไม่พัง

export interface AuditActor {
  at?: string;      // ISO timestamp
  id?: string;
  name?: string;    // 'Unknown' = backend มี id แต่ resolve ชื่อไม่เจอ
  avatar?: string;
}

export interface NormalizedAudit {
  created?: AuditActor;
  updated?: AuditActor;   // มีก็ต่อเมื่อ "เคยแก้จริง" — ดู normalizeAudit
  deleted?: AuditActor;
}

/** สตริงตรงตัวที่ gateway ใส่มาเมื่อ resolve ชื่อจาก user id ไม่ได้ */
const UNKNOWN_ACTOR = 'Unknown';

/** จริงเฉพาะสตริง 'Unknown' เป๊ะ ๆ — ห้ามใช้ includes เพราะชื่อคนจริงอาจมีคำนี้อยู่ */
export function isUnknownActor(name?: string): boolean {
  return name === UNKNOWN_ACTOR;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/** อ่านรูปแบบ nested — `audit.created` ที่ gateway ประกอบให้ */
function fromNested(entry: unknown): AuditActor | undefined {
  if (!isRecord(entry)) return undefined;
  const actor: AuditActor = {
    at: str(entry.at),
    id: str(entry.id),
    name: str(entry.name),
    avatar: str(entry.avatar),
  };
  return actor.at || actor.name || actor.id ? actor : undefined;
}

/** อ่านรูปแบบแบน — `created_at` + `created_by_name` ที่ route ยังไม่ enrich คืนมา */
function fromFlat(at: unknown, name: unknown): AuditActor | undefined {
  const a = str(at);
  const n = str(name);
  if (!a && !n) return undefined;
  return { at: a, name: n };
}

/**
 * แปลง record จาก API รูปแบบใดก็ได้ให้เป็นรูปเดียว
 *
 * `updated` จะถูกตัดทิ้งเมื่อ "ยังไม่เคยแก้" — ตัดสินจาก **การมีชื่อคนแก้** ไม่ใช่การเทียบ
 * timestamp เพราะ `updated_at` ใน schema มี `@default(now())` แต่ `updated_by_id` ไม่มี
 * record ที่สร้างแล้วไม่เคยแก้จึงมีเวลาสองอันเท่ากันเสมอ ส่วน service เขียน `updated_by_id`
 * เฉพาะตอน update จริง ข้อยกเว้น: ถ้าเวลาต่างจากตอนสร้างแต่ไม่มีชื่อ แปลว่าเคยแก้จริง
 * เพียงแต่ไม่รู้ว่าใคร — ยังต้องแสดง
 */
export function normalizeAudit(record: unknown): NormalizedAudit {
  if (!isRecord(record)) return {};
  const nested = isRecord(record.audit) ? record.audit : undefined;

  const created =
    fromNested(nested?.created) ?? fromFlat(record.created_at, record.created_by_name);
  const updatedRaw =
    fromNested(nested?.updated) ?? fromFlat(record.updated_at, record.updated_by_name);
  const deleted =
    fromNested(nested?.deleted) ?? fromFlat(record.deleted_at, record.deleted_by_name);

  const everEdited = Boolean(updatedRaw && (updatedRaw.name || updatedRaw.at !== created?.at));

  const out: NormalizedAudit = {};
  if (created) out.created = created;
  if (updatedRaw && everEdited) out.updated = updatedRaw;
  if (deleted) out.deleted = deleted;
  return out;
}

/**
 * แปลงเป็นฟิลด์สำหรับ CSV — **absolute ISO เสมอ** ไฟล์ที่ export ออกไปต้องอ่านได้ในอีก 3 เดือน
 * ซึ่ง `5mo ago` ทำไม่ได้ merge ผลลัพธ์นี้เข้าแถวก่อนส่งให้ `generateCSV`
 */
export function auditCsvFields(a: NormalizedAudit): {
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
} {
  return {
    created_at: a.created?.at ?? '',
    created_by: a.created?.name ?? '',
    updated_at: a.updated?.at ?? '',
    updated_by: a.updated?.name ?? '',
  };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

รัน: `bun run test src/utils/audit.test.ts`
คาดหวัง: PASS ทั้ง 12 เคส

- [ ] **Step 5: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 6: commit**

```bash
git add src/utils/audit.ts src/utils/audit.test.ts
git commit -m "feat(audit): เพิ่ม normalizeAudit อ่าน response ได้ทั้ง nested และแบน"
```

---

### Task 2: `src/components/AuditMeta.tsx`

**Files:**
- Create: `src/components/AuditMeta.tsx`

**Interfaces:**
- Consumes: `NormalizedAudit`, `AuditActor` จาก `src/utils/audit.ts` (Task 1) · `relativeTime` จาก `src/utils/relativeTime.ts:39`
- Produces: `<AuditMeta>` — props เป็น discriminated union:
  - `{ variant: 'header'; audit: NormalizedAudit; now?: Date; className?: string }`
  - `{ variant: 'cell' | 'compact'; actor?: AuditActor; now?: Date; className?: string }`

**หมายเหตุการปรับจาก spec:** spec ข้อ 3.2 เขียน props เป็น `audit: NormalizedAudit` อย่างเดียว
แต่คอลัมน์ตารางต้องแยก Created กับ Updated เป็นคนละคอลัมน์ จึงต้องส่ง actor ตัวเดียวเข้าไปได้
discriminated union ให้ทั้งสองแบบโดยยังเป็น component เดียวตามเจตนาของ spec

**ห้ามข้ามขั้น:** ไม่ต้องเขียนเทสต์ให้ไฟล์นี้ (Global Constraints ข้อ 1)

- [ ] **Step 1: เขียน component**

สร้าง `src/components/AuditMeta.tsx`:

```tsx
import { relativeTime } from '../utils/relativeTime';
import type { AuditActor, NormalizedAudit } from '../utils/audit';
import { isUnknownActor } from '../utils/audit';

// ไม่มี date library ในโปรเจกต์นี้ (CLAUDE.md · DateTime) — formatter แบบ inline
const absolute = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** ชื่อที่จะแสดง — 'Unknown' จาก backend อ่านไม่รู้เรื่อง ต้องขยายเป็นประโยค */
const displayName = (name?: string): string | undefined => {
  if (!name) return undefined;
  return isUnknownActor(name) ? 'Unknown user' : name;
};

type AuditMetaProps =
  | { variant: 'header'; audit: NormalizedAudit; now?: Date; className?: string }
  | { variant: 'cell' | 'compact'; actor?: AuditActor; now?: Date; className?: string };

/**
 * แสดง "ใครทำเมื่อไหร่" ด้วยรูปแบบเดียวกันทั้งแอป
 *
 * เวลาแสดงเป็น relative (`5mo ago`) เพราะอ่านแล้วรู้ทันทีว่าสดหรือเก่า และห่อด้วย `title`
 * ที่เป็นเวลาเต็ม — ใช้ `title` ไม่ใช่ Radix Tooltip เพราะตารางหนึ่งหน้ามีเซลล์เป็นร้อย
 * การ mount Tooltip ทุกเซลล์จะกิน DOM node มหาศาล
 *
 * `now` ต้องส่งได้จากภายนอกเพื่อให้ผลลัพธ์คงที่ตอนทดสอบ
 */
export function AuditMeta(props: AuditMetaProps) {
  const now = props.now ?? new Date();

  if (props.variant === 'header') {
    const { created, updated } = props.audit;
    if (!created && !updated) return null;
    return (
      <p className={props.className ?? 'text-muted-foreground mt-0.5 text-xs'}>
        {created && <ActorPhrase verb="Created" actor={created} now={now} />}
        {created && updated && <span className="mx-1.5">·</span>}
        {updated && <ActorPhrase verb="Updated" actor={updated} now={now} />}
      </p>
    );
  }

  const { actor } = props;
  if (!actor?.at && !actor?.name) return null;
  const when = relativeTime(actor.at, now);
  const who = displayName(actor.name);

  if (props.variant === 'compact') {
    return (
      <span className={props.className ?? 'text-muted-foreground text-xs'} title={absolute(actor.at)}>
        {when}
        {who && ` · ${who}`}
      </span>
    );
  }

  // variant 'cell' — เวลาบรรทัดบน ชื่อบรรทัดล่าง ให้คอลัมน์แคบพอในตาราง
  return (
    <div
      className={props.className ?? 'text-muted-foreground space-y-0.5 text-[11px] leading-tight'}
      title={absolute(actor.at)}
    >
      <div>{when || '-'}</div>
      {who && <div>{who}</div>}
    </div>
  );
}

function ActorPhrase({ verb, actor, now }: { verb: string; actor: AuditActor; now: Date }) {
  const who = displayName(actor.name);
  return (
    <span title={absolute(actor.at)}>
      <span className="font-medium">{verb}</span> {relativeTime(actor.at, now) || '-'}
      {who && ` by ${who}`}
    </span>
  );
}
```

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่ (ยังไม่มีใครเรียกใช้ — นั่นถูกต้องแล้ว)

- [ ] **Step 3: commit**

```bash
git add src/components/AuditMeta.tsx
git commit -m "feat(audit): เพิ่ม AuditMeta 3 variant พร้อม tooltip เวลาเต็ม"
```

---

### Task 3: `src/components/auditColumns.tsx`

**Files:**
- Create: `src/components/auditColumns.tsx`

**Interfaces:**
- Consumes: `normalizeAudit` จาก `src/utils/audit.ts` · `AuditMeta` จาก `src/components/AuditMeta.tsx`
- Produces: `function auditColumns<T>(opts?: { hideUpdatedOnCard?: boolean; now?: Date }): ColumnDef<T, unknown>[]`
  คืน 2 คอลัมน์เสมอ — `id: 'created_at'` และ `id: 'updated_at'` ตามลำดับ

**ทำไมเป็น factory ไม่ใช่การยัดเข้า DataTable:** แต่ละหน้ายังต้องคุม `meta.card` เอง
เช่น `ClusterManagement.tsx:433` ซ่อนคอลัมน์ Updated บนการ์ดมือถือ ซึ่ง DataTable ตัดสินแทนไม่ได้

- [ ] **Step 1: เขียน factory**

สร้าง `src/components/auditColumns.tsx`:

```tsx
import type { ColumnDef } from '@tanstack/react-table';
import { AuditMeta } from './AuditMeta';
import { normalizeAudit } from '../utils/audit';

interface AuditColumnsOptions {
  /** ซ่อนคอลัมน์ Updated บนการ์ดมือถือ (ต่ำกว่า lg) — การ์ดแคบ ใส่ครบสองอันแล้วเบียด */
  hideUpdatedOnCard?: boolean;
  /** ส่งเข้ามาเพื่อให้ผลลัพธ์คงที่ตอนทดสอบ */
  now?: Date;
}

/**
 * คืนคอลัมน์ Created / Updated สำเร็จรูปให้ spread เข้า `columns` array ของหน้า
 *
 * ใช้แทนการเขียน `fmt()` เองในแต่ละหน้า ซึ่งเดิมคัดลอกกันอยู่ 7 ชุดและไม่ตรงกัน
 * เรียก `normalizeAudit` ต่อแถวเพื่อให้รับได้ทั้ง response แบบ nested และแบบแบน
 *
 * ตัวอย่าง:
 * ```ts
 * const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
 *   ...myColumns,
 *   ...auditColumns<Cluster>({ hideUpdatedOnCard: true }),
 * ], []);
 * ```
 */
export function auditColumns<T>(opts: AuditColumnsOptions = {}): ColumnDef<T, unknown>[] {
  const { hideUpdatedOnCard = false, now } = opts;
  return [
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).created} now={now} />
      ),
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      header: 'Updated',
          ...(hideUpdatedOnCard ? { meta: { card: 'hidden' } } : {}),
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).updated} now={now} />
      ),
    },
  ];
}
```

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

หมายเหตุ: `CardRole` (`data-table.tsx:72`) ไม่ได้ export และ TanStack `ColumnMeta` ไม่ถูก augment
จึงส่งสตริง `'hidden'` ตรง ๆ ได้เลย แบบเดียวกับที่ `ClusterManagement.tsx:433` ทำอยู่ **ห้ามแก้ `data-table.tsx`**

- [ ] **Step 3: commit**

```bash
git add src/components/auditColumns.tsx
git commit -m "feat(audit): เพิ่ม factory auditColumns คืน ColumnDef สำเร็จรูป"
```

---

### Task 4: prop `audit` บน `PageHeader`

**Files:**
- Modify: `src/components/PageHeader.tsx` (ทั้งไฟล์ 28 บรรทัด)

**Interfaces:**
- Consumes: `NormalizedAudit` จาก `src/utils/audit.ts` · `AuditMeta` จาก `src/components/AuditMeta.tsx`
- Produces: `PageHeader` รับ prop เพิ่ม `audit?: NormalizedAudit` และ `now?: Date`
  prop เดิมทั้ง 5 ตัว (`title`, `subtitle`, `actions`, `backTo`, `beforeTitle`) **ไม่เปลี่ยน**

- [ ] **Step 1: แก้ไฟล์**

เขียนทับ `src/components/PageHeader.tsx` ทั้งไฟล์:

```tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuditMeta } from './AuditMeta';
import type { NormalizedAudit } from '../utils/audit';

export function PageHeader({
  title, subtitle, actions, backTo, beforeTitle, audit, now,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  backTo?: string;
  beforeTitle?: React.ReactNode;
  // แถบ "ใครสร้าง/แก้เมื่อไหร่" ใต้ subtitle — ส่งผลลัพธ์ของ normalizeAudit(record) เข้ามา
  audit?: NormalizedAudit;
  now?: Date;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Back"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted text-muted-foreground shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {beforeTitle}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {audit && <AuditMeta variant="header" audit={audit} now={now} />}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่ — prop ใหม่เป็น optional ทั้งคู่ ผู้เรียกเดิม 43 หน้าไม่ต้องแก้

- [ ] **Step 3: ตรวจว่าเทสต์เดิมของ PageHeader ยังผ่าน**

รัน: `bun run test src/components/PageHeader.test.tsx`
คาดหวัง: PASS — ถ้าแดง แปลว่าเผลอเปลี่ยน markup เดิม ให้ย้อนดู diff

- [ ] **Step 4: commit**

```bash
git add src/components/PageHeader.tsx
git commit -m "feat(audit): PageHeader รับ prop audit วาดแถบ meta ใต้หัวข้อ"
```

---

## เฟส B — แปลงของเดิมมาใช้ของกลาง

> **เป้าหมายของทั้งเฟส:** ไม่เพิ่มฟีเจอร์ ลบโค้ดซ้ำ ผู้ใช้เห็นเปลี่ยนแค่รูปเวลา
> ถ้าเฟสนี้ผ่านครบ = `normalizeAudit()` รับมือข้อมูลจริงได้ทุกรูปแบบแล้ว

### Task 5: ตาราง Management กลุ่มหลัก 5 หน้า

**Files:**
- Modify: `src/pages/ClusterManagement.tsx`
- Modify: `src/pages/BusinessUnitManagement.tsx`
- Modify: `src/pages/UserManagement.tsx`
- Modify: `src/pages/RoleManagement.tsx`
- Modify: `src/pages/ApplicationManagement.tsx`

**Interfaces:**
- Consumes: `auditColumns` (Task 3) · `normalizeAudit`, `auditCsvFields` (Task 1)
- Produces: ไม่มี — เป็นหน้าปลายทาง

**สิ่งที่ต้องลบในแต่ละไฟล์:**

1. บล็อก normalize ซ้ำตอนรับ response — เช่น `ClusterManagement.tsx:152-155`:
   ```ts
   created_at: item.created_at ?? item.audit?.created?.at,
   created_by_name: item.created_by_name ?? item.audit?.created?.name,
   updated_at: item.updated_at ?? item.audit?.updated?.at,
   updated_by_name: item.updated_by_name ?? item.audit?.updated?.name,
   ```
   **ลบทิ้งทั้งบล็อก** — เก็บ `item` ดิบไว้ แล้วให้ `auditColumns` เรียก `normalizeAudit` เอง
2. column def `created_at` และ `updated_at` ที่เขียน `fmt()` เอง — เช่น `ClusterManagement.tsx:414-445`
3. ฟังก์ชัน `fmt()` แบบ inline ที่อยู่ในเซลล์เหล่านั้น

- [ ] **Step 1: แก้ ClusterManagement.tsx เป็นตัวอย่างเต็ม**

เพิ่ม import:

```ts
import { auditColumns } from '../components/auditColumns';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
```

แทนที่ column def สองอันเดิม (`ClusterManagement.tsx:414-445`) ด้วยการ spread ในตำแหน่งเดิม
ภายใน `useMemo` ของ columns:

```ts
...auditColumns<Cluster>({ hideUpdatedOnCard: true }),
```

> `hideUpdatedOnCard: true` เพราะของเดิมมี `meta: { card: 'hidden' }` บนคอลัมน์ Updated
> (`ClusterManagement.tsx:433`) ต้องคงพฤติกรรมนั้นไว้

แก้ CSV export — ที่ `ClusterManagement.tsx:316-321` มี `.map()` pre-format อยู่แล้ว
เติม audit เข้าไปในนั้น:

```ts
const rows = clusters.map((c) => {
  const d = c.bu_cap_end_date;
  const buCapEndDate = !d ? '' : isPerpetual(d) ? 'No expiry' : fmtDate(d);
  return { ...c, bu_cap_end_date: buCapEndDate, ...auditCsvFields(normalizeAudit(c)) };
});
```

แล้วเพิ่มคอลัมน์เข้าใน array ที่ส่งให้ `generateCSV`:

```ts
{ key: 'created_at', label: 'Created at' },
{ key: 'created_by', label: 'Created by' },
{ key: 'updated_at', label: 'Updated at' },
{ key: 'updated_by', label: 'Updated by' },
```

- [ ] **Step 2: ทำแบบเดียวกันกับอีก 4 ไฟล์**

| ไฟล์ | บล็อก normalize ที่ต้องลบ | `hideUpdatedOnCard` |
|---|---|---|
| `BusinessUnitManagement.tsx` | บรรทัด 97-100 | `true` (ของเดิมบรรทัด 332 มี `card: 'hidden'`) |
| `UserManagement.tsx` | บรรทัด 152-155 | ตรวจ column def เดิมว่ามี `meta.card` ไหม แล้วทำตาม |
| `RoleManagement.tsx` | บรรทัด 112-115 | ตรวจ column def เดิมว่ามี `meta.card` ไหม แล้วทำตาม |
| `ApplicationManagement.tsx` | บรรทัด 106-109 | ตรวจ column def เดิมว่ามี `meta.card` ไหม แล้วทำตาม |

ทุกไฟล์: ลบ type field `created_by_name` / `updated_by_name` ที่ประกาศไว้ใน interface ท้องถิ่น
ของหน้า (เช่น `RoleManagement.tsx:36-38`, `UserManagement.tsx:57-59`) ถ้าไม่มีใครใช้แล้ว
— `bun run typecheck` จะบอกเองว่าเหลือใครใช้อยู่ไหม

ทุกไฟล์: แก้ CSV ด้วย pattern เดียวกับ Step 1

- [ ] **Step 3: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 4: ตรวจว่าเทสต์เดิมยังผ่าน**

รัน: `bun run test src/pages/ClusterManagement.test.tsx src/pages/BusinessUnitManagement.test.tsx src/pages/RoleManagement.test.tsx`
คาดหวัง: PASS — เทสต์เหล่านี้ assert แค่ `getByText(/Created/)` ไม่ได้ assert สตริงวันที่
ถ้าแดงเพราะหาคำว่า Created ไม่เจอ แปลว่า spread `auditColumns` ผิดตำแหน่งหรือลืม spread

- [ ] **Step 5: ตรวจในเบราว์เซอร์**

รัน: `bun run dev:dev` แล้วเปิด `http://localhost:3304/clusters`
ตรวจ:
- คอลัมน์ Created แสดง `5mo ago` แบบ relative ไม่ใช่ `2026-03-12 14:22:07`
- hover แล้วขึ้น tooltip เป็นเวลาเต็ม
- แถวที่ไม่เคยแก้ คอลัมน์ Updated ว่าง ไม่ใช่ `-`
- กดปุ่ม export CSV แล้วเปิดไฟล์ — คอลัมน์ `Created at` ต้องเป็น ISO ไม่ใช่ `5mo ago`

- [ ] **Step 6: commit**

```bash
git add src/pages/ClusterManagement.tsx src/pages/BusinessUnitManagement.tsx \
        src/pages/UserManagement.tsx src/pages/RoleManagement.tsx \
        src/pages/ApplicationManagement.tsx
git commit -m "refactor(audit): ตาราง Management 5 หน้าหลักใช้ auditColumns แทน fmt() ของตัวเอง"
```

---

### Task 6: ตาราง Management ที่เหลือ 8 หน้า

**Files:**
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/pages/SuperAdminManagement.tsx`
- Modify: `src/pages/UserPlatformManagement.tsx`
- Modify: `src/pages/DatabasePoolManagement.tsx`
- Modify: `src/pages/BroadcastManagement.tsx`
- Modify: `src/pages/NewsManagement.tsx`
- Modify: `src/pages/clusterAdmin/BusinessUnitList.tsx`
- Modify: `src/pages/clusterAdmin/InvitationsTable.tsx`

**Interfaces:**
- Consumes: `auditColumns` (Task 3) · `normalizeAudit`, `auditCsvFields` (Task 1)
- Produces: ไม่มี

**pattern เดียวกับ Task 5 ทุกประการ** — เพิ่ม import สองบรรทัด, ลบบล็อก normalize,
แทน column def เดิมด้วย `...auditColumns<T>({ hideUpdatedOnCard })`, เติม `auditCsvFields`
เข้า CSV

```ts
import { auditColumns } from '../components/auditColumns';
import { normalizeAudit, auditCsvFields } from '../utils/audit';
```

> ไฟล์ใน `src/pages/clusterAdmin/` ต้องใช้ path ย้อนสองชั้น: `'../../components/auditColumns'`

**จุดที่ต่างจาก Task 5 และต้องระวังเป็นราย ๆ ไป:**

| ไฟล์ | สิ่งที่ต่าง |
|---|---|
| `SuperAdminManagement.tsx:83-89` | มีคอมเมนต์อธิบายว่า gateway ย้าย timestamp ไป `audit.created.at` — **ลบคอมเมนต์นั้นด้วย** เพราะความรู้นี้ย้ายไปอยู่ใน `audit.ts` แล้ว |
| `UserPlatformManagement.tsx:271-272, 331-335` | ไม่ได้ใช้ audit เป็นคอลัมน์ แต่ใช้หา role ที่ถูก grant ล่าสุด (`granted_at` / `granted_by`) **อย่าแตะ logic นั้น** เปลี่ยนเฉพาะให้อ่านผ่าน `normalizeAudit(role)` แทน `role.audit?.created?.at` ตรง ๆ |
| `NewsManagement.tsx:422` | อ่าน `row.original.audit?.updated` ในคอลัมน์ที่ไม่ใช่คอลัมน์ audit มาตรฐาน — เปลี่ยนเป็น `normalizeAudit(row.original).updated` แล้วคงคอลัมน์เดิมไว้ |
| `DatabasePoolManagement.tsx` | อ่านฟิลด์แบน 3 จุด และ backend **ยังไม่ enrich** — หลังแปลงแล้วต้องยังแสดงผลได้เหมือนเดิม เพราะ `normalizeAudit` อ่าน flat ได้ |
| `clusterAdmin/BusinessUnitList.tsx` | `stickyLeftColumns={2}` — คอลัมน์ audit อยู่ขวาสุด ไม่กระทบ แต่ห้ามย้ายลำดับคอลัมน์อื่น |

- [ ] **Step 1: แก้ทั้ง 8 ไฟล์ตาม pattern**

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 3: ตรวจว่าเทสต์เดิมยังผ่าน**

รัน: `bun run test src/pages/ReportTemplateManagement.test.tsx src/pages/SuperAdminManagement.test.tsx`
คาดหวัง: PASS

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิด `/report-templates`, `/super-admins`, `/news`, `/database-pools`
ตรวจว่าคอลัมน์ Created/Updated แสดง relative time และ tooltip ขึ้นเวลาเต็ม

- [ ] **Step 5: commit**

```bash
git add src/pages/ReportTemplateManagement.tsx src/pages/SuperAdminManagement.tsx \
        src/pages/UserPlatformManagement.tsx src/pages/DatabasePoolManagement.tsx \
        src/pages/BroadcastManagement.tsx src/pages/NewsManagement.tsx \
        src/pages/clusterAdmin/BusinessUnitList.tsx src/pages/clusterAdmin/InvitationsTable.tsx
git commit -m "refactor(audit): ตาราง Management ที่เหลือ 8 หน้าใช้ auditColumns"
```

---

### Task 7: หน้า Edit 5 หน้า + Hero 2 ตัวที่คู่กัน

> **task นี้ถูกรวมจาก Task 7 และ Task 8 เดิมของแผน** ตามคำวินิจฉัยตอน pre-flight scan:
> `ClusterHero` กับ `ApplicationIdentityHero` เปลี่ยน signature และ call site ของมันอยู่ใน
> หน้า Edit ที่ task นี้แก้พอดี (`ClusterEdit.tsx:552`, `ApplicationEdit.tsx:375`)
> ถ้าแยกเป็นสอง task จะมีสถานะกลางที่ `bun run typecheck` ไม่ผ่าน ซึ่งขัด Global Constraints ข้อ 2

**Files:**
- Modify: `src/pages/ClusterEdit.tsx`
- Modify: `src/pages/ApplicationEdit.tsx`
- Modify: `src/pages/ReportTemplateEdit.tsx`
- Modify: `src/pages/NewsEdit.tsx`
- Modify: `src/pages/BroadcastEdit.tsx`
- Modify: `src/pages/clusterManagement/ClusterHero.tsx`
- Modify: `src/pages/clusterManagement/ClusterHero.test.tsx`
- Modify: `src/pages/applicationEdit/ApplicationIdentityHero.tsx`
- Modify: `src/pages/applicationEdit/ApplicationIdentityHero.test.tsx`

**Interfaces:**
- Consumes: `normalizeAudit`, `NormalizedAudit` (Task 1) · `AuditMeta` (Task 2) · prop `audit` บน `PageHeader` (Task 4)
- Produces:
  - `ClusterHero` เปลี่ยน prop `meta: {...}` → `audit: NormalizedAudit`
  - `ApplicationIdentityHero` เปลี่ยน prop `meta: {...}` → `audit: NormalizedAudit`

**การตัดสินใจที่ต้องรู้ก่อนเริ่ม:**

`ClusterEdit` และ `ApplicationEdit` **ไม่ต้องเพิ่ม prop `audit` บน `PageHeader`** — สองหน้านี้มี
Hero ที่แสดง audit อยู่แล้วในตำแหน่งเดียวกัน (ใต้หัวข้อ) การใส่ทั้งสองที่จะแสดงข้อมูลเดียวกันซ้ำ
ในหน้าเดียว ส่วนอีกสามหน้า (ReportTemplate, News, Broadcast) ไม่มี Hero จึงใช้ `PageHeader`

- [ ] **Step 1: แก้ `ClusterHero.tsx`**

ลบฟังก์ชัน `auditLine()` (บรรทัด 31-39) และ `fmtDate()` กับ `MONTHS` (บรรทัด 6-12)
ถ้าไม่มีใครใช้แล้ว — `bun run lint` จะบอกถ้าเหลือตัวแปรที่ไม่ถูกใช้

เปลี่ยน prop ใน `ClusterHeroProps` (บรรทัด 27):

```tsx
// เดิม
  meta: { created_at?: string; created_by_name?: string; updated_at?: string; updated_by_name?: string };
// ใหม่
  audit: NormalizedAudit;
```

เปลี่ยน destructure ที่บรรทัด 48 จาก `meta` เป็น `audit`

แทนสองบรรทัดที่เรียก `auditLine` (บรรทัด 83-84) ด้วย:

```tsx
            <AuditMeta variant="header" audit={audit} className="text-muted-foreground text-[11px] leading-tight" />
```

เพิ่ม import:

```ts
import { AuditMeta } from '../../components/AuditMeta';
import type { NormalizedAudit } from '../../utils/audit';
```

- [ ] **Step 2: แก้ call site ใน `ClusterEdit.tsx`**

ที่บรรทัด 552 เปลี่ยน:

```tsx
                    meta={clusterMeta}
```

เป็น:

```tsx
                    audit={normalizeAudit(cluster)}
```

โดย `cluster` คือ object ดิบที่ได้จาก API — ถ้าหน้าไม่ได้เก็บไว้ ให้ดูว่าตัวแปรชื่ออะไรใน
`fetchCluster` แล้วเก็บลง state ใหม่ **ห้ามเก็บใน `formData`** เพราะจะทำให้
`useUnsavedChanges` เข้าใจผิดว่ามีการแก้

ลบตัวแปร `clusterMeta` และบล็อก normalize ที่บรรทัด 158-161 พร้อมกับ field
`created_by_name` / `updated_by_name` ในโครง state ที่บรรทัด 70-72

เพิ่ม import: `import { normalizeAudit } from '../utils/audit';`

- [ ] **Step 3: แก้ `ClusterHero.test.tsx`**

เปลี่ยน prop ที่บรรทัด 10:

```ts
// เดิม
  meta: { created_at: '2025-02-11T00:00:00Z', created_by_name: 'A. Wong', updated_at: '2025-07-08T00:00:00Z', updated_by_name: 'S. Chan' },
// ใหม่
  audit: normalizeAudit({
    created_at: '2025-02-11T00:00:00Z', created_by_name: 'A. Wong',
    updated_at: '2025-07-08T00:00:00Z', updated_by_name: 'S. Chan',
  }),
```

เพิ่ม `import { normalizeAudit } from '../../utils/audit';`
assertion เดิม `expect(screen.getByText(/Created/))` ยังใช้ได้ ไม่ต้องแก้

- [ ] **Step 4: แก้ `ApplicationIdentityHero.tsx` + call site + เทสต์**

pattern เดียวกับ Step 1-3 ทุกประการ:
- component เปลี่ยน prop `meta` → `audit: NormalizedAudit` แล้ววาดด้วย `<AuditMeta variant="header">`
  (ไฟล์นี้มีคอมเมนต์ที่บรรทัด 24 บอกว่า "Mirrors ClusterHero's auditLine" — ลบคอมเมนต์นั้นด้วย
  เพราะของที่มัน mirror ถูกลบไปแล้ว)
- call site ที่ `ApplicationEdit.tsx:375` เปลี่ยน `meta={applicationMeta}` เป็น `audit={normalizeAudit(app)}`
- ลบบล็อก normalize ที่ `ApplicationEdit.tsx:148-150` และ field ใน interface บรรทัด 69-71
- เทสต์ที่ `ApplicationIdentityHero.test.tsx:71-73` ส่ง `created_at` / `updated_at` แบบแบน
  ให้ห่อด้วย `normalizeAudit({...})`

- [ ] **Step 5: แก้อีก 3 หน้า Edit ที่ไม่มี Hero**

สามหน้านี้ใช้ `<PageHeader audit={normalizeAudit(record)}>` ที่ `PageHeader` ของหน้า edit จริง
(ไม่ใช่จุด not-found หรือหน้า Add — record ยังไม่มีตัวตน)

| ไฟล์ | ของเดิมที่ต้องลบ |
|---|---|
| `ReportTemplateEdit.tsx` | การประกอบสตริงที่บรรทัด 751-755 (`` by ${metadata.created_by_name} ``) และ field บรรทัด 64-66 |
| `NewsEdit.tsx` | ฟังก์ชัน `fmt()` และบล็อกวาดที่บรรทัด 470-474 |
| `BroadcastEdit.tsx` | `<Label>Created by</Label>` และช่องที่คู่กัน บรรทัด 358 |

- [ ] **Step 6: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่ — ถ้า typecheck แดงที่ `ClusterEdit.tsx` หรือ `ApplicationEdit.tsx`
แปลว่าแก้ call site ไม่ครบ

- [ ] **Step 7: รันเทสต์ทั้งชุด**

รัน: `bun run test`
คาดหวัง: PASS ทั้งหมด — `ClusterHero.test.tsx` และ `ApplicationIdentityHero.test.tsx`
จะแดงถ้ายังแก้ prop ในเทสต์ไม่ครบ

- [ ] **Step 8: ตรวจในเบราว์เซอร์**

รัน `bun run dev:dev` แล้วเปิด `/clusters/<id>`
ตรวจ:
- ในการ์ด Hero มีบรรทัด `Created 5mo ago by ... · Updated 2h ago by ...`
- hover แล้วขึ้นเวลาเต็ม
- **ไม่มี** แถบ audit ซ้ำใต้หัวข้อหน้า (เพราะหน้านี้ไม่ได้ใส่ PageHeader audit)
- เข้า `/clusters/new` แล้ว Hero ต้องไม่แสดง audit

เปิด `/report-templates/<id>` — ต้องมีแถบ `Created ... by ...` ใต้หัวข้อ

- [ ] **Step 9: commit**

```bash
git add src/pages/ClusterEdit.tsx src/pages/ApplicationEdit.tsx \
        src/pages/ReportTemplateEdit.tsx src/pages/NewsEdit.tsx src/pages/BroadcastEdit.tsx \
        src/pages/clusterManagement/ClusterHero.tsx src/pages/clusterManagement/ClusterHero.test.tsx \
        src/pages/applicationEdit/ApplicationIdentityHero.tsx \
        src/pages/applicationEdit/ApplicationIdentityHero.test.tsx
git commit -m "refactor(audit): หน้า Edit และ Hero ที่คู่กันใช้ AuditMeta"
```

---

### Task 8: sub-list ที่เหลือ 3 ไฟล์

> **`RoleIdentityHero` ถูกตัดออกจากงานนี้** ตามคำวินิจฉัยตอน pre-flight scan — component
> ไม่มี prop ที่เป็น record ให้ normalize (`RoleIdentityHero.tsx:26-32` มีแค่
> name/isActive/permissions/catalogSize/actions) การเพิ่มต้องแก้ทั้ง signature และ call site
> ที่ `RoleEdit.tsx:389` เพียงเพื่อแสดงข้อมูลที่ Task 10 จะใส่บน `PageHeader` ของหน้าเดียวกันอยู่แล้ว

**Files:**
- Modify: `src/pages/userManagement/UserDirectorySummary.tsx`
- Modify: `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx`
- Modify: `src/pages/platformConfig/NotificationEmailConfigCard.tsx`

**Interfaces:**
- Consumes: `normalizeAudit` (Task 1) · `AuditMeta` (Task 2)
- Produces: ไม่มี

- [ ] **Step 1: แก้ `UserDirectorySummary.tsx`**

บรรทัด 34 ปัจจุบันคือ:

```ts
const createdAt = (u: UserLike) => u.created_at ?? u.audit?.created?.at ?? '';
```

เปลี่ยนเป็น:

```ts
const createdAt = (u: UserLike) => normalizeAudit(u).created?.at ?? '';
```

**คง logic การจัดกลุ่มที่ใช้ค่านี้ไว้เหมือนเดิมทุกประการ** — เปลี่ยนแค่วิธีอ่านค่า
เพิ่ม import: `import { normalizeAudit } from '../../utils/audit';`

- [ ] **Step 2: แก้ `BusinessUnitsSection.tsx`**

ในแต่ละแถว BU เติมบรรทัด compact:

```tsx
<AuditMeta variant="compact" actor={normalizeAudit(bu).updated ?? normalizeAudit(bu).created} />
```

ใช้ `updated ?? created` เพราะแถวมีพื้นที่บรรทัดเดียว "แก้ล่าสุดเมื่อไหร่" มีค่ากว่า
"สร้างเมื่อไหร่" และถ้ายังไม่เคยแก้ก็ถอยไปแสดงตอนสร้าง

- [ ] **Step 3: แก้ `NotificationEmailConfigCard.tsx`**

เติมบรรทัด compact ท้ายการ์ดด้วย pattern เดียวกับ Step 2

- [ ] **Step 4: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 5: รันเทสต์ทั้งชุด**

รัน: `bun run test`
คาดหวัง: PASS ทั้งหมด รวม `UserDirectorySummary.test.tsx` ที่มีอยู่แล้ว

- [ ] **Step 6: commit**

```bash
git add src/pages/userManagement/UserDirectorySummary.tsx \
        src/pages/clusterEdit/sections/BusinessUnitsSection.tsx \
        src/pages/platformConfig/NotificationEmailConfigCard.tsx
git commit -m "refactor(audit): sub-list ใช้ AuditMeta variant compact"
```

---

### Task 9: `PlatformConfigManagement` และ `broadcastColumns`

**Files:**
- Modify: `src/pages/PlatformConfigManagement.tsx`
- Modify: `src/pages/broadcastManagement/broadcastColumns.tsx`

**Interfaces:**
- Consumes: `normalizeAudit` (Task 1) · `AuditMeta` (Task 2) · `auditColumns` (Task 3)
- Produces: ไม่มี

**ทำไมแยกเป็น task เอง:** `PlatformConfigManagement.tsx` อ่านฟิลด์แบน **7 จุด** มากที่สุดในแอป
และเป็นหน้าที่ backend ยังไม่ enrich (spec ข้อ 4.3 ระบุว่าเสี่ยงสุด) ควรได้ review แยก

- [ ] **Step 1: แก้ `PlatformConfigManagement.tsx`**

ไล่ทั้ง 7 จุดที่อ่าน `created_at` / `updated_at` / `created_by` / `updated_by` ตรง ๆ
เปลี่ยนให้อ่านผ่าน `normalizeAudit(config)` และวาดด้วย `<AuditMeta variant="compact">`

หาจุดทั้งหมดด้วย:

```bash
grep -n "created_at\|updated_at\|created_by\|updated_by" src/pages/PlatformConfigManagement.tsx
```

**สำคัญ:** หน้านี้เป็นการ์ด ไม่มีตาราง — ใช้ `variant="compact"` ไม่ใช่ `auditColumns`

- [ ] **Step 2: แก้ `broadcastManagement/broadcastColumns.tsx`**

บรรทัด 129 มี `header: 'Created by'` เป็นคอลัมน์ที่เขียนเอง — เปลี่ยนมาใช้
`...auditColumns<BroadcastListItem>()` แทน แล้วลบคอลัมน์เดิมทิ้ง

- [ ] **Step 3: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิด `/platform-configs` และ `/broadcasts`
ตรวจว่าข้อมูล audit ยังแสดงเหมือนเดิม (แค่เปลี่ยนเป็น relative time) **ไม่หายไป**
— หน้านี้ backend ยังส่งฟิลด์แบนอยู่ ถ้าหายแปลว่า `normalizeAudit` อ่าน flat ไม่ได้

- [ ] **Step 5: commit**

```bash
git add src/pages/PlatformConfigManagement.tsx src/pages/broadcastManagement/broadcastColumns.tsx
git commit -m "refactor(audit): PlatformConfig และ broadcastColumns ใช้ของกลาง"
```

---

## เฟส C — เติมหน้าที่ยังไม่มี (17 ไฟล์)

> **คาดหมายไว้ล่วงหน้า:** หน้ากลุ่ม licenses และ EmailSetting จะยัง **ว่าง** ในเฟสนี้
> เพราะ backend ยังไม่ส่ง audit มา (จะเต็มเองในแผน backend เฟส D) ว่างแบบเงียบตามนโยบาย
> "ซ่อนเมื่อไม่มี" ในข้อ 2 ของ spec — **ไม่ใช่บั๊ก อย่าไล่แก้**

### Task 10: หน้า Edit 5 หน้าที่ยังไม่มี audit

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx`
- Modify: `src/pages/RoleEdit.tsx`
- Modify: `src/pages/UserEdit.tsx`
- Modify: `src/pages/UserPlatformEdit.tsx`
- Modify: `src/pages/DatabasePoolEdit.tsx`

**Interfaces:**
- Consumes: `normalizeAudit` (Task 1) · prop `audit` บน `PageHeader` (Task 4)
- Produces: ไม่มี

- [ ] **Step 1: แก้ทั้ง 5 ไฟล์**

แต่ละไฟล์: หา `<PageHeader` ที่เป็นหน้า edit ของ record จริง (ไม่ใช่ not-found / Add)
แล้วเติม prop:

```tsx
audit={normalizeAudit(record)}
```

โดย `record` คือ object ที่ได้จาก API ตรง ๆ ก่อนถูกแปลงเป็น `formData` — ถ้าหน้าไหน
ไม่ได้เก็บ record ดิบไว้ ให้เพิ่ม state ใหม่:

```ts
const [rawRecord, setRawRecord] = useState<unknown>(null);
```

แล้ว `setRawRecord(data)` ในที่เดียวกับที่ setState ตัวอื่นตอนโหลดสำเร็จ

เพิ่ม import ทุกไฟล์:

```ts
import { normalizeAudit } from '../utils/audit';
```

**ห้ามเก็บ audit ไว้ใน `formData`** — เหตุผลเดียวกับที่ CLAUDE.md ห้ามเก็บ `doc_version`
ใน `formData`: มันไม่ใช่ค่าที่ผู้ใช้แก้ และจะทำให้ `useUnsavedChanges` เข้าใจผิดว่ามีการแก้

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 3: รันเทสต์ทั้งชุด**

รัน: `bun run test`
คาดหวัง: PASS ทั้งหมด

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิดหน้า edit ของ BU, Role, User สักหน้าละหนึ่ง record
ตรวจว่ามีแถบ `Created ... by ...` ใต้ชื่อ
เปิด `/database-pools/<id>` — **คาดว่ายังว่าง** เพราะ backend ยังไม่ส่ง ไม่ใช่บั๊ก

- [ ] **Step 5: ตรวจว่าไม่ทำ unsaved-guard พัง**

ในหน้า edit ที่แก้ ให้เปิดหน้าแล้วกด Cancel ทันทีโดยไม่แก้อะไร
คาดหวัง: **ไม่มี** dialog เตือน unsaved changes — ถ้ามี แปลว่าเผลอใส่ audit เข้า `formData`

- [ ] **Step 6: commit**

```bash
git add src/pages/BusinessUnitEdit.tsx src/pages/RoleEdit.tsx src/pages/UserEdit.tsx \
        src/pages/UserPlatformEdit.tsx src/pages/DatabasePoolEdit.tsx
git commit -m "feat(audit): เติมแถบ meta ให้หน้า Edit อีก 5 หน้า"
```

---

### Task 11: ตาราง 4 ตัวที่ยังไม่มี audit

**Files:**
- Modify: `src/pages/licenses/SubscriptionTable.tsx`
- Modify: `src/pages/licenses/ClusterLicenseTable.tsx`
- Modify: `src/pages/licenses/PurchaseLicenseTable.tsx`
- Modify: `src/pages/clusterAdmin/MembersTable.tsx`

**Interfaces:**
- Consumes: `auditColumns` (Task 3) · `normalizeAudit`, `auditCsvFields` (Task 1)
- Produces: ไม่มี

- [ ] **Step 1: แก้ทั้ง 4 ไฟล์**

เพิ่ม spread ท้าย `columns` array ภายใน `useMemo`:

```ts
...auditColumns<T>({ hideUpdatedOnCard: true }),
```

โดย `T` คือ type ของแถวในตารางนั้น
import: `import { auditColumns } from '../../components/auditColumns';`

ถ้าตารางไหนมี CSV export ให้เติม `auditCsvFields` ตาม pattern ใน Task 5 Step 1

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 3: ตรวจในเบราว์เซอร์**

เปิด `/licenses`
คาดหวัง: คอลัมน์ Created / Updated **โผล่ขึ้นมาแต่ว่างเปล่า** เพราะ backend ยังไม่ส่ง
นี่คือสภาพที่ตั้งใจไว้ — จะเต็มเองหลังแผน backend

- [ ] **Step 4: commit**

```bash
git add src/pages/licenses/SubscriptionTable.tsx src/pages/licenses/ClusterLicenseTable.tsx \
        src/pages/licenses/PurchaseLicenseTable.tsx src/pages/clusterAdmin/MembersTable.tsx
git commit -m "feat(audit): เติมคอลัมน์ audit ให้ตาราง licenses และ MembersTable"
```

---

### Task 12: หน้า Config 3 หน้า และ sub-list 5 ไฟล์

**Files:**
- Modify: `src/pages/EmailSettingManagement.tsx`
- Modify: `src/pages/ReportFormGroupManagement.tsx`
- Modify: `src/pages/PermissionCatalog.tsx`
- Modify: `src/pages/userEdit/UserAccessTree.tsx`
- Modify: `src/pages/licenses/sections/SeatSection.tsx`
- Modify: `src/pages/licenses/sections/BuQuotaSection.tsx`
- Modify: `src/pages/licenses/sections/SubscriptionSection.tsx`
- Modify: `src/pages/reportFormGroups/GroupCard.tsx`

**Interfaces:**
- Consumes: `normalizeAudit` (Task 1) · `AuditMeta` (Task 2)
- Produces: ไม่มี

- [ ] **Step 1: แก้ทั้ง 8 ไฟล์**

ทุกไฟล์เป็นการ์ดหรือรายการ ไม่ใช่ตาราง — ใช้ `variant="compact"` วางท้ายการ์ด/แถว:

```tsx
<AuditMeta variant="compact" actor={normalizeAudit(item).updated ?? normalizeAudit(item).created} />
```

> ใช้ `updated ?? created` เพราะการ์ด config มีพื้นที่บรรทัดเดียว "แก้ล่าสุดเมื่อไหร่"
> มีค่ากว่า "สร้างเมื่อไหร่" และถ้ายังไม่เคยแก้ ก็ถอยไปแสดงตอนสร้าง

import:

```ts
import { AuditMeta } from '../components/AuditMeta';
import { normalizeAudit } from '../utils/audit';
```

> ไฟล์ใน subdirectory ใช้ `'../../components/AuditMeta'` และ `'../../utils/audit'`

**`PermissionCatalog.tsx` คาดว่าจะว่างถาวร** — `tb_permission` เป็น seed data ที่
`created_by_id` เป็น null ทั้งตาราง ใส่ไว้เพื่อความสม่ำเสมอ ไม่ใช่เพื่อผลลัพธ์ (spec เฟส C)

- [ ] **Step 2: static check**

รัน: `bun run typecheck && bun run lint`
คาดหวัง: เขียวทั้งคู่

- [ ] **Step 3: รันเทสต์ทั้งชุด**

รัน: `bun run test`
คาดหวัง: PASS ทั้งหมด

- [ ] **Step 4: commit**

```bash
git add src/pages/EmailSettingManagement.tsx src/pages/ReportFormGroupManagement.tsx \
        src/pages/PermissionCatalog.tsx src/pages/userEdit/UserAccessTree.tsx \
        src/pages/licenses/sections/SeatSection.tsx src/pages/licenses/sections/BuQuotaSection.tsx \
        src/pages/licenses/sections/SubscriptionSection.tsx src/pages/reportFormGroups/GroupCard.tsx
git commit -m "feat(audit): เติม audit ให้หน้า Config และ sub-list"
```

---

## Task 13: ตรวจงานรวมทั้งแผน

**Files:** ไม่แก้ไฟล์ — เป็น task ตรวจอย่างเดียว

**Interfaces:**
- Consumes: ผลงานจาก Task 1-12
- Produces: รายงานผลตรวจ

- [ ] **Step 1: static check ทั้ง repo**

รัน: `CI=true bun run typecheck && CI=true bun run lint`
คาดหวัง: เขียวทั้งคู่ (`CI=true` ทำให้ warning นับเป็น error)

- [ ] **Step 2: รันเทสต์ทั้งชุด**

รัน: `bun run test`
คาดหวัง: PASS ทั้งหมด รวม `src/utils/audit.test.ts` 15 เคส

- [ ] **Step 3: ตรวจว่าไม่มีโค้ดเก่าหลงเหลือ**

รัน:

```bash
grep -rn "audit?.created?.at\|audit?.updated?.at" src/pages src/components --include="*.tsx" --include="*.ts" | grep -v "\.test\." | grep -v "src/utils/audit.ts"
```

คาดหวัง: **ไม่มีผลลัพธ์** — ทุกจุดต้องอ่านผ่าน `normalizeAudit()` แล้ว
ถ้ายังมี แปลว่ามีไฟล์ที่ตกหล่นจาก Task 5-12

- [ ] **Step 4: นับ CSV ว่าครบ**

รัน:

```bash
echo "หน้าที่มีคอลัมน์ audit: $(grep -rl 'auditColumns' src/pages --include='*.tsx' | grep -v '\.test\.' | wc -l)"
echo "หน้าที่ export audit ลง CSV: $(grep -rl 'auditCsvFields' src/pages --include='*.tsx' | grep -v '\.test\.' | wc -l)"
```

คาดหวัง: ตัวเลขที่สองต้องเท่ากับจำนวนหน้าที่มีทั้ง `auditColumns` **และ** ปุ่ม export CSV
ถ้าน้อยกว่า ให้ไล่ดูว่าหน้าไหนมี `generateCSV` แต่ไม่มี `auditCsvFields`

- [ ] **Step 5: ตรวจ 4 ระดับในเบราว์เซอร์**

รัน `bun run dev:dev` แล้วตรวจ:

| ระดับ | URL | ต้องเห็น |
|---|---|---|
| ตาราง Management | `/clusters` | คอลัมน์ Created/Updated เป็น `5mo ago` hover ขึ้นเวลาเต็ม |
| หน้า Edit | `/clusters/<id>` | แถบ `Created ... by ...` ใต้ชื่อ |
| sub-list | `/clusters/<id>` ส่วน Business units | บรรทัด compact ในแต่ละแถว |
| การ์ด Config | `/platform-configs` | บรรทัด compact ท้ายการ์ด |

- [ ] **Step 6: ตรวจ viewport 390px**

ในเบราว์เซอร์ ย่อหน้าต่างให้ `window.innerWidth === 390` (ตรวจด้วย console ไม่ใช่กะจาก
screenshot — ขนาดหน้าต่างกับ viewport ไม่เท่ากัน) แล้วเปิด `/clusters/<id>`

คาดหวัง: แถบ meta ใต้หัวข้อไม่ล้นขอบ ไม่ดันปุ่ม Edit ตกบรรทัด

- [ ] **Step 7: ตรวจ CSV จริง**

ที่ `/clusters` กดปุ่ม export CSV แล้วเปิดไฟล์ที่ได้
คาดหวัง: คอลัมน์ `Created at` เป็น `2026-03-12T14:22:07.000Z` **ไม่ใช่** `5mo ago`

- [ ] **Step 8: เทียบจำนวนแถวที่มี Updated ก่อน/หลัง**

ความเสี่ยงที่ spec ข้อ 6 ระบุไว้: กฎ "เคยแก้หรือยัง" เปลี่ยนจากการเทียบ timestamp เป็นการดู
ชื่อคนแก้ แถวที่เคยแสดง/ซ่อนอาจสลับกัน

ที่ `/clusters` นับว่ามีกี่แถวที่คอลัมน์ Updated ไม่ว่าง แล้วเทียบกับ production ปัจจุบัน
ถ้าต่างกันมากผิดปกติ **ให้เปิด DevTools ดู response ดิบก่อนสรุปว่าเป็นบั๊ก** — อาจเป็นการ
แก้ให้ถูกต้องตามที่ตั้งใจ

- [ ] **Step 9: เปิด PR**

```bash
git push -u origin feature/audit-metadata-everywhere
gh pr create --title "feat(audit): แสดง created/updated by+date ทุกส่วนของแอป (frontend)" \
  --body "$(cat <<'BODY'
ทำตาม docs/superpowers/specs/2026-08-22-audit-metadata-everywhere-design.md เฟส A-C

- เพิ่ม normalizeAudit() อ่าน response ได้ทั้ง nested และแบน
- เพิ่ม AuditMeta 3 variant และ factory auditColumns()
- PageHeader รับ prop audit
- แปลง 26 ไฟล์เดิมมาใช้ของกลาง ลบ fmt() ที่คัดลอกกัน 7 ชุด
- เติม audit ให้อีก 17 ไฟล์ที่ยังไม่มี

หน้ากลุ่ม licenses / EmailSetting / DatabasePool จะยังว่างจนกว่าแผน backend (เฟส D)
จะขึ้น — เป็นสภาพที่ตั้งใจไว้ ไม่ใช่บั๊ก

**ต้อง merge และ deploy ก่อนแผน backend เสมอ** เพราะ mutateToAuditShape ฝั่ง gateway
ลบฟิลด์แบนทิ้ง (spec ข้อ 4.3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0158iPRxEcTEQQMu7eKeyKQ9
BODY
)"
```

---

## สรุปการครอบคลุม spec

| หัวข้อ spec | Task ที่ทำ |
|---|---|
| 3.1 `src/utils/audit.ts` | Task 1 |
| 3.2 `AuditMeta` 3 variant | Task 2 |
| 3.3 `auditColumns()` factory | Task 3 |
| 3.4 prop `audit` บน `PageHeader` | Task 4 |
| 3.5 ไม่แตะ `data-table.tsx` | Global Constraints + Task 3 Step 2 |
| เฟส B — Management 13 ไฟล์ | Task 5, 6 |
| เฟส B — Edit 5 ไฟล์ + Hero 2 ตัว (รวมตาม Ruling 1) | Task 7 |
| เฟส B — sub-list 3 ไฟล์ (RoleIdentityHero ตัดออกตาม Ruling 3) | Task 8 |
| เฟส B — PlatformConfig + broadcastColumns | Task 9 |
| เฟส C — Edit 5 ไฟล์ | Task 10 |
| เฟส C — Management 4 ไฟล์ | Task 11 |
| เฟส C — Config 3 + sub-list 5 | Task 12 |
| CSV 36 จุด | Task 5, 6, 11 + ตรวจนับใน Task 13 Step 4 |
| ข้อ 6 ความเสี่ยงทั้ง 6 ข้อ | Task 8 (signature), Task 10 Step 5 (unsaved), Task 13 Step 4/6/8 |
| ข้อ 7 วิธีตรวจงาน | Task 13 |
| เฟส D (backend) | **ไม่อยู่ในแผนนี้** — แผนแยก |
