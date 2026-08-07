import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  AdminScope,
  ApiListResponse,
  ClusterInvitation,
  InvitationCreatePayload,
  PaginateParams,
} from '../types';

const clusterSearchFields = ['name', 'code'];

const clusterAdminService = {
  /**
   * Which clusters the signed-in user administers. `all` short-circuits every scope check —
   * a super admin administers everything, so `clusters` is only a searchable page.
   */
  getMyAdminClusters: async (paginate: PaginateParams = {}): Promise<AdminScope> => {
    const response = await api.get(
      `/api-system/me/admin-clusters?${buildQuery(paginate, clusterSearchFields)}`,
    );
    const body = response.data;
    return {
      // `all` travels inside `summary`, not at the top level: the gateway's response envelope
      // rebuilds any `{ data, paginate }`-shaped payload from those two keys alone and drops
      // every other top-level field. `summary` is the one extra key it preserves.
      all: body?.summary?.all === true,
      clusters: Array.isArray(body?.data) ? body.data : [],
    };
  },

  listInvitations: async (
    clusterId: string,
    paginate: PaginateParams = {},
  ): Promise<ApiListResponse<ClusterInvitation>> => {
    const response = await api.get(
      `/api-system/clusters/${clusterId}/invitations?${buildQuery(paginate, ['email'])}`,
    );
    return response.data;
  },

  createInvitation: async (clusterId: string, payload: InvitationCreatePayload) => {
    const response = await api.post(`/api-system/clusters/${clusterId}/invitations`, payload);
    return response.data;
  },

  revokeInvitation: async (clusterId: string, invitationId: string) => {
    const response = await api.delete(
      `/api-system/clusters/${clusterId}/invitations/${invitationId}`,
    );
    return response.data;
  },

  resendInvitation: async (clusterId: string, invitationId: string) => {
    const response = await api.post(
      `/api-system/clusters/${clusterId}/invitations/${invitationId}/resend`,
    );
    return response.data;
  },
};

export default clusterAdminService;
