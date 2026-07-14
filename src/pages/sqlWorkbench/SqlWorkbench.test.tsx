import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SqlWorkbench from './SqlWorkbench';
import sqlQueryService from '../../services/sqlQueryService';

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

// Node 26 exposes bare `localStorage` as undefined; the BU switcher reads/writes
// it for its "recent BUs" list, so stub it with a fresh in-memory store per test.
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

const hasPermission = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ hasPermission }),
}));

vi.mock('../../services/businessUnitService', () => ({
  default: {
    getAll: vi.fn().mockResolvedValue({
      data: [
        { id: '1', code: 'T02', name: 'Test Hotel', is_active: true },
        { id: '2', code: 'T03', name: 'Other Hotel', is_active: true },
      ],
    }),
  },
}));

vi.mock('../../services/sqlQueryService', () => ({
  default: {
    getDbObjects: vi.fn().mockResolvedValue({
      tables: [],
      views: [{ schema: 'public', name: 'v_test' }],
      procedures: [],
      columns: [],
    }),
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
    vi.stubGlobal('localStorage', makeLocalStorage()); // fresh "recent BUs" store per test
    hasPermission.mockReturnValue(true);
  });

  // Open the BU switcher palette and connect to a BU by its display name.
  const connectBu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(await screen.findByLabelText('Switch business unit'));
    await user.click(await screen.findByText(name));
  };

  it('shows the BU-gated empty state before a BU is chosen', async () => {
    renderPage();
    expect(await screen.findByText(/select a business unit to begin/i)).toBeInTheDocument();
  });

  it('reveals the editor after selecting a business unit', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectBu(user, 'Test Hotel');
    await waitFor(() => expect(screen.getByLabelText('sql')).toBeInTheDocument());
  });

  it('hides Save when the user lacks sql_workbench.manage', async () => {
    hasPermission.mockImplementation((k: string) => k !== 'sql_workbench.manage');
    renderPage();
    await screen.findByText(/select a business unit to begin/i);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('discards a stale getDefinition response when the BU is switched mid-flight', async () => {
    const user = userEvent.setup();

    // A deferred getDefinition('T02', ...) promise we resolve manually, after the BU
    // has already been switched away from T02.
    let resolveDefinition!: (value: {
      type: string;
      schema: string;
      name: string;
      definition: string;
    }) => void;
    const deferred = new Promise<{
      type: string;
      schema: string;
      name: string;
      definition: string;
    }>((resolve) => {
      resolveDefinition = resolve;
    });
    vi.mocked(sqlQueryService.getDefinition).mockReturnValueOnce(deferred);

    renderPage();

    // Pick BU T02 and load the db object tree, then click the view — this kicks off
    // getDefinition('T02', ...) and leaves it pending.
    await connectBu(user, 'Test Hotel');
    await user.click(await screen.findByText('v_test'));
    expect(sqlQueryService.getDefinition).toHaveBeenCalledWith(
      'T02',
      expect.objectContaining({ schema: 'public', name: 'v_test' }),
    );

    // Switch to BU T03 before the pending getDefinition('T02', ...) resolves. The
    // reset-on-BU-change effect clears the editor immediately.
    await connectBu(user, 'Other Hotel');
    await waitFor(() => expect(screen.getByLabelText('sql')).toHaveValue(''));

    // Now let the stale T02 definition resolve — it must be discarded, not repopulate
    // the editor while the user is looking at BU T03.
    resolveDefinition({
      type: 'view',
      schema: 'public',
      name: 'v_test',
      definition: 'STALE DEFINITION FROM T02',
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByLabelText('sql')).toHaveValue('');
  });
});
