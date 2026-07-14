import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tenantSeedService from './tenantSeedService';
import type { SeedProgressEvent } from '../types';

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

describe('tenantSeedService.deployStream', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    localStorage.setItem('token', 'tok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('parses NDJSON (including a split line) and calls onEvent per event', async () => {
    const events: SeedProgressEvent[] = [
      { type: 'start', bu_id: 'b', bu_code: 'B', total: 2 },
      { type: 'seeding', bu_id: 'b', bu_code: 'B', key: 'running-code', row_type: 'PURCHASE-ORDER', index: 1, total: 2 },
      { type: 'seeding', bu_id: 'b', bu_code: 'B', key: 'running-code', row_type: 'CREDIT-NOTE', index: 2, total: 2 },
      { type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 2, skipped: 12 } },
    ];
    const ndjson = events.map((e) => JSON.stringify(e) + '\n').join('');
    const mid = Math.floor(ndjson.length / 2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream([ndjson.slice(0, mid), ndjson.slice(mid)]) as never);

    const seen: SeedProgressEvent[] = [];
    const summary = await tenantSeedService.deployStream('b', (e) => seen.push(e));

    expect(seen).toEqual(events);
    expect(summary).toMatchObject({ created: 2, skipped: 12 });
  });

  it('POSTs the seeds stream endpoint with Authorization header', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 14 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-9', () => {});
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api-system/tenant/seeds/bu-9/deploy/stream');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws on a pre-stream HTTP error (parses the JSON body)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'no database connection configured' }),
    } as never);
    await expect(tenantSeedService.deployStream('b', () => {})).rejects.toThrow(/no database connection/);
  });

  it('rejects on a terminal error event', async () => {
    const chunks = [
      JSON.stringify({ type: 'start', bu_id: 'b', bu_code: 'B', total: 1 }) + '\n',
      JSON.stringify({ type: 'error', message: 'seed failed' }) + '\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream(chunks) as never);
    await expect(tenantSeedService.deployStream('b', () => {})).rejects.toThrow(/seed failed/);
  });

  it('sends a JSON body with selected keys when provided', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 0 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-7', () => {}, ['running-code']);
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ keys: ['running-code'] });
  });

  it('omits the body when no keys are provided', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okStream([JSON.stringify({ type: 'done', success: true, summary: { bu_id: 'b', bu_code: 'B', created: 0, skipped: 0 } }) + '\n']) as never);
    await tenantSeedService.deployStream('bu-7', () => {});
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).body).toBeUndefined();
  });
});
