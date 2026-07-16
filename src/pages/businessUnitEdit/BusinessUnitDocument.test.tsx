import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitDocument from './BusinessUnitDocument';
import { initialFormData } from './types';
import type { BusinessUnitFormData } from './types';

const setup = (overrides: Partial<React.ComponentProps<typeof BusinessUnitDocument>> = {}) => {
  const onCommit = vi.fn();
  const onValidate = vi.fn();
  const noop = vi.fn();
  render(
    <BusinessUnitDocument
      formData={initialFormData}
      fieldErrors={{}}
      clusterName="-"
      clusters={[]}
      defaultCurrency={null}
      getCalculationMethodLabel={(m) => m}
      canEdit
      onCommit={onCommit}
      onToggle={noop}
      onValidate={onValidate}
      onChange={noop}
      onBlur={noop}
      onFocus={noop}
      onConfigChange={noop}
      onAddConfigRow={noop}
      onRemoveConfigRow={noop}
      onDbFieldChange={noop}
      onDbExtraChange={noop}
      onAddDbExtraRow={noop}
      onRemoveDbExtraRow={noop}
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
  ['code', 'Code'],
  ['alias_name', 'Alias'],
  ['max_license_users', 'Max users'],
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
  it.each(EDITABLE_FIELDS)('lets the user edit %s', async (name, label) => {
    const user = userEvent.setup();
    const { onCommit } = setup();

    await user.click(screen.getByRole('button', { name: new RegExp(`^set ${label}…$`, 'i') }));
    // getByLabelText resolves both <input type="text"> and type="number"; a
    // duplicated label (hotel vs company) would make this throw on ambiguity.
    await user.type(screen.getByLabelText(label), '12');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(name, '12');
  });

  it('lets the user set the required code on a new business unit', async () => {
    const user = userEvent.setup();
    const { onCommit } = setup();

    await user.click(screen.getByRole('button', { name: /set code/i }));
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'HQ-01');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith('code', 'HQ-01');
  });

  it('validates the code on commit', async () => {
    const user = userEvent.setup();
    const { onValidate } = setup();

    await user.click(screen.getByRole('button', { name: /set code/i }));
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'x');
    await user.tab();

    expect(onValidate).toHaveBeenCalledWith('code', 'x');
  });
});
