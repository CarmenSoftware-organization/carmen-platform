import { describe, it, expect, vi } from 'vitest';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';
import { FragmentRedactingSpanExporter, stripUrlFragment } from './telemetry';

class FakeSpan {
  constructor(public readonly attributes: Record<string, unknown>) {}
  spanContext() {
    return { traceId: 't', spanId: 's' };
  }
}

const asSpan = (attributes: Record<string, unknown>) => new FakeSpan(attributes) as unknown as ReadableSpan;

function makeExporter() {
  const exported: ReadableSpan[][] = [];
  const inner: SpanExporter = {
    export: vi.fn((spans, cb) => {
      exported.push(spans);
      cb({ code: 0 });
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    forceFlush: vi.fn().mockResolvedValue(undefined),
  };
  return { exporter: new FragmentRedactingSpanExporter(inner), inner, exported };
}

describe('stripUrlFragment', () => {
  it('drops everything from the first #', () => {
    expect(stripUrlFragment('https://p.test/login/callback?x=1#access_token=a&refresh_token=b')).toBe(
      'https://p.test/login/callback?x=1',
    );
  });

  it('leaves a URL without a fragment alone', () => {
    expect(stripUrlFragment('https://p.test/clusters?x=1')).toBe('https://p.test/clusters?x=1');
  });
});

describe('FragmentRedactingSpanExporter', () => {
  it('removes the OAuth tokens from url.full and http.url before export', () => {
    const { exporter, exported } = makeExporter();
    const span = asSpan({
      'url.full': 'https://p.test/login/callback#access_token=SECRET&refresh_token=SECRET2',
      'http.url': 'https://p.test/login/callback#access_token=SECRET',
      other: 'keep',
    });

    exporter.export([span], () => undefined);

    const sent = exported[0][0];
    expect(sent.attributes['url.full']).toBe('https://p.test/login/callback');
    expect(sent.attributes['http.url']).toBe('https://p.test/login/callback');
    expect(sent.attributes.other).toBe('keep');
    expect(JSON.stringify(sent.attributes)).not.toContain('SECRET');
  });

  it('keeps the span usable: methods the OTLP transform calls still work on the copy', () => {
    const { exporter, exported } = makeExporter();

    exporter.export([asSpan({ 'url.full': 'https://p.test/#access_token=a' })], () => undefined);

    expect(exported[0][0].spanContext()).toEqual({ traceId: 't', spanId: 's' });
  });

  it('does not touch the original span object', () => {
    const { exporter } = makeExporter();
    const span = asSpan({ 'url.full': 'https://p.test/#access_token=a' });

    exporter.export([span], () => undefined);

    expect(span.attributes['url.full']).toBe('https://p.test/#access_token=a');
  });

  it('passes spans without a fragment through unchanged (same object)', () => {
    const { exporter, exported } = makeExporter();
    const span = asSpan({ 'url.full': 'https://p.test/clusters' });

    exporter.export([span], () => undefined);

    expect(exported[0][0]).toBe(span);
  });

  it('forwards the result callback, shutdown and forceFlush to the real exporter', async () => {
    const { exporter, inner } = makeExporter();
    const cb = vi.fn();

    exporter.export([], cb);
    await exporter.forceFlush();
    await exporter.shutdown();

    expect(cb).toHaveBeenCalledWith({ code: 0 });
    expect(inner.forceFlush).toHaveBeenCalled();
    expect(inner.shutdown).toHaveBeenCalled();
  });
});
