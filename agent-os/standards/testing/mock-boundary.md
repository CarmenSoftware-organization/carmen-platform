# Mock Boundary

**Mock the environment. Keep the logic under test real.**

| Mock it | Why |
|---|---|
| `../components/Layout` | shell — pulls in Sidebar, AuthContext, the whole app frame |
| `../context/AuthContext` | the environment's answer to "who is this user" |
| `../services/*`, `../services/api` | network |
| `sonner` | side-effect sink |

| Keep it real | Why |
|---|---|
| **`Can`** | it *is* the permission logic. Mocking it to always render children makes every permission test pass regardless of permissions — vacuous. |
| routing | `MemoryRouter` + real `Routes`/`Route` (39 files). Partial-mock `react-router-dom` only to spy on navigation. |
| form state, validation, the component's own logic | that's the thing being tested |

No file in this repo mocks `Can`. Keep it that way. If a page never imports `Can`, say so in a comment — otherwise the next reader assumes you forgot (see `BusinessUnitEdit.test.tsx`).

## vi.hoisted

`vi.mock` factories are hoisted above the file body, so a plain `const` isn't initialised when the factory runs. `vi.hoisted` lifts the value with it. Used in 32 files, three ways:

**Mutable auth** — the reason `Can` never needs mocking:

```tsx
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

// in a test:
auth.hasPermission = (p) => p !== 'cluster.update';
// → the real Can hides the Save button, and the assertion means something
```

**Toast spy** — assert what the user was told:

```tsx
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
```

**Navigation spy** — partial mock, so routing stays real:

```tsx
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
```

Spread `importOriginal()` — replacing the whole module takes `MemoryRouter`, `Routes`, and `useParams` down with it.

Reset mutable hoisted values in `beforeEach`; they persist across tests in the file.
