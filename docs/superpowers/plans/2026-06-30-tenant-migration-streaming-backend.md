# Tenant Migration Streaming — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream `prisma migrate deploy` progress (per-migration) from micro-business to the browser, for single-BU and batch (`all`) deploys, via a new NDJSON endpoint — without breaking the existing buffered endpoint.

**Architecture:** micro-business spawns prisma and exposes the run as an `Observable<ProgressEvent>` from a `@MessagePattern` handler (NestJS TCP streams each emission). The gateway subscribes to that Observable and writes NDJSON to the Express response. A pre-deploy `migrate status` supplies the `total` for a determinate progress bar.

**Tech Stack:** NestJS (TCP microservices), RxJS, Node `child_process.spawn`/`readline`, Jest. Repo: `carmen-turborepo-backend-v2`.

## Global Constraints

- New endpoint only: `POST /api-system/tenant/migrations/:bu_id/deploy/stream`. The buffered `:bu_id/deploy` stays unchanged (CI/CD x-deploy-token parity).
- Same guard: `TenantMigrationGuard` (super-admin bearer OR x-deploy-token).
- `bu_id === 'all'` routes to the batch stream.
- Every emitted line/message MUST be sanitized via the existing `sanitize()` (redacts `postgres://…` and `DATABASE_URL=…`).
- Per-BU lock (`runningBuIds`) and batch lock (`isBatchRunning`) MUST be acquired for streaming runs and released when the stream finalizes (success, error, OR unsubscribe).
- Pre-stream failures (resolveConnection error, 409 lock, 403 guard) → the Observable **errors before emitting `start`** so the gateway can return a normal HTTP error with no NDJSON body. Mid-stream failures → an in-band terminal `{ type: 'error' }` event.
- Client disconnect does NOT abort an in-flight migration.
- Timeout: `envConfig.TENANT_MIGRATION_TIMEOUT_MS` (existing).
- ProgressEvent NDJSON schema (verbatim from spec):
  - `{ type: 'start'; bu_id; bu_code; total }`
  - `{ type: 'applying'; bu_id; bu_code; name; index; total }`
  - `{ type: 'bu-complete'; bu_id; bu_code; success; applied: string[]; already_up_to_date; error? }`
  - `{ type: 'log'; message }`
  - `{ type: 'done'; success; summary }`
  - `{ type: 'error'; message }`
- Spec: `carmen-platform/docs/superpowers/specs/2026-06-30-tenant-migration-streaming-progress-design.md`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `apps/micro-business/src/authen/tenant_migration/progress-event.ts` | `ProgressEvent` type + helpers (new, small, shared) | 1 |
| `apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts` | `spawnPrisma`, `deployStream`, `deployAllStream` | 2,3,4 |
| `apps/micro-business/src/authen/tenant_migration/tenant_migration.controller.ts` | `deploy-stream` message pattern | 5 |
| `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.service.ts` | `runDeployStream` (Observable passthrough) | 6 |
| `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.ts` | `POST :bu_id/deploy/stream` NDJSON writer | 7 |
| `*.spec.ts` co-located | tests per task | each |

Run a single backend spec from the repo root:
`cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.service.spec.ts`
`cd apps/backend-gateway && bunx jest src/platform/tenant-migrations/tenant-migrations.controller.spec.ts`

---

## Task 1: ProgressEvent type

**Files:**
- Create: `apps/micro-business/src/authen/tenant_migration/progress-event.ts`
- Test: `apps/micro-business/src/authen/tenant_migration/progress-event.spec.ts`

**Interfaces:**
- Produces: the `ProgressEvent` discriminated union and a `parseApplyingLine(line): string | null` helper (extracts the migration name from a prisma `Applying migration \`X\`` line).

- [ ] **Step 1: Write the failing test**

Create `progress-event.spec.ts`:

```ts
import { parseApplyingLine } from './progress-event';

describe('parseApplyingLine', () => {
  it('extracts the migration name from a prisma applying line', () => {
    expect(parseApplyingLine('Applying migration `20260318094751_add_x`')).toBe(
      '20260318094751_add_x',
    );
  });
  it('returns null for unrelated lines', () => {
    expect(parseApplyingLine('No pending migrations to apply.')).toBeNull();
    expect(parseApplyingLine('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/progress-event.spec.ts`
Expected: FAIL — `parseApplyingLine` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `progress-event.ts`:

