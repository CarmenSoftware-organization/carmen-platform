import api from './api';
import QueryParams from '../utils/QueryParams';
import type {
  PaginateParams,
  PlatformUserRow,
  PlatformUserScope,
  ApiListResponse,
} from '../types';

const defaultSearchFields = ['username', 'email'];

const userPlatformService = {
  /** Users holding at least one platform role. Users with none are excluded server-side. */
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<PlatformUserRow>> => {
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
