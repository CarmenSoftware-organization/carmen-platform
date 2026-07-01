import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevDebugSheet } from './dev-debug-sheet';

describe('DevDebugSheet (import.meta.env.DEV is true under vitest)', () => {
  beforeEach(() => {
    // `@testing-library/user-event` v14 permanently replaces `navigator.clipboard`
    // with a getter-only accessor the first time `userEvent.setup()` runs in this
    // file (see node_modules/@testing-library/user-event/.../Clipboard.js
    // `attachClipboardStubToView`), so a later `Object.assign(navigator, {...})`
    // throws "Cannot set property clipboard of #<Navigator> which has only a
    // getter". `Object.defineProperty` replaces the whole (configurable)
    // descriptor instead of going through the missing setter, so it works
    // whether or not a prior test in this file already triggered that stub.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  it('renders nothing when there is no data', () => {
    const { container } = render(<DevDebugSheet title="X" data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the sheet from the FAB and shows the JSON', async () => {
    const user = userEvent.setup();
    render(<DevDebugSheet title="Cluster Data" endpoint="/api-system/clusters" data={{ id: 7 }} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    expect(await screen.findByText('Cluster Data')).toBeInTheDocument();
    expect(screen.getByText(/"id": 7/)).toBeInTheDocument();
  });

  it('copies the active data as JSON', async () => {
    const user = userEvent.setup();
    // `userEvent.setup()` (above) unconditionally replaces `navigator.clipboard`
    // with its own internal Clipboard stub (see the comment in `beforeEach`),
    // clobbering the `beforeEach` mock. Spy on the real stub's `writeText` here,
    // after `setup()` has run, so the assertion below can inspect the call.
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<DevDebugSheet title="X" data={{ id: 7 }} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ id: 7 }, null, 2));
  });

  it('switches tabs and shows that tab’s data', async () => {
    const user = userEvent.setup();
    render(<DevDebugSheet title="Edit" tabs={[
      { key: 'a', label: 'Cluster', data: { which: 'a' } },
      { key: 'b', label: 'Users', data: { which: 'b' } },
    ]} />);
    await user.click(screen.getByRole('button', { name: /debug/i }));
    expect(await screen.findByText(/"which": "a"/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Users' }));
    expect(screen.getByText(/"which": "b"/)).toBeInTheDocument();
  });
});