```ts
/** Streamed deploy-progress events (NDJSON over the gateway). */
export type ProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'applying'; bu_id: string; bu_code: string; name: string; index: number; total: number }
  | {
      type: 'bu-complete';
      bu_id: string;
      bu_code: string;
      success: boolean;
      applied: string[];
      already_up_to_date: boolean;
      error?: string;
    }
  | { type: 'log'; message: string }
  | { type: 'done'; success: boolean; summary: unknown }
  | { type: 'error'; message: string };

const APPLYING_RE = /Applying migration `([^`]+)`/;

/** Pull the migration name out of a prisma "Applying migration `X`" line, else null. */
export const parseApplyingLine = (line: string): string | null => {
  const m = APPLYING_RE.exec(line);
  return m ? m[1] : null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/progress-event.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/tenant_migration/progress-event.ts apps/micro-business/src/authen/tenant_migration/progress-event.spec.ts
git commit -m "feat(tenant-migration): ProgressEvent type + applying-line parser"
```

---

## Task 2: `spawnPrisma` Observable

**Files:**
- Modify: `apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts`
- Test: `apps/micro-business/src/authen/tenant_migration/tenant_migration.spawn.spec.ts` (new spec file to isolate spawn mocking)

**Interfaces:**
- Consumes: existing private `sanitize`, `buildChildEnv`, `prismaBin`, `prismaDir`, `timeoutMs`.
- Produces: `private spawnPrisma(args: string[], databaseUrl: string): Observable<string>` — emits each sanitized stdout/stderr line; `complete`s on exit 0; `error`s on non-zero exit, spawn error, or timeout (SIGKILL).

- [ ] **Step 1: Write the failing test**

Create `tenant_migration.spawn.spec.ts`:

```ts
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { lastValueFrom, toArray } from 'rxjs';

const spawnMock = jest.fn();
jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...a: unknown[]) => spawnMock(...a),
}));

import { TenantMigrationService } from './tenant_migration.service';

// Build a fake child process whose stdout/stderr are Readables we push lines into.
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    kill: jest.Mock;
    killed: boolean;
  };
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  child.killed = false;
  return child;
}

// Access the private method under test via an index cast.
const callSpawn = (svc: TenantMigrationService, args: string[], url: string) =>
  (svc as unknown as { spawnPrisma: (a: string[], u: string) => import('rxjs').Observable<string> })
    .spawnPrisma(args, url);

function newService(): TenantMigrationService {
  // Construct with stub deps; spawnPrisma only uses prismaBin/dir/env/sanitize/timeout.
  return new TenantMigrationService({} as never, { getConnectionString: () => '' } as never);
}

