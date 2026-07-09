import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SqlWorkbench from './SqlWorkbench';

// jsdom doesn't implement the PointerEvent capture / scroll APIs Radix's Select
// relies on for its open/click interaction. Polyfill them so the real Select
// component can be exercised the same way a user would (click to open, click an
// item) instead of weakening the test to skip the dropdown interaction.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock('../../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const hasPermission = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ hasPermission }),
}));

vi.mock('../../services/businessUnitService', () => ({
  default: {
    getAll: vi.fn().mockResolvedValue({
      data: [{ id: '1', code: 'T02', name: 'Test Hotel', is_active: true }],
    }),
  },
}));

vi.mock('../../services/sqlQueryService', () => ({
  default: {
    getDbObjects: vi
      .fn()
      .mockResolvedValue({ tables: [], views: [], procedures: [], columns: [] }),
    executeSql: vi.fn(),
    saveDdl: vi.fn(),
    dropObject: vi.fn(),
    getDefinition: vi.fn(),
  },
}));

// CodeMirror needs layout APIs jsdom lacks; stub the editor to a textarea.
vi.mock('./SqlEditor', () => ({
  SqlEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => <textarea aria-label="sql" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <SqlWorkbench />
    </MemoryRouter>,
  );

describe('SqlWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
  });

  it('shows the BU-gated empty state before a BU is chosen', async () => {
    renderPage();
    expect(await screen.findByText(/select a business unit to begin/i)).toBeInTheDocument();
  });

  it('reveals the editor after selecting a business unit', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByLabelText('Business unit'));
    await user.click(await screen.findByText('Test Hotel (T02)'));
    await waitFor(() => expect(screen.getByLabelText('sql')).toBeInTheDocument());
  });

  it('hides Save when the user lacks sql_workbench.manage', async () => {
    hasPermission.mockImplementation((k: string) => k !== 'sql_workbench.manage');
    renderPage();
    await screen.findByText(/select a business unit to begin/i);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });
});
