import api from './api';
import type { TenantSeedStatus, SeedProgressEvent, SeedDeploySummary } from '../types';

// Tenant default-data seeding for a single BU. Super-admin only (backend enforces
// it; the axios interceptor supplies the bearer token + x-app-id). The backend
// resolves the target tenant DB from the BU's stored db_connection, so we send
// only the bu_id. Mirrors tenantMigrationService.
const tenantSeedService = {
  getStatus: async (buId: string): Promise<TenantSeedStatus> => {
    const res = await api.get(`/api-system/tenant/seeds/${buId}/status`);
    return res.data.data ?? res.data;
  },

  /**
   * Stream a single-BU seed run as NDJSON SeedProgressEvents. Uses fetch (not
   * EventSource) so it can send the bearer token + x-app-id. Rejects on a
   * pre-stream HTTP error or a terminal error event; resolves with the `done` summary.
   */
  deployStream: async (
    buId: string,
    onEvent: (e: SeedProgressEvent) => void,
  ): Promise<SeedDeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/seeds/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Seed stream failed (${res.status})`);
    }

    if (!res.body) throw new Error('Seed stream: response body is null');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: SeedDeploySummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as SeedProgressEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') summary = event.summary;
    };

    try {
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
    } finally {
      reader.cancel().catch(() => {});
    }

    if (!summary) throw new Error('Seed stream ended without a result');
    return summary;
  },
};

export default tenantSeedService;
