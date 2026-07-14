import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

// CodeMirror needs layout APIs jsdom lacks; stub the editor to a textarea + Run button.
vi.mock('./SqlEditor', () => ({
  SqlEditor: ({
    value,
    onChange,
    onRun,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRun?: (sql: string) => void;
  }) => (
    <div>
      <textarea aria-label="sql" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onRun?.(value)}>Run</button>
    </div>
  ),
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

  it('runs a non-destructive statement without confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'SELECT * FROM t');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'SELECT * FROM t'),
    );
    expect(screen.queryByText(/run destructive sql/i)).not.toBeInTheDocument();
  });

  it('confirms before running a destructive statement', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'DROP TABLE users');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    // Dialog shown, nothing executed yet.
    expect(await screen.findByText(/run destructive sql/i)).toBeInTheDocument();
    expect(sqlQueryService.executeSql).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /run anyway/i }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'DROP TABLE users'),
    );
  });

  it('discards a pending destructive confirm when the BU is switched', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'DROP TABLE users');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/run destructive sql/i)).toBeInTheDocument();

    // Switch BU while the confirm dialog is open. The "Switch business unit"
    // trigger button sits behind the ConfirmDialog's Radix overlay (pointer-events
    // locked to the topmost dialog), so a literal click on it — as `connectBu`
    // does in the other tests — can't reach it here. This mirrors the actual bug
    // report, which is triggered via the global Ctrl/Cmd+B shortcut rather than a
    // click, so fire that shortcut directly to open the BuSwitcher on top of the
    // still-open confirm dialog, then pick the other BU from it.
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await user.click(await screen.findByText('Other Hotel'));

    await waitFor(() =>
      expect(screen.queryByText(/run destructive sql/i)).not.toBeInTheDocument(),
    );
    expect(sqlQueryService.executeSql).not.toHaveBeenCalled();
  });

  it('allows a multi-statement run', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.executeSql).mockResolvedValue({
      columns: [], rows: [], rowCount: 0, durationMs: 1,
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'SELECT 1; SELECT 2');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(sqlQueryService.executeSql).toHaveBeenCalledWith('T02', 'SELECT 1; SELECT 2'),
    );
  });

  it('saves a multi-statement script (old code blocked multiple statements)', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.saveDdl).mockResolvedValue({
      type: 'view', name: 't', schema: 'public', executed_sql: 'SELECT 1; SELECT 2',
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.type(await screen.findByLabelText('sql'), 'SELECT 1; SELECT 2');
    await user.type(screen.getByLabelText(/object name/i), 't');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(sqlQueryService.saveDdl).toHaveBeenCalled());
  });

  it('drops a SELECT into the editor when a table is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(sqlQueryService.getDbObjects).mockResolvedValueOnce({
      tables: [{ schema: 'public', name: 'orders' }],
      views: [],
      procedures: [],
      columns: [],
    });
    renderPage();
    await connectBu(user, 'Test Hotel');
    await user.click(await screen.findByText('orders'));
    expect(screen.getByLabelText('sql')).toHaveValue('SELECT * FROM public.orders LIMIT 100;');
    expect(sqlQueryService.getDefinition).not.toHaveBeenCalled();
  });
});
