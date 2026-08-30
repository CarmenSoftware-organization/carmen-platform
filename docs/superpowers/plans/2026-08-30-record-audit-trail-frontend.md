# Record Audit Trail — แผน implement ฝั่ง Frontend

> **สำหรับ agentic worker:** REQUIRED SUB-SKILL — ใช้ `superpowers:subagent-driven-development`
> (แนะนำ) หรือ `superpowers:executing-plans` ทำทีละ task ขั้นตอนใช้ checkbox (`- [ ]`)

**Goal:** ปุ่มบนหน้า Cluster Edit ที่เปิด Sheet แสดง timeline การเปลี่ยนแปลงของ cluster นั้น
คลิกแถวกางดูว่าฟิลด์ไหนเปลี่ยนจากอะไรเป็นอะไร

**Architecture:** service ใหม่ยิง 2 endpoint ที่แผน backend เปิดไว้ · hook page-local
ที่มี generation-counter race guard · Sheet ตัวเดียวที่ถือทั้งปุ่มและเนื้อหา แถวกางได้โดยลอกท่าจาก
`CollapsibleGroupCard` (ไม่มี Accordion primitive ในรีโปและห้ามเพิ่มไลบรารี) ·
`detail` เรียกตอนกางครั้งแรกแล้ว cache

**Tech Stack:** React 19 + TypeScript · Vite · shadcn/ui + Tailwind · axios · Bun

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`

**Spec:** `docs/superpowers/specs/2026-08-30-record-audit-trail-design.md`

**กิ่ง:** `feature/cluster-record-audit-trail` (แตกจาก `main`)

---

## ⛔ เงื่อนไขก่อนเริ่ม

**แผนนี้เริ่มไม่ได้จนกว่าแผน backend จะ merge และ deploy DEV เสร็จ พร้อม seed permission แล้ว**
(`docs/superpowers/plans/2026-08-30-record-audit-trail-backend.md` Task 7)

ยืนยันก่อนเขียนโค้ดบรรทัดแรก — ยิง route จริงเทียบ route ปลอม:

```bash
# ต้องได้ 200 หรือ 403 (ไม่ใช่ 404)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  'https://<dev-host>/api-system/platform/activity-logs/record/<cluster-uuid>'
```

ถ้าได้ 404 **หยุด** — backend ยังไม่ขึ้น การเขียน FE ต่อจะเป็นการเดารูป response

---

## Global Constraints

- **ไม่เขียนเทสต์ใหม่** ตามคำสั่งผู้ใช้ — ไม่สร้าง `*.test.tsx` ใด ๆ
  **แต่ suite ที่มีอยู่ต้องยังเขียว** (`bun run test`)
- **ห้ามเพิ่มไลบรารีภายนอก** (กฎ 6 ของ `CLAUDE.md`) — ไม่มี Accordion/Collapsible ใน
  `src/components/ui/` และ **ห้ามลง `@radix-ui/react-accordion`** ให้ลอกท่าจากของที่มีอยู่
- **ห้ามแก้ `src/components/ui/`** โดยไม่ถาม (กฎ 2)
- **ห้าม hardcode ข้อความ** — ทุกสตริงที่ผู้ใช้เห็นต้องอยู่ใน `src/i18n/en.ts` + `src/i18n/th.ts`
- **`bun run typecheck` คือด่านตรวจ i18n** — `TKey` derive จาก `en.ts` แบบ type-level
  และ `th.ts:10` ประกาศ `const th: Translations` จึงบังคับว่า key ต้องครบทั้งคู่
  **ไม่ต้องรัน script ใด ๆ หลังเพิ่ม key**
- **overlay ของ `vite-plugin-checker` ค้างโชว์ TS error ปลอมหลังแก้ i18n catalog** —
  restart dev server ก่อนเชื่อ และเชื่อ `bun run typecheck` แยกเสมอ
- `t` ผูก identity กับ `lang` โดยตั้งใจ — `useMemo` ที่ใช้ `t` ต้องใส่ `t` ใน deps
  แต่ **ห้ามใส่ `t` ใน deps ของ `useEffect` ที่ยิง API** (จะยิงใหม่ทุกครั้งที่สลับภาษา)
- ฟิลด์ใหม่จาก API ประกาศเป็น **optional (`?`)** ทั้งหมด (กฎ 11)
- **`entity_type` บนสาย wire คือ `cluster` ไม่ใช่ `tb_cluster`** — `mapEntityType` ฝั่ง backend
  ตัด prefix `tb_` ออก

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/activityLogService.ts` | ยิง 2 endpoint ใต้ `/api-system/platform/activity-logs` |
| `src/pages/clusterEdit/useActivityTrail.ts` | fetch timeline + โหลดเพิ่ม + โหลด detail ทีละแถว |
| `src/pages/clusterEdit/ActivityTrailSheet.tsx` | ปุ่ม + Sheet + timeline + แถวกางได้ |
| `src/pages/clusterEdit/ActivityDiffView.tsx` | แสดง `changes` ของหนึ่งรายการ |

**แก้ไข**

