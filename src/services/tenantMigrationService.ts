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
   * Shared NDJSON streamer. `buId` is a real BU id for a single deploy, or 'all'
   * for the batch deploy of every BU. Uses fetch (not EventSource) so it can send
   * the bearer token + x-app-id. Rejects on a pre-stream HTTP error or a terminal
   * error event; resolves with the terminal `done` summary.
   *
   * `signal` only aborts the BROWSER's wait on this fetch — it does NOT stop the migration
   * running server-side. The gateway (`tenant-migrations.controller.ts` `deployStream`) DOES
   * watch `req.on('close')` and unsubscribes its RxJS subscription on client disconnect, and
   * that propagates all the way to the micro-business HTTP RPC call being aborted. But the
   * micro-business handler that actually spawns `prisma migrate deploy`
   * (`tenant_migration.service.ts` `deployStream`, ../carmen-turborepo-backend-v2) is explicitly
   * designed to keep running after that: "The inner runBuStream subscription is intentionally
   * NOT torn down when the outer Observable is unsubscribed ... a client disconnect must NOT
   * abort an in-flight migration: runBuStream runs to natural completion (or its spawnPrisma
   * timeout)" (tenant_migration.service.ts:388-393). `deployAllStream` behaves the same way for
   * the BU currently being migrated — cancellation only stops the batch from starting the NEXT
   * BU (tenant_migration.service.ts:504-518), it does not interrupt the one in flight. There is
   * no cancel/rollback endpoint for this domain today. Callers must not present `signal` as a
   * real "Cancel" — it exists only to avoid a leaked fetch / stale state update after the page
   * is navigated away from. See TenantMigrationManagement.tsx's abort-on-unmount usage.
   */
  _streamDeploy: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<DeploySummary> => {
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(`${base}/api-system/tenant/migrations/${buId}/deploy/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
      signal,
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

    if (!summary) throw new Error('Deploy stream ended without a result');
    return summary;
  },

  /** Stream a single-BU deploy as NDJSON ProgressEvents. See `_streamDeploy` for what `signal` does (and does not) cancel. */
  deployStream: async (
    buId: string,
    onEvent: (e: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<DeploySummary> => tenantMigrationService._streamDeploy(buId, onEvent, signal),

  /** Stream a deploy of ALL BUs (bu_id='all') as NDJSON ProgressEvents. See `_streamDeploy` for what `signal` does (and does not) cancel. */
  deployAllStream: async (
    onEvent: (e: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<DeploySummary> => tenantMigrationService._streamDeploy('all', onEvent, signal),
};

export default tenantMigrationService;
