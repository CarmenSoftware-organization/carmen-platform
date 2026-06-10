import api from './api';
import type { PermissionCatalogItem, EffectivePermissions } from '../types';

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

  getMyPlatformPermissions: async (): Promise<EffectivePermissions | null> => {
    const response = await api.get('/api/user/permission/platform');
    const body = response.data?.data ?? response.data;
    if (body && typeof body === 'object' && Array.isArray(body.platform)) {
      return { platform: body.platform ?? [], clusters: body.clusters ?? {}, is_super_admin: body.is_super_admin ?? false };
    }
    return null;
  },
};

export default permissionService;
