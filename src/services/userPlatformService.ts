import api from './api';
import QueryParams from '../utils/QueryParams';
import type {
  PaginateParams,
  PlatformUserScope,
  PlatformUsersResponse,
} from '../types';

const defaultSearchFields = ['username', 'email'];

const userPlatformService = {
  /**
   * Users holding at least one platform role. Users with none are excluded server-side.
   * The response's `summary` block is the registry-wide aggregate (see
   * `PlatformUserRegistrySummary`) and is optional — it is absent until the backend
   * deploys the change that adds it, so callers must not assume its presence.
   */
  getAll: async (paginate: PaginateParams = {}): Promise<PlatformUsersResponse> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter)
        ? (paginate.filter as Record<string, unknown>)
        : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/platform/users?${q.toQueryString()}`);
    return response.data;
  },

  /** Grant several roles at one shared scope. Atomic — the backend writes all or none. */
  assignBulk: async (
    userId: string,
    payload: { role_ids: string[]; scope: PlatformUserScope },
  ) => {
    const response = await api.post(
      `/api-system/platform/users/${userId}/roles/bulk`,
      payload,
    );
    return response.data;
  },
};

export default userPlatformService;
