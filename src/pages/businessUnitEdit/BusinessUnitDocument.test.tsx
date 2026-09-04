import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialFormData } from './types';
import type { BusinessUnitFormData } from './types';

// Mutable auth so `<Can>` (the REAL component, rendered inside DatabaseConnectionSection —
// never mocked here) has an AuthContext to read via useAuth(). Without this, mounting the
// document throws "useAuth must be used within an AuthProvider" the moment the DB pool
// section's edit-mode branch reaches its <Can permission="database_pool.read"> gate.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../services/databasePoolService', () => ({
  default: { getAll: vi.fn() },
}));

import BusinessUnitDocument from './BusinessUnitDocument';
import { tabForField, type BuTab, type BuTabId } from './BusinessUnitTabs';
import databasePoolService from '../../services/databasePoolService';

beforeEach(() => {
  vi.mocked(databasePoolService.getAll).mockResolvedValue({ data: [] });
});

const TABS: BuTab[] = [
  { id: 'general', label: 'General' },
  { id: 'location', label: 'Location' },
  { id: 'formats', label: 'Formats' },
  { id: 'technical', label: 'Technical' },
  { id: 'users', label: 'Users' },
];

const setup = (overrides: Partial<React.ComponentProps<typeof BusinessUnitDocument>> = {}) => {
  const onCommit = vi.fn();
  const onValidate = vi.fn();
  const noop = vi.fn();
  render(
    <BusinessUnitDocument
      tabs={TABS}
      activeTab="general"
      onTabChange={noop}
      formData={initialFormData}
      fieldErrors={{}}
      clusterName="-"
      clusters={[]}
      defaultCurrency={null}
      getCalculationMethodLabel={(m) => m}
      canEdit
      activeSeats={0}
      activeLicenseCount={0}
      onCommit={onCommit}
      onToggle={noop}
      onValidate={onValidate}
      onCopyHotelAddress={noop}
      onChange={noop}
      onBlur={noop}
      onFocus={noop}
      onConfigChange={noop}
      onAddConfigRow={noop}
      onRemoveConfigRow={noop}
      onPoolChange={noop}
      {...overrides}
    />,
  );
  return { onCommit, onValidate };
};

// Every field the one-document rewrite must keep editable. Each entry is the
// formData key plus the label it renders under. Fields that reach formData but
// have no control here can never be set on create nor changed on edit — the
// `code` regression (400 on create) was exactly this.
const EDITABLE_FIELDS: [keyof BusinessUnitFormData, string][] = [
  ['alias_name', 'Alias'],
  ['description', 'Description'],
  ['hotel_name', 'Hotel name'],
  ['hotel_address_line1', 'Address line 1'],
  ['hotel_address_line2', 'Address line 2'],
  ['hotel_sub_district', 'Sub-district'],
  ['hotel_district', 'District'],
  ['hotel_city', 'City'],
  ['hotel_province', 'Province'],
  ['hotel_postal_code', 'Postal code'],
  ['hotel_country', 'Country'],
  ['hotel_latitude', 'Latitude'],
  ['hotel_longitude', 'Longitude'],
  ['hotel_tel', 'Phone'],
  ['hotel_email', 'Email'],
  ['company_name', 'Company'],
  ['company_tel', 'Company phone'],
  ['company_email', 'Company email'],
  ['company_address_line1', 'Company address line 1'],
  ['company_address_line2', 'Company address line 2'],
  ['company_sub_district', 'Company sub-district'],
  ['company_district', 'Company district'],
  ['company_city', 'Company city'],
  ['company_province', 'Company province'],
  ['company_postal_code', 'Company postal code'],
  ['company_country', 'Company country'],
  ['company_latitude', 'Company latitude'],
  ['company_longitude', 'Company longitude'],
  ['tax_no', 'Tax ID'],
  ['branch_no', 'Branch'],
  ['timezone', 'Timezone'],
  ['date_format', 'Date format'],
  ['date_time_format', 'Date-time format'],
  ['time_format', 'Time format'],
  ['long_time_format', 'Long time format'],
  ['short_time_format', 'Short time format'],
];

describe('BusinessUnitDocument', () => {
  // Each field is opened on the tab `tabForField()` claims owns it, so a field routed to the
  // wrong tab fails here rather than silently disappearing from the page.
  it.each(EDITABLE_FIELDS)('lets the user edit %s', async (name, label) => {
    const user = userEvent.setup();
    const { onCommit } = setup({ activeTab: tabForField(name) as BuTabId });

    await user.click(screen.getByRole('button', { name: new RegExp(`^set ${label}…$`, 'i') }));
    // getByLabelText resolves both <input type="text"> and type="number"; a
    // duplicated label (hotel vs company) would make this throw on ambiguity.
    await user.type(screen.getByLabelText(label), '12');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(name, '12');
  });

  it('Max users เป็นค่าอ่านอย่างเดียว — แก้ได้ที่การ์ด User Licenses เท่านั้น', () => {
    setup({ activeSeats: 15, activeLicenseCount: 2 });

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/From 2 active licenses/)).toBeInTheDocument();
    // ไม่ใช่ queryByLabelText('Max users') — InlineField ใส่ aria-label ให้ตัวควบคุมเฉพาะตอน
    // editing === true เท่านั้น โหมดอ่านเป็น <button> ล้วนไม่มี aria-label เลย ดังนั้น
    // queryByLabelText จะผ่านเสมอไม่ว่าฟิลด์นี้จะยังเป็น InlineField ที่แก้ได้อยู่หรือไม่
    // (ไม่มีใครคลิกเข้า edit mode ในเทสต์นี้) — ต้องเช็คปุ่มคลิกเข้าโหมดแก้ไขแทน ปุ่มนั้นคือปุ่มเดียว
    // ที่ EDITABLE_FIELDS ด้านบนคลิกเพื่อเปิดทุกแถว (ชื่อปุ่ม "Set <label>…") ถ้าฟิลด์นี้ย้อนกลับไป
    // เป็น InlineField ปุ่มนี้จะกลับมาปรากฏและ assertion นี้จะแดง (ดูหลักฐาน RED ใน task-3.5-report.md)
    expect(screen.queryByRole('button', { name: /max users/i })).not.toBeInTheDocument();
  });
});

describe('BusinessUnitDocument — copy hotel address to company', () => {
  it('shows a "Copy from hotel address" action on the Company group when editable, and wires it through onCopyHotelAddress', async () => {
    const user = userEvent.setup();
    const onCopyHotelAddress = vi.fn();
    setup({ onCopyHotelAddress, activeTab: 'location' });

    const button = screen.getByRole('button', { name: /copy from hotel address/i });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(onCopyHotelAddress).toHaveBeenCalledTimes(1);
  });

  it('hides the copy-from-hotel-address action when not editable', () => {
    setup({ canEdit: false, activeTab: 'location' });

    expect(screen.queryByRole('button', { name: /copy from hotel address/i })).not.toBeInTheDocument();
  });
});

describe('BusinessUnitDocument - character counters', () => {
  it('shows a 0 / 500 counter when editing the description', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /^set description…$/i }));
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });
});
