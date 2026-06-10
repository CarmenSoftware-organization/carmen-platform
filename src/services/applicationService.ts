import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Application, ApplicationWritePayload, ApiListResponse, ApiCatalogGroup } from '../types';
import { groupApiNames } from '../utils/apiCatalog';

const defaultSearchFields = ['name', 'description'];

// Build the write payload from flat form data. `api_names` (string[]) is translated
// into the backend's details.add[] shape. Empty/whitespace entries are dropped.
const toWritePayload = (data: {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  api_names?: string[];
}): ApplicationWritePayload => {
  const payload: ApplicationWritePayload = {
    name: data.name,
    description: data.description,
    is_active: data.is_active,
    allow_all: data.allow_all,
  };
  // When allow_all is set the backend grants every API, so api_names are irrelevant.
  if (!data.allow_all) {
    const cleaned = (data.api_names ?? []).map((s) => s.trim()).filter(Boolean);
    payload.details = { add: cleaned.map((api_name) => ({ api_name })) };
  }
  return payload;
};

// Runtime guard for a catalog group from an untrusted API response: both fields
// present and correctly typed (including every api_name being a string).
const isApiCatalogGroup = (g: unknown): g is ApiCatalogGroup =>
  typeof g === 'object' &&
  g !== null &&
  typeof (g as ApiCatalogGroup).module === 'string' &&
  Array.isArray((g as ApiCatalogGroup).api_names) &&
  (g as ApiCatalogGroup).api_names.every((n: unknown) => typeof n === 'string');

const applicationService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Application>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? paginate.filter as Record<string, unknown> : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/applications?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/applications/${id}`);
    return response.data;
  },

  // Catalog of selectable api_name values. The endpoint returns
  // { api_names: string[], groups?: { module, api_names }[] } (optionally inside the
  // standard { data } envelope). Tolerate a bare string[] too. When the backend has
  // not yet been redeployed with `groups`, derive the same grouping client-side from
  // api_names (identical split rule), so the UI works regardless of deploy order.
  getApiCatalog: async (): Promise<{ groups: ApiCatalogGroup[]; api_names: string[] }> => {
    const response = await api.get('/api-system/applications/api-catalog');
    const body = response.data?.data ?? response.data;

    const api_names: string[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.api_names)
        ? body.api_names
        : [];

    const rawGroups = body?.groups;
    const validGroups: ApiCatalogGroup[] =
      Array.isArray(rawGroups) && rawGroups.every(isApiCatalogGroup)
        ? (rawGroups as ApiCatalogGroup[])
        : groupApiNames(api_names);

    return { groups: validGroups, api_names };
  },

  create: async (data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.post('/api-system/applications', toWritePayload(data));
    return response.data;
  },

  update: async (id: string, data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.put(`/api-system/applications/${id}`, toWritePayload(data));
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/applications/${id}`);
    return response.data;
  },
};

export default applicationService;