| ไฟล์ | แก้อะไร |
|---|---|
| `src/types/index.ts` | เพิ่ม `ActivityLogEntry`, `ActivityDiff`, `ActivityFieldChange`, `ActivityChildChange`, `ActivityLogsResponse` |
| `src/pages/clusterEdit/ClusterPlate.tsx` | เพิ่ม prop `headerAction?: React.ReactNode` + ห่อแถว back link |
| `src/pages/ClusterEdit.tsx` | ส่ง `headerAction` + เติม tab ที่ 4 ใน `DevDebugSheet` |
| `src/i18n/en.ts` / `src/i18n/th.ts` | เพิ่มหมวด `pages.activityTrail.*` |

**hook อยู่ที่ `src/pages/clusterEdit/` ไม่ใช่ `src/hooks/`** — `agent-os/standards/hooks/hook-placement.md`
บอกให้เริ่มที่ page-local เสมอ แล้วย้ายขึ้นเมื่อมีหน้าที่สองต้องใช้ (ซึ่งจะเกิดในเฟส 2)

---

### Task 1: Types + service

**Files:**
- Create: `src/services/activityLogService.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `activityLogService.getRecordTrail(entityType, entityId, paginate): Promise<ActivityLogsResponse>` ·
  `activityLogService.getDetail(id): Promise<{ data: ActivityLogDetail }>` ·
  types ทั้งหมดด้านล่าง

- [ ] **Step 1: เพิ่ม types**

`src/types/index.ts` — เพิ่มหมวดใหม่ (วางต่อท้ายหมวด Usage Analytics ที่ `:1159`
เพื่อให้สองเรื่องที่ชื่อคล้ายกันอยู่ติดกันและอ่านความต่างได้):

```ts
// ==================== Record Audit Trail (tb_activity) ====================
// คนละตารางกับ Usage Analytics ข้างบน: ตรงนั้นคือ tb_activity_event (คลิก/page view)
// ส่วนนี่คือประวัติการแก้เรคอร์ดจริง พร้อมค่าก่อน/หลัง

export interface ActivityFieldChange {
  field: string;
  old?: unknown;
  new?: unknown;
}

export interface ActivityChildChange {
  relation: string;
  added?: Record<string, unknown>[];
  removed?: Record<string, unknown>[];
  updated?: { id: string; fields: ActivityFieldChange[] }[];
}

export interface ActivityDiff {
  fields?: ActivityFieldChange[];
  children?: ActivityChildChange[];
  has_changes?: boolean;
}

export interface ActivityLogEntry {
  id: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string | null;
  actor_username?: string | null;
  actor_firstname?: string | null;
  actor_middlename?: string | null;
  actor_lastname?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  description?: string | null;
  created_at?: string;
}

export type ActivityLogDetail = ActivityLogEntry & { changes?: ActivityDiff };

export type ActivityLogsResponse = ApiListResponse<ActivityLogEntry>;
```

ทุกฟิลด์นอก `id` เป็น optional ตามกฎ 11 — backend เพิ่งเปิด endpoint นี้ และรูปอาจขยับ

- [ ] **Step 2: เขียน service**

`src/services/activityLogService.ts` — ลอกรูปจาก `src/services/licenseFeatureGroupService.ts`
(ใช้ `const BASE` แล้วประกอบ URL ซึ่งสะอาดกว่าเมื่อมีหลาย endpoint ใต้ prefix เดียว):

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { ActivityLogDetail, ActivityLogsResponse, PaginateParams } from '../types';

const BASE = '/api-system/platform/activity-logs';

const activityLogService = {
  /**
   * ประวัติการเปลี่ยนแปลงของเรคอร์ดเดียว เรียงใหม่→เก่า (backend เรียงให้แล้ว)
   *
   * `entityType` คือชื่อตารางที่ตัด prefix `tb_` ออกแล้ว — backend เก็บ `cluster`
   * ไม่ใช่ `tb_cluster` ส่งผิดจะได้รายการว่างโดยไม่มี error
   */
  getRecordTrail: async (
    entityType: string,
    entityId: string,
    paginate: PaginateParams = {},
  ): Promise<ActivityLogsResponse> => {
    const qs = buildQuery(paginate);
    const response = await api.get(
      `${BASE}/record/${entityId}?entity_type=${encodeURIComponent(entityType)}${qs ? `&${qs}` : ''}`,
    );
    return response.data;
  },

  getDetail: async (id: string): Promise<{ data: ActivityLogDetail }> => {
    const response = await api.get(`${BASE}/${id}/detail`);
    return { data: response.data?.data ?? response.data };
  },
};

export default activityLogService;
```

`getDetail` unwrap แบบยอมรับได้ทั้ง `{ data }` และ object เปล่า — เป็น convention ที่ getter
ตัวเดียวอื่น ๆ ในรีโปใช้ (`analyticsService.getOverview`)

- [ ] **Step 3: ยืนยันรูป response กับของจริงบน DEV**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  'https://<dev-host>/api-system/platform/activity-logs/record/<cluster-uuid>?entity_type=cluster' \
  | python3 -m json.tool | head -40
