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

describe('normalizeAudit — รูปแบบ actor เป็น object', () => {
  it('อ่าน created_by ที่เป็น object { id, name }', () => {
    const a = normalizeAudit({ created_at: CREATED_AT, created_by: { id: 'u1', name: 'สมชาย' } });
    expect(a.created).toEqual({ at: CREATED_AT, id: 'u1', name: 'สมชาย' });
  });

  it('created_by_name แบบสตริงชนะ created_by แบบ object เมื่อมีทั้งคู่', () => {
    const a = normalizeAudit({
      created_at: CREATED_AT, created_by_name: 'จากสตริง', created_by: { id: 'u1', name: 'จาก object' },
    });
    expect(a.created?.name).toBe('จากสตริง');
  });

  it('เก็บ id ไว้แม้ object จะไม่มี name', () => {
    const a = normalizeAudit({ created_at: CREATED_AT, created_by: { id: 'u1' } });
    expect(a.created?.id).toBe('u1');
    expect(a.created?.name).toBeUndefined();
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
