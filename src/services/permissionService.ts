import api from './api';
import type { PermissionCatalogItem } from '../types';

const permissionService = {
  getCatalog: async (): Promise<PermissionCatalogItem[]> => {
    const response = await api.get('/api-system/platform/permissions');
    const body = response.data?.data ?? response.data;
    const items = Array.isArray(body) ? body : body?.data ?? [];
    return (items as Array<Partial<PermissionCatalogItem>>).map((p) => ({
      key: p.key ?? `${p.resource}.${p.action}`,
      resource: p.resource ?? '',
      action: p.action ?? '',
      description: p.description,
    }));
  },
};

export default permissionService;
