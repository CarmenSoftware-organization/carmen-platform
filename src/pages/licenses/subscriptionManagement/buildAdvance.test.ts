import { describe, it, expect } from 'vitest';
import { buildAdvance, type SubscriptionFilters } from './buildAdvance';
import type { SubscriptionState } from '../../../types';

const NOW = new Date('2026-08-18T00:00:00.000Z');
const ISO = NOW.toISOString();

// เงื่อนไขที่ควรได้ต่อ 1 state — ต้องตรงกับ deriveSubscriptionState ของ backend เป๊ะ
// (phase-b-backend-contract.md §2): status='expired' เป็น expired โดยไม่สนใจ end_date
const ACTIVE = { status: 'active', end_date: { gte: ISO } };
const INACTIVE = { status: 'inactive' };
const EXPIRED = { OR: [{ status: 'expired' }, { status: 'active', end_date: { lt: ISO } }] };

const filters = (over: Partial<SubscriptionFilters> = {}): SubscriptionFilters => ({
  search: '',
  states: [],
  expiringSoon: false,
  clusterId: '',
  ...over,
});

// 30 = ค่าตั้งต้นเดิมของเกณฑ์ "ใกล้หมดอายุ" — assertion ทุกข้อในไฟล์นี้จึงยังยืนยันพฤติกรรมเดิม
// 30 is the former default, so every assertion below still tests the same behaviour.
const advance = (over: Partial<SubscriptionFilters> = {}) => buildAdvance(filters(over), 30, NOW);
const parse = (raw: string) => JSON.parse(raw);

describe('buildAdvance', () => {
  it('returns an empty string when there is nothing to filter by', () => {
    expect(advance()).toBe('');
  });

  it('wraps a search term in a case-insensitive subscription_number contains clause', () => {
    expect(parse(advance({ search: '  SUB-001  ' }))).toEqual({
      where: {
        AND: [{ subscription_number: { contains: 'SUB-001', mode: 'insensitive' } }],
      },
    });
  });
});

// Review I1: the filter used to send `{ status: { in: [...] } }` — the raw column — while the
// table badge and the summary cards both show `state` (backend-derived from status + end_date).
// A row with status='active' and a past end_date has state='expired', so ticking Active pulled
// in rows whose badge said expired, ticking Expired dropped them, and the summary counted on a
// third basis again. Every clause below is the `state` value translated back onto real columns.
describe('buildAdvance — state filter is translated to status + end_date', () => {
  it('active means status=active AND end_date has not passed', () => {
    expect(parse(advance({ states: ['active'] }))).toEqual({
      where: { AND: [{ OR: [ACTIVE] }] },
    });
  });

  it('inactive means status=inactive, regardless of end_date', () => {
    expect(parse(advance({ states: ['inactive'] }))).toEqual({
      where: { AND: [{ OR: [INACTIVE] }] },
    });
  });

  it('expired means status=expired OR (status=active AND end_date already passed)', () => {
    expect(parse(advance({ states: ['expired'] }))).toEqual({
      where: { AND: [{ OR: [EXPIRED] }] },
    });
  });

  it('ORs the clauses together when several states are picked at once', () => {
    expect(parse(advance({ states: ['active', 'expired'] }))).toEqual({
      where: { AND: [{ OR: [ACTIVE, EXPIRED] }] },
    });
  });

  it('keeps the picked order and covers every state when all three are selected', () => {
    const all: SubscriptionState[] = ['active', 'expired', 'inactive'];
    expect(parse(advance({ states: all }))).toEqual({
      where: { AND: [{ OR: [ACTIVE, EXPIRED, INACTIVE] }] },
    });
  });

  it('never sends a bare status:{in:[...]} clause any more', () => {
    expect(advance({ states: ['active', 'inactive', 'expired'] })).not.toContain('"in"');
  });

  it('combines a search term with a state filter (both apply when expiringSoon is off)', () => {
    expect(parse(advance({ search: 'SUB-001', states: ['inactive'] }))).toEqual({
      where: {
        AND: [
          { subscription_number: { contains: 'SUB-001', mode: 'insensitive' } },
          { OR: [INACTIVE] },
        ],
      },
    });
  });
});

// Review M3: spec §8.1 lists a cluster filter alongside status/expiring-soon. `cluster_id` IS a
// real column of tb_subscription (unlike `cluster_name`, which only exists via the join), so it
// filters directly rather than through a translation.
describe('buildAdvance — cluster filter', () => {
  it('adds a cluster_id equality clause when a cluster is picked', () => {
    expect(parse(advance({ clusterId: 'c1' }))).toEqual({
      where: { AND: [{ cluster_id: 'c1' }] },
    });
  });

  it('adds nothing when the cluster filter is empty (= all clusters)', () => {
    expect(advance({ clusterId: '' })).toBe('');
  });

  it('ANDs the cluster with the search term and the state filter', () => {
    expect(parse(advance({ search: 'SUB', states: ['active'], clusterId: 'c9' }))).toEqual({
      where: {
        AND: [
          { subscription_number: { contains: 'SUB', mode: 'insensitive' } },
          { cluster_id: 'c9' },
          { OR: [ACTIVE] },
        ],
      },
    });
  });

  it('still applies while expiringSoon is on (only the state filter is overridden, not cluster)', () => {
    const parsed = parse(advance({ clusterId: 'c1', expiringSoon: true }));
    expect(parsed.where.AND).toContainEqual({ cluster_id: 'c1' });
    expect(parsed.where.AND).toContainEqual({ status: 'active' });
  });
});

describe('buildAdvance — expiring soon', () => {
  // The corrections spec (task-B2-corrections.md #4): "ใกล้หมดอายุ" ต้องบังคับ status=active
  // เสมอ — ไม่สนใจค่า state ที่ผู้ใช้ติ๊กไว้ก่อนหน้า.
  it('forces active and ignores the passed-in state filter when expiringSoon is on', () => {
    const until = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(parse(advance({ states: ['inactive', 'expired'], expiringSoon: true }))).toEqual({
      where: {
        AND: [
          { status: 'active' },
          { end_date: { gte: ISO, lte: until.toISOString() } },
        ],
      },
    });
  });

  it('still combines a search term with the expiringSoon clause', () => {
    const until = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(parse(advance({ search: 'SUB-9', expiringSoon: true }))).toEqual({
      where: {
        AND: [
          { subscription_number: { contains: 'SUB-9', mode: 'insensitive' } },
          { status: 'active' },
          { end_date: { gte: ISO, lte: until.toISOString() } },
        ],
      },
    });
  });

  it('never expires-soon a row whose end_date already passed (lower bound is now, not open)', () => {
    const parsed = parse(advance({ expiringSoon: true }));
    const endClause = parsed.where.AND.find((c: Record<string, unknown>) => 'end_date' in c);
    expect(endClause.end_date.gte).toBe(ISO);
  });
});
