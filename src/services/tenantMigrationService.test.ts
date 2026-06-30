import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tenantMigrationService from './tenantMigrationService';
import type { ProgressEvent } from '../types';

// Build a ReadableStream that emits the given string chunks.
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

const okStream = (chunks: string[]) => ({ ok: true, status: 200, body: streamFrom(chunks) });

// Node 26 exposes `localStorage` as undefined (experimental global requires --localstorage-file).
// Jsdom sets it on `window` but Node 26's own binding wins at the bare `localStorage` reference.
// Stub it so the service can call localStorage.getItem('token') in tests.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: (_: number) => null,
  };
};

describe('tenantMigrationService.deployStream', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('parses NDJSON (including a line split across chunks) and calls onEvent per event', async () => {
    const events: ProgressEvent[] = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 2 },
      { type: 'applying', bu_id: 'b', bu_code: 'B', name: 'm1', index: 1, total: 2 },
      { type: 'applying', bu_id: 'b', bu_code: 'B', name: 'm2', index: 2, total: 2 },
      { type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', success: true, already_up_to_date: false, applied_migrations: ['m1', 'm2'] } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    // split mid-way through to exercise the partial-line buffer
    const mid = Math.floor(ndjson.length / 2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson.slice(0, mid), ndjson.slice(mid)]) as never);

    const seen: ProgressEvent[] = [];
    const summary = await tenantMigrationService.deployStream('b', (e) => seen.push(e));

    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ success: true, applied_migrations: ['m1', 'm2'] });
  });

  it('sends Authorization + x-app-id headers to the stream endpoint', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: {} }) + '\n']) as never);
    await tenantMigrationService.deployStream('bu-9', () => {});
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/migrations/bu-9/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws on a pre-stream HTTP error (parses the JSON body)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'already running' }),
    } as never);
    await expect(tenantMigrationService.deployStream('b', () => {})).rejects.toThrow(/already running/);
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'b', bu_code: 'B', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'migrate failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantMigrationService.deployStream('b', () => {})).rejects.toThrow(/migrate failed/);
  });
});

describe('tenantMigrationService.deployAllStream', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("POSTs the all-BU stream endpoint and parses per-BU + batch events", async () => {
    const events: ProgressEvent[] = [
      { type: 'start', bu_id: 'all', bu_code: 'ALL', total: 2 },
      { type: 'bu-complete', bu_id: 'b1', bu_code: 'B1', success: true, applied: ['m1'], already_up_to_date: false },
      { type: 'bu-complete', bu_id: 'b2', bu_code: 'B2', success: true, applied: [], already_up_to_date: true },
      { type: 'done', success: true, summary: { total: 2, succeeded: 2, failed: 0, results: [] } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson]) as never);

    const seen: ProgressEvent[] = [];
    const summary = await tenantMigrationService.deployAllStream((e) => seen.push(e));

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/migrations/all/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'all', bu_code: 'ALL', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'batch failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantMigrationService.deployAllStream(() => {})).rejects.toThrow(/batch failed/);
  });
});
