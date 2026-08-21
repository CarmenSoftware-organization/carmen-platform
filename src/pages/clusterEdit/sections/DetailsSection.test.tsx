import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailsSection } from './DetailsSection';
import type { ClusterFormData } from '../../clusterManagement/ClusterIdentityFields';

// `max_license_bu` deliberately omitted — DetailsSection no longer renders it (Task 9); BU
// quota moved to the "BU Quota Licenses" card. The field stays optional on ClusterFormData
// only so clusterAdmin/ClusterProfile.tsx keeps compiling.
const formData: ClusterFormData = {
  code: 'CLS1',
  name: 'Acme',
  alias_name: 'ACM',
  is_active: true,
};

describe('DetailsSection', () => {
  it('renders values and lets an editor change a field', async () => {
    const onCommit = vi.fn();
    render(
      <DetailsSection
        formData={formData}
        fieldErrors={{}}
        canEdit
        onCommit={onCommit}
        onValidate={() => {}}
      />,
    );
    // Read shows the value.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    // Click name → input appears → type → blur commits.
    await userEvent.click(screen.getByRole('button', { name: /acme/i }));
    const input = screen.getByDisplayValue('Acme');
    await userEvent.clear(input);
    await userEvent.type(input, 'Acme 2');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith('name', 'Acme 2');
  });

  it('renders read-only (fields cannot be opened for editing) when canEdit is false', async () => {
    render(
      <DetailsSection
        formData={formData}
        fieldErrors={{}}
        canEdit={false}
        onCommit={() => {}}
        onValidate={() => {}}
      />,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    // The trigger exists but is disabled, and clicking it opens no input.
    const trigger = screen.getByRole('button', { name: /acme/i });
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    expect(screen.queryByDisplayValue('Acme')).toBeNull();
  });
});
