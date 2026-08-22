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
