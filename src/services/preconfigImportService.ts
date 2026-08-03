import api from './api';
import type {
  PreconfigCheckReport,
  PreconfigImportEvent,
  PreconfigImportOptions,
  PreconfigImportSummary,
  PreconfigPreview,
  PreconfigStepMeta,
} from '../types';

// Preconfig master-data import. Requires the `data_import.manage` platform permission;
// the axios interceptor supplies the bearer token + x-app-id.
const base = '/api-system/tenant/preconfig-imports';

/**
 * Build the multipart body shared by check/preview/import.
 */
function formOf(file: File, options?: PreconfigImportOptions): FormData {
  const fd = new FormData();
  fd.append('file', file);
  if (options) fd.append('options', JSON.stringify(options));
  return fd;
}

const preconfigImportService = {
  getSteps: async (): Promise<PreconfigStepMeta[]> => {
    const res = await api.get(`${base}/steps`);
    const body = res.data?.data ?? res.data;
    return body?.steps ?? [];
  },

  check: async (buId: string, file: File): Promise<PreconfigCheckReport> => {
    const res = await api.post(`${base}/${buId}/check`, formOf(file));
    return res.data?.data ?? res.data;
  },

  preview: async (
    buId: string,
    stepId: string,
    file: File,
    options?: PreconfigImportOptions,
  ): Promise<PreconfigPreview> => {
    const res = await api.post(`${base}/${buId}/${stepId}/preview`, formOf(file, options));
    return res.data?.data ?? res.data;
  },

  /**
   * Stream one import step as NDJSON. Uses fetch (not axios) so the body can be read
   * incrementally; resolves with the `done` summary and rejects on a terminal error.
   */
  importStream: async (
    buId: string,
    stepId: string,
    file: File,
    options: PreconfigImportOptions,
    onEvent: (e: PreconfigImportEvent) => void,
    signal?: AbortSignal,
  ): Promise<PreconfigImportSummary> => {
    const root = api.defaults.baseURL ?? '';
    const res = await fetch(`${root}${base}/${buId}/${stepId}/import/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
      body: formOf(file, options),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Import failed (${res.status})`);
    }
    if (!res.body) throw new Error('Import stream: response body is null');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: PreconfigImportSummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as PreconfigImportEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') summary = event.summary;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handleLine(buffer);
    if (!summary) throw new Error('Import stream ended without a result');
    return summary;
  },
};

export default preconfigImportService;