```

เทียบกับ `ActivityLogEntry` ที่เพิ่งประกาศ **ถ้าชื่อฟิลด์ไม่ตรงให้แก้ type ตามของจริง
ไม่ใช่แก้ backend** และถ้ารายการว่างทั้งที่เพิ่งแก้ cluster ไป ให้ลองไม่ส่ง `entity_type`
เพื่อดูว่าค่าที่ backend เก็บคืออะไรกันแน่

- [ ] **Step 4: typecheck + lint + commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b feature/cluster-record-audit-trail
bun run typecheck
bunx eslint src/services/activityLogService.ts src/types/index.ts
git add src/services/activityLogService.ts src/types/index.ts
git commit -m "feat(activity-trail): service + types สำหรับประวัติการเปลี่ยนแปลงเรคอร์ด

entity_type บนสาย wire ตัด prefix tb_ ออกแล้ว — ส่ง 'cluster' ไม่ใช่ 'tb_cluster'"
```

---

### Task 2: Hook

**Files:**
- Create: `src/pages/clusterEdit/useActivityTrail.ts`

**Interfaces:**
- Consumes: `activityLogService` (Task 1)
- Produces:
```ts
useActivityTrail(entityType: string, entityId: string | undefined, enabled: boolean): {
  entries: ActivityLogEntry[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
  details: Record<string, ActivityLogDetail | undefined>;
  detailLoading: Record<string, boolean>;
  loadDetail: (id: string) => void;
  rawResponse: unknown;
}
```

- [ ] **Step 1: เขียน hook**

`src/pages/clusterEdit/useActivityTrail.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import activityLogService from '../../services/activityLogService';
import { getErrorDetail } from '../../utils/errorParser';
import type { ActivityLogDetail, ActivityLogEntry } from '../../types';

const PER_PAGE = 20;

/**
 * โหลดประวัติการเปลี่ยนแปลงของเรคอร์ดหนึ่งตัว พร้อมโหลด diff ทีละแถวตอนกาง
 *
 * `enabled` ผูกกับสถานะเปิด/ปิดของ Sheet — ปิดแล้วไม่ยิง request แต่ **ไม่ล้าง state**
 * เปิดใหม่ต้องเห็นของเดิมทันที ไม่ใช่กะพริบว่างแล้วโหลดซ้ำ
 * (agent-os/standards/hooks/fetch-race-guards.md)
 *
 * ใช้ generation counter ไม่ใช่ cancelled flag เพราะ entityId เปลี่ยนได้ระหว่างที่ request
 * ยังบินอยู่ — สอง request ที่ทับกันจะเป็น "current" ได้ทั้งคู่ถ้าใช้แค่ flag
 */
export function useActivityTrail(
  entityType: string,
  entityId: string | undefined,
  enabled: boolean,
) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [details, setDetails] = useState<Record<string, ActivityLogDetail | undefined>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  const generationRef = useRef(0);
  // เรคอร์ดที่ผลลัพธ์ปัจจุบันเป็นของมัน — กันโหลดซ้ำเมื่อเปิด-ปิด Sheet เรื่อย ๆ
  const loadedIdRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    (targetPage: number, append: boolean) => {
      if (!entityId) return;
      const generation = ++generationRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');

      activityLogService
        .getRecordTrail(entityType, entityId, { page: targetPage, perpage: PER_PAGE })
        .then((response) => {
          if (generation !== generationRef.current) return;
          const list = response.data || [];
          setEntries((prev) => (append ? [...prev, ...list] : list));
          setTotal(response.paginate?.total ?? list.length);
          setRawResponse(response);
        })
        .catch((err: unknown) => {
          if (generation !== generationRef.current) return;
          setError(getErrorDetail(err));
          // ให้ลองใหม่ได้: ลืมว่าเคยโหลดเรคอร์ดนี้แล้ว
          if (!append) loadedIdRef.current = null;
        })
        .finally(() => {
          if (generation !== generationRef.current) return;
          if (append) setLoadingMore(false);
          else setLoading(false);
        });
    },
    [entityType, entityId],
  );

  useEffect(() => {
    if (!enabled || !entityId) return;
    if (loadedIdRef.current === entityId) return;
    loadedIdRef.current = entityId;
    setPage(1);
    fetchPage(1, false);
  }, [enabled, entityId, fetchPage]);

  const hasMore = entries.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  const loadDetail = useCallback(
    (id: string) => {
      // cache: กางซ้ำไม่ยิงใหม่ และไม่ยิงซ้อนระหว่างที่ตัวแรกยังบิน
      setDetailLoading((prev) => {
        if (prev[id]) return prev;
        return { ...prev, [id]: true };
      });
      setDetails((prev) => {
        if (prev[id] !== undefined) return prev;
        activityLogService
          .getDetail(id)
          .then(({ data }) => setDetails((d) => ({ ...d, [id]: data })))
          .catch((err: unknown) => setError(getErrorDetail(err)))
          .finally(() => setDetailLoading((d) => ({ ...d, [id]: false })));
        return prev;
      });
    },
    [],
  );

  return {
    entries, total, loading, loadingMore, error,
    hasMore, loadMore,
    details, detailLoading, loadDetail,
    rawResponse,
  };
}
```