describe('spawnPrisma', () => {
  beforeEach(() => spawnMock.mockReset());

  it('emits sanitized lines and completes on exit 0', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const svc = newService();
    const p = lastValueFrom(callSpawn(svc, ['migrate', 'status'], 'postgres://u:p@h:5432/db').pipe(toArray()));
    child.stdout.push('Applying migration `20260101000000_x`\n');
    child.stdout.push('DATABASE_URL=postgres://secret@h/db\n');
    child.stdout.push(null);
    child.emit('close', 0);
    const lines = await p;
    expect(lines).toContain('Applying migration `20260101000000_x`');
    // sanitized: no raw connection string leaks
    expect(lines.join('\n')).not.toContain('secret');
    expect(lines.join('\n')).toContain('***REDACTED***');
  });

  it('errors on a non-zero exit code', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const svc = newService();
    const p = lastValueFrom(callSpawn(svc, ['migrate', 'deploy'], 'url').pipe(toArray()));
    child.stdout.push(null);
    child.emit('close', 1);
    await expect(p).rejects.toThrow(/exited with code 1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.spawn.spec.ts`
Expected: FAIL — `spawnPrisma` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `tenant_migration.service.ts`, add the imports at the top (next to the existing `node:` imports):

```ts
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { Observable } from 'rxjs';
```

Add the method to the class (place it right after `runPrisma`):

```ts
  /**
   * Spawn the Prisma CLI and stream its stdout/stderr line-by-line (sanitized).
   * Completes on exit 0; errors on non-zero exit, spawn failure, or timeout (SIGKILL).
   */
  private spawnPrisma(args: string[], databaseUrl: string): Observable<string> {
    return new Observable<string>((subscriber) => {
      const child = spawn(this.prismaBin, args, {
        cwd: this.prismaDir,
        env: this.buildChildEnv(databaseUrl),
      });
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        finish(() => {
          child.kill('SIGKILL');
          subscriber.error(new Error('migrate timed out'));
        });
      }, this.timeoutMs);

      const rlOut = readline.createInterface({ input: child.stdout });
      const rlErr = readline.createInterface({ input: child.stderr });
      rlOut.on('line', (line) => subscriber.next(this.sanitize(line)));
      rlErr.on('line', (line) => subscriber.next(this.sanitize(line)));

      child.on('error', (err) => finish(() => subscriber.error(err)));
      child.on('close', (code) =>
        finish(() => {
          rlOut.close();
          rlErr.close();
          if (code === 0) subscriber.complete();
          else subscriber.error(new Error(`migrate exited with code ${code}`));
        }),
      );

      // Teardown runs on unsubscribe AND after complete/error. Only kill a child that
      // is still running (do not signal an already-closed process).
      return () => {
        clearTimeout(timer);
        if (!settled && !child.killed) child.kill('SIGKILL');
      };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.spawn.spec.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts apps/micro-business/src/authen/tenant_migration/tenant_migration.spawn.spec.ts
git commit -m "feat(tenant-migration): spawnPrisma streaming Observable"
```

---

## Task 3: `deployStream` (single-BU)

**Files:**
- Modify: `apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts`
- Test: `apps/micro-business/src/authen/tenant_migration/tenant_migration.deploy-stream.spec.ts`

**Interfaces:**
- Consumes: `spawnPrisma` (Task 2), `parseApplyingLine` (Task 1), existing `resolveConnection`, `runningBuIds`, `parseMigrationNames`, `sanitize`.
- Produces: `deployStream(bu_id: string): Observable<ProgressEvent>` — errors before `start` on resolve/lock failure; else emits `start → applying* → done`.

- [ ] **Step 1: Write the failing test**

Create `tenant_migration.deploy-stream.spec.ts`:

```ts
import { of, throwError, Observable, lastValueFrom, toArray } from 'rxjs';
import { TenantMigrationService } from './tenant_migration.service';
import type { ProgressEvent } from './progress-event';

type Svc = TenantMigrationService & {
  resolveConnection: jest.Mock;
  spawnPrisma: jest.Mock;
  runningBuIds: Set<string>;
};

function newService(): Svc {
  const svc = new TenantMigrationService({} as never, {} as never) as Svc;
  return svc;
}

const CONN = { bu_id: 'bu-1', bu_code: 'AVG', database_url: 'url' };

describe('deployStream', () => {
  it('emits start -> applying -> done for a successful deploy', async () => {
    const svc = newService();
    svc.resolveConnection = jest.fn().mockResolvedValue({ isError: () => false, value: CONN });
    // status call returns 2 pending; deploy applies both.
    svc.spawnPrisma = jest
      .fn()
      .mockReturnValueOnce(
        of(
          'Following migrations have not yet been applied:',
          '20260101000000_a',
          '20260102000000_b',
        ),
      )
      .mockReturnValueOnce(
        of('Applying migration `20260101000000_a`', 'Applying migration `20260102000000_b`'),
      );

    const events = (await lastValueFrom(
      svc.deployStream('bu-1').pipe(toArray()),
    )) as ProgressEvent[];

    expect(events[0]).toMatchObject({ type: 'start', bu_code: 'AVG', total: 2 });
    expect(events.filter((e) => e.type === 'applying').map((e) => (e as { name: string }).name)).toEqual([
      '20260101000000_a',
      '20260102000000_b',
    ]);
    const done = events.at(-1) as Extract<ProgressEvent, { type: 'done' }>;
    expect(done).toMatchObject({ type: 'done', success: true });
    expect(svc.runningBuIds.has('bu-1')).toBe(false); // lock released on finalize
  });

  it('errors before start when the connection cannot resolve', async () => {
    const svc = newService();
    svc.resolveConnection = jest
      .fn()
      .mockResolvedValue({ isError: () => true, error: { message: 'unsupported database provider' } });
    await expect(lastValueFrom(svc.deployStream('bu-1').pipe(toArray()))).rejects.toThrow(
      /unsupported database provider/,
    );
  });

  it('errors with ALREADY_EXISTS when the BU lock is held', async () => {
    const svc = newService();
    svc.resolveConnection = jest.fn().mockResolvedValue({ isError: () => false, value: CONN });
    svc.runningBuIds.add('bu-1');
    await expect(lastValueFrom(svc.deployStream('bu-1').pipe(toArray()))).rejects.toThrow(
      /already running/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.deploy-stream.spec.ts`
Expected: FAIL — `deployStream` not a function.

- [ ] **Step 3: Write minimal implementation**

Add the imports at the top (merge the `rxjs` import with Task 2's `import { Observable } from 'rxjs'` — keep a single `rxjs` import line containing exactly `Observable, defer, from`):

```ts
import { Observable, defer, from } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { parseApplyingLine, type ProgressEvent } from './progress-event';
```

(These are the only rxjs symbols this task uses — do not add `of`/`concat`.)

Add the method to the class (after `deployResolved`):

```ts
  /**
   * Stream a single BU's deploy as ProgressEvents. Errors (before any `start`) on a
   * resolve failure or a held lock; otherwise emits start -> applying* -> done.
   */
  deployStream(bu_id: string): Observable<ProgressEvent> {
    return defer(() => from(this.resolveConnection(bu_id))).pipe(
      // resolve -> either error the stream or hand off to the per-connection runner
      map((conn) => {
        if (conn.isError()) {
          throw new Error(this.sanitize(conn.error.message) || 'cannot resolve connection');
        }
        return conn.value;
      }),
      // flatten the connection into its event stream
      (source) =>
        new Observable<ProgressEvent>((subscriber) => {
          const sub = source.subscribe({
            next: (conn) => {
              if (this.runningBuIds.has(conn.bu_id)) {
                subscriber.error(new Error(`A migration operation is already running for BU ${conn.bu_code}`));
                return;
              }
              this.runningBuIds.add(conn.bu_id);
              this.runBuStream(conn)
                .pipe(finalize(() => this.runningBuIds.delete(conn.bu_id)))
                .subscribe({
                  next: (e) => subscriber.next(e),
                  error: (err) => subscriber.error(err),
                  complete: () => subscriber.complete(),
                });
            },
            error: (err) => subscriber.error(err),
          });
          return () => sub.unsubscribe();
        }),
    );
  }

  /**
   * Emit start -> applying* -> done for one already-resolved+locked connection.
   * Caller owns the lock lifecycle.
   */
  private runBuStream(conn: ResolvedConnection): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      const applied: string[] = [];
      let total = 0;
      let cancelled = false;

      const run = async () => {
        // 1) pre-deploy status -> total pending
        const statusLines: string[] = [];
        await new Promise<void>((resolve, reject) => {
          this.spawnPrisma(['migrate', 'status', '--schema', this.schemaPath], conn.database_url).subscribe({
            next: (l) => statusLines.push(l),
            error: reject,
            complete: resolve,
          });
        });
        const out = statusLines.join('\n');
        total = /not yet been applied/i.test(out) ? this.parseMigrationNames(out).length : 0;
        if (cancelled) return;
        subscriber.next({ type: 'start', bu_id: conn.bu_id, bu_code: conn.bu_code, total });

        // 2) deploy -> applying events
        await new Promise<void>((resolve, reject) => {
          this.spawnPrisma(['migrate', 'deploy', '--schema', this.schemaPath], conn.database_url).subscribe({
            next: (line) => {
              const name = parseApplyingLine(line);
              if (name) {
                applied.push(name);
                subscriber.next({
                  type: 'applying',
                  bu_id: conn.bu_id,
                  bu_code: conn.bu_code,
                  name,
                  index: applied.length,
                  total,
                });
              }
            },
            error: reject,
            complete: resolve,
          });
        });

        subscriber.next({
          type: 'done',
          success: true,
          summary: {
            bu_id: conn.bu_id,
            bu_code: conn.bu_code,
            success: true,
            already_up_to_date: applied.length === 0,
            applied_migrations: applied,
          },
        });
        subscriber.complete();
      };

      run().catch((err) => subscriber.error(err));
      return () => {
        cancelled = true;
      };
    });
  }
```

> Note on the lock+resolve flow: a held lock must surface as an error BEFORE `start`,
> which the test asserts. `runBuStream` only emits `start` after the (cheap) status
> spawn, so the lock check in `deployStream` (which runs first) is what produces the
> pre-`start` error.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.deploy-stream.spec.ts`
Expected: PASS (3 cases). Lock released after finalize.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts apps/micro-business/src/authen/tenant_migration/tenant_migration.deploy-stream.spec.ts
git commit -m "feat(tenant-migration): deployStream single-BU Observable"
```

---

## Task 4: `deployAllStream` (batch)

**Files:**
- Modify: `apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts`
- Test: `apps/micro-business/src/authen/tenant_migration/tenant_migration.deploy-all-stream.spec.ts`

**Interfaces:**
- Consumes: `runBuStream`, `listActiveConnections`, `isBatchRunning`.
- Produces: `deployAllStream(): Observable<ProgressEvent>` — errors before `start` if a batch is already running; else per BU emits `start → applying* → bu-complete`, continuing past a failing BU, then one final `done{ summary }`.

- [ ] **Step 1: Write the failing test**

Create `tenant_migration.deploy-all-stream.spec.ts`:

```ts
import { of, throwError, lastValueFrom, toArray, Observable } from 'rxjs';
import { TenantMigrationService } from './tenant_migration.service';
import type { ProgressEvent } from './progress-event';

type Svc = TenantMigrationService & {
  listActiveConnections: jest.Mock;
  runBuStream: jest.Mock;
  isBatchRunning: boolean;
};

const newService = () => new TenantMigrationService({} as never, {} as never) as Svc;

const buStart = (bu: string): ProgressEvent => ({ type: 'start', bu_id: bu, bu_code: bu, total: 1 });
const buApplying = (bu: string): ProgressEvent => ({
  type: 'applying', bu_id: bu, bu_code: bu, name: 'm1', index: 1, total: 1,
});

describe('deployAllStream', () => {
  it('streams each BU and ends with a done summary, continuing past a failure', async () => {
    const svc = newService();
    svc.listActiveConnections = jest.fn().mockResolvedValue([
      { bu_id: 'a', bu_code: 'A', database_url: 'u' },
      { bu_id: 'b', bu_code: 'B', database_url: 'u' },
    ]);
    svc.runBuStream = jest
      .fn()
      .mockImplementationOnce(() => of(buStart('A'), buApplying('A')))
      .mockImplementationOnce(() => throwError(() => new Error('B failed')));

    const events = (await lastValueFrom(svc.deployAllStream().pipe(toArray()))) as ProgressEvent[];

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'bu-complete')).toHaveLength(2);
    const a = events.find((e) => e.type === 'bu-complete' && e.bu_id === 'a') as Extract<ProgressEvent, { type: 'bu-complete' }>;
    const b = events.find((e) => e.type === 'bu-complete' && e.bu_id === 'b') as Extract<ProgressEvent, { type: 'bu-complete' }>;
    expect(a.success).toBe(true);
    expect(b.success).toBe(false);
    const done = events.at(-1) as Extract<ProgressEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(svc.isBatchRunning).toBe(false);
  });

  it('errors before start when a batch is already running', async () => {
    const svc = newService();
    svc.isBatchRunning = true;
    await expect(lastValueFrom(svc.deployAllStream().pipe(toArray()))).rejects.toThrow(/batch migration is already running/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.deploy-all-stream.spec.ts`
Expected: FAIL — `deployAllStream` not a function.

- [ ] **Step 3: Write minimal implementation**

Add to the class (after `deployStream`/`runBuStream`):

```ts
  /**
   * Stream batch deploy across all active BUs. Errors before any event if a batch is
   * already running; otherwise streams each BU (start -> applying* -> bu-complete),
   * continuing past per-BU failures, then a final done{summary}.
   */
  deployAllStream(): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      if (this.isBatchRunning) {
        subscriber.error(new Error('A batch migration is already running'));
        return;
      }
      this.isBatchRunning = true;
      let cancelled = false;

      const run = async () => {
        const connections = await this.listActiveConnections();
        const results: Array<Record<string, unknown>> = [];
        let succeeded = 0;
        let failed = 0;

        for (const conn of connections) {
          if (cancelled) return;
          const applied: string[] = [];
          try {
            await new Promise<void>((resolve, reject) => {
              this.runBuStream(conn).subscribe({
                next: (e) => {
                  if (e.type === 'applying') applied.push(e.name);
                  // forward start/applying (and any done from runBuStream is swallowed below)
                  if (e.type === 'start' || e.type === 'applying') subscriber.next(e);
                },
                error: reject,
                complete: resolve,
              });
            });
            succeeded++;
            subscriber.next({
              type: 'bu-complete',
              bu_id: conn.bu_id,
              bu_code: conn.bu_code,
              success: true,
              applied,
              already_up_to_date: applied.length === 0,
            });
            results.push({ bu_id: conn.bu_id, bu_code: conn.bu_code, success: true, applied_migrations: applied, already_up_to_date: applied.length === 0 });
          } catch (err) {
            failed++;
            const message = this.sanitize((err as Error).message);
            subscriber.next({
              type: 'bu-complete',
              bu_id: conn.bu_id,
              bu_code: conn.bu_code,
              success: false,
              applied,
              already_up_to_date: false,
              error: message,
            });
            results.push({ bu_id: conn.bu_id, bu_code: conn.bu_code, success: false, error: message });
          }
        }

        subscriber.next({
          type: 'done',
          success: failed === 0,
          summary: { total: connections.length, succeeded, failed, results },
        });
        subscriber.complete();
      };

      run()
        .catch((err) => subscriber.error(err))
        .finally(() => {
          this.isBatchRunning = false;
        });
      return () => {
        cancelled = true;
      };
    });
  }
```

> Note: `runBuStream` may itself emit a `done` event; the batch loop only forwards
> `start`/`applying` and synthesizes its own `bu-complete` + final `done`, so the
> per-BU `done` is intentionally not forwarded.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.deploy-all-stream.spec.ts`
Expected: PASS (2 cases). `isBatchRunning` released.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/tenant_migration/tenant_migration.service.ts apps/micro-business/src/authen/tenant_migration/tenant_migration.deploy-all-stream.spec.ts
git commit -m "feat(tenant-migration): deployAllStream batch Observable"
```

---

## Task 5: micro-business `deploy-stream` message pattern

**Files:**
- Modify: `apps/micro-business/src/authen/tenant_migration/tenant_migration.controller.ts`
- Test: `apps/micro-business/src/authen/tenant_migration/tenant_migration.controller.spec.ts` (add a case; create the file if absent)

**Interfaces:**
- Consumes: `deployStream`, `deployAllStream`.
- Produces: a `@MessagePattern({ cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' })` handler returning `Observable<ProgressEvent>` (routes `'all'` → batch).

- [ ] **Step 1: Write the failing test**

Add to (or create) `tenant_migration.controller.spec.ts`:

```ts
import { of } from 'rxjs';
import { TenantMigrationController } from './tenant_migration.controller';
import type { ProgressEvent } from './progress-event';

describe('TenantMigrationController.deployStream', () => {
  const ev: ProgressEvent = { type: 'done', success: true, summary: {} };

  it('routes a bu_id to deployStream and returns its Observable', () => {
    const svc = { deployStream: jest.fn().mockReturnValue(of(ev)), deployAllStream: jest.fn() } as never;
    const ctrl = new TenantMigrationController(svc);
    const out = ctrl.deployStream({ bu_id: 'bu-1' } as never);
    expect((svc as { deployStream: jest.Mock }).deployStream).toHaveBeenCalledWith('bu-1');
    expect(out).toBeDefined();
  });

  it("routes 'all' to deployAllStream", () => {
    const svc = { deployStream: jest.fn(), deployAllStream: jest.fn().mockReturnValue(of(ev)) } as never;
    const ctrl = new TenantMigrationController(svc);
    ctrl.deployStream({ bu_id: 'all' } as never);
    expect((svc as { deployAllStream: jest.Mock }).deployAllStream).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.controller.spec.ts`
Expected: FAIL — `deployStream` not a method on the controller.

- [ ] **Step 3: Write minimal implementation**

Add the import to the controller:

```ts
import type { ProgressEvent } from './progress-event';
import type { Observable } from 'rxjs';
```

Add the handler (after the existing `deploy` handler):

```ts
  /**
   * Stream apply progress for one BU ('all' for batch) as ProgressEvents.
   * สตรีมความคืบหน้าการ apply ของ BU เดียว ('all' = batch) เป็น ProgressEvent
   */
  @MessagePattern({ cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' })
  deployStream(@Payload() payload: MicroservicePayload & { bu_id: string }): Observable<ProgressEvent> {
    this.logger.debug({ function: 'deployStream', bu_id: payload.bu_id }, TenantMigrationController.name);
    return payload.bu_id === 'all'
      ? this.tenantMigrationService.deployAllStream()
      : this.tenantMigrationService.deployStream(payload.bu_id);
  }
```

> Unlike the buffered handlers, this returns the Observable directly (NestJS TCP
> streams each emission); it does NOT wrap in `handleResult`. Audit-context wrapping
> for the stream lives at the gateway (Task 7) since the run outlives a single reply.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/micro-business && bunx jest src/authen/tenant_migration/tenant_migration.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/tenant_migration/tenant_migration.controller.ts apps/micro-business/src/authen/tenant_migration/tenant_migration.controller.spec.ts
git commit -m "feat(tenant-migration): deploy-stream message pattern"
```

---

## Task 6: gateway `runDeployStream`

**Files:**
- Modify: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.service.ts`
- Test: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.service.spec.ts`

**Interfaces:**
- Consumes: the injected `ClientProxy` (`BUSINESS_SERVICE`), `getGatewayRequestContext`.
- Produces: `runDeployStream(bu_id: string): Observable<ProgressEvent>` — passes through the microservice stream (NO `firstValueFrom`).

- [ ] **Step 1: Write the failing test**

Create `tenant-migrations.service.spec.ts`:

```ts
import { of, lastValueFrom, toArray } from 'rxjs';
import { TenantMigrationsService } from './tenant-migrations.service';

jest.mock('@/common/context/gateway-request-context', () => ({
  getGatewayRequestContext: () => ({ request_id: 'r1' }),
}));

describe('TenantMigrationsService.runDeployStream', () => {
  it('passes the microservice stream through unchanged', async () => {
    const events = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 1 },
      { type: 'done', success: true, summary: {} },
    ];
    const client = { send: jest.fn().mockReturnValue(of(...events)) };
    const svc = new TenantMigrationsService(client as never);
    const got = await lastValueFrom(svc.runDeployStream('b').pipe(toArray()));
    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' },
      expect.objectContaining({ bu_id: 'b', request_id: 'r1' }),
    );
    expect(got).toEqual(events);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-gateway && bunx jest src/platform/tenant-migrations/tenant-migrations.service.spec.ts`
Expected: FAIL — `runDeployStream` not a method.

- [ ] **Step 3: Write minimal implementation**

`ProgressEvent` lives in micro-business; the gateway must NOT import across app
boundaries. Declare a local structural copy at the top of the gateway service file
(below the existing imports), identical to the micro-business type:

```ts
type ProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'applying'; bu_id: string; bu_code: string; name: string; index: number; total: number }
  | { type: 'bu-complete'; bu_id: string; bu_code: string; success: boolean; applied: string[]; already_up_to_date: boolean; error?: string }
  | { type: 'log'; message: string }
  | { type: 'done'; success: boolean; summary: unknown }
  | { type: 'error'; message: string };
```

Add the method:

```ts
  /**
   * Stream tenant deploy progress for one BU ('all' for batch). Passes the
   * micro-business Observable straight through (one emission per ProgressEvent).
   */
  runDeployStream(bu_id: string): Observable<ProgressEvent> {
    this.logger.debug({ function: 'runDeployStream', bu_id }, TenantMigrationsService.name);
    return this.client.send<ProgressEvent>(
      { cmd: 'tenant-migrations.deploy-stream', service: 'tenant-migrations' },
      { bu_id, ...getGatewayRequestContext() },
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend-gateway && bunx jest src/platform/tenant-migrations/tenant-migrations.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.service.ts apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.service.spec.ts
git commit -m "feat(tenant-migration): gateway runDeployStream passthrough"
```

---

## Task 7: gateway `POST :bu_id/deploy/stream` NDJSON endpoint

**Files:**
- Modify: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.ts`
- Test: `apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.spec.ts`

**Interfaces:**
- Consumes: `tenantMigrationsService.runDeployStream` (Task 6).
- Produces: `POST :bu_id/deploy/stream` writing NDJSON; lazy headers; HTTP error before first event; in-band `error` after.

- [ ] **Step 1: Write the failing test**

Create/extend `tenant-migrations.controller.spec.ts`:

```ts
import { of, throwError, Subject } from 'rxjs';
import { TenantMigrationsController } from './tenant-migrations.controller';

function fakeRes() {
  return {
    headersSent: false,
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: [] as string[],
    setHeader(k: string, v: string) { this.headers[k] = v; },
    flushHeaders() { this.headersSent = true; },
    status(c: number) { this.statusCode = c; return this; },
    write(chunk: string) { this.body.push(chunk); return true; },
    json(obj: unknown) { this.body.push(JSON.stringify(obj)); this.end(); },
    end() {},
  };
}
const fakeReq = () => ({ on: jest.fn(), deployActor: 'tester' });

describe('TenantMigrationsController.deployStream', () => {
  const make = (svc: unknown) => new TenantMigrationsController(svc as never);

  it('writes one NDJSON line per event and sets anti-buffering headers', async () => {
    const events = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 1 },
      { type: 'applying', bu_id: 'b', bu_code: 'B', name: 'm1', index: 1, total: 1 },
      { type: 'done', success: true, summary: {} },
    ];
    const ctrl = make({ runDeployStream: () => of(...events) });
    const res = fakeRes();
    await ctrl.deployStream(fakeReq() as never, res as never, 'b');
    expect(res.headers['Content-Type']).toBe('application/x-ndjson');
    expect(res.headers['X-Accel-Buffering']).toBe('no');
    expect(res.body).toEqual(events.map((e) => JSON.stringify(e) + '\n'));
  });

  it('returns an HTTP error (no NDJSON) when the stream errors before any event', async () => {
    const ctrl = make({ runDeployStream: () => throwError(() => new Error('already running')) });
    const res = fakeRes();
    await ctrl.deployStream(fakeReq() as never, res as never, 'b');
    expect(res.headersSent).toBe(false); // never started NDJSON
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.body.join('')).toContain('already running');
  });

  it('writes an in-band error event when the stream errors after start', async () => {
    const subject = new Subject();
    const ctrl = make({ runDeployStream: () => subject });
    const res = fakeRes();
    const p = ctrl.deployStream(fakeReq() as never, res as never, 'b');
    subject.next({ type: 'start', bu_id: 'b', bu_code: 'B', total: 1 });
    subject.error(new Error('migrate failed'));
    await p;
    expect(res.headersSent).toBe(true);
    expect(res.body.at(-1)).toContain('"type":"error"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-gateway && bunx jest src/platform/tenant-migrations/tenant-migrations.controller.spec.ts`
Expected: FAIL — `deployStream` not a method.

- [ ] **Step 3: Write minimal implementation**

Add the import for `Sse`/streaming is not needed; use the existing `@Post`, `@Req`, `@Res`. Add the handler after the buffered `deploy`:

```ts
  /**
   * Stream tenant migrate-deploy progress as NDJSON (one ProgressEvent per line).
   * สตรีมความคืบหน้าการ deploy เป็น NDJSON (1 ProgressEvent ต่อบรรทัด)
   */
  @Post(':bu_id/deploy/stream')
  @ApiOperation({ summary: 'Stream tenant migrate deploy (NDJSON)', operationId: 'tenantMigration_deployStream' })
  @ApiParam({ name: 'bu_id', description: "Business unit UUID, or 'all' for every active BU" })
  @ApiResponse({ status: 200, description: 'application/x-ndjson stream of ProgressEvent objects' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  @ApiResponse({ status: 409, description: 'A migration operation is already running' })
  deployStream(@Req() req: Request, @Res() res: Response, @Param('bu_id') id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let started = false;
      const startNdjson = () => {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        started = true;
      };

      const sub = this.tenantMigrationsService.runDeployStream(id).subscribe({
        next: (event) => {
          if (!started) startNdjson();
          res.write(JSON.stringify(event) + '\n');
        },
        error: (err: Error) => {
          if (!started) {
            // pre-stream failure -> normal HTTP error, no NDJSON body
            const status = /already running/i.test(err.message)
              ? HttpStatus.CONFLICT
              : HttpStatus.INTERNAL_SERVER_ERROR;
            this.executeAuditLog(req, 'deploy-stream', id, err);
            res.status(status).json({ message: err.message, status, success: false });
          } else {
            res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
            res.end();
          }
          resolve();
        },
        complete: () => {
          this.executeAuditLog(req, 'deploy-stream', id, { success: true });
          if (started) res.end();
          resolve();
        },
      });

      req.on('close', () => sub.unsubscribe());
    });
  }
```

> The audit log fires once at the terminal (`complete` or pre-stream `error`); per-event
> logging would be too chatty. `started` flips on the first event so pre- vs mid-stream
> errors are handled differently per the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend-gateway && bunx jest src/platform/tenant-migrations/tenant-migrations.controller.spec.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.ts apps/backend-gateway/src/platform/tenant-migrations/tenant-migrations.controller.spec.ts
git commit -m "feat(tenant-migration): gateway deploy/stream NDJSON endpoint"
```

---

## Final Verification (after all tasks)

- [ ] `cd apps/micro-business && bunx jest src/authen/tenant_migration` — all green.
- [ ] `cd apps/backend-gateway && bunx jest src/platform/tenant-migrations` — all green.
- [ ] Build both apps (the repo's build command, e.g. `bun run build` per app or `turbo build --filter=...`) — no TS errors.
- [ ] Manual (requires a tenant DB behind on migrations): `curl -N -X POST .../deploy/stream` with a super-admin bearer → observe NDJSON lines streaming (`start`, `applying`, `done`). Confirm `:bu_id/deploy` (buffered) still returns a single JSON.

## Self-Review Notes

- **Spec coverage:** spawnPrisma (T2), single deployStream (T3), batch deployAllStream (T4), micro message pattern (T5), gateway passthrough (T6), gateway NDJSON endpoint with lazy headers + pre/mid error split + disconnect (T7), ProgressEvent schema (T1, reused everywhere). Sanitize + lock-via-finalize covered in T2-T4 tests. Buffered endpoint untouched.
- **Type consistency:** `ProgressEvent` defined once in micro (T1), structurally re-declared in the gateway (T6) to avoid a cross-app import — kept identical.
- **Known risk to verify in review:** NestJS TCP streaming of an Observable from `@MessagePattern` must actually deliver multiple emissions to `client.send`. If the deployed NestJS version buffers/returns only the first, the integration (not unit) path needs a fallback — flag during the final whole-branch review and confirm against a live micro→gateway call.
