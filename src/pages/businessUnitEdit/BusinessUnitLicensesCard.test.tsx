import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import BusinessUnitLicensesCard from './BusinessUnitLicensesCard';
import type { BusinessUnitLicense } from '../../types';

// Task 8: การ์ดนี้กลายเป็นสรุปอ่านอย่างเดียวถาวรแล้ว — การออก/แก้/ลบใบย้ายไปที่ License Center
// ทั้งหมด จึงไม่มี `<Can>` และไม่มี AuthContext ให้ mock อีกต่อไป (ต่างจากไฟล์เทสต์เดิมที่ยัง
// mock ไว้เพราะฟอร์มเก่ามีปุ่มที่คุมด้วยสิทธิ์)
const NOW = new Date('2026-08-19T00:00:00.000Z');

const lic = (o: Partial<BusinessUnitLicense>): BusinessUnitLicense => ({
  id: 'l1', business_unit_id: 'bu1', license_number: 'SEAT-2601-0001', licensed_users: 10,
  start_date: '2026-01-01T00:00:00.000Z', end_date: '2026-12-31T00:00:00.000Z',
  doc_version: 0, ...o,
});

const base = {
  loading: false,
  manageHref: '/licenses/c1#seats',
  now: NOW,
};

// `<Link>` ต้องมี Router context ถึงจะ render ได้โดยไม่โยน error
const renderCard = (props: Partial<ComponentProps<typeof BusinessUnitLicensesCard>> = {}) =>
  render(
    <MemoryRouter>
      <BusinessUnitLicensesCard {...base} licenses={[]} {...props} />
    </MemoryRouter>,
  );

describe('BusinessUnitLicensesCard', () => {
  it('แสดงผลรวมของใบที่ใช้ได้ ไม่ใช่ผลรวมทุกใบ', () => {
    // cap ตั้งใจเป็น 99 (ไม่ใช่ตัวเลขบังเอิญ) กันไม่ให้เทสต์ผ่านเพราะเลขชนกับ clusterSeat.cap
    // แทนที่จะตรงกับผลรวมที่นั่งจริงที่การ์ดคำนวณเอง
    renderCard({
      clusterSeat: { used: 12, cap: 99 },
      licenses: [
        lic({ id: 'a', licensed_users: 10 }),
        // ใบ 'b' ยัง scheduled (เริ่ม 2026-10-01, NOW = 2026-08-19) จึงไม่นับเข้าที่นั่งที่ใช้ได้
        lic({ id: 'b', licensed_users: 5, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
      ],
    });
    // ผลรวมต้องเป็น 10 (เฉพาะใบ 'a' ที่ active) ไม่ใช่ 15 (10+5 รวมทุกใบ)
    expect(screen.getByText(/^10 seats from/)).toBeInTheDocument();
    expect(screen.getByText(/1 active license$/)).toBeInTheDocument();
  });

  it('บอก pool ระดับ cluster เพราะเพดานไม่ใช่ของ BU นี้', () => {
    renderCard({ clusterSeat: { used: 12, cap: 15 }, licenses: [lic({})] });
    expect(screen.getByText(/12 \/ 15/)).toBeInTheDocument();
    expect(screen.getByText(/Cluster pool:/)).toBeInTheDocument();
  });

  it('แสดงป้ายใกล้หมดอายุสำหรับใบที่ active และเหลือน้อยกว่า 30 วัน', () => {
    renderCard({
      licenses: [lic({ id: 'soon', licensed_users: 10, start_date: '2026-01-01T00:00:00.000Z', end_date: '2026-09-10T00:00:00.000Z' })],
    });
    // 2026-08-19 → 2026-09-10 = 22 วัน (ปัดขึ้น)
    expect(screen.getByText('22 days left')).toBeInTheDocument();
  });

  it('ไม่แสดงป้ายใกล้หมดอายุเมื่อยังเหลือมากกว่า 30 วัน', () => {
    renderCard({ licenses: [lic({ id: 'far', end_date: '2027-12-31T00:00:00.000Z' })] });
    expect(screen.queryByText(/days left/)).not.toBeInTheDocument();
  });

  it('ลิงก์ "Manage licences" ไปตาม manageHref ที่ผู้เรียกส่งเข้ามา — การ์ดห้ามประกอบ URL เอง', () => {
    renderCard({ manageHref: '/licenses/cluster-1#seats' });
    expect(screen.getByRole('link', { name: 'Manage licences' })).toHaveAttribute('href', '/licenses/cluster-1#seats');
  });

  it('BU ที่ไม่สังกัด cluster — ผู้เรียกส่ง manageHref เป็น /licenses เฉย ๆ (ไม่มี id undefined ปน)', () => {
    renderCard({ manageHref: '/licenses' });
    expect(screen.getByRole('link', { name: 'Manage licences' })).toHaveAttribute('href', '/licenses');
  });

  it('cluster admin — manageHref ชี้เชลล์ของตัวเอง ไม่ใช่ /licenses/* ของ platform', () => {
    renderCard({ manageHref: '/cluster-admin/c1/licenses' });
    expect(screen.getByRole('link', { name: 'Manage licences' })).toHaveAttribute('href', '/cluster-admin/c1/licenses');
  });

  it('ไม่มีปุ่ม Add/Edit/Remove อีกต่อไป — การเขียนย้ายไปที่ License Center ทั้งหมด', () => {
    renderCard({ licenses: [lic({})] });
    expect(screen.queryByRole('button', { name: /Add license/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument();
  });

  it('loading = แสดง Loading แทนเลขที่นั่ง ไม่ใช่ 0 seats ที่หลอกตา', () => {
    renderCard({ loading: true, licenses: [] });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText(/seats from/)).not.toBeInTheDocument();
  });
});
