import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuSwitcher } from './BuSwitcher';
import type { BusinessUnit } from '../../types';

// Radix Dialog relies on pointer-capture / scroll APIs jsdom doesn't implement.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the switcher reads/writes it
// directly for the "recent BUs" list, so stub it with a fresh in-memory store.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

const BUS: BusinessUnit[] = [
  { id: '1', code: 'ACME-TH', name: 'Acme Thailand', cluster_name: 'Acme', is_active: true },
  { id: '2', code: 'ACME-SG', name: 'Acme Singapore', cluster_name: 'Acme', is_active: true },
  { id: '3', code: 'BETA-TH', name: 'Beta Thailand', cluster_name: 'Beta', is_active: true },
];

function setup(props: Partial<React.ComponentProps<typeof BuSwitcher>> = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <BuSwitcher
      open
      onOpenChange={onOpenChange}
      businessUnits={BUS}
      currentCode=""
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect, onOpenChange };
}

describe('BuSwitcher', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
  });

  it('filters BUs by the search query', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText('Search business units'), 'beta');
    expect(screen.getByText('Beta Thailand')).toBeInTheDocument();
    expect(screen.queryByText('Acme Thailand')).not.toBeInTheDocument();
  });

  it('connects the BU on click and closes', async () => {
    const user = userEvent.setup();
    const { onSelect, onOpenChange } = setup();
    await user.click(screen.getByText('Acme Thailand'));
    expect(onSelect).toHaveBeenCalledWith('ACME-TH');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('connects the active row on Enter', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    const input = screen.getByLabelText('Search business units');
    await user.type(input, 'singapore');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('ACME-SG');
  });

  it('marks the currently connected BU', () => {
    setup({ currentCode: 'ACME-TH' });
    const row = screen.getByText('ACME-TH').closest('[role="option"]') as HTMLElement;
    expect(within(row).getByText('connected')).toBeInTheDocument();
  });

  it('pins recently used BUs under a Recent heading', () => {
    localStorage.setItem('sqlwb_recent_bus', JSON.stringify(['BETA-TH']));
    setup();
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('records the connected BU as recent for next time', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('Acme Singapore'));
    expect(JSON.parse(localStorage.getItem('sqlwb_recent_bus') || '[]')).toContain('ACME-SG');
  });
});
