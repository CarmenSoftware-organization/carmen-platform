import api from './api';
import type { TenantMigrationStatus, TenantMigrationDeployResult, ProgressEvent, DeploySummary } from '../types';

// Tenant DB schema migrations for a single BU. Super-admin only (backend enforces
// it; the axios interceptor supplies the bearer token + x-app-id). The backend
// resolves the target tenant DB from the BU's stored db_connection, so we send
// only the bu_id. Responses are unwrapped tolerantly (envelope vs bare DTO).
const tenantMigrationService = {
  getStatus: async (buId: string): Promise<TenantMigrationStatus> => {
    const res = await api.get(`/api-system/tenant/migrations/${buId}/status`);
    return res.data.data ?? res.data;
  },
  deploy: async (buId: string): Promise<TenantMigrationDeployResult> => {
    const res = await api.post(`/api-system/tenant/migrations/${buId}/deploy`);
    return res.data.data ?? res.data;
  },

  /**
   * Stream a tenant deploy as NDJSON ProgressEvents. Calls onEvent for each event and
   * resolves with the final `done` summary. Uses fetch (not EventSource) so it can send
   * the bearer token + x-app-id. Rejects on a pre-stream HTTP error or a terminal error event.
   */
  deployStream: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
  ): Promise<DeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/migrations/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Deploy stream failed (${res.status})`);
    }

    if (!res.body) throw new Error('Deploy stream: response body is null');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: DeploySummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as ProgressEvent;
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
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer); // flush any trailing line

    if (!summary) throw new Error('Deploy stream ended without a result');
    return summary;
  },
};

export default tenantMigrationService;
