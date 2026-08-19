import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // cap ตั้งใจเป็น 99 (ไม่ใช่ 15 ของ base) กันไม่ให้เทสต์ผ่านเพราะตัวเลขบังเอิญตรงกับ
    // clusterSeat.cap แทนที่จะตรงกับผลรวมที่นั่งจริงที่การ์ดคำนวณเอง
    render(<BusinessUnitLicensesCard {...base} clusterSeat={{ used: 12, cap: 99 }} licenses={[
      lic({ id: 'a', licensed_users: 10 }),
      lic({ id: 'b', licensed_users: 5, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
    ]} />);
    // ใบ 'b' ยัง scheduled (เริ่ม 2026-10-01, NOW = 2026-08-19) จึงไม่นับเข้าที่นั่งที่ใช้ได้ —
    // ผลรวมต้องเป็น 10 (เฉพาะใบ 'a' ที่ active) ไม่ใช่ 15 (10+5 รวมทุกใบ)
    expect(screen.getByText(/^10 ที่นั่ง/)).toBeInTheDocument();
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

  // ยืนยันเป็นส่วนประกอบเวลาท้องถิ่น ไม่ใช่สตริง ISO ตายตัว — เครื่อง dev รัน +07 ส่วน CI รัน UTC
  // เทียบสตริงตรง ๆ จะเขียวที่หนึ่งแล้วแดงอีกที่หนึ่งโดยที่โค้ดไม่ผิด
  // ใช้ fireEvent.change กับ <input type="date"> เพราะการพิมพ์ทีละตัวอักษรลงช่องวันที่
  // ขึ้นกับ locale ของ jsdom
  it('วันหมดอายุครอบคลุมถึงสิ้นวันตามเวลาผู้ใช้ ไม่ใช่เที่ยงคืน UTC', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<BusinessUnitLicensesCard {...base} licenses={[]} onCreate={onCreate} />);

    await user.click(screen.getAllByRole('button', { name: /เพิ่มใบ/ })[0]);
    fireEvent.change(screen.getByLabelText('จำนวนที่นั่ง'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('วันเริ่ม'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('วันหมดอายุ'), { target: { value: '2026-12-31' } });
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const { start_date, end_date } = onCreate.mock.calls[0][0];
    const start = new Date(start_date);
    const end = new Date(end_date);

    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([2026, 12, 1]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);

    expect([end.getFullYear(), end.getMonth() + 1, end.getDate()]).toEqual([2026, 12, 31]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()])
      .toEqual([23, 59, 59, 999]);

    // ส่งขึ้นสายเป็น UTC เสมอ ไม่ว่าเครื่องจะอยู่โซนไหน
    expect(end_date.endsWith('Z')).toBe(true);
    // ใบที่เริ่มและหมดวันเดียวกันต้องผ่าน CHECK `end_date > start_date` ของ DB
    expect(new Date(end_date).getTime()).toBeGreaterThan(new Date(start_date).getTime());
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
