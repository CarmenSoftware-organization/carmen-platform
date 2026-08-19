import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitLicensesCard from './BusinessUnitLicensesCard';
import type { BusinessUnitLicense } from '../../types';

const NOW = new Date('2026-08-19T00:00:00.000Z');

const lic = (o: Partial<BusinessUnitLicense>): BusinessUnitLicense => ({
  id: 'l1', business_unit_id: 'bu1', licensed_users: 10,
  start_date: '2026-01-01T00:00:00.000Z', end_date: '2026-12-31T00:00:00.000Z',
  doc_version: 0, ...o,
});

// สิทธิ์ต้องขับผ่าน AuthContext ไม่ใช่ prop — `<Can>` *คือ* ตรรกะสิทธิ์ การ mock มันทิ้ง
// ทำให้เทสต์สิทธิ์ผ่านหมดโดยไร้ความหมาย (กฎ 18 ของ CLAUDE.md)
const auth = vi.hoisted(() => ({ permissions: ['cluster.read', 'subscription.manage'] as string[] }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (p: string) => auth.permissions.includes(p),
    isSuperAdmin: false,
  }),
}));

const base = {
  loading: false, saving: false,
  clusterSeat: { used: 12, cap: 15 },
  onCreate: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(),
  now: NOW,
};

beforeEach(() => {
  auth.permissions = ['cluster.read', 'subscription.manage'];
});

describe('BusinessUnitLicensesCard', () => {
  it('แสดงผลรวมของใบที่ใช้ได้ ไม่ใช่ผลรวมทุกใบ', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[
      lic({ id: 'a', licensed_users: 10 }),
      lic({ id: 'b', licensed_users: 5, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
    ]} />);
    expect(screen.getByText(/15 ที่นั่ง/)).toBeInTheDocument();  // 10 active + 5 scheduled = pool ของ cluster
    expect(screen.getByText(/จาก 1 ใบที่ใช้ได้/)).toBeInTheDocument();
  });

  it('ใบที่หมดอายุถูกซ่อนไว้จนกว่าจะกดแสดง — เป็นประวัติ ไม่ใช่ noise', async () => {
    const user = userEvent.setup();
    render(<BusinessUnitLicensesCard {...base} licenses={[
      lic({ id: 'a' }),
      lic({ id: 'old', licensed_users: 8, start_date: '2025-01-01T00:00:00.000Z', end_date: '2025-12-31T00:00:00.000Z' }),
    ]} />);
    expect(screen.queryByText('8')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /แสดงใบที่หมดอายุ/ }));
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('ใบจาก migration ขึ้นป้ายว่าต้องระบุวันหมดอายุ', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({ note: 'migrated — ต้องระบุวันหมดอายุจริง', end_date: '2099-12-31T00:00:00.000Z' })]} />);
    expect(screen.getByText(/ต้องระบุวันหมดอายุ/)).toBeInTheDocument();
  });

  it('บอก pool ระดับ cluster เพราะเพดานไม่ใช่ของ BU นี้', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({})]} />);
    expect(screen.getByText(/12 \/ 15/)).toBeInTheDocument();
    expect(screen.getByText(/ทั้ง cluster/)).toBeInTheDocument();
  });

  it('ไม่มี subscription.manage = ไม่มีปุ่มเพิ่ม/แก้/ลบ แต่ยังเห็นรายการ', () => {
    auth.permissions = ['cluster.read'];  // ผู้ที่แก้ BU ได้ แต่ไม่ได้ดูแลสัญญา
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({})]} />);
    expect(screen.queryByRole('button', { name: /เพิ่มใบ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ลบ$/ })).not.toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();  // ยังอ่านได้
  });

  it('ลบใบต้องผ่าน ConfirmDialog ไม่ลบทันที', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<BusinessUnitLicensesCard {...base} onRemove={onRemove} licenses={[lic({})]} />);
    await user.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /ยืนยัน|Confirm/ }));
    expect(onRemove).toHaveBeenCalledWith('l1');
  });
});