⚠️ `loadDetail` ที่เขียนแบบเรียก service **ภายใน** `setDetails` updater ผิดกฎ React
(updater ต้องบริสุทธิ์) — เขียนใหม่ให้ตรวจ cache ด้วย ref แทน:

```ts
  const detailRequestedRef = useRef<Set<string>>(new Set());

  const loadDetail = useCallback((id: string) => {
    if (detailRequestedRef.current.has(id)) return;
    detailRequestedRef.current.add(id);
    setDetailLoading((prev) => ({ ...prev, [id]: true }));
    activityLogService
      .getDetail(id)
      .then(({ data }) => setDetails((d) => ({ ...d, [id]: data })))
      .catch((err: unknown) => {
        setError(getErrorDetail(err));
        // ให้กางใหม่แล้วลองอีกครั้งได้
        detailRequestedRef.current.delete(id);
      })
      .finally(() => setDetailLoading((d) => ({ ...d, [id]: false })));
  }, []);
```

**ใช้เวอร์ชันหลังนี้** — เวอร์ชันแรกเขียนไว้ให้เห็นว่าทำไมถึงผิด

- [ ] **Step 2: typecheck + lint + commit**

```bash
bun run typecheck
bunx eslint src/pages/clusterEdit/useActivityTrail.ts
git add src/pages/clusterEdit/useActivityTrail.ts
git commit -m "feat(activity-trail): hook โหลด timeline + diff ทีละแถว

generation counter ไม่ใช่ cancelled flag เพราะ entityId เปลี่ยนได้ระหว่าง request บิน
enabled=false หยุดยิงแต่ไม่ล้าง state — เปิด Sheet ใหม่ต้องเห็นของเดิม"
```

---

### Task 3: มุมมอง diff

**Files:**
- Create: `src/pages/clusterEdit/ActivityDiffView.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `ActivityDiff` (Task 1)
- Produces: `<ActivityDiffView changes={diff} />`

- [ ] **Step 1: เพิ่มคีย์ i18n**

`src/i18n/en.ts` — เพิ่มหมวดใหม่ใต้ `pages:` (วางถัดจาก `activityEvents` เพื่อให้สองเรื่อง
ที่ชื่อคล้ายกันอยู่ติดกัน):

```ts
    activityTrail: {
      buttonLabel: 'Change history',
      title: 'Change history',
      description: 'Every recorded change to this record — who changed it, when, and what changed',
      // ไม่ใช่ 'ไม่มีประวัติ' โดยเจตนา: เรคอร์ดที่ไม่เคยถูกแก้กับเรคอร์ดที่ถูกแก้ก่อนระบบ
      // เริ่มบันทึก หน้าตาเหมือนกันทุกประการ การเขียนว่า "ไม่มี" จะทำให้ผู้ใช้สรุปผิด
      emptyTitle: 'No recorded changes',
      emptyDescription: 'Recording started on {{date}}. Changes made before then are not kept.',
      loadMore: 'Load more',
      changedFields: '{{count}} fields changed',
      noFieldChanges: 'No field changes recorded',
      // ค่าที่ถูกปิดบังตอนบันทึก — บอกว่า "เปลี่ยน" ได้ แต่บอกไม่ได้ว่าเปลี่ยนเป็นอะไร
      redactedValue: 'Changed (value hidden)',
      emptyValue: 'empty',
      childSummary: '{{relation}}: {{added}} added, {{removed}} removed, {{updated}} changed',
      showHousekeeping: 'Show system fields',
      actionCreate: 'created',
      actionUpdate: 'updated',
      actionDelete: 'deleted',
      loadError: 'Could not load the change history',
    },
```

`src/i18n/th.ts` — เพิ่มบล็อกเดียวกันเป็นภาษาไทยครบทุกคีย์
(`th.ts:10` ประกาศ `const th: Translations` ดังนั้นขาดคีย์ใด = compile error)

- [ ] **Step 2: เขียนคอมโพเนนต์**

`src/pages/clusterEdit/ActivityDiffView.tsx`:

```tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { ActivityDiff, ActivityFieldChange } from '../../types';

/**
 * ฟิลด์ที่ระบบเขียนเองทุกครั้งที่บันทึก — backend ส่งมาใน `fields` แต่ไม่นับใน
 * `has_changes` ซ่อนไว้เพราะมันจะกลบฟิลด์จริงที่ผู้ใช้อยากเห็น
 */
const HOUSEKEEPING = new Set(['updated_at', 'updated_by_id', 'doc_version']);

const REDACTED = '[REDACTED]';

const renderValue = (value: unknown, t: ReturnType<typeof useI18n>['t']): string => {
  if (value === REDACTED) return t('pages.activityTrail.redactedValue');
  if (value === null || value === undefined || value === '') return t('pages.activityTrail.emptyValue');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const FieldRow: React.FC<{ change: ActivityFieldChange }> = ({ change }) => {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-xs">
      <span className="text-muted-foreground truncate font-mono">{change.field}</span>
      <span className="text-muted-foreground line-through break-all">
        {renderValue(change.old, t)}
      </span>
      <span className="break-all">{renderValue(change.new, t)}</span>
    </div>
  );
};

