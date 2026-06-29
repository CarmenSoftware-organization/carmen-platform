import api from './api';
import type { TenantMigrationStatus, TenantMigrationDeployResult } from '../types';

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
};

export default tenantMigrationService;