export const ActivityDiffView: React.FC<{ changes?: ActivityDiff }> = ({ changes }) => {
  const { t } = useI18n();
  const fields = (changes?.fields ?? []).filter((f) => !HOUSEKEEPING.has(f.field));
  const children = changes?.children ?? [];

  if (fields.length === 0 && children.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('pages.activityTrail.noFieldChanges')}</p>;
  }

  return (
    <div className="space-y-2">
      {fields.length > 0 && (
        <div className="divide-border divide-y">
          {fields.map((f) => (
            <FieldRow key={f.field} change={f} />
          ))}
        </div>
      )}
      {/* ตารางลูกสรุปเป็นตัวเลข — กางลึกกว่านี้ในแผ่นแคบอ่านไม่ไหว */}
      {children.map((c) => (
        <p key={c.relation} className="text-muted-foreground text-xs">
          {t('pages.activityTrail.childSummary', {
            relation: c.relation,
            added: c.added?.length ?? 0,
            removed: c.removed?.length ?? 0,
            updated: c.updated?.length ?? 0,
          })}
        </p>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: typecheck + lint + commit**

```bash
bun run typecheck
bunx eslint src/pages/clusterEdit/ActivityDiffView.tsx src/i18n/en.ts src/i18n/th.ts
git add src/pages/clusterEdit/ActivityDiffView.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(activity-trail): มุมมอง diff รายฟิลด์

ซ่อน updated_at/updated_by_id/doc_version เพราะ backend ไม่นับใน has_changes อยู่แล้ว
และถ้าโชว์จะกลบฟิลด์จริง

ค่าที่ถูก redact แสดงเป็นประโยค ไม่ใช่ [REDACTED] ดิบ"
```

---

### Task 4: Sheet + ปุ่ม

**Files:**
- Create: `src/pages/clusterEdit/ActivityTrailSheet.tsx`

**Interfaces:**
- Consumes: `useActivityTrail` (Task 2) · `<ActivityDiffView>` (Task 3)
- Produces:
```ts
interface ActivityTrailSheetProps {
  entityType: string;
  entityId?: string;
  recordingStartedOn: string;
  /** ส่ง response ดิบกลับให้หน้าแม่เอาไปใส่ DevDebugSheet — hook อยู่ในนี้ หน้าแม่เข้าถึงตรงไม่ได้ */
  onRawResponse?: (raw: unknown) => void;
}
```

- [ ] **Step 1: เขียนคอมโพเนนต์**

`src/pages/clusterEdit/ActivityTrailSheet.tsx`:

```tsx
import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { EmptyState } from '../../components/EmptyState';
import { AuditMeta } from '../../components/AuditMeta';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { useActivityTrail } from './useActivityTrail';
import { ActivityDiffView } from './ActivityDiffView';
import type { TKey } from '../../i18n/types';
import type { ActivityLogEntry } from '../../types';

interface ActivityTrailSheetProps {
  entityType: string;
  entityId?: string;
  recordingStartedOn: string;
  onRawResponse?: (raw: unknown) => void;
}

const VERB_KEYS: Record<string, TKey> = {
  create: 'pages.activityTrail.actionCreate',
  update: 'pages.activityTrail.actionUpdate',
  delete: 'pages.activityTrail.actionDelete',
};

/** ชื่อผู้ทำ: ชื่อ-สกุล → username → id — backend อาจให้มาไม่ครบทั้งสามชั้น */
const actorName = (entry: ActivityLogEntry): string | undefined => {
  const full = [entry.actor_firstname, entry.actor_lastname].filter(Boolean).join(' ').trim();
  return full || entry.actor_username || entry.actor_id || undefined;
};

const TrailRow: React.FC<{
  entry: ActivityLogEntry;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  changes?: React.ComponentProps<typeof ActivityDiffView>['changes'];
}> = ({ entry, expanded, onToggle, loading, changes }) => {
  const { t } = useI18n();
  const contentId = useId();
  const fieldCount = changes?.fields?.length;

  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className="focus-visible:ring-ring flex w-full items-center gap-3 py-3 text-left focus-visible:ring-1 focus-visible:outline-hidden"
      >
        <span className="min-w-0 flex-1">
          <AuditMeta
            variant="compact"
            verbKey={entry.action ? VERB_KEYS[entry.action] : undefined}
            actor={{ at: entry.created_at, name: actorName(entry) }}
            className="text-muted-foreground text-xs"
          />
        </span>
        {/* summary ไม่ใช่ของประดับ: หัวข้อเปล่าบังคับให้กางทุกแถวเพื่อรู้ว่าข้างในมีอะไร
            ก่อนกางยังไม่รู้จำนวน (มาจาก detail) จึงเป็น '-' แล้วเปลี่ยนเมื่อข้อมูลมาถึง */}
        <span className="text-muted-foreground shrink-0 text-xs">
          {fieldCount === undefined ? '-' : t('pages.activityTrail.changedFields', { count: fieldCount })}
        </span>
        <ChevronDown
          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <div id={contentId} className="pb-3">
          {loading ? <Skeleton className="h-16 w-full" /> : <ActivityDiffView changes={changes} />}
        </div>
      )}
    </div>
  );
};

/** โครงกระดูกที่กระจกกับเลย์เอาต์จริง เพื่อไม่ให้อะไรกระตุกตอนข้อมูลมาถึง */
const TrailSkeleton: React.FC = () => (
  <div className="divide-border divide-y">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-3 py-3">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="size-4" />
      </div>
    ))}
  </div>
);

export const ActivityTrailSheet: React.FC<ActivityTrailSheetProps> = ({
  entityType,
  entityId,
  recordingStartedOn,
  onRawResponse,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const trail = useActivityTrail(entityType, entityId, open);

  useEffect(() => {
    if (trail.rawResponse !== null) onRawResponse?.(trail.rawResponse);
  }, [trail.rawResponse, onRawResponse]);

  const toggle = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    trail.loadDetail(id); // มี cache ในตัว — กางซ้ำไม่ยิงใหม่
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="mr-2 h-4 w-4" />
        {t('pages.activityTrail.buttonLabel')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t('pages.activityTrail.title')}</SheetTitle>
            <SheetDescription>{t('pages.activityTrail.description')}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* error แสดง inline ในแผ่น ไม่ใช่ toast — แผ่นนี้มีที่แสดงของตัวเอง
                (agent-os/standards/hooks/hook-placement.md) */}
            {trail.error && (
              <p className="text-destructive text-sm">
                {t('pages.activityTrail.loadError')} — {trail.error}
              </p>
            )}

            {trail.loading && trail.entries.length === 0 && <TrailSkeleton />}

            {!trail.loading && trail.entries.length === 0 && !trail.error && (
              <EmptyState
                icon={History}
                title={t('pages.activityTrail.emptyTitle')}
                description={t('pages.activityTrail.emptyDescription', { date: recordingStartedOn })}
              />
            )}

            {trail.entries.length > 0 && (
              <div>
                {trail.entries.map((entry) => (
                  <TrailRow
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() => toggle(entry.id)}
                    loading={!!trail.detailLoading[entry.id]}
                    changes={trail.details[entry.id]?.changes}
                  />
                ))}
              </div>
            )}

            {trail.hasMore && (
              <Button
                variant="outline"
                className="w-full"
                disabled={trail.loadingMore}
                onClick={trail.loadMore}
              >
                {t('pages.activityTrail.loadMore')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
```

**สิ่งที่ลอกมาและห้ามเปลี่ยน:**

| ของ | ที่มา |
|---|---|
| `SheetContent className="w-full overflow-y-auto sm:max-w-xl"` | `src/pages/activityEvents/EventDetailSheet.tsx` — ปุ่มปิดมุมขวาบนมีให้อยู่แล้ว |
| `useId` + `aria-expanded`/`aria-controls` + `ChevronDown` หมุน 180° | `src/pages/clusterAdmin/licenses/CollapsibleGroupCard.tsx:21-48` |
| `summary` ที่บอกจำนวนฟิลด์ | คอมเมนต์ `CollapsibleGroupCard.tsx:19` — หัวข้อเปล่าบังคับให้กางทุกใบ |
| skeleton ที่กระจกเลย์เอาต์จริง | หลักที่ `ClusterEdit.tsx:388-390` |

**ห้ามใช้ Accordion primitive** — ไม่มีใน `src/components/ui/` และห้ามเพิ่มไลบรารี (กฎ 6)

⚠️ ตรวจ import path ให้ตรงของจริงก่อนรัน — `EmptyState` และ `AuditMeta` อาจเป็น default export:

```bash
grep -n "^export" src/components/EmptyState.tsx src/components/AuditMeta.tsx
grep -rn "cn" src/lib/utils.ts | head -3
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
bun run typecheck
bunx eslint src/pages/clusterEdit/ActivityTrailSheet.tsx
git add src/pages/clusterEdit/ActivityTrailSheet.tsx
git commit -m "feat(activity-trail): Sheet timeline พร้อมแถวกางดู diff

แถวกางได้ลอกท่าจาก CollapsibleGroupCard เพราะไม่มี Accordion ใน ui/ และห้ามเพิ่ม lib
empty state บอกวันที่เริ่มบันทึก — 'ไม่มีประวัติ' เฉย ๆ ทำให้เข้าใจผิดว่าไม่เคยถูกแก้"
```

---

### Task 5: ผูกเข้าหน้า Cluster Edit

**Files:**
- Modify: `src/pages/clusterEdit/ClusterPlate.tsx`
- Modify: `src/pages/ClusterEdit.tsx`

**Interfaces:**
- Consumes: `<ActivityTrailSheet>` (Task 4)
- Produces: `ClusterPlateProps.headerAction?: React.ReactNode`

- [ ] **Step 1: เพิ่ม prop `headerAction` ใน ClusterPlate**

`src/pages/clusterEdit/ClusterPlate.tsx`:

1. เพิ่มใน `ClusterPlateProps` (`:72-89`):

```ts
  /** ปุ่มที่วางคู่กับ back link — ทางเดียวที่จะแทรกของเข้าหัวแผ่นได้ เพราะ ClusterPlate ไม่รับ children */
  headerAction?: React.ReactNode;
```

2. เพิ่มใน destructure (`:101-118`): `headerAction,`

3. ห่อแถว back link (`:128-134`) — เดิม `<Link>` อยู่เดี่ยว ๆ ในแถวเต็มความกว้าง:

```tsx
      <div className="flex items-center justify-between gap-3">
        <Link to={backTo} className="...คงคลาสเดิมทั้งหมด...">
          <ArrowLeft className="size-4" />
          {t('breadcrumb.clusters')}
        </Link>
        {headerAction}
      </div>
```

**ห้ามยัดปุ่มลงใน `<h1>`** — คอมเมนต์ที่ `:161-165` ห้ามไว้โดยเจตนา

- [ ] **Step 2: ส่งปุ่มเข้าไปจาก ClusterEdit**

`src/pages/ClusterEdit.tsx` — ในบล็อก `<ClusterPlate ... />` (`:514-535`) เพิ่ม prop:

```tsx
  headerAction={
    <Can permission="activity_log.read" clusterId={id ?? UNRESOLVED_CLUSTER_ID}>
      <ActivityTrailSheet
        entityType="cluster"
        entityId={id}
        recordingStartedOn={AUDIT_RECORDING_STARTED_ON}
      />
    </Can>
  }
```

⚠️ **`clusterId={undefined}` ไม่ใช่การเช็คแบบเข้ม** — มันตกไปกิ่ง "cluster ไหนก็ได้"
ที่ตั้งใจไว้สำหรับ nav/page visibility เท่านั้น (`src/utils/permissions.ts:17-27`)
ต้องส่ง `UNRESOLVED_CLUSTER_ID` (`permissions.ts:27`) เมื่อ id ยังไม่มา

ประกาศค่าคงที่ไว้บนสุดของไฟล์:

```tsx
/**
 * วันที่ระบบเริ่มบันทึกประวัติ — ใช้บอกผู้ใช้ว่าความว่างเปล่าใน Sheet แปลว่าอะไร
 *
 * เป็นค่าคงที่ในโค้ดโดยเจตนา ไม่ได้ดึงจาก API: backend ไม่มีข้อมูลนี้ และการ query
 * "แถวเก่าสุดใน tb_activity" จะให้คำตอบผิดสำหรับเรคอร์ดที่ไม่เคยถูกแก้เลย
 * อัปเดตค่านี้ให้ตรงกับวันที่ deploy backend จริง
 */
const AUDIT_RECORDING_STARTED_ON = '2026-08-30';
```

- [ ] **Step 3: เติม tab ที่ 4 ใน DevDebugSheet**

`ClusterEdit.tsx:744-757` มี `DevDebugSheet` พร้อม 3 tab อยู่แล้ว **เติม ไม่ใช่สร้างใหม่**

`useActivityTrail` ถูกเรียกอยู่ใน `ActivityTrailSheet` หน้าแม่จึงเข้าถึง `rawResponse`
ตรงไม่ได้ — ใช้ callback `onRawResponse` ที่ประกาศไว้ใน `ActivityTrailSheetProps` (Task 4)

ในหน้า:

```tsx
const [rawHistoryResponse, setRawHistoryResponse] = useState<unknown>(null);
```

แล้วส่งเข้า Sheet: `onRawResponse={setRawHistoryResponse}`
(`setState` มี identity คงที่ จึงไม่ทำให้ `useEffect` ใน Sheet วนซ้ำ)

เติมแถวที่ 4 ในอาร์เรย์ `tabs`:

```tsx
  { key: 'history', label: 'Change History', data: rawHistoryResponse,
    endpoint: `GET /api-system/platform/activity-logs/record/${id}?entity_type=cluster` },
```

`DevDebugSheet` คืน `null` เองถ้าไม่มี tab ไหนมี data จึงปลอดภัยที่จะเติมตอนค่ายังเป็น `null`

- [ ] **Step 4: typecheck + lint + suite เดิม**

```bash
bun run typecheck
bunx eslint src/pages/ClusterEdit.tsx src/pages/clusterEdit/ClusterPlate.tsx
bun run test
```

Expected: ทั้งสามผ่าน — **suite เดิมต้องเขียวทุกตัว** โดยเฉพาะเทสต์ที่แตะ `ClusterPlate`
ถ้ามีเทสต์ที่ยังเขียวทั้งที่ควรกระทบ ให้สงสัยว่ามันไม่ได้ assert DOM จริง

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClusterEdit.tsx src/pages/clusterEdit/ClusterPlate.tsx
git commit -m "feat(cluster-edit): ปุ่มดูประวัติการเปลี่ยนแปลงบนหัวหน้า

ClusterPlate ไม่รับ children จึงเพิ่ม prop headerAction แทนการยัดลง h1 ซึ่งคอมเมนต์ห้ามไว้
Can ส่ง UNRESOLVED_CLUSTER_ID เมื่อ id ยังไม่มา — undefined ตกไปกิ่ง any-cluster ที่ไม่เข้ม"
```

---

### Task 6: ตรวจในเบราว์เซอร์

**Files:** ไม่มีการแก้โค้ด

- [ ] **Step 1: รัน dev server ต่อ DEV backend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run dev:dev
```

(`vite --mode dev` → อ่าน `.env.dev` → พอร์ต 3304 รันได้ทีละตัวเท่านั้น)

⚠️ ถ้า overlay ของ `vite-plugin-checker` โชว์ TS error ที่ `bun run typecheck` บอกว่าไม่มี
— **restart dev server** ก่อนเชื่อ overlay

- [ ] **Step 2: ตรวจเส้นทางหลัก**

1. เปิด `/clusters/<id>` ที่ cluster ซึ่งเคยถูกแก้บน DEV
2. ปุ่ม "ประวัติการเปลี่ยนแปลง" ต้องอยู่คู่กับ back link ไม่ทับกับ sticky save bar หรือ FAB debug
3. กดแล้ว Sheet เปิด แสดง timeline ใหม่→เก่า
4. คลิกแถว → กางลงในตัว (ไม่ใช่เปิด Sheet ซ้อน) → เห็น `ชื่อฟิลด์ / ค่าเก่า / ค่าใหม่`
5. ปิดแล้วกางแถวเดิมซ้ำ → **ต้องไม่มี request ใหม่** (ดู Network tab)
6. ปิด Sheet แล้วเปิดใหม่ → **ต้องเห็นรายการเดิมทันที ไม่กะพริบว่าง**

- [ ] **Step 3: ตรวจ empty state พูดความจริง**

เปิด Sheet ที่ cluster ที่ไม่เคยถูกแก้เลย

Expected: ข้อความบอก**วันที่เริ่มบันทึก** ไม่ใช่แค่ "ไม่มีประวัติ"

- [ ] **Step 4: ตรวจสิทธิ์**

ล็อกอินด้วยบัญชีที่ไม่มี `activity_log.read`

Expected: **ไม่เห็นปุ่มเลย** (ไม่ใช่เห็นแล้วกดได้ 403)

จากนั้นบัญชีที่มี `read` แต่ไม่มี `detail`: เปิด timeline ได้ แต่กางแถวแล้วเห็นข้อความ error
ไม่ใช่จอขาว

- [ ] **Step 5: ตรวจ 390px**

ใช้ท่า iframe probe (ไม่ใช่ `resize_window` ซึ่งใช้ไม่ได้) วัด `innerWidth` จริง
ไม่ใช่ดูจาก screenshot

Expected: แผ่น Sheet เต็มความกว้าง (`w-full` มีอยู่แล้ว) แถว diff 3 คอลัมน์ไม่ล้น —
ถ้าล้น ให้เปลี่ยนเป็นเรียงลงบนมือถือ (`grid-cols-1 sm:grid-cols-3`)

- [ ] **Step 6: ตรวจสองภาษา**

สลับภาษาแล้วเปิด Sheet ซ้ำ

Expected: ข้อความเปลี่ยนครบทุกจุด **และไม่มี request ใหม่ถูกยิงตอนสลับภาษา**
(ถ้ามี แปลว่า `t` หลุดเข้าไปใน deps ของ `useEffect` ที่ยิง API)

- [ ] **Step 7: เปิด PR**

```bash
git push -u origin feature/cluster-record-audit-trail
gh pr create --base main \
  --title "feat(cluster-edit): ปุ่มดูประวัติการเปลี่ยนแปลงของเรคอร์ด" \
  --body "$(cat <<'BODY'
## สรุป
ปุ่มบนหัวหน้า Cluster Edit เปิด Sheet แสดง timeline การเปลี่ยนแปลง คลิกแถวกางดู diff รายฟิลด์

## ขึ้นกับ backend
ต้องมี `api-system/platform/activity-logs` บน DEV และ seed permission
`activity_log.read` / `activity_log.detail` แล้ว

## ตรวจแล้ว
- timeline + กาง diff + cache (กางซ้ำไม่ยิงใหม่)
- empty state บอกวันที่เริ่มบันทึก
- ไม่มีสิทธิ์ = ไม่เห็นปุ่ม
- 390px
- สลับภาษาไม่ยิง request ใหม่

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 8: หลัง merge — ยืนยันว่า DEV deploy จริง**

push `main` → `deploy-dev.yml` ทำงานอัตโนมัติ

```bash
gh run list --branch main --limit 5
```

⚠️ **อย่าใช้ `curl` ดู asset hash เพื่อยืนยัน** — edge cache หลอกได้ ให้เปิดในเบราว์เซอร์จริง
แล้วดูว่าปุ่มโผล่

**Vercel (production) ไม่ได้ deploy จากขั้นนี้** — ต้อง `git push origin main:vercel`
เป็นขั้นแยกต่างหาก และยังไม่ต้องทำจนกว่าจะตรวจ DEV ครบ
